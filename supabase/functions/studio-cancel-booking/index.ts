import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Studio-side cancellation safety window — inbound cancellation.
//
// Flow:
//   1. Studio taps the cancel link in the WhatsApp/SMS alert.
//   2. GET /studio-cancel?t=<token> serves an HTML confirmation page. This
//      avoids WhatsApp link previewers accidentally triggering the cancel.
//   3. Studio clicks the confirm button, which POSTs the same token.
//   4. This function verifies the HMAC signature, checks the expiry hasn't
//      passed, checks the token hasn't already been used, then cancels the
//      booking, refunds the credits, decrements slots.booked, and emails
//      the customer with 2-3 alternative venues.
//
// The token itself is: base64url(urlencode(bookingId.expiryIso).hmacSig).
// A signature match plus safety_cancel_token still populated on the row is
// how we enforce one-time-use: we clear the column when the cancellation
// succeeds, so replaying the same URL fails on the "already used" check.

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY            = Deno.env.get('RESEND_API_KEY')            || ''
const SAFETY_CANCEL_SECRET      = Deno.env.get('SAFETY_CANCEL_SECRET')      || ''

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

const html = (body: string, status = 200) =>
  new Response(body, { status, headers: { ...CORS, 'Content-Type': 'text/html; charset=utf-8' } })

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

// Timing-safe comparison of two strings of equal length. Guards against
// signature comparison attacks; probably overkill for a booking cancel link
// but cheap.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// Parse and verify token; returns { bookingId, expiryIso, sig } or an error.
async function verifyToken(token: string): Promise<
  | { ok: true; bookingId: number; expiryIso: string; sig: string }
  | { ok: false; error: string }
> {
  const parts = token.split('.')
  if (parts.length < 2) return { ok: false, error: 'Malformed token' }
  const sig = parts.pop() as string
  const payloadEncoded = parts.join('.')
  const payload = decodeURIComponent(payloadEncoded)
  const dot = payload.indexOf('.')
  if (dot === -1) return { ok: false, error: 'Malformed token payload' }
  const bookingIdStr = payload.slice(0, dot)
  const expiryIso    = payload.slice(dot + 1)
  const bookingId    = parseInt(bookingIdStr, 10)
  if (!Number.isFinite(bookingId)) return { ok: false, error: 'Invalid booking id' }
  if (!expiryIso)                  return { ok: false, error: 'Missing expiry' }
  const expected = await hmacSign(payload, SAFETY_CANCEL_SECRET)
  if (!safeEqual(expected, sig)) return { ok: false, error: 'Signature mismatch' }
  return { ok: true, bookingId, expiryIso, sig }
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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  if (!SAFETY_CANCEL_SECRET) return html(page('Not configured', `<h1>Not configured</h1><p>The safety cancel secret is missing. Contact hello@wello-wellness.com.</p>`), 500)

  // Token always rides in the query string. On GET it's set by the WhatsApp
  // link; on POST the confirmation <form action> preserves url.search so it
  // stays there.
  const url = new URL(req.url)
  const token = url.searchParams.get('t')
  if (!token) return html(page('Invalid link', `<h1>Invalid link</h1><p>This cancel link is missing its token. If you tapped it from a WhatsApp message, try copying and pasting the full URL into your browser.</p>`), 400)

  const parsed = await verifyToken(token)
  if (!parsed.ok) {
    console.warn('studio-cancel: token verification failed:', parsed.error)
    return html(page('Invalid link', `<h1>Invalid link</h1><p>This cancel link could not be verified. It may have been altered. Contact hello@wello-wellness.com if you believe this is a mistake.</p>`), 400)
  }
  const { bookingId, expiryIso, sig } = parsed

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Load booking + business + slot + customer in enough detail to render
  // the confirm page and to complete the cancellation.
  const { data: booking, error: bookErr } = await supabase
    .from('bookings')
    .select('id, user_id, business_id, slot_id, booking_date, start_time, credits_used, status, safety_cancel_token, safety_cancel_expires_at, safety_cancelled_at')
    .eq('id', bookingId)
    .maybeSingle()
  if (bookErr || !booking) return html(page('Booking not found', `<h1>Booking not found</h1><p>We could not find the booking this link refers to.</p>`), 404)

  const { data: business } = await supabase
    .from('businesses').select('id, name, category, location').eq('id', booking.business_id).maybeSingle()

  const { data: slot } = await supabase
    .from('slots').select('name').eq('id', booking.slot_id).maybeSingle()

  const { data: customer } = await supabase
    .from('profiles').select('id, full_name, email, credits').eq('id', booking.user_id).maybeSingle()

  const dateStr = fmtDate(booking.booking_date)
  const timeStr = (booking.start_time || '').slice(0,5)
  const sessionName = slot?.name || 'a session'
  const studioName  = business?.name || 'the studio'

  // Reject cases that would leave us in an inconsistent state.
  const now = Date.now()
  const expiresAt = new Date(expiryIso).getTime()
  if (!Number.isFinite(expiresAt)) {
    return html(page('Invalid link', `<h1>Invalid link</h1><p>This cancel link has an invalid expiry. Contact hello@wello-wellness.com.</p>`), 400)
  }
  if (now > expiresAt) {
    console.log(`studio-cancel: expired link for booking ${bookingId} (expired ${expiryIso})`)
    return html(page('Window closed', `<h1>Cancellation window closed</h1><p>The window to cancel this booking ended ${new Date(expiresAt).toLocaleString('en-GB', { timeZone: 'Europe/Madrid' })}. Contact the customer directly if you still need to reschedule.</p>`), 410)
  }
  if (!booking.safety_cancel_token || !safeEqual(booking.safety_cancel_token, sig)) {
    // Token was rotated, cleared, or never existed — likely already used.
    return html(page('Already cancelled', `<h1>Already cancelled</h1><p>This booking has already been cancelled or the link has been used. No further action is needed.</p>`), 409)
  }
  if (booking.status !== 'confirmed') {
    return html(page('Nothing to cancel', `<h1>Nothing to cancel</h1><p>This booking is currently ${booking.status}. It cannot be cancelled through this link.</p>`), 409)
  }

  // ── GET: show the confirmation page ────────────────────────────────
  if (req.method === 'GET') {
    const details = `<dl>
      <dt>Session</dt><dd>${sessionName}</dd>
      <dt>When</dt><dd>${dateStr} at ${timeStr}</dd>
      <dt>Customer</dt><dd>${(customer?.full_name || customer?.email || 'A Wello member').split(/\s+/)[0]}</dd>
    </dl>`
    return html(page('Cancel this booking?', `
      <h1>Cancel this booking?</h1>
      <p>You are about to cancel this booking under Wello's safety window. The customer's credits will be returned in full and they will be notified with alternative options.</p>
      ${details}
      <form method="POST" action="${url.pathname}${url.search}">
        <button type="submit">Yes, cancel booking</button>
        <a class="btn secondary" href="https://wello-wellness.com">Never mind</a>
      </form>`))
  }

  if (req.method !== 'POST') return html(page('Method not allowed', `<h1>Method not allowed</h1>`), 405)

  // ── POST: do the cancellation ──────────────────────────────────────
  // Update conditional on the current status + token so a concurrent call
  // can't double-cancel.
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
    return html(page('Error', `<h1>Error</h1><p class="err">Could not cancel the booking. Contact hello@wello-wellness.com.</p>`), 500)
  }
  if (!updated) {
    return html(page('Already cancelled', `<h1>Already cancelled</h1><p>Looks like this booking was cancelled by another action in the meantime. No further action is needed.</p>`), 409)
  }

  // Refund credits via the ledger. refund_by_booking is idempotent so
  // a partial failure that's later retried won't double-refund.
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
      return html(page('Error', `<h1>Refund failed</h1><p class="err">We could not return the customer's credits. The cancellation has been rolled back. Please try again in a minute or email hello@wello-wellness.com.</p>`), 500)
    }
  }

  // Decrement slots.booked so the slot returns to the marketplace.
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

  // Build 2-3 rule-based alternatives for the customer email.
  // Same category, different venue, upcoming slots with capacity, ordered by
  // proximity to the cancelled session's time-of-day.
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
      // Pick the slot closest in hour-of-day to the cancelled slot.
      bookableSlots.sort((a: { time: string }, b: { time: string }) => {
        const ah = parseInt((a.time || '00:00').slice(0,2), 10)
        const bh = parseInt((b.time || '00:00').slice(0,2), 10)
        return Math.abs(ah - targetHour) - Math.abs(bh - targetHour)
      })
      return { ...l, next_slot: bookableSlots[0] as { date: string; time: string } }
    })
    .filter(Boolean)
    .slice(0, 3) as Array<{ id: number; name: string; loc: string; cr: number; next_slot: { date: string; time: string } }>

  // Email the customer.
  if (customer?.email) {
    const altsHtml = alternatives.length > 0
      ? `<p style="color:#54584F;line-height:1.7;margin:18px 0 8px;">Here are some similar options you could try:</p>` +
        alternatives.map(a => {
          const d = fmtDate(a.next_slot.date)
          const t = (a.next_slot.time || '').slice(0,5)
          return `<div style="display:block;padding:12px 14px;border:1px solid #E4E2DD;border-radius:8px;margin-bottom:8px;background:#fff;"><div style="font-weight:700;color:#1B1C19;">${a.name}</div><div style="color:#54584F;font-size:13px;">${a.loc || 'Mallorca'} · Next slot ${d} ${t} · ◈ ${a.cr}</div></div>`
        }).join('') +
        `<p style="color:#54584F;line-height:1.7;margin-top:16px;"><a href="https://wello-wellness.com" style="color:#213C18;font-weight:600;">Browse all venues</a></p>`
      : `<p style="color:#54584F;line-height:1.7;margin-top:16px;">We do not have another venue available for that slot right now. <a href="https://wello-wellness.com" style="color:#213C18;font-weight:600;">Browse the marketplace</a> for other options.</p>`

    await sendEmail(customer.email, `${studioName} can no longer host your ${sessionName}`,
      `<div style="font-family:Manrope,Arial,sans-serif;max-width:520px;padding:24px;background:#FBF9F4;">
        <h2 style="color:#213C18;">A quick change of plan</h2>
        <p style="color:#54584F;line-height:1.7;">Unfortunately ${studioName} can no longer host your <strong>${sessionName}</strong> on <strong>${dateStr}</strong> at <strong>${timeStr}</strong>. Your ${refund} credits have been returned to your account in full.</p>
        ${altsHtml}
        <p style="color:#54584F;line-height:1.7;margin-top:18px;">Wello</p>
      </div>`)
  }

  console.log(`studio-cancel: booking ${booking.id} cancelled, refunded ${refund} credits to ${booking.user_id}`)

  return html(page('Booking cancelled', `
    <h1>Booking cancelled</h1>
    <p>The customer's credits have been returned and we have emailed them with a couple of alternative options. No further action is needed from your side.</p>
    <a class="btn" href="https://wello-wellness.com">Back to Wello</a>`))
})
