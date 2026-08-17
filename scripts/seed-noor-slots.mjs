// One-off: seed Noor Yoga's session slots.
//
// Goes through the admin-businesses edge function so the SLOT_COLS
// whitelist + auth gates still apply. Auth uses the standard admin-CLI
// pattern from admin_auth.ts:
//
//   - Authorization: Bearer <anon_key>  → satisfies Supabase gateway's
//                                          JWT-format requirement (Kong).
//   - X-Admin-Token: <cli_token>        → satisfies requireAdmin's
//                                          ephemeral-bypass path.
//
// No service-role key is ever passed to the function (Kong rejects
// sb_secret_* keys as "non-user tokens"). No permanent config changes
// — the ADMIN_CLI_TOKEN is set in Supabase secrets by the companion
// bash wrapper before this runs, and unset immediately after.
//
// Required env:
//   SUPABASE_URL              https://<ref>.supabase.co
//   SUPABASE_ANON_KEY         public anon key (present in .env.local as
//                             VITE_SUPABASE_PUBLISHABLE_KEY)
//   ADMIN_CLI_TOKEN           ephemeral secret currently set on the
//                             admin-businesses function
//   BUSINESS_ID               numeric id of the business to seed (48
//                             for Noor). Required — no name-based
//                             lookup on this path to avoid ambiguity.
//
// Usage:
//   ./scripts/seed-noor-slots.sh                 # dry run
//   ./scripts/seed-noor-slots.sh --apply         # actually insert
//
// (Or invoke node directly if the token is already set:
//    ADMIN_CLI_TOKEN=... node scripts/seed-noor-slots.mjs)

const { SUPABASE_URL, SUPABASE_ANON_KEY, ADMIN_CLI_TOKEN, BUSINESS_ID } = process.env
for (const [k, v] of Object.entries({ SUPABASE_URL, SUPABASE_ANON_KEY, ADMIN_CLI_TOKEN, BUSINESS_ID })) {
  if (!v) { console.error(`missing env: ${k}`); process.exit(1) }
}
const bizId = Number(BUSINESS_ID)
if (!Number.isFinite(bizId) || bizId <= 0) { console.error(`BUSINESS_ID must be a positive integer, got: ${BUSINESS_ID}`); process.exit(1) }
const APPLY = process.argv.includes('--apply')

const FN_URL = `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/admin-businesses`

async function adminFn(body) {
  const resp = await fetch(FN_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'X-Admin-Token': ADMIN_CLI_TOKEN,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify(body),
  })
  const payload = await resp.json().catch(() => ({}))
  if (!resp.ok || payload?.error) {
    throw new Error(`admin-businesses ${body.op} failed (${resp.status}): ${payload?.error || JSON.stringify(payload).slice(0,200)}`)
  }
  return payload
}

// ── Noor's offerings ────────────────────────────────────────────────
// name           what shows on the marketplace card + booking modal.
// credits        per-attendee price (goes into slots.credits).
// spots          capacity per slot (1 = 1-on-1; >1 = group class).
// venue_side     'instructor' = at Noor's place / by the sea;
//                'customer'   = at the customer's address.
// booking_mode   'request' for 1-on-1s (Noor confirms each);
//                'instant'  for group classes at her venue (auto-confirm,
//                she checks dashboard).
// Names are intentionally bare — location + duration are carried by
// slot.venue_side and slot.dur. The client's filter chip and slot row
// display a "· at venue" / "· at your home" suffix only when a name
// appears at both venue sides (Private, Group), so short names stay
// clean where unambiguous.
const OFFERINGS = [
  { name: "Private",     credits: 30, spots: 1,  venue_side: 'instructor', booking_mode: 'request' },
  { name: "Small group", credits: 20, spots: 4,  venue_side: 'instructor', booking_mode: 'instant' },
  { name: "Large group", credits: 15, spots: 30, venue_side: 'instructor', booking_mode: 'instant' },
  { name: "Private",     credits: 60, spots: 1,  venue_side: 'customer',   booking_mode: 'request' },
  { name: "Group",       credits: 30, spots: 30, venue_side: 'customer',   booking_mode: 'request' },
]

// { weekdayJsIndex: [HH:MM, ...] }. Sunday = 0, Saturday = 6.
const SCHEDULE = {
  1: ['10:00', '11:00'],                     // Mon
  3: ['10:00', '11:00', '19:00', '20:00'],   // Wed
  4: ['10:00', '11:00', '19:00', '20:00'],   // Thu
  5: ['19:00', '20:00'],                     // Fri
  6: ['19:00', '20:00'],                     // Sat
  0: ['19:00', '20:00'],                     // Sun
}
const WEEKS = 4

// ── Fetch business + listing_id ─────────────────────────────────────
console.log(`— Loading business #${bizId} via admin-businesses op=get…`)
const { business: biz, listing_id: listingId } = await adminFn({ op: 'get', business_id: bizId })
console.log(`  business #${biz.id}: ${biz.name} <${biz.email}> · category=${biz.category} · business_type=${biz.business_type} · status=${biz.status}`)
if (!listingId) {
  console.error(`  refuse: no listings row for business #${biz.id}. Approve the business (or save the wizard step) first so a listings row exists.`)
  process.exit(1)
}
console.log(`  linked listing #${listingId}`)

// Category no longer gates the booking flow — the client keys off
// slot.venue_side (address prompt + travel-zone matching) and
// slot.booking_mode (request vs instant). The only category effect is
// routing: request-mode bookings at Private Instructor businesses go to
// pending_instructor + SMS via notify-instructor-sms; everywhere else
// they go to pending_venue + email with accept/decline HMAC links via
// notify-venue-slot-request. Noor (category=Yoga) → email flow.

// ── Build slot rows ─────────────────────────────────────────────────
const now = new Date()
const start = new Date(now); start.setHours(0, 0, 0, 0)
const end   = new Date(start); end.setDate(end.getDate() + WEEKS * 7)

const rows = []
for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
  const dow = d.getDay()
  const times = SCHEDULE[dow]
  if (!times) continue
  const dateStr = d.toISOString().slice(0, 10)
  for (const time of times) {
    const slotAt = new Date(`${dateStr}T${time}:00`)
    if (slotAt < now) continue
    for (const off of OFFERINGS) {
      rows.push({
        name: off.name,
        date: dateStr,
        time,
        dur: '60 min',
        spots: off.spots,
        credits: off.credits,
        acuity_type_id: null,
        venue_side: off.venue_side,
        booking_mode: off.booking_mode,
      })
    }
  }
}

console.log(`\n— Plan: ${rows.length} slot rows for business #${biz.id} / listing #${listingId}`)
const byOff = rows.reduce((acc, r) => { acc[r.name] = (acc[r.name] || 0) + 1; return acc }, {})
for (const [name, n] of Object.entries(byOff)) console.log(`  ${String(n).padStart(3)}  ${name}`)
console.log(`  first: ${rows[0]?.date} ${rows[0]?.time}    last: ${rows[rows.length-1]?.date} ${rows[rows.length-1]?.time}`)

if (!APPLY) {
  console.log(`\n(dry run — re-run with --apply to insert)`)
  process.exit(0)
}

// ── Insert via the admin edge function ──────────────────────────────
console.log(`\n— Inserting via admin-businesses op=insert_slots …`)
const result = await adminFn({ op: 'insert_slots', listing_id: listingId, slot_rows: rows })
console.log(`✓ inserted ${result.inserted} rows.`)
