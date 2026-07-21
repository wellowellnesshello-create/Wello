import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Admin-only test-data seeder for the weekly payout job.
//
// Given a business_id, this function:
//   1. Guarantees the row has commission_rate (default 0.15),
//      terms_accepted_commission (default 0.15 — this is the field
//      run-weekly-payouts treats as authoritative), and
//      founding_incentive_bookings (default 20). Only sets fields that
//      are null; existing values are left alone.
//   2. Also sets terms_accepted_at to now() if null, because the
//      partner-agreement gate elsewhere expects that stamp to be
//      present alongside a rate.
//   3. Inserts one backdated confirmed booking owned by the admin
//      (they act as the "member"). booking_date is default = 4 days
//      ago at 18:00 for 60 minutes with 25 credits, all overridable.
//
// Deliberately admin-gated and clearly test-only — the notes column
// carries a "test booking for payout dry-run" tag so a human eyeballing
// bookings can tell it apart from real ones.
//
// Caveat: bookings_safety_window_trigger blocks confirmed inserts whose
// session start is <2h from now, but ONLY for businesses that opted
// into cancellation_safety_window. For a throwaway test business this
// is normally off (default false). If the flag is on, this function
// short-circuits with a clear error rather than silently mangling
// state; disable the safety window on the row and re-invoke.

const SUPABASE_URL              = required('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = required('SUPABASE_SERVICE_ROLE_KEY')
const SUPABASE_ANON_KEY         = required('SUPABASE_ANON_KEY')
const ADMIN_USER_IDS            = (Deno.env.get('ADMIN_USER_IDS') || '')
  .split(',').map(s => s.trim()).filter(Boolean)

function required(name: string): string {
  const v = Deno.env.get(name)
  if (!v) throw new Error(`seed-payout-test-booking: missing required env var ${name}`)
  return v
}

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b, null, 2), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })

async function authorise(req: Request): Promise<{ ok: true; userId: string } | { ok: false; response: Response }> {
  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) return { ok: false, response: json({ error: 'Missing Authorization header.' }, 401) }
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
  return { ok: true, userId: data.user.id }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')    return json({ error: 'POST only' }, 405)

  const gate = await authorise(req)
  if (!gate.ok) return gate.response

  let body: {
    business_id?: number
    credits?: number
    days_ago?: number
    start_time?: string
    duration?: number
  } = {}
  try { body = await req.json() } catch { /* empty body is fine */ }

  const business_id = Number(body.business_id)
  if (!Number.isFinite(business_id)) return json({ error: 'business_id required (number)' }, 400)
  const credits     = Math.max(1, Math.floor(Number(body.credits    ?? 25)))
  const daysAgo     = Math.max(1, Math.floor(Number(body.days_ago   ?? 4))) // last Friday when run on a Tue
  const startTime   = String(body.start_time ?? '18:00').slice(0, 5)
  const duration    = Math.max(15, Math.floor(Number(body.duration ?? 60)))

  // Fetch current state
  const { data: biz, error: bizErr } = await db
    .from('businesses')
    .select('id, name, email, user_id, commission_rate, terms_accepted_commission, founding_incentive_bookings, terms_accepted_at, cancellation_safety_window, stripe_account_status')
    .eq('id', business_id)
    .maybeSingle()
  if (bizErr || !biz) return json({ error: `business ${business_id} not found: ${bizErr?.message ?? ''}` }, 404)

  // Guard: safety window blocks backdated confirmed inserts. Rather than
  // toggle it silently, refuse and tell the caller.
  if (biz.cancellation_safety_window === true) {
    return json({
      error: 'businesses.cancellation_safety_window is TRUE on this row. The DB trigger will reject a backdated confirmed insert. Set it to false, re-invoke, then flip back if you need to.',
      business: biz,
    }, 409)
  }

  // Fill in commission fields if null. Test defaults per the payout job's
  // requirements (15% commission, 20 founding-incentive bookings).
  const updates: Record<string, unknown> = {}
  if (biz.commission_rate               == null) updates.commission_rate               = 0.15
  if (biz.terms_accepted_commission     == null) updates.terms_accepted_commission     = 0.15
  if (biz.founding_incentive_bookings   == null) updates.founding_incentive_bookings   = 20
  if (biz.terms_accepted_at             == null) updates.terms_accepted_at             = new Date().toISOString()
  if (Object.keys(updates).length > 0) {
    const { error: updErr } = await db.from('businesses').update(updates).eq('id', business_id)
    if (updErr) return json({ error: `business commission update failed: ${updErr.message}`, updates }, 500)
  }

  // Backdated booking date: today (Madrid) minus days_ago. Uses the same
  // Madrid-local wall-clock convention as the payout job's cutoff.
  const now = new Date()
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const y  = Number(parts.find(p => p.type === 'year')!.value)
  const mo = Number(parts.find(p => p.type === 'month')!.value)
  const d  = Number(parts.find(p => p.type === 'day')!.value)
  const bookingDate = new Date(Date.UTC(y, mo - 1, d - daysAgo)).toISOString().slice(0, 10)

  // bookings has TWO FKs to businesses (business_id + venue_id — historical
  // shape, "placeholder until a venues table exists"). Every real insert in
  // the codebase populates both with the same id; venue_id is not-null in
  // practice. Duration is stored as free text ("60 min" / "Full Day" /
  // "Open") not an integer, so we format to match.
  const insertPayload = {
    user_id:      gate.userId, // admin acts as the "member" for the test
    business_id,
    venue_id:     business_id,
    slot_id:      null,
    booking_date: bookingDate,
    start_time:   startTime,
    duration:     `${duration} min`,
    credits_used: credits,
    notes:        `test booking for payout dry-run — seeded ${now.toISOString()}`,
    status:       'confirmed',
  }
  const { data: booking, error: insErr } = await db
    .from('bookings')
    .insert(insertPayload)
    .select('id, business_id, user_id, booking_date, start_time, duration, credits_used, status, notes, payout_at, payout_transfer_id, created_at')
    .single()
  if (insErr || !booking) return json({ error: `booking insert failed: ${insErr?.message ?? 'unknown'}`, insertPayload }, 500)

  // Return everything the caller needs to eyeball, plus a preview of what
  // the payout dry-run should say for this business.
  const rate = biz.terms_accepted_commission ?? 0.15
  const N    = biz.founding_incentive_bookings ?? 20
  return json({
    ok: true,
    business_id,
    business_name: biz.name,
    stripe_account_status: biz.stripe_account_status,
    commission_updates: Object.keys(updates).length ? updates : 'no-op (all fields already set)',
    booking,
    expected_dry_run_for_this_business: {
      status: biz.stripe_account_status === 'active' ? 'plan' : 'skipped',
      reason_if_skipped: biz.stripe_account_status !== 'active' ? 'account_not_active' : null,
      rate,
      gross_cents:      credits * 100,
      commission_cents: 0, // first delivered booking within the founding-incentive window
      net_cents:        credits * 100,
      booking_count:    1,
      is_incentive:     true,
      incentive_remaining_after: Math.max(0, N - 1),
      note: 'This booking is the partner’s first delivered — it lands inside the founding-incentive window, so commission is 0 and the Transfer would be for the full session value.',
    },
  })
})
