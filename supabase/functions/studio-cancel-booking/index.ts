import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Partner-side cancellation safety window — inbound cancellation. Handles
// both studios (booking-safety-alert path) and private instructors
// (instructor-booking-response path). Kept under the studio-cancel-booking
// name because existing HMAC tokens already in flight point here.
//
// Flow:
//   1. Partner taps the cancel link in the WhatsApp/SMS alert (or clicks
//      through the SPA proxy at /cancel/:token).
//   2. GET /studio-cancel-booking?t=<token> serves an HTML confirmation page.
//      This avoids WhatsApp link previewers accidentally triggering cancels.
//   3. Partner clicks confirm, which POSTs the same token.
//   4. This function verifies the HMAC signature, checks the expiry hasn't
//      passed, checks the token hasn't already been used, then cancels the
//      booking, refunds the credits, decrements slots.booked, and emails
//      the customer with 2-3 alternative venues/instructors.
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
// bookingId stays a string — bookings.id is a UUID, not an int. The prior
// parseInt collapsed UUIDs like "1abc-..." to the leading digits and either
// failed the id-lookup or matched the wrong row; UUIDs starting with a
// letter would return NaN and 400 as "Invalid booking id" here.
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

// Branded page shell — used by all responses (cancel success, invalid link,
// window closed, etc.). Matches the Wello marketplace palette + typography
// so it doesn't feel like a bare debug page tacked on to WhatsApp.
function page(title: string, bodyHtml: string, opts?: { variant?: 'success' | 'info' | 'error' }): string {
  const v = opts?.variant || 'info'
  const accent =
    v === 'success' ? '#213C18' :
    v === 'error'   ? '#8B2F00' :
                      '#54584F'
  const badge =
    v === 'success' ? '<div class="badge badge-success" aria-hidden="true">✓</div>' :
    v === 'error'   ? '<div class="badge badge-error" aria-hidden="true">!</div>' :
                      '<div class="badge badge-info" aria-hidden="true">i</div>'
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#213C18">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Jost:wght@400;600;700&family=Manrope:wght@300;400;600;700&display=swap" rel="stylesheet">
    <title>${title} · Wello</title>
    <style>
      *,*::before,*::after { box-sizing: border-box; }
      html, body { min-height: 100dvh; }
      body {
        font-family: Manrope, -apple-system, BlinkMacSystemFont, Arial, sans-serif;
        background: linear-gradient(180deg, #FBF9F4 0%, #F5F3EE 100%);
        color: #1B1C19; margin: 0; padding: 24px;
        display: flex; flex-direction: column; align-items: center;
      }
      header { width: 100%; max-width: 520px; padding: 8px 4px 24px; }
      .wordmark {
        font-family: 'Jost', system-ui, sans-serif;
        font-size: 22px; font-weight: 700; color: #213C18;
        letter-spacing: -0.5px; text-decoration: none;
      }
      main { width: 100%; max-width: 520px; }
      .card {
        background: #fff; border-radius: 16px; padding: 32px 28px;
        box-shadow: 0 8px 32px rgba(33,60,24,0.10), 0 2px 6px rgba(33,60,24,0.05);
      }
      .badge {
        width: 52px; height: 52px; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        font-size: 26px; font-weight: 700; margin-bottom: 18px;
      }
      .badge-success { background: #E8EFDF; color: #213C18; }
      .badge-info    { background: #F5F3EE; color: #54584F; }
      .badge-error   { background: #F8E4D9; color: #8B2F00; }
      h1 {
        font-family: 'Jost', system-ui, sans-serif;
        color: ${accent}; font-size: 24px; font-weight: 700;
        line-height: 1.2; letter-spacing: -0.4px; margin: 0 0 12px;
      }
      p { color: #43483F; line-height: 1.6; margin: 0 0 14px; font-size: 15px; font-weight: 400; }
      p.muted { color: #54584F; font-size: 13px; }
      dl {
        display: grid; grid-template-columns: 84px 1fr; gap: 10px 14px;
        margin: 20px 0 24px; padding: 16px 18px;
        background: #F5F3EE; border-radius: 12px;
      }
      dt {
        color: #54584F; font-size: 10px; letter-spacing: 1.4px;
        text-transform: uppercase; font-weight: 700; align-self: center;
      }
      dd { color: #1B1C19; font-weight: 600; margin: 0; font-size: 14px; align-self: center; }
      .actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 24px; }
      .btn, button {
        display: inline-flex; align-items: center; justify-content: center;
        padding: 12px 24px; background: #213C18; color: #FBF9F4;
        border: none; border-radius: 999px; font-family: inherit;
        font-weight: 700; font-size: 14px; letter-spacing: 0.2px;
        cursor: pointer; text-decoration: none; transition: background .15s;
      }
      .btn:hover, button:hover { background: #2A4C1F; }
      .btn.secondary {
        background: transparent; color: #54584F;
        border: 1px solid rgba(33,60,24,0.20);
      }
      .btn.secondary:hover { background: rgba(33,60,24,0.04); }
      footer {
        margin-top: 32px; padding: 12px 4px;
        font-family: Manrope, sans-serif; font-size: 11px;
        color: #54584F; text-align: center;
      }
      footer a { color: #54584F; text-decoration: none; border-bottom: 1px solid rgba(84,88,79,0.3); }
      @media (max-width: 480px) {
        body { padding: 16px; }
        .card { padding: 24px 20px; }
        h1 { font-size: 20px; }
        dl { grid-template-columns: 76px 1fr; }
      }
    </style></head><body>
    <header><a class="wordmark" href="https://wello-wellness.com">wello</a></header>
    <main><div class="card">${badge}${bodyHtml}</div></main>
    <footer>Need help? <a href="mailto:hello@wello-wellness.com">hello@wello-wellness.com</a></footer>
    </body></html>`
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

  if (!SAFETY_CANCEL_SECRET) return html(page('Not configured', `<h1>Something's not set up</h1><p>Our cancel link infrastructure isn't fully configured on the server. Please email <a href="mailto:hello@wello-wellness.com">hello@wello-wellness.com</a> and we'll sort it out for you.</p>`, { variant: 'error' }), 500)

  // Token always rides in the query string. On GET it's set by the WhatsApp
  // link; on POST the confirmation <form action> preserves url.search so it
  // stays there.
  const url = new URL(req.url)
  const token = url.searchParams.get('t')
  if (!token) return html(page('Invalid link', `<h1>Link isn't complete</h1><p>The cancel link is missing part of its address. If you tapped it from WhatsApp, try copying the full URL into your browser and opening it there.</p><p class="muted">Still not working? Email <a href="mailto:hello@wello-wellness.com">hello@wello-wellness.com</a> and we'll sort it directly.</p>`, { variant: 'error' }), 400)

  const parsed = await verifyToken(token)
  if (!parsed.ok) {
    console.warn('studio-cancel: token verification failed:', parsed.error)
    return html(page('Invalid link', `<h1>Link couldn't be verified</h1><p>This link may have been altered or copied incorrectly, so we can't be sure it's you tapping cancel. If you believe this is a mistake, email <a href="mailto:hello@wello-wellness.com">hello@wello-wellness.com</a> and we'll cancel it for you.</p>`, { variant: 'error' }), 400)
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
  if (bookErr || !booking) return html(page('Booking not found', `<h1>We couldn't find that booking</h1><p>The booking this link refers to isn't in our records. It may have already been removed, or the link may have been generated by an older version of the notification.</p><p class="muted">If you think this is wrong, email <a href="mailto:hello@wello-wellness.com">hello@wello-wellness.com</a> and we'll investigate.</p>`, { variant: 'error' }), 404)

  const { data: business } = await supabase
    .from('businesses').select('id, name, category, location').eq('id', booking.business_id).maybeSingle()

  const { data: slot } = await supabase
    .from('slots').select('name').eq('id', booking.slot_id).maybeSingle()

  const { data: customer } = await supabase
    .from('profiles').select('id, full_name, email, credits').eq('id', booking.user_id).maybeSingle()

  const dateStr = fmtDate(booking.booking_date)
  const timeStr = (booking.start_time || '').slice(0,5)
  const sessionName = slot?.name || 'a session'
  const isInstructor = (business?.category || '') === 'Private Instructor'
  const partnerName  = business?.name || (isInstructor ? 'the instructor' : 'the studio')

  // Reject cases that would leave us in an inconsistent state.
  const now = Date.now()
  const expiresAt = new Date(expiryIso).getTime()
  if (!Number.isFinite(expiresAt)) {
    return html(page('Invalid link', `<h1>Link has an invalid expiry</h1><p>Something's off with this link's timestamp. Email <a href="mailto:hello@wello-wellness.com">hello@wello-wellness.com</a> and we'll cancel it for you.</p>`, { variant: 'error' }), 400)
  }
  if (now > expiresAt) {
    console.log(`studio-cancel: expired link for booking ${bookingId} (expired ${expiryIso})`)
    return html(page('Window closed', `<h1>The cancel window has closed</h1><p>The safety window for this booking ended <b>${new Date(expiresAt).toLocaleString('en-GB', { timeZone: 'Europe/Madrid', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</b>. The session is going ahead as booked.</p><p class="muted">If something's come up, please contact the customer directly to reschedule.</p>`, { variant: 'info' }), 410)
  }
  if (!booking.safety_cancel_token || !safeEqual(booking.safety_cancel_token, sig)) {
    // Token was rotated, cleared, or never existed — likely already used.
    return html(page('Already cancelled', `<h1>This one's already handled</h1><p>Looks like this booking was cancelled by someone else (or by tapping this link earlier). No further action needed on your side.</p><div class="actions"><a class="btn" href="https://wello-wellness.com">Back to Wello</a></div>`, { variant: 'info' }), 409)
  }
  if (booking.status !== 'confirmed') {
    return html(page('Nothing to cancel', `<h1>Nothing to cancel</h1><p>This booking is currently <b>${booking.status}</b> — it can't be cancelled via this link.</p><div class="actions"><a class="btn" href="https://wello-wellness.com">Back to Wello</a></div>`, { variant: 'info' }), 409)
  }

  // ── Cancel immediately (GET or POST) ──────────────────────────────
  // Previously GET showed a confirmation form and POST did the work.
  // Partners asked for "tap the WhatsApp button → done" — the WhatsApp
  // client is the sole way this URL is served (never a public link in
  // the message body, and WA button URLs are not pre-fetched by
  // clients or previewers), so treating GET as the action is safe here.
  if (req.method !== 'GET' && req.method !== 'POST') {
    return html(page('Method not allowed', `<h1>Method not allowed</h1>`), 405)
  }

  // ── Do the cancellation ───────────────────────────────────────────
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
    return html(page('Error', `<h1>Something went wrong</h1><p>We couldn't cancel this booking — the request failed on our end. Please try again in a minute or email <a href="mailto:hello@wello-wellness.com">hello@wello-wellness.com</a> and we'll handle it manually.</p>`, { variant: 'error' }), 500)
  }
  if (!updated) {
    return html(page('Already cancelled', `<h1>This one's already handled</h1><p>Looks like this booking was cancelled by another action in the meantime. No further action needed on your side.</p><div class="actions"><a class="btn" href="https://wello-wellness.com">Back to Wello</a></div>`, { variant: 'info' }), 409)
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
      return html(page('Refund failed', `<h1>Refund didn't go through</h1><p>We couldn't return the customer's credits, so we've rolled the cancellation back — the booking is still active.</p><p class="muted">Please try tapping the cancel link again in a minute. If it keeps failing, email <a href="mailto:hello@wello-wellness.com">hello@wello-wellness.com</a> and we'll sort it.</p>`, { variant: 'error' }), 500)
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

  const customerFirst = (customer?.full_name || customer?.email || 'the customer').split(/\s+/)[0]
  return html(page('Booking cancelled', `
    <h1>Booking cancelled</h1>
    <p>Thanks — we've handled the rest. ${customerFirst}'s ${refund > 0 ? `${refund} credits have` : 'credits have'} been refunded automatically and we've emailed them a couple of alternative options.</p>
    <dl>
      <dt>Session</dt><dd>${sessionName}</dd>
      <dt>When</dt><dd>${dateStr} at ${timeStr}</dd>
      <dt>Customer</dt><dd>${customerFirst}</dd>
      ${refund > 0 ? `<dt>Refunded</dt><dd>◈ ${refund}</dd>` : ''}
    </dl>
    <p class="muted">No further action is needed from your side.</p>
    <div class="actions">
      <a class="btn" href="https://wello-wellness.com">Back to Wello</a>
    </div>`, { variant: 'success' }))
})
