import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import Stripe from 'https://esm.sh/stripe@17.3.0?target=denonext'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1?target=denonext'

// Weekly payout job — Wello → partners.
//
// Runs weekly (Monday 09:00 Europe/Madrid via pg_cron in production;
// admin-triggered manually until the schedule is trusted). For every
// active connected account, sums the session value of every confirmed
// booking that finished before the cutoff and hasn't been paid out yet,
// deducts commission per the partner's ACCEPTED rate, creates a Stripe
// Transfer to that partner's connected account, stamps the bookings
// with the transfer id, generates a statement PDF, stores it, emails
// it, and logs the outcome.
//
// Design notes worth pinning down here because they matter for money:
//
//   1. IDEMPOTENCY. Stripe Transfer creation uses an idempotency key
//      `wello-payout-{business_id}-{run_id}`. A second call with the
//      same key is a no-op (returns the existing Transfer). The DB
//      commit that stamps payout_transfer_id + payout_at is guarded by
//      payout_at IS NULL in the update filter; a re-run that already
//      stamped the rows returns zero affected rows and logs
//      'partial_db_commit'. So even a partial-failure retry cannot
//      double-pay.
//
//   2. COMMISSION RATE. Uses businesses.terms_accepted_commission as
//      the authoritative rate — this is the rate the partner formally
//      accepted in the Partner Agreement. If that column is null the
//      business is SKIPPED and flagged 'no_commission_rate'. A partner
//      who hasn't accepted a rate must never be paid on an assumed
//      rate. There is no fallback.
//
//   3. FOUNDING INCENTIVE. businesses.founding_incentive_bookings = N.
//      The FIRST N delivered bookings for that partner, ordered by
//      (booking_date, start_time, id), pay out at 100% of session
//      value (commission = 0). This is stable across payouts — if
//      last week's payout consumed 3 of 5 incentive bookings, this
//      week's first 2 delivered bookings are still commission-free.
//      Bookings 6+ ever pay the accepted rate.
//
//   4. ELIGIBILITY. status = 'confirmed' AND (booking_date +
//      start_time + duration) <= cutoff. Uses session END so we only
//      pay for genuinely delivered sessions per Partner Agreement
//      clause 6.4/1.x. Cancelled / refunded bookings (status ==
//      'cancelled') are already excluded by the status filter. Times
//      are treated as Madrid-local wall-clock throughout.
//
//   5. CUTOFF. Most-recent Monday 00:00 Europe/Madrid, computed from
//      wall-clock now in Madrid. Overridable via body.cutoff_iso for
//      admin backfill / catch-up runs. Bookings that finished after
//      the cutoff wait for the following week.
//
//   6. PER-BUSINESS ISOLATION. One Stripe API error, DB error, or
//      restricted-account response never aborts the batch. Each
//      business is processed inside its own try/catch; failures land
//      in payout_log with status='failed' + reason, and the loop
//      continues to the next business.
//
//   7. DRY RUN. body.dry_run=true returns the planned batch as JSON
//      without touching Stripe, the DB, Storage, Resend, or
//      payout_log. Used by the admin UI for a "what would happen this
//      week" preview.
//
//   8. AUTH. Two allowed callers:
//        (a) service-role JWT: Authorization matches
//            SUPABASE_SERVICE_ROLE_KEY exactly. This is the pg_cron
//            path — cron.schedule('...', $$ select net.http_post(...
//            headers => jsonb_build_object('Authorization',
//            'Bearer ' || <service_role_key>) ) $$).
//        (b) admin JWT: user id present in ADMIN_USER_IDS (shared
//            helper). This is the admin=setup panel and CLI invoke
//            path.
//
// Pre-merge chores (kept here so a reviewer sees them):
//   • Stripe Dashboard: add `account.updated` to the sandbox webhook
//     endpoint's event list. The Connect branch's stripe-webhook
//     handler is a no-op until the endpoint subscribes to it.
//   • Confirm deployed stripe-webhook matches the branch's version
//     BEFORE merge (drift check).

// ─── Env ──────────────────────────────────────────────────────────
// Every one of these is required. A missing var here is a deployment
// error, not something we can degrade to. Fail loud at cold start
// rather than silently returning empty JSON to pg_cron.
const STRIPE_SECRET_KEY         = required('STRIPE_SECRET_KEY')
const SUPABASE_URL              = required('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = required('SUPABASE_SERVICE_ROLE_KEY')
const SUPABASE_ANON_KEY         = required('SUPABASE_ANON_KEY')
const ADMIN_USER_IDS            = (Deno.env.get('ADMIN_USER_IDS') || '')
  .split(',').map(s => s.trim()).filter(Boolean)
const RESEND_API_KEY            = Deno.env.get('RESEND_API_KEY') || ''

function required(name: string): string {
  const v = Deno.env.get(name)
  if (!v) throw new Error(`run-weekly-payouts: missing required env var ${name}`)
  return v
}

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2024-09-30.acacia',
  httpClient: Stripe.createFetchHttpClient(),
})

// Service-role client is safe here — this function runs with the
// service-role key regardless of caller, so RLS is bypassed. Every
// query below narrows explicitly by business_id / status.
const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  })

// ─── Auth ─────────────────────────────────────────────────────────
// Returns { ok:true } if the caller is the service-role JWT (pg_cron
// path) OR an admin user (allowlisted UUID). Anything else is 403.
async function authorise(req: Request): Promise<{ ok: true; via: 'service_role' | 'admin'; userId?: string } | { ok: false; response: Response }> {
  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) return { ok: false, response: json({ error: 'Missing Authorization header.' }, 401) }

  // Path A: service-role key (pg_cron).
  if (token === SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: true, via: 'service_role' }
  }

  // Path B: admin JWT. Same shape as _shared/admin_auth.ts but inlined
  // to keep this function self-contained — one file to deploy.
  if (ADMIN_USER_IDS.length === 0) {
    return { ok: false, response: json({ error: 'Admin allowlist not configured.' }, 403) }
  }
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error } = await client.auth.getUser(token)
  if (error || !data?.user) return { ok: false, response: json({ error: 'Invalid or non-user token.' }, 403) }
  if (!ADMIN_USER_IDS.includes(data.user.id)) {
    return { ok: false, response: json({ error: 'Not on the admin allowlist.' }, 403) }
  }
  return { ok: true, via: 'admin', userId: data.user.id }
}

// ─── Cutoff computation ───────────────────────────────────────────
// Bookings store booking_date + start_time + duration as Madrid-local
// wall-clock (the app assumes Europe/Madrid throughout — 9:00-19:00
// Spanish time is called out in the Partner Agreement's safety-window
// clause). We compare cutoff and session-end AS Madrid-local strings
// without a timezone, avoiding DST math on the hot path.
type MadridParts = { y: number; mo: number; d: number; weekdayIdx: number }
function madridParts(d: Date): MadridParts {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid',
    year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour12: false,
  })
  const parts = fmt.formatToParts(d)
  const get = (t: string) => parts.find(p => p.type === t)?.value || ''
  const weekdayIdx = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(get('weekday'))
  return {
    y:  Number(get('year')),
    mo: Number(get('month')),
    d:  Number(get('day')),
    weekdayIdx,
  }
}

// Most recent Monday 00:00 Europe/Madrid, expressed as a date-string
// (YYYY-MM-DD). If today (Madrid) is Monday, returns today. Bookings
// that ended before this date-time are eligible for this batch.
function mostRecentMondayMadrid(now = new Date()): string {
  const p = madridParts(now)
  const daysSinceMonday = p.weekdayIdx === 0 ? 6 : p.weekdayIdx - 1
  const monday = new Date(Date.UTC(p.y, p.mo - 1, p.d - daysSinceMonday))
  return monday.toISOString().slice(0, 10)
}

// Parse a bookings row's (date, time, duration) into a pretend-UTC ms.
// Both sides of the comparison use the same convention, so the naive
// parse is safe.
function madridLocalMs(date: string, time: string | null, addMinutes = 0): number {
  const t = (time || '00:00').slice(0, 5)
  return new Date(`${date}T${t}:00Z`).getTime() + addMinutes * 60_000
}

// ─── Types ────────────────────────────────────────────────────────
type BusinessRow = {
  id: number
  name: string
  email: string | null
  stripe_account_id: string | null
  stripe_account_status: string | null
  commission_rate: number | null
  terms_accepted_commission: number | null
  founding_incentive_bookings: number | null
}
type BookingRow = {
  id: number
  booking_date: string
  start_time: string | null
  duration: number | null
  credits_used: number | null
  payout_at: string | null
  user_id: string | null
  notes: string | null
  offering_type: string | null
  slot_id: number | null
}
type ProfileRow = { id: string; full_name: string | null; email: string | null }
type Item = BookingRow & {
  value_cents: number
  commission_cents: number
  net_cents: number
  is_incentive: boolean
  member_first_name: string
  session_label: string
}

// ─── Payout plan for one business ─────────────────────────────────
type Plan =
  | { kind: 'skip'; business: BusinessRow; reason: string }
  | {
      kind: 'run'
      business: BusinessRow
      items: Item[]
      gross_cents: number
      commission_cents: number
      net_cents: number
      rate: number
      incentive_used_after: number
      incentive_remaining_after: number
    }

async function planForBusiness(business: BusinessRow, cutoffMs: number): Promise<Plan> {
  if (business.stripe_account_status !== 'active') {
    return { kind: 'skip', business, reason: 'account_not_active' }
  }
  const rate = business.terms_accepted_commission
  if (rate == null) {
    // No accepted rate on file — Partner Agreement gate says we must
    // not pay. Would fire if a partner was created without ever
    // completing the agreement flow, or if terms_accepted_commission
    // got cleared. Admin intervention required.
    return { kind: 'skip', business, reason: 'no_commission_rate' }
  }

  // Pull every confirmed booking for this business, chronological. The
  // set is small (typical launch partner does <100 bookings/week) so
  // filtering in JS is fine and avoids arcane SQL for the
  // Madrid-local cutoff.
  const { data: rows, error } = await db
    .from('bookings')
    .select('id, booking_date, start_time, duration, credits_used, payout_at, user_id, notes, offering_type, slot_id')
    .eq('business_id', business.id)
    .eq('status', 'confirmed')
    .order('booking_date', { ascending: true })
    .order('start_time',   { ascending: true })
    .order('id',           { ascending: true })
  if (error) throw new Error(`load bookings for business ${business.id}: ${error.message}`)

  const bookings = (rows || []) as BookingRow[]

  // Filter to delivered — session end <= cutoff.
  const delivered = bookings.filter(b => {
    const endMs = madridLocalMs(b.booking_date, b.start_time, Number(b.duration) || 0)
    return endMs <= cutoffMs
  })

  // Founding incentive: first N delivered ever, ordered chronologically.
  const N = Math.max(0, Number(business.founding_incentive_bookings || 0))
  const incentiveIds = new Set(delivered.slice(0, N).map(b => b.id))

  // Unpaid subset — the bookings this run pays.
  const unpaid = delivered.filter(b => b.payout_at == null)
  if (unpaid.length === 0) {
    return { kind: 'skip', business, reason: 'no_delivered_bookings' }
  }

  // Look up member first names + session labels for the statement. We
  // pull both in one query each to keep the round-trips bounded.
  const userIds  = Array.from(new Set(unpaid.map(b => b.user_id).filter(Boolean))) as string[]
  const slotIds  = Array.from(new Set(unpaid.map(b => b.slot_id).filter(Boolean))) as number[]

  const [profilesRes, slotsRes] = await Promise.all([
    userIds.length
      ? db.from('profiles').select('id, full_name, email').in('id', userIds)
      : Promise.resolve({ data: [] as ProfileRow[], error: null }),
    slotIds.length
      ? db.from('slots').select('id, name, category').in('id', slotIds)
      : Promise.resolve({ data: [] as { id: number; name: string | null; category: string | null }[], error: null }),
  ])
  if (profilesRes.error) throw new Error(`load profiles: ${profilesRes.error.message}`)
  if (slotsRes.error)    throw new Error(`load slots: ${slotsRes.error.message}`)

  const profileById = new Map<string, ProfileRow>()
  for (const p of (profilesRes.data as ProfileRow[])) profileById.set(p.id, p)
  const slotById = new Map<number, { name: string | null; category: string | null }>()
  for (const s of (slotsRes.data as { id: number; name: string | null; category: string | null }[])) slotById.set(s.id, { name: s.name, category: s.category })

  const items: Item[] = unpaid.map(b => {
    const value_cents      = Math.round((Number(b.credits_used) || 0) * 100)
    const is_incentive     = incentiveIds.has(b.id)
    const commission_cents = is_incentive ? 0 : Math.round(value_cents * rate)
    const net_cents        = value_cents - commission_cents
    const prof = b.user_id ? profileById.get(b.user_id) : null
    const member_first_name = (prof?.full_name || '').trim().split(/\s+/)[0] || (prof?.email?.split('@')[0] || 'Member')
    const slot = b.slot_id ? slotById.get(b.slot_id) : null
    const session_label = slot?.name || b.offering_type || 'Session'
    return { ...b, value_cents, commission_cents, net_cents, is_incentive, member_first_name, session_label }
  })

  const gross_cents      = items.reduce((s, i) => s + i.value_cents,      0)
  const commission_cents = items.reduce((s, i) => s + i.commission_cents, 0)
  const net_cents        = gross_cents - commission_cents

  if (net_cents <= 0) {
    // Whole batch was incentive-covered and rate * gross rounds to zero.
    // Nothing to transfer this week. Still log so the admin can see we
    // evaluated the business and decided not to move money.
    return { kind: 'skip', business, reason: 'no_positive_net' }
  }

  // Incentive counter after this payout, for the statement footer.
  const incentive_used_after = Math.min(delivered.length, N)
  const incentive_remaining_after = Math.max(0, N - incentive_used_after)

  return { kind: 'run', business, items, gross_cents, commission_cents, net_cents, rate, incentive_used_after, incentive_remaining_after }
}

// ─── PDF statement ────────────────────────────────────────────────
// Deliberately simple layout: A4 portrait, one page for a typical
// weekly batch. Multi-page overflow is handled by trimming the table
// (see MAX_ROWS below) and adding a "+ N more" line. Full detail lives
// in payout_log.booking_ids for auditable retrieval.
const WELLO_NAME    = 'Wello-Wellness Ltd'
const WELLO_NUMBER  = '17318025'
const WELLO_ADDRESS = '9 Colville Gardens, GU18 5QQ, UK'
const WELLO_EMAIL   = 'hello@wello-wellness.com'

async function buildStatementPdf(plan: Extract<Plan, { kind: 'run' }>, ctx: {
  runId: string
  cutoffDate: string
  transferId: string
  paidAtIso: string
}): Promise<Uint8Array> {
  const pdf     = await PDFDocument.create()
  const page    = pdf.addPage([595.28, 841.89]) // A4
  const font    = await pdf.embedFont(StandardFonts.Helvetica)
  const bold    = await pdf.embedFont(StandardFonts.HelveticaBold)
  const ink     = rgb(0.11, 0.11, 0.10)
  const soft    = rgb(0.33, 0.35, 0.31)
  const sage    = rgb(0.13, 0.24, 0.10)

  const draw = (text: string, x: number, y: number, opts: { size?: number; f?: 'reg' | 'bold'; color?: ReturnType<typeof rgb> } = {}) => {
    page.drawText(text, {
      x, y,
      size: opts.size ?? 10,
      font: opts.f === 'bold' ? bold : font,
      color: opts.color ?? ink,
    })
  }

  const MARGIN_X = 48
  let y = 800

  // Brand + company block
  draw('Wello', MARGIN_X, y, { size: 24, f: 'bold', color: sage })
  y -= 18
  draw(`${WELLO_NAME}  ·  Company No. ${WELLO_NUMBER}`, MARGIN_X, y, { size: 9, color: soft })
  y -= 12
  draw(`${WELLO_ADDRESS}  ·  ${WELLO_EMAIL}`, MARGIN_X, y, { size: 9, color: soft })

  // Statement title
  y -= 30
  draw('Payout statement', MARGIN_X, y, { size: 16, f: 'bold' })

  // Meta block (2-column)
  y -= 22
  const metaRows: [string, string][] = [
    ['Partner',         plan.business.name || `Business #${plan.business.id}`],
    ['Period ending',   `${ctx.cutoffDate}  (Europe/Madrid)`],
    ['Payout date',     ctx.paidAtIso.slice(0, 10)],
    ['Stripe transfer', ctx.transferId],
    ['Commission rate', `${(plan.rate * 100).toFixed(1)}%`],
  ]
  for (const [k, v] of metaRows) {
    draw(k, MARGIN_X, y, { size: 9, color: soft })
    draw(v, MARGIN_X + 120, y, { size: 10, f: 'bold' })
    y -= 14
  }

  // Table header
  y -= 12
  const COL_DATE   = MARGIN_X
  const COL_LABEL  = MARGIN_X + 78
  const COL_MEMBER = MARGIN_X + 260
  const COL_VALUE  = MARGIN_X + 360
  const COL_FEE    = MARGIN_X + 440
  draw('Date',    COL_DATE,   y, { size: 9, f: 'bold', color: soft })
  draw('Session', COL_LABEL,  y, { size: 9, f: 'bold', color: soft })
  draw('Member',  COL_MEMBER, y, { size: 9, f: 'bold', color: soft })
  draw('Value',   COL_VALUE,  y, { size: 9, f: 'bold', color: soft })
  draw('Fee',     COL_FEE,    y, { size: 9, f: 'bold', color: soft })
  y -= 4
  page.drawLine({ start: { x: MARGIN_X, y }, end: { x: 555, y }, thickness: 0.5, color: soft })
  y -= 10

  // Table rows (trim to fit one page for now)
  const MAX_ROWS  = 32
  const shown     = plan.items.slice(0, MAX_ROWS)
  const truncated = plan.items.length - shown.length
  for (const it of shown) {
    if (y < 140) break
    const dateStr = it.booking_date
    const label = truncate(it.session_label, 30) + (it.is_incentive ? ' *' : '')
    const value = `€${(it.value_cents / 100).toFixed(2)}`
    const fee   = it.is_incentive ? '—' : `€${(it.commission_cents / 100).toFixed(2)}`
    draw(dateStr,             COL_DATE,   y, { size: 9 })
    draw(label,               COL_LABEL,  y, { size: 9 })
    draw(truncate(it.member_first_name, 16), COL_MEMBER, y, { size: 9 })
    draw(value,               COL_VALUE,  y, { size: 9 })
    draw(fee,                 COL_FEE,    y, { size: 9 })
    y -= 13
  }
  if (truncated > 0) {
    draw(`+ ${truncated} more (see payout_log.booking_ids)`, COL_DATE, y, { size: 9, color: soft })
    y -= 14
  }

  // Footer incentive note
  y -= 4
  page.drawLine({ start: { x: MARGIN_X, y }, end: { x: 555, y }, thickness: 0.5, color: soft })
  y -= 14
  if (plan.items.some(i => i.is_incentive)) {
    const incentive_msg = plan.incentive_remaining_after > 0
      ? `* Founding-partner incentive: no commission on your first ${plan.business.founding_incentive_bookings} delivered bookings. ${plan.incentive_remaining_after} commission-free bookings remaining after this payout.`
      : `* Founding-partner incentive: no commission on your first ${plan.business.founding_incentive_bookings} delivered bookings. Incentive fully applied — future bookings pay commission at ${(plan.rate * 100).toFixed(1)}%.`
    y = drawWrapped(page, font, incentive_msg, MARGIN_X, y, 500, 9, soft)
    y -= 8
  }

  // Totals
  y -= 4
  draw('Gross',      COL_VALUE - 40, y, { size: 10, color: soft }); draw(`€${(plan.gross_cents / 100).toFixed(2)}`,      COL_FEE, y, { size: 10, f: 'bold' })
  y -= 14
  draw('Commission', COL_VALUE - 40, y, { size: 10, color: soft }); draw(`-€${(plan.commission_cents / 100).toFixed(2)}`, COL_FEE, y, { size: 10, f: 'bold' })
  y -= 14
  draw('Net paid',   COL_VALUE - 40, y, { size: 11, f: 'bold', color: sage })
  draw(`€${(plan.net_cents / 100).toFixed(2)}`, COL_FEE, y, { size: 11, f: 'bold', color: sage })

  // VAT note — flagged for accountant review, per the requirement.
  y -= 32
  const vatMsg = 'Reverse-charge VAT applies on Wello\'s commission where the Partner is UK/EU VAT-registered. Format pending accountant review.'
  y = drawWrapped(page, font, vatMsg, MARGIN_X, y, 500, 8, soft)

  return await pdf.save()
}

function truncate(s: string, max: number): string {
  s = s || ''
  return s.length <= max ? s : s.slice(0, max - 1) + '…'
}

// Word-wrap a paragraph into a fixed pixel width. Returns the y
// coordinate below the last drawn line so the caller can continue
// laying out the page.
function drawWrapped(
  page: ReturnType<PDFDocument['addPage']>,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  text: string, x: number, y: number, maxWidth: number, size: number, color: ReturnType<typeof rgb>,
): number {
  const words = text.split(/\s+/)
  let line = ''
  for (const w of words) {
    const next = line ? `${line} ${w}` : w
    if (font.widthOfTextAtSize(next, size) > maxWidth) {
      page.drawText(line, { x, y, size, font, color })
      y -= size + 3
      line = w
    } else {
      line = next
    }
  }
  if (line) {
    page.drawText(line, { x, y, size, font, color })
    y -= size + 3
  }
  return y
}

// ─── Storage + email ──────────────────────────────────────────────
async function storeStatement(runId: string, businessId: number, pdfBytes: Uint8Array): Promise<{ path: string } | { error: string }> {
  const path = `${businessId}/${runId}.pdf`
  const { error } = await db.storage.from('payout-statements').upload(path, pdfBytes, {
    contentType: 'application/pdf',
    upsert: true, // idempotent — same run_id + business_id is safe to re-upload
  })
  if (error) return { error: error.message }
  return { path }
}

async function emailStatement(business: BusinessRow, pdfBytes: Uint8Array, ctx: { cutoffDate: string; netCents: number; transferId: string }): Promise<'sent' | 'failed' | 'no_resend_key' | 'no_partner_email'> {
  if (!RESEND_API_KEY) return 'no_resend_key'
  if (!business.email) return 'no_partner_email'
  const filenameSafe = ctx.cutoffDate.replace(/-/g, '')
  const html = `
    <div style="font-family:Manrope,Arial,sans-serif;max-width:540px;margin:0 auto;padding:28px;color:#1B1C19;background:#FBF9F4;">
      <h2 style="color:#213C18;font-size:20px;margin:0 0 6px;letter-spacing:-0.4px;">Your Wello payout is on the way</h2>
      <p style="margin:0 0 20px;line-height:1.5;font-size:14px;color:#54584F;">€${(ctx.netCents / 100).toFixed(2)} for the week ending ${ctx.cutoffDate} has been sent via Stripe to your connected bank account. Statement attached with per-booking detail.</p>
      <p style="margin:0;font-size:11px;color:#A3B18A;line-height:1.5;">Stripe transfer: <code>${ctx.transferId}</code></p>
    </div>`
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from:    'Wello <hello@wello-wellness.com>',
      to:      business.email,
      subject: `Wello payout — week ending ${ctx.cutoffDate}`,
      html,
      attachments: [{
        filename: `wello-payout-${filenameSafe}.pdf`,
        content:  base64(pdfBytes),
      }],
    }),
  }).catch(e => { console.error('Resend statement error:', e); return null })
  return r?.ok ? 'sent' : 'failed'
}

function base64(bytes: Uint8Array): string {
  // pdf-lib returns a Uint8Array; Resend expects base64 string.
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

// ─── Log helper ───────────────────────────────────────────────────
type LogRow = {
  run_id: string
  business_id: number
  status: 'paid' | 'skipped' | 'failed'
  reason?: string | null
  booking_ids?: number[] | null
  gross_cents?: number | null
  commission_cents?: number | null
  net_cents?: number | null
  stripe_transfer_id?: string | null
  statement_path?: string | null
  statement_email_status?: string | null
  error_message?: string | null
}
async function logPayout(row: LogRow) {
  const { error } = await db.from('payout_log').insert(row)
  if (error) console.error('payout_log insert failed:', error.message, row)
}

// ─── Handler ──────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')    return json({ error: 'POST only' }, 405)

  const gate = await authorise(req)
  if (!gate.ok) return gate.response

  let body: { dry_run?: boolean; business_ids?: number[]; cutoff_iso?: string } = {}
  try { body = await req.json() } catch { /* empty body is fine */ }

  const dry_run = !!body.dry_run
  const runId = crypto.randomUUID()
  const cutoffDate = body.cutoff_iso
    ? body.cutoff_iso.slice(0, 10)
    : mostRecentMondayMadrid()
  const cutoffMs = madridLocalMs(cutoffDate, '00:00', 0)

  // Load candidate businesses. We include ALL businesses with an
  // account_id (even non-active) because we want to LOG the skip
  // reason for the admin — silently ignoring accounts is how partners
  // end up asking why they weren't paid this week.
  let q = db
    .from('businesses')
    .select('id, name, email, stripe_account_id, stripe_account_status, commission_rate, terms_accepted_commission, founding_incentive_bookings')
    .not('stripe_account_id', 'is', null)
    .order('id', { ascending: true })
  if (body.business_ids?.length) q = q.in('id', body.business_ids)
  const { data: businesses, error: bizErr } = await q
  if (bizErr) return json({ error: `load businesses: ${bizErr.message}` }, 500)

  const results: unknown[] = []
  let totalPaidCents = 0

  for (const business of (businesses || []) as BusinessRow[]) {
    // Per-business try/catch: one Stripe/DB/PDF failure never aborts
    // the batch. The failed business gets a payout_log row; the loop
    // moves on.
    try {
      const plan = await planForBusiness(business, cutoffMs)

      if (plan.kind === 'skip') {
        if (!dry_run) await logPayout({ run_id: runId, business_id: business.id, status: 'skipped', reason: plan.reason })
        results.push({ business_id: business.id, name: business.name, status: 'skipped', reason: plan.reason })
        continue
      }

      const bookingIds = plan.items.map(i => i.id)

      if (dry_run) {
        results.push({
          business_id: business.id,
          name: business.name,
          status: 'plan',
          rate: plan.rate,
          gross_cents: plan.gross_cents,
          commission_cents: plan.commission_cents,
          net_cents: plan.net_cents,
          booking_count: bookingIds.length,
          incentive_used_after: plan.incentive_used_after,
          incentive_remaining_after: plan.incentive_remaining_after,
        })
        continue
      }

      // ── Real path ──
      // 1. Create Transfer (idempotent by key). Any Stripe error here
      //    aborts THIS business but not the batch.
      const transfer = await stripe.transfers.create({
        amount:      plan.net_cents,
        currency:    'eur',
        destination: business.stripe_account_id!,
        transfer_group: `wello_payout_${runId}`,
        description: `Wello weekly payout — week ending ${cutoffDate}`,
        metadata: {
          run_id:            runId,
          business_id:       String(business.id),
          business_name:     business.name || '',
          cutoff_date:       cutoffDate,
          booking_ids:       bookingIds.join(','),
          gross_cents:       String(plan.gross_cents),
          commission_cents: String(plan.commission_cents),
        },
      }, {
        idempotencyKey: `wello-payout-${business.id}-${runId}`,
      })

      // 2. Stamp bookings. Guard by payout_at IS NULL so a concurrent
      //    run can't re-stamp; count check catches the mismatch loudly.
      const paidAtIso = new Date().toISOString()
      const { data: stamped, error: updErr } = await db
        .from('bookings')
        .update({ payout_transfer_id: transfer.id, payout_at: paidAtIso })
        .in('id', bookingIds)
        .is('payout_at', null)
        .select('id')

      if (updErr || !stamped || stamped.length !== bookingIds.length) {
        // Money has moved but the DB record didn't fully commit. This
        // is the worst case: on a retry we could double-pay. Log as
        // 'partial_db_commit' with the transfer id + expected/actual
        // counts so the admin can reconcile manually. The next run
        // will filter out the successfully-stamped rows (payout_at IS
        // NULL guard) but not the un-stamped ones — hence the alarm.
        await logPayout({
          run_id: runId,
          business_id: business.id,
          status: 'failed',
          reason: 'partial_db_commit',
          stripe_transfer_id: transfer.id,
          booking_ids: stamped?.map(r => r.id) ?? [],
          gross_cents: plan.gross_cents,
          commission_cents: plan.commission_cents,
          net_cents: plan.net_cents,
          error_message: updErr?.message || `expected ${bookingIds.length} stamped, got ${stamped?.length ?? 0}`,
        })
        results.push({ business_id: business.id, name: business.name, status: 'failed', reason: 'partial_db_commit', transfer_id: transfer.id })
        continue
      }

      // 3. Statement PDF: build, store, email. A failure here is
      //    NON-FATAL — the money has moved and the DB agrees. We log
      //    the statement outcome inside the payout_log row and move
      //    on. Admin can re-generate later if needed.
      let statementPath: string | null = null
      let statementEmail: string = 'not_sent'
      let statementError: string | null = null
      try {
        const pdfBytes = await buildStatementPdf(plan, { runId, cutoffDate, transferId: transfer.id, paidAtIso })
        const stored = await storeStatement(runId, business.id, pdfBytes)
        if ('path' in stored) statementPath = stored.path
        else                   statementError = `store failed: ${stored.error}`
        statementEmail = await emailStatement(business, pdfBytes, { cutoffDate, netCents: plan.net_cents, transferId: transfer.id })
      } catch (e) {
        statementError = (e as Error).message
        console.error(`statement build/send failed for business ${business.id}:`, e)
      }

      await logPayout({
        run_id: runId,
        business_id: business.id,
        status: 'paid',
        reason: statementError ? 'statement_generation_failed' : null,
        booking_ids: bookingIds,
        gross_cents: plan.gross_cents,
        commission_cents: plan.commission_cents,
        net_cents: plan.net_cents,
        stripe_transfer_id: transfer.id,
        statement_path: statementPath,
        statement_email_status: statementEmail,
        error_message: statementError,
      })

      totalPaidCents += plan.net_cents
      results.push({
        business_id: business.id,
        name: business.name,
        status: 'paid',
        transfer_id: transfer.id,
        net_cents: plan.net_cents,
        booking_count: bookingIds.length,
        statement_path: statementPath,
        statement_email_status: statementEmail,
        statement_error: statementError,
      })
    } catch (e) {
      const msg = (e as Error).message || 'unexpected'
      console.error(`business ${business.id} failed:`, e)
      if (!dry_run) {
        await logPayout({
          run_id: runId,
          business_id: business.id,
          status: 'failed',
          reason: msg.startsWith('load ') ? 'unexpected' : 'stripe_error',
          error_message: msg,
        })
      }
      results.push({ business_id: business.id, name: business.name, status: 'failed', error: msg })
    }
  }

  return json({
    run_id: runId,
    dry_run,
    cutoff_date: cutoffDate,
    total_paid_cents: totalPaidCents,
    business_count: results.length,
    caller: gate.via,
    results,
  })
})
