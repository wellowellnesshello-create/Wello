import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Partner-side cancellation safety window — inbound cancellation. Handles
// both studios (booking-safety-alert path) and private instructors
// (instructor-booking-response path). Kept under the studio-cancel-booking
// name because existing HMAC tokens already in flight point here.
//
// Historical flow (pre-2026-09-04): this fn returned styled HTML pages
// directly for browser tapping the WhatsApp cancel link. That broke when
// Supabase started force-serving edge-fn responses with `Content-Type:
// text/plain` + `X-Content-Type-Options: nosniff` + a sandbox CSP —
// browsers refused to render our HTML.
//
// Current flow:
//   1. Partner taps the cancel link in the WhatsApp/SMS alert.
//   2. GET /studio-cancel-booking?t=<token> (no auth) → 302 redirects the
//      browser to https://wello-wellness.com/?cancel=<token>.
//   3. The Wello SPA loads the cancel page, immediately POSTs to this
//      same fn with the token in a JSON body (which sends an
//      Authorization header via supabase.functions.invoke).
//   4. This fn verifies HMAC, expiry, one-time-use, cancels the booking,
//      refunds credits, decrements slots.booked, emails the customer with
//      alternatives, and returns a JSON result the SPA renders.
//
// Token format: base64url(urlencode(bookingId.expiryIso).hmacSig).
// One-time-use = we clear bookings.safety_cancel_token on successful
// cancel; replaying the same URL then trips the already_cancelled branch.

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY            = Deno.env.get('RESEND_API_KEY')            || ''
const SAFETY_CANCEL_SECRET      = Deno.env.get('SAFETY_CANCEL_SECRET')      || ''
const PUBLIC_ORIGIN             = Deno.env.get('PUBLIC_ORIGIN')             || 'https://wello-wellness.com'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

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

// Parse and verify token; returns { bookingId, expiryIso, sig } or an error.
// bookingId stays a string — bookings.id is a UUID, not an int.
async function verifyToken(token: string): Promise<
  | { ok: true; bookingId: string; expiryIso: string; sig: string }
  | { ok: false; error: string }
> {
  const parts = token.split('.')
  if (parts.length < 2) return { ok: false, error: 'Malformed token' }
  const sig = parts.pop() as string
  const payloadEncoded = parts.join('.')
  const payload = decodeURIComponent(payloadEncoded)
  const dot = payload.indexOf('.')
  if (dot === -1) return { ok: false, error: 'Malformed token payload' }
  const bookingId    = payload.slice(0, dot)
  const expiryIso    = payload.slice(dot + 1)
  if (!bookingId)                  return { ok: false, error: 'Missing booking id' }
  if (!expiryIso)                  return { ok: false, error: 'Missing expiry' }
  const expected = await hmacSign(payload, SAFETY_CANCEL_SECRET)
  if (!safeEqual(expected, sig)) return { ok: false, error: 'Signature mismatch' }
  return { ok: true, bookingId, expiryIso, sig }
}

async function sendEmail(to: string, subject: string, htmlBody: string) {
  if (!RESEND_API_KEY) { console.warn('RESEND_API_KEY not set; skipping email to', to); return }
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'Wello <hello@wello-wellness.com>', to, subject, html: htmlBody }),
  }).catch(e => console.error('Resend error:', e))
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const url = new URL(req.url)

  // ── Browser tap → 302 to the SPA ─────────────────────────────────
  // WhatsApp link opens the browser, which sends a bare GET (no auth
  // header). Supabase's gateway now serves any HTML we'd return as
  // text/plain + nosniff + sandbox CSP, so browsers refuse to render.
  // Punt to the SPA instead — it'll call us back with an Authorization
  // header (below path) to actually do the cancel work, and render the
  // result using Wello's own design system.
  const hasAuth = !!(req.headers.get('Authorization') || req.headers.get('authorization'))
  const tokenFromQuery = url.searchParams.get('t')
  if (req.method === 'GET' && tokenFromQuery && !hasAuth) {
    return new Response(null, {
      status: 302,
      headers: {
        ...CORS,
        Location: `${PUBLIC_ORIGIN}/?cancel=${encodeURIComponent(tokenFromQuery)}`,
      },
    })
  }

  if (!SAFETY_CANCEL_SECRET) {
    return json({ ok: false, code: 'not_configured', message: 'The safety cancel secret is missing on the server.' }, 500)
  }

  // Token can come from ?t=… (legacy GET path) or from a JSON body { token }
  // (SPA POST path). Prefer body.
  let token = tokenFromQuery || ''
  if (!token && (req.method === 'POST' || req.method === 'PUT')) {
    try {
      const body = await req.json()
      token = String(body?.token || '').trim()
    } catch { /* body optional */ }
  }
  if (!token) return json({ ok: false, code: 'missing_token', message: 'This link is missing its token.' }, 400)

  const parsed = await verifyToken(token)
  if (!parsed.ok) {
    console.warn('studio-cancel: token verification failed:', parsed.error)
    return json({ ok: false, code: 'invalid_link', message: "This link couldn't be verified. It may have been altered or copied incorrectly." }, 400)
  }
  const { bookingId, expiryIso, sig } = parsed

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: booking, error: bookErr } = await supabase
    .from('bookings')
    .select('id, user_id, business_id, slot_id, booking_date, start_time, credits_used, status, safety_cancel_token, safety_cancel_expires_at, safety_cancelled_at')
    .eq('id', bookingId)
    .maybeSingle()
  if (bookErr || !booking) {
    return json({ ok: false, code: 'not_found', message: "We couldn't find the booking this link refers to." }, 404)
  }

  const { data: business } = await supabase
    .from('businesses').select('id, name, category, location').eq('id', booking.business_id).maybeSingle()
  const { data: slot } = await supabase
    .from('slots').select('name').eq('id', booking.slot_id).maybeSingle()
  const { data: customer } = await supabase
    .from('profiles').select('id, full_name, email, credits').eq('id', booking.user_id).maybeSingle()

  const dateStr      = fmtDate(booking.booking_date)
  const timeStr      = (booking.start_time || '').slice(0, 5)
  const sessionName  = slot?.name || 'a session'
  const isInstructor = (business?.category || '') === 'Private Instructor'
  const partnerName  = business?.name || (isInstructor ? 'the instructor' : 'the studio')
  const customerName = (customer?.full_name || customer?.email || 'A Wello member').trim()
  const customerFirst = customerName.split(/\s+/)[0]

  const now = Date.now()
  const expiresAt = new Date(expiryIso).getTime()
  if (!Number.isFinite(expiresAt)) {
    return json({ ok: false, code: 'invalid_link', message: 'This link has an invalid expiry.' }, 400)
  }
  if (now > expiresAt) {
    console.log(`studio-cancel: expired link for booking ${bookingId} (expired ${expiryIso})`)
    return json({
      ok: false,
      code: 'window_closed',
      message: 'The cancel window for this booking has closed.',
      expires_at: expiryIso,
      session: sessionName,
      when: `${dateStr} at ${timeStr}`,
    }, 410)
  }
  if (!booking.safety_cancel_token || !safeEqual(booking.safety_cancel_token, sig)) {
    return json({
      ok: false,
      code: 'already_cancelled',
      message: 'This booking has already been cancelled.',
      session: sessionName,
      when: `${dateStr} at ${timeStr}`,
    }, 409)
  }
  if (booking.status !== 'confirmed') {
    return json({
      ok: false,
      code: 'not_confirmed',
      message: `This booking is currently ${booking.status} — it can't be cancelled via this link.`,
      status: booking.status,
    }, 409)
  }

  // ── Do the cancellation ────────────────────────────────────────────
  const { data: updated, error: updErr } = await supabase
    .from('bookings')
    .update({ status: 'cancelled', safety_cancelled_at: new Date().toISOString(), safety_cancel_token: null })
    .eq('id', booking.id)
    .eq('status', 'confirmed')
    .eq('safety_cancel_token', sig)
    .select('id')
    .maybeSingle()
  if (updErr) {
    console.error('studio-cancel: booking update failed', updErr.message)
    return json({ ok: false, code: 'update_failed', message: "We couldn't cancel this booking." }, 500)
  }
  if (!updated) {
    return json({
      ok: false,
      code: 'already_cancelled',
      message: 'Looks like this booking was cancelled by another action in the meantime.',
      session: sessionName,
      when: `${dateStr} at ${timeStr}`,
    }, 409)
  }

  const refund = Number(booking.credits_used) || 0
  if (refund > 0 && customer) {
    const { error: refundErr } = await supabase.rpc('refund_by_booking', {
      p_booking_id: booking.id,
      p_source:     'safety_window',
      p_note:       'studio safety-window cancel',
    })
    if (refundErr) {
      console.error('studio-cancel: refund_by_booking failed, rolling booking back', refundErr.message)
      await supabase.from('bookings').update({ status: 'confirmed', safety_cancelled_at: null, safety_cancel_token: sig }).eq('id', booking.id)
      return json({ ok: false, code: 'refund_failed', message: "We couldn't return the customer's credits — cancellation rolled back." }, 500)
    }
  }

  if (booking.slot_id) {
    const slotIdNum = Number(booking.slot_id)
    if (Number.isFinite(slotIdNum)) {
      const { data: slotRow } = await supabase
        .from('slots').select('id, booked').eq('id', slotIdNum).maybeSingle()
      if (slotRow) {
        const newBooked = Math.max(0, (slotRow.booked || 0) - 1)
        await supabase.from('slots').update({ booked: newBooked }).eq('id', slotIdNum)
      }
    }
  }

  // 2-3 rule-based alternatives for the customer email.
  const targetHour = parseInt(timeStr.slice(0,2), 10)
  const { data: altListings } = await supabase
    .from('listings')
    .select('id, name, cat, loc, cr, business_id, slots(id, date, time, spots, booked)')
    .eq('cat', business?.category || null)
    .eq('status', 'active')
    .neq('business_id', booking.business_id)
    .limit(20)
  const alternatives = (altListings || [])
    .map(l => {
      const bookableSlots = (l.slots || []).filter((s: { date: string; time: string; spots: number; booked: number }) => {
        const start = new Date(`${s.date}T${(s.time || '00:00').slice(0,5)}:00`)
        return start.getTime() > Date.now() && (s.booked ?? 0) < (s.spots ?? 1)
      })
      if (bookableSlots.length === 0) return null
      bookableSlots.sort((a: { time: string }, b: { time: string }) => {
        const ah = parseInt((a.time || '00:00').slice(0,2), 10)
        const bh = parseInt((b.time || '00:00').slice(0,2), 10)
        return Math.abs(ah - targetHour) - Math.abs(bh - targetHour)
      })
      return { ...l, next_slot: bookableSlots[0] as { date: string; time: string } }
    })
    .filter(Boolean)
    .slice(0, 3) as Array<{ id: number; name: string; loc: string; cr: number; next_slot: { date: string; time: string } }>

  if (customer?.email) {
    const altsHtml = alternatives.length > 0
      ? `<p style="color:#54584F;line-height:1.7;margin:18px 0 8px;">Here are some similar options you could try:</p>` +
        alternatives.map(a => {
          const d = fmtDate(a.next_slot.date)
          const t = (a.next_slot.time || '').slice(0,5)
          return `<div style="display:block;padding:12px 14px;border:1px solid #E4E2DD;border-radius:8px;margin-bottom:8px;background:#fff;"><div style="font-weight:700;color:#1B1C19;">${a.name}</div><div style="color:#54584F;font-size:13px;">${a.loc || 'Mallorca'} · Next slot ${d} ${t} · ◈ ${a.cr}</div></div>`
        }).join('') +
        `<p style="color:#54584F;line-height:1.7;margin-top:16px;"><a href="https://wello-wellness.com" style="color:#213C18;font-weight:600;">Browse the marketplace</a></p>`
      : `<p style="color:#54584F;line-height:1.7;margin-top:16px;">We do not have another ${isInstructor ? 'instructor' : 'venue'} available for that slot right now. <a href="https://wello-wellness.com" style="color:#213C18;font-weight:600;">Browse the marketplace</a> for other options.</p>`

    await sendEmail(customer.email, `${partnerName} can no longer host your ${sessionName}`,
      `<div style="font-family:Manrope,Arial,sans-serif;max-width:520px;padding:24px;background:#FBF9F4;">
        <h2 style="color:#213C18;">A quick change of plan</h2>
        <p style="color:#54584F;line-height:1.7;">Unfortunately ${partnerName} can no longer host your <strong>${sessionName}</strong> on <strong>${dateStr}</strong> at <strong>${timeStr}</strong>. Your ${refund} credits have been returned to your account in full.</p>
        ${altsHtml}
        <p style="color:#54584F;line-height:1.7;margin-top:18px;">Wello</p>
      </div>`)
  }

  console.log(`studio-cancel: booking ${booking.id} cancelled, refunded ${refund} credits to ${booking.user_id}`)

  return json({
    ok: true,
    code: 'cancelled',
    session: sessionName,
    when: `${dateStr} at ${timeStr}`,
    customer: customerFirst,
    refunded: refund,
  })
})
