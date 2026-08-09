import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Handles the two HMAC-signed action links a venue receives when a
// pending_venue booking lands: accept or decline. Also serves as the
// entry point for the cron-driven auto_decline path.
//
// URL shape:   /venue-booking-response?a=accept&t=<token>
//              /venue-booking-response?a=decline&t=<token>
//
// GET  → renders a small HTML confirmation page (avoids link previewers
//        triggering the action).
// POST → performs the action, single-use.
//
// Auto-decline invocation from auto-decline-stale-bookings:
//   POST body: { booking_id: <id>, action: 'auto_decline' }
//   Authenticated by an X-Cron-Token header carrying CRON_INVOKE_SECRET
//   (same value stored in Vault so pg_cron reads it via
//   vault.decrypted_secrets). The old comment claiming this ran "inside
//   the Supabase functions network" was wishful: the function has
//   verify_jwt=false at the gateway, so without this header check any
//   anonymous caller can cancel a pending_venue booking.

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY         = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY            = Deno.env.get('RESEND_API_KEY')            || ''
const SAFETY_CANCEL_SECRET      = Deno.env.get('SAFETY_CANCEL_SECRET')      || ''
const CRON_INVOKE_SECRET        = Deno.env.get('CRON_INVOKE_SECRET')        || ''
const PUBLIC_ORIGIN             = Deno.env.get('PUBLIC_ORIGIN')             || 'https://wello-wellness.com'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

const html = (body: string, status = 200) =>
  new Response(body, { status, headers: { ...CORS, 'Content-Type': 'text/html; charset=utf-8' } })
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

function fmtDate(iso: string) {
  try { return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) } catch { return iso }
}

async function hmacSign(msg: string, key: string): Promise<string> {
  const enc = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey(
    'raw', enc.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(msg))
  const bytes = new Uint8Array(sig)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// Parse and verify token; returns { bookingId, expiryIso, action, sig }.
async function verifyToken(token: string): Promise<
  | { ok: true; bookingId: number; expiryIso: string; action: string; sig: string }
  | { ok: false; error: string }
> {
  const parts = token.split('.')
  if (parts.length < 2) return { ok: false, error: 'Malformed token' }
  const sig = parts.pop() as string
  const payloadEncoded = parts.join('.')
  const payload = decodeURIComponent(payloadEncoded)
  const bits = payload.split('.')
  if (bits.length < 3) return { ok: false, error: 'Malformed token payload' }
  const [bookingIdStr, expiryIso, action, ...rest] = bits
  if (rest.length > 0) return { ok: false, error: 'Unexpected token payload' }
  const bookingId = parseInt(bookingIdStr, 10)
  if (!Number.isFinite(bookingId)) return { ok: false, error: 'Invalid booking id' }
  if (!expiryIso)                  return { ok: false, error: 'Missing expiry' }
  if (action !== 'accept' && action !== 'decline') return { ok: false, error: 'Unknown action' }
  const expected = await hmacSign(payload, SAFETY_CANCEL_SECRET)
  if (!safeEqual(expected, sig)) return { ok: false, error: 'Signature mismatch' }
  return { ok: true, bookingId, expiryIso, action, sig }
}

function page(title: string, bodyHtml: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, Manrope, Arial, sans-serif; background:#FBF9F4; color:#1B1C19; margin:0; padding:24px; }
      .card { max-width: 480px; margin: 32px auto; background: #fff; border-radius: 14px; padding: 28px; box-shadow: 0 6px 24px rgba(33,60,24,0.08); }
      h1 { color:#213C18; font-size:20px; margin:0 0 10px; letter-spacing:-0.3px; }
      p  { color:#43483F; line-height:1.6; margin: 0 0 14px; font-size:14px; }
      dl { margin: 16px 0; padding: 14px 16px; background:#F5F3EE; border-radius:10px; }
      dt { color:#54584F; font-size:11px; letter-spacing:1.5px; text-transform:uppercase; margin-top:8px; }
      dt:first-child { margin-top:0; }
      dd { color:#213C18; font-weight:600; margin:2px 0 0; font-size:14px; }
      button, .btn { display:inline-block; padding:12px 22px; background:#213C18; color:#FBF9F4; border:none; border-radius:999px; font-family:inherit; font-weight:700; font-size:14px; cursor:pointer; text-decoration:none; }
      .btn.secondary { background:transparent; color:#54584F; margin-left:8px; }
      .err { background:#F8E4D9; color:#8B2F00; padding:14px 16px; border-radius:10px; }
    </style></head><body><div class="card">${bodyHtml}</div></body></html>`
}

async function sendEmail(to: string, subject: string, htmlBody: string) {
  if (!RESEND_API_KEY) { console.warn('RESEND_API_KEY not set; skipping email to', to); return }
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'Wello <hello@wello-wellness.com>', to, subject, html: htmlBody }),
  }).catch(e => console.error('Resend error:', e))
}

// Load context needed to email + decide flow. Reused by both action paths.
async function loadContext(supabase: ReturnType<typeof createClient>, bookingId: number) {
  const { data: booking, error: bookErr } = await supabase
    .from('bookings')
    .select('id, user_id, business_id, booking_date, start_time, credits_used, notes, status, offering_type, venue_accept_token, venue_decline_token, venue_action_expires_at, created_at')
    .eq('id', bookingId)
    .maybeSingle()
  if (bookErr || !booking) return { ok: false as const, error: 'Booking not found' }
  const { data: business } = await supabase
    .from('businesses').select('id, name, category, location, email').eq('id', booking.business_id).maybeSingle()
  const { data: customer } = await supabase
    .from('profiles').select('id, full_name, email, credits').eq('id', booking.user_id).maybeSingle()
  return { ok: true as const, booking, business, customer }
}

// Build 2-3 rule-based alternatives — mirrors studio-cancel-booking so the
// customer email pattern stays consistent. Same category, different venue,
// active listings with capacity, sorted by time-of-day proximity.
async function findAlternatives(
  supabase: ReturnType<typeof createClient>,
  { category, exceptBusinessId, targetHour }: { category: string | null; exceptBusinessId: number; targetHour: number },
) {
  if (!category) return []
  const { data: altListings } = await supabase
    .from('listings')
    .select('id, name, cat, loc, cr, business_id, slots(id, date, time, spots, booked)')
    .eq('cat', category)
    .eq('status', 'active')
    .neq('business_id', exceptBusinessId)
    .limit(20)
  return (altListings || [])
    .map(l => {
      const bookableSlots = ((l as any).slots || []).filter((s: { date: string; time: string; spots: number; booked: number }) => {
        const start = new Date(`${s.date}T${(s.time || '00:00').slice(0,5)}:00`)
        return start.getTime() > Date.now() && (s.booked ?? 0) < (s.spots ?? 1)
      })
      if (bookableSlots.length === 0) return null
      bookableSlots.sort((a: { time: string }, b: { time: string }) => {
        const ah = parseInt((a.time || '00:00').slice(0,2), 10)
        const bh = parseInt((b.time || '00:00').slice(0,2), 10)
        return Math.abs(ah - targetHour) - Math.abs(bh - targetHour)
      })
      return { ...l, next_slot: bookableSlots[0] }
    })
    .filter(Boolean)
    .slice(0, 3) as Array<{ id: number; name: string; loc: string; cr: number; next_slot: { date: string; time: string } }>
}

// Shared decline-effect (applied for token decline, JWT decline, and
// auto_decline). Flips status to cancelled AND refunds the held credits
// back to the customer's balance. Credits were debited at request time
// (see request-treatment-booking), so decline is a real refund now.
async function applyDecline(
  supabase: ReturnType<typeof createClient>,
  { bookingId, mode, tokenSig, credits, customerId, source }:
  { bookingId: number; mode: 'token' | 'auth' | 'auto'; tokenSig?: string; credits: number; customerId: string; source: string },
): Promise<{ ok: true } | { ok: false; alreadyHandled?: boolean; error?: string }> {
  const q = supabase
    .from('bookings')
    .update({
      status: 'cancelled',
      venue_accept_token: null,
      venue_decline_token: null,
    })
    .eq('id', bookingId)
    .eq('status', 'pending_venue')
    .select('id, slot_id')
  if (mode === 'token' && tokenSig) q.eq('venue_decline_token', tokenSig)
  const { data: updated, error: updErr } = await q.maybeSingle()
  if (updErr) return { ok: false, error: updErr.message }
  if (!updated) return { ok: false, alreadyHandled: true }

  // Slot-based pending_venue bookings (studio in request mode) carry a
  // slot_id; the older offering-based flow does not. When present,
  // decrement slots.booked so the slot returns to the marketplace —
  // same shape as instructor-booking-response.
  const declinedSlotId = (updated as { slot_id?: string | null }).slot_id
  if (declinedSlotId) {
    const slotIdNum = Number(declinedSlotId)
    if (Number.isFinite(slotIdNum)) {
      const { data: slotRow } = await supabase
        .from('slots').select('id, booked').eq('id', slotIdNum).maybeSingle()
      if (slotRow) {
        const newBooked = Math.max(0, ((slotRow as { booked?: number }).booked || 0) - 1)
        const { error: slotErr } = await supabase
          .from('slots').update({ booked: newBooked }).eq('id', slotIdNum)
        if (slotErr) console.warn('applyDecline: slots.booked decrement failed:', slotErr.message)
      }
    }
  }

  // Refund the held credits via the ledger. If this fails we log
  // loudly rather than rolling the cancellation back — a stuck-
  // cancelled booking with a missing refund is easier to spot and fix
  // in support than a stuck pending row that no-one owns any more.
  // refund_by_booking is idempotent so retrying is safe.
  if (credits > 0 && customerId) {
    const { error: refErr } = await supabase.rpc('refund_by_booking', {
      p_booking_id: bookingId,
      p_source:     source,
      p_note:       `venue ${mode} decline`,
    })
    if (refErr) console.error('applyDecline: refund_by_booking failed for booking', bookingId, refErr.message)
  }
  return { ok: true }
}

// Shared accept-effect (token or JWT). Credits were already held at
// request time so accept is a status flip only, no credit movement.
async function applyAccept(
  supabase: ReturnType<typeof createClient>,
  { bookingId, tokenSig }:
  { bookingId: number; tokenSig?: string },
): Promise<{ ok: true } | { ok: false; error: string; alreadyHandled?: boolean }> {
  const q = supabase
    .from('bookings')
    .update({
      status: 'confirmed',
      venue_accept_token: null,
      venue_decline_token: null,
    })
    .eq('id', bookingId)
    .eq('status', 'pending_venue')
  if (tokenSig) q.eq('venue_accept_token', tokenSig)
  const { data: updated, error: updErr } = await q.select('id').maybeSingle()
  if (updErr) return { ok: false, error: updErr.message }
  if (!updated) return { ok: false, error: 'Concurrent update', alreadyHandled: true }
  return { ok: true }
}

// Send the customer the "declined / auto-declined" email with 2-3 alternatives.
async function emailCustomerDecline(
  supabase: ReturnType<typeof createClient>,
  { booking, business, customer, autoDecline }:
  { booking: Record<string, unknown>; business: Record<string, unknown> | null; customer: Record<string, unknown> | null; autoDecline: boolean },
) {
  if (!customer || !(customer as { email?: string }).email) return
  const targetHour = parseInt(String((booking as { start_time?: string }).start_time || '00').slice(0,2), 10) || 9
  const alts = await findAlternatives(supabase, {
    category: (business as { category?: string })?.category || null,
    exceptBusinessId: Number((booking as { business_id?: number }).business_id),
    targetHour,
  })
  const venueName   = (business as { name?: string })?.name || 'the venue'
  const dateHuman   = fmtDate(String((booking as { booking_date?: string }).booking_date || ''))
  const sessionName = String((booking as { offering_type?: string }).offering_type || 'a session')
  const credits     = Number((booking as { credits_used?: number }).credits_used) || 0
  const altsHtml = alts.length > 0
    ? `<p style="color:#54584F;line-height:1.7;margin:18px 0 8px;">Here are a few similar options you could try:</p>` +
      alts.map(a => {
        const d = fmtDate(a.next_slot.date)
        const t = (a.next_slot.time || '').slice(0,5)
        return `<div style="display:block;padding:12px 14px;border:1px solid #E4E2DD;border-radius:8px;margin-bottom:8px;background:#fff;"><div style="font-weight:700;color:#1B1C19;">${a.name}</div><div style="color:#54584F;font-size:13px;">${a.loc || 'Mallorca'} · Next slot ${d} ${t} · ◈ ${a.cr}</div></div>`
      }).join('') +
      `<p style="color:#54584F;line-height:1.7;margin-top:16px;"><a href="${PUBLIC_ORIGIN}" style="color:#213C18;font-weight:600;">Browse all venues</a></p>`
    : `<p style="color:#54584F;line-height:1.7;margin-top:16px;"><a href="${PUBLIC_ORIGIN}" style="color:#213C18;font-weight:600;">Browse other venues</a></p>`

  const subject = autoDecline
    ? `Your request at ${venueName} timed out`
    : `${venueName} cannot host your ${sessionName}`
  const opening = autoDecline
    ? `<p style="color:#54584F;line-height:1.7;">Your request for <strong>${sessionName}</strong> at ${venueName} on <strong>${dateHuman}</strong> was not confirmed within 48 hours. Your credits are returned in full.</p>`
    : `<p style="color:#54584F;line-height:1.7;">Unfortunately ${venueName} cannot host your <strong>${sessionName}</strong> on <strong>${dateHuman}</strong>. Your ${credits} credits have been returned in full.</p>`

  await sendEmail(
    (customer as { email?: string }).email as string,
    subject,
    `<div style="font-family:Manrope,Arial,sans-serif;max-width:520px;padding:24px;background:#FBF9F4;">
      <h2 style="color:#213C18;">${autoDecline ? 'The venue did not respond in time' : 'A change of plan'}</h2>
      ${opening}
      ${altsHtml}
      <p style="color:#54584F;line-height:1.7;margin-top:18px;">Wello</p>
    </div>`,
  )
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // ── JSON POST path (auto_decline OR authenticated confirm/decline) ────
  // Auto-decline is server-to-server (called by auto-decline-stale-bookings).
  // Confirm/decline via JSON is the partner portal path — venue owner is
  // signed in and the caller's JWT must map to businesses.user_id for the
  // booking's business_id.
  if (req.method === 'POST') {
    const clone = req.clone()
    let jsonBody: { booking_id?: number; action?: string } | null = null
    try {
      jsonBody = await clone.json()
    } catch { /* not JSON — token flow */ }

    if (jsonBody && jsonBody.action && jsonBody.booking_id) {
      const action = jsonBody.action
      const bookingId = Number(jsonBody.booking_id)
      if (!Number.isFinite(bookingId)) return json({ error: 'booking_id required' }, 400)

      // Auth per action BEFORE any DB lookup — otherwise a 404 vs 200
      // difference leaks whether a given booking_id exists to
      // unauthenticated callers.
      //   confirm/decline: venue-owner JWT (partner portal path)
      //   auto_decline:    X-Cron-Token matching CRON_INVOKE_SECRET
      //                    (pg_cron path via auto-decline-stale-bookings)
      let acceptingUserId: string | null = null
      if (action === 'auto_decline') {
        if (!CRON_INVOKE_SECRET) return json({ error: 'CRON_INVOKE_SECRET not configured.' }, 500)
        const provided = (req.headers.get('X-Cron-Token') || req.headers.get('x-cron-token') || '').trim()
        if (!provided || provided.length !== CRON_INVOKE_SECRET.length) return json({ error: 'Unauthorized' }, 401)
        let diff = 0
        for (let i = 0; i < provided.length; i++) diff |= provided.charCodeAt(i) ^ CRON_INVOKE_SECRET.charCodeAt(i)
        if (diff !== 0) return json({ error: 'Unauthorized' }, 401)
      } else if (action === 'confirm' || action === 'decline') {
        const authHeader = req.headers.get('Authorization') || req.headers.get('authorization') || ''
        const jwt = authHeader.replace(/^Bearer\s+/i, '').trim()
        if (!jwt) return json({ error: 'Sign in to respond to this request.' }, 401)
        const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          auth: { autoRefreshToken: false, persistSession: false },
        })
        const { data: userData, error: userErr } = await anonClient.auth.getUser(jwt)
        if (userErr || !userData?.user) return json({ error: 'Session expired.' }, 401)
        acceptingUserId = userData.user.id
      } else {
        return json({ error: 'action must be confirm, decline or auto_decline' }, 400)
      }

      const ctx = await loadContext(supabase, bookingId)
      if (!ctx.ok) return json({ error: ctx.error }, 404)
      const { booking, business, customer } = ctx
      if (booking.status !== 'pending_venue') return json({ skipped: 'not pending_venue', status: booking.status })

      // Ownership check runs after loadContext for confirm/decline —
      // needed the business row to compare against the authenticated
      // user. auto_decline skips this: it's the internal cron caller.
      if (acceptingUserId && (!business || (business as { user_id?: string }).user_id !== acceptingUserId)) {
        return json({ error: 'This booking does not belong to your business.' }, 403)
      }

      // Apply the effect.
      if (action === 'confirm') {
        const cost = Number(booking.credits_used) || 0
        const result = await applyAccept(supabase, { bookingId })
        if (!result.ok && result.alreadyHandled) return json({ error: 'Already handled' }, 409)
        if (!result.ok) return json({ error: result.error }, 500)
        if ((customer as { email?: string } | null)?.email) {
          const venueName   = (business as { name?: string })?.name || 'the venue'
          const dateHuman   = fmtDate(String(booking.booking_date))
          const sessionName = String(booking.offering_type || 'a session')
          await sendEmail(
            (customer as { email?: string }).email as string,
            `Your ${sessionName} at ${venueName} is confirmed`,
            `<div style="font-family:Manrope,Arial,sans-serif;max-width:520px;padding:24px;background:#FBF9F4;">
              <h2 style="color:#213C18;">You are booked in</h2>
              <p style="color:#54584F;line-height:1.7;">${venueName} has confirmed your <strong>${sessionName}</strong> on <strong>${dateHuman}</strong>. The ${cost} credits you held for this booking are now settled with the venue.</p>
              <p style="color:#54584F;line-height:1.7;">If you need to make changes, contact ${venueName} directly or open your <a href="${PUBLIC_ORIGIN}" style="color:#213C18;font-weight:600;">Wello bookings</a>.</p>
              <p style="color:#54584F;line-height:1.7;margin-top:18px;">Wello</p>
            </div>`,
          )
        }
        return json({ ok: true, action: 'confirm', booking_id: bookingId })
      }

      // decline OR auto_decline. Refund the held credits.
      const cost    = Number(booking.credits_used) || 0
      const custId  = String((customer as { id?: string } | null)?.id || '')
      const result = await applyDecline(supabase, {
        bookingId, mode: 'auth', credits: cost, customerId: custId,
        source: action === 'auto_decline' ? 'auto_decline' : 'decline',
      })
      if (!result.ok && result.alreadyHandled) return json({ error: 'Already handled' }, 409)
      if (!result.ok) return json({ error: result.error || 'decline failed' }, 500)
      await emailCustomerDecline(supabase, { booking, business, customer, autoDecline: action === 'auto_decline' })
      return json({ ok: true, action, booking_id: bookingId })
    }
  }

  // ── Token-driven path (venue clicks link) ─────────────────────────────
  if (!SAFETY_CANCEL_SECRET) return html(page('Not configured', `<h1>Not configured</h1><p>Contact hello@wello-wellness.com.</p>`), 500)

  const url    = new URL(req.url)
  const token  = url.searchParams.get('t')
  const actionParam = String(url.searchParams.get('a') || '').toLowerCase()
  if (!token) return html(page('Invalid link', `<h1>Invalid link</h1><p>This link is missing its token. Try copying and pasting the full URL into your browser.</p>`), 400)

  const parsed = await verifyToken(token)
  if (!parsed.ok) {
    console.warn('venue-booking-response: token verification failed:', parsed.error)
    return html(page('Invalid link', `<h1>Invalid link</h1><p>This link could not be verified. It may have been altered. Contact hello@wello-wellness.com if you believe this is a mistake.</p>`), 400)
  }
  const { bookingId, expiryIso, action: tokenAction, sig } = parsed
  // Belt-and-braces: require the URL param to match the payload action so
  // an accept link on the decline URL param is rejected up front.
  if (actionParam && actionParam !== tokenAction) {
    return html(page('Mismatched link', `<h1>Mismatched link</h1><p>The action in the URL does not match the token.</p>`), 400)
  }
  const action = tokenAction

  const ctx = await loadContext(supabase, bookingId)
  if (!ctx.ok) return html(page('Booking not found', `<h1>Booking not found</h1><p>We could not find the booking this link refers to.</p>`), 404)
  const { booking, business, customer } = ctx

  const dateHuman = fmtDate(booking.booking_date)
  const timeHuman = (booking.start_time || '').slice(0,5)
  const sessionName = booking.offering_type || 'a session'
  const venueName   = business?.name || 'the venue'
  const memberName  = (customer?.full_name || customer?.email || 'a Wello member').split(/\s+/)[0]
  const credits     = Number(booking.credits_used) || 0

  // Common validity checks ─ mirrors studio-cancel-booking so the failure
  // paths look and feel consistent to the venue.
  const now = Date.now()
  const expiresAt = new Date(expiryIso).getTime()
  if (!Number.isFinite(expiresAt)) return html(page('Invalid link', `<h1>Invalid link</h1><p>This link has an invalid expiry.</p>`), 400)
  if (now > expiresAt) {
    return html(page('Window closed', `<h1>Window closed</h1><p>The 48 hour window for this request has ended. The member's credits have already been returned.</p>`), 410)
  }
  const tokenColumn: 'venue_accept_token' | 'venue_decline_token' =
    action === 'accept' ? 'venue_accept_token' : 'venue_decline_token'
  const storedSig = booking[tokenColumn]
  if (!storedSig || !safeEqual(String(storedSig), sig)) {
    return html(page('Already used', `<h1>Already used</h1><p>This link has already been used, or the request was cancelled another way. No further action is needed.</p>`), 409)
  }
  if (booking.status !== 'pending_venue') {
    return html(page('Nothing to do', `<h1>Nothing to do</h1><p>This booking is ${booking.status}. It cannot be changed through this link.</p>`), 409)
  }

  // ── GET: confirmation page ────────────────────────────────────────────
  if (req.method === 'GET') {
    const details = `<dl>
      <dt>Session</dt><dd>${sessionName}</dd>
      <dt>Requested date</dt><dd>${dateHuman}</dd>
      <dt>Member</dt><dd>${memberName}</dd>
      <dt>Credits</dt><dd>${credits}</dd>
    </dl>`
    if (action === 'accept') {
      return html(page('Accept booking?', `
        <h1>Accept this booking?</h1>
        <p>You are about to confirm ${memberName}'s request at ${venueName}. ${credits} credits will be deducted from their balance and they will receive a confirmation email with the agreed time.</p>
        ${details}
        <form method="POST" action="${url.pathname}${url.search}">
          <button type="submit">Yes, accept booking</button>
          <a class="btn secondary" href="${PUBLIC_ORIGIN}">Never mind</a>
        </form>`))
    }
    return html(page('Decline booking?', `
      <h1>Decline this booking?</h1>
      <p>You are about to decline ${memberName}'s request. Their credits are returned in full and they will be emailed with alternative options.</p>
      ${details}
      <form method="POST" action="${url.pathname}${url.search}">
        <button type="submit">Yes, decline booking</button>
        <a class="btn secondary" href="${PUBLIC_ORIGIN}">Never mind</a>
      </form>`))
  }

  if (req.method !== 'POST') return html(page('Method not allowed', `<h1>Method not allowed</h1>`), 405)

  // ── POST: apply the action ────────────────────────────────────────────
  // Credits were HELD at request time (see request-treatment-booking), so:
  //   accept  = flip status only, credits are already settled
  //   decline = flip status + refund credits back to profile
  //
  // The previous "member no longer has enough credits" race check is gone
  // because credits were reserved at request. A concurrent spend cannot
  // undercut the reserve.
  if (action === 'accept') {
    if (!customer) return html(page('Error', `<h1>Error</h1><p class="err">Member profile missing. Contact hello@wello-wellness.com.</p>`), 500)

    const { data: updated, error: updErr } = await supabase
      .from('bookings')
      .update({
        status: 'confirmed',
        venue_accept_token: null,
        venue_decline_token: null,
      })
      .eq('id', booking.id)
      .eq('status', 'pending_venue')
      .eq('venue_accept_token', sig)
      .select('id')
      .maybeSingle()
    if (updErr) return html(page('Error', `<h1>Error</h1><p class="err">Could not accept the booking: ${updErr.message}</p>`), 500)
    if (!updated) return html(page('Already handled', `<h1>Already handled</h1><p>This request has already been actioned.</p>`), 409)

    // Confirmation email — brief, matches the rest of the pattern.
    if (customer.email) {
      await sendEmail(customer.email, `Your ${sessionName} at ${venueName} is confirmed`,
        `<div style="font-family:Manrope,Arial,sans-serif;max-width:520px;padding:24px;background:#FBF9F4;">
          <h2 style="color:#213C18;">You are booked in</h2>
          <p style="color:#54584F;line-height:1.7;">${venueName} has confirmed your <strong>${sessionName}</strong> on <strong>${dateHuman}</strong>. The ${credits} credits you held for this booking are now settled with the venue.</p>
          <p style="color:#54584F;line-height:1.7;">If you need to make changes, contact ${venueName} directly or open your <a href="${PUBLIC_ORIGIN}" style="color:#213C18;font-weight:600;">Wello bookings</a>.</p>
          <p style="color:#54584F;line-height:1.7;margin-top:18px;">Wello</p>
        </div>`)
    }

    return html(page('Booking accepted', `
      <h1>Booking accepted</h1>
      <p>${memberName} has been notified. No further action is needed from your side.</p>
      <a class="btn" href="${PUBLIC_ORIGIN}">Back to Wello</a>`))
  }

  // action === 'decline' — flip status + refund the held credits.
  const { data: updated, error: updErr } = await supabase
    .from('bookings')
    .update({
      status: 'cancelled',
      venue_accept_token: null,
      venue_decline_token: null,
    })
    .eq('id', booking.id)
    .eq('status', 'pending_venue')
    .eq('venue_decline_token', sig)
    .select('id, slot_id')
    .maybeSingle()
  if (updErr) return html(page('Error', `<h1>Error</h1><p class="err">Could not decline the booking: ${updErr.message}</p>`), 500)
  if (!updated) return html(page('Already handled', `<h1>Already handled</h1><p>This request has already been actioned.</p>`), 409)

  // Slot-based decline: decrement slots.booked so the slot returns to
  // the marketplace. Offering-based (slot_id null) skips this.
  const declinedSlotId = (updated as { slot_id?: string | null }).slot_id
  if (declinedSlotId) {
    const slotIdNum = Number(declinedSlotId)
    if (Number.isFinite(slotIdNum)) {
      const { data: slotRow } = await supabase
        .from('slots').select('id, booked').eq('id', slotIdNum).maybeSingle()
      if (slotRow) {
        const newBooked = Math.max(0, ((slotRow as { booked?: number }).booked || 0) - 1)
        await supabase.from('slots').update({ booked: newBooked }).eq('id', slotIdNum)
      }
    }
  }

  // Refund credits held at request time via the ledger. Best-effort —
  // log if it fails so we can spot orphaned holds in support, but do
  // not roll the decline back (a stuck-cancelled row is easier to
  // reconcile than a stuck-pending row nobody can action any more).
  // refund_by_booking is idempotent so retrying is safe.
  if (credits > 0 && customer?.id) {
    const { error: refErr } = await supabase.rpc('refund_by_booking', {
      p_booking_id: booking.id,
      p_source:     'decline',
      p_note:       'venue token decline',
    })
    if (refErr) console.error('venue-booking-response: refund_by_booking failed for booking', booking.id, refErr.message)
  }

  // Email the member with rule-based alternatives, same shape as the
  // safety window flow.
  const targetHour = parseInt(String(booking.start_time || '00').slice(0,2), 10) || 9
  const alts = await findAlternatives(supabase, {
    category: business?.category || null,
    exceptBusinessId: booking.business_id,
    targetHour,
  })
  if (customer?.email) {
    const altsHtml = alts.length > 0
      ? `<p style="color:#54584F;line-height:1.7;margin:18px 0 8px;">Here are a few similar options you could try:</p>` +
        alts.map(a => {
          const d = fmtDate(a.next_slot.date)
          const t = (a.next_slot.time || '').slice(0,5)
          return `<div style="display:block;padding:12px 14px;border:1px solid #E4E2DD;border-radius:8px;margin-bottom:8px;background:#fff;"><div style="font-weight:700;color:#1B1C19;">${a.name}</div><div style="color:#54584F;font-size:13px;">${a.loc || 'Mallorca'} · Next slot ${d} ${t} · ◈ ${a.cr}</div></div>`
        }).join('') +
        `<p style="color:#54584F;line-height:1.7;margin-top:16px;"><a href="${PUBLIC_ORIGIN}" style="color:#213C18;font-weight:600;">Browse all venues</a></p>`
      : `<p style="color:#54584F;line-height:1.7;margin-top:16px;"><a href="${PUBLIC_ORIGIN}" style="color:#213C18;font-weight:600;">Browse other venues</a></p>`

    await sendEmail(customer.email, `${venueName} cannot host your ${sessionName}`,
      `<div style="font-family:Manrope,Arial,sans-serif;max-width:520px;padding:24px;background:#FBF9F4;">
        <h2 style="color:#213C18;">A change of plan</h2>
        <p style="color:#54584F;line-height:1.7;">Unfortunately ${venueName} cannot host your <strong>${sessionName}</strong> on <strong>${dateHuman}</strong>. Your ${credits} credits have been returned in full.</p>
        ${altsHtml}
        <p style="color:#54584F;line-height:1.7;margin-top:18px;">Wello</p>
      </div>`)
  }

  return html(page('Booking declined', `
    <h1>Booking declined</h1>
    <p>${memberName} has been notified and pointed at a couple of alternatives. No further action is needed from your side.</p>
    <a class="btn" href="${PUBLIC_ORIGIN}">Back to Wello</a>`))
})
