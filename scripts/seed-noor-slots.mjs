// One-off: seed Noor Yoga's session slots.
//
// Runs against the LINKED Supabase project via the admin edge function
// (op: insert_slots on admin-businesses), so it respects the same
// column whitelist the admin UI does. Requires:
//
//   SUPABASE_URL                = https://<ref>.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY   = service-role JWT (used for the lookup
//                                 and as auth for the admin edge fn)
//
// Optional:
//   BUSINESS_ID                 = numeric id to skip the name-based
//                                 lookup. Recommended for production
//                                 runs so you're 100% sure which row
//                                 gets slots.
//
// Usage:
//   node scripts/seed-noor-slots.mjs                # dry run, prints planned rows
//   node scripts/seed-noor-slots.mjs --apply        # actually inserts
//
// Idempotency: NOT idempotent. Re-running will insert duplicate slots
// for overlapping dates. If you need to re-seed, delete Noor's slots
// first with a targeted query.

import { createClient } from '@supabase/supabase-js'

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env
for (const [k, v] of Object.entries({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY })) {
  if (!v) { console.error(`missing env: ${k}`); process.exit(1) }
}
const APPLY = process.argv.includes('--apply')

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ── Noor's offerings ────────────────────────────────────────────────
// name           what shows on the marketplace card + booking modal.
// credits        per-attendee price (goes into slots.credits).
// spots          capacity per slot (1 = 1-on-1; >1 = group class).
// venue_side     'instructor' = at Noor's place / by the sea;
//                'customer'   = at the customer's address.
// booking_mode   'request' for 1-on-1s (Noor confirms each);
//                'instant'  for group classes (auto-confirm, she checks
//                dashboard). Flip in the partner portal later if wrong.
const OFFERINGS = [
  { name: "Private · at her place or by the sea · 60 min",       credits: 30, spots: 1,  venue_side: 'instructor', booking_mode: 'request' },
  { name: "Small group (2-4) · at her place or by the sea · 60 min", credits: 20, spots: 4,  venue_side: 'instructor', booking_mode: 'instant' },
  { name: "Large group · at her place or by the sea · 60 min",   credits: 15, spots: 30, venue_side: 'instructor', booking_mode: 'instant' },
  { name: "Private · at your home · 60 min",                     credits: 60, spots: 1,  venue_side: 'customer',   booking_mode: 'request' },
  { name: "Group · at your home · 60 min",                       credits: 30, spots: 30, venue_side: 'customer',   booking_mode: 'request' },
]

// ── Weekly schedule ─────────────────────────────────────────────────
// { weekdayJsIndex: [HH:MM, ...] }. Sunday = 0, Saturday = 6.
const SCHEDULE = {
  1: ['10:00', '11:00'],                     // Mon
  3: ['10:00', '11:00', '19:00', '20:00'],   // Wed
  4: ['10:00', '11:00', '19:00', '20:00'],   // Thu
  5: ['19:00', '20:00'],                     // Fri
  6: ['19:00', '20:00'],                     // Sat
  0: ['19:00', '20:00'],                     // Sun
}
const WEEKS = 4  // rolling horizon; matches the wizard's default expansion

// ── Locate Noor ─────────────────────────────────────────────────────
// Prefer explicit BUSINESS_ID (safer for production). Fall back to a
// name-ilike lookup, refuse if it's ambiguous.
let biz
const explicitId = process.env.BUSINESS_ID ? Number(process.env.BUSINESS_ID) : null
if (explicitId && Number.isFinite(explicitId)) {
  console.log(`— Loading business #${explicitId} (from BUSINESS_ID env)…`)
  const { data, error } = await admin
    .from('businesses')
    .select('id, name, email, category, business_type, status')
    .eq('id', explicitId)
    .maybeSingle()
  if (error) { console.error('lookup failed:', error.message); process.exit(1) }
  if (!data)  { console.error(`no business found with id=${explicitId}.`); process.exit(1) }
  biz = data
} else {
  console.log(`— Looking up Noor Yoga by name…`)
  const { data: candidates, error: findErr } = await admin
    .from('businesses')
    .select('id, name, email, category, business_type, status')
    .ilike('name', '%noor%')
  if (findErr) { console.error('lookup failed:', findErr.message); process.exit(1) }
  if (!candidates || candidates.length === 0) {
    console.error(`no business found with name matching "noor". Set BUSINESS_ID=<id> or check the record exists.`)
    process.exit(1)
  }
  if (candidates.length > 1) {
    console.error(`multiple businesses match "noor":`); console.table(candidates)
    console.error(`disambiguate: rerun with BUSINESS_ID=<id> pointing at the right one.`)
    process.exit(1)
  }
  biz = candidates[0]
}
console.log(`  business #${biz.id}: ${biz.name} <${biz.email}> · category=${biz.category} · status=${biz.status}`)

if (biz.category !== 'Private Instructor') {
  console.error(`  refuse: category is "${biz.category}", not "Private Instructor". These offerings assume the private-instructor booking flow (pending_instructor for 1-on-1s, per-slot venue_side).`)
  process.exit(1)
}

// ── Find the linked listing ─────────────────────────────────────────
const { data: listings, error: lErr } = await admin
  .from('listings')
  .select('id, name, status')
  .eq('business_id', biz.id)
if (lErr) { console.error('listing lookup failed:', lErr.message); process.exit(1) }
if (!listings || listings.length === 0) {
  console.error(`  refuse: no listings row for business #${biz.id}. Approve the business (or run the wizard's Save step) first so a listings row exists.`)
  process.exit(1)
}
if (listings.length > 1) {
  console.error(`  multiple listings for business #${biz.id}:`); console.table(listings)
  console.error(`  ambiguous — resolve before seeding.`)
  process.exit(1)
}
const listing = listings[0]
console.log(`  linked listing #${listing.id} (status=${listing.status})`)

// ── Build slot rows ─────────────────────────────────────────────────
// Horizon: today → today + 4 weeks. Skip any slot in the past (script
// might be run mid-week and Mon 10:00 has already gone).
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
    // Skip slots already in the past today.
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

console.log(`\n— Plan: ${rows.length} slot rows for business #${biz.id} / listing #${listing.id}`)
const byOff = rows.reduce((acc, r) => { acc[r.name] = (acc[r.name] || 0) + 1; return acc }, {})
for (const [name, n] of Object.entries(byOff)) console.log(`  ${n.toString().padStart(3)}  ${name}`)
console.log(`  first: ${rows[0]?.date} ${rows[0]?.time}    last: ${rows[rows.length-1]?.date} ${rows[rows.length-1]?.time}`)

if (!APPLY) {
  console.log(`\n(dry run — re-run with --apply to insert)`)
  process.exit(0)
}

// ── Insert via the admin edge function ──────────────────────────────
// Uses the service-role JWT as auth, which requireAdmin honours the
// same way it does for a real admin login.
console.log(`\n— Inserting via admin-businesses op=insert_slots …`)
const url = `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/admin-businesses`
const resp = await fetch(url, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'apikey':        SUPABASE_SERVICE_ROLE_KEY,
    'Content-Type':  'application/json',
  },
  body: JSON.stringify({ op: 'insert_slots', listing_id: listing.id, slot_rows: rows }),
})
const body = await resp.json().catch(() => ({}))
if (!resp.ok || body?.error) {
  console.error(`insert_slots failed (${resp.status}):`, body?.error || body)
  process.exit(1)
}
console.log(`✓ inserted ${body.inserted} rows.`)
