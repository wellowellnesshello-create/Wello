import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Notification for instant-book (already-confirmed) bookings. Fired
// from the client's onConfirm path after spend-booking-credits succeeds
// for slot.booking_mode='instant' rows.
//
// Sends an email to the venue ("you have a new booking") and honours
// per-business SMS + WhatsApp opt-ins the same way notify-venue-slot-
// request and notify-venue-rental-request do. No accept/decline
// buttons — the booking is already confirmed; the venue just needs
// to know it happened.
//
// Also fires a "booking confirmed" email to the customer so they have
// a record with venue address + start time in their inbox.

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY         = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY            = (Deno.env.get('RESEND_API_KEY') || '').trim()
const PUBLIC_ORIGIN             = Deno.env.get('PUBLIC_ORIGIN')   || 'https://wello-wellness.com'
const TWILIO_ACCOUNT_SID        = (Deno.env.get('TWILIO_ACCOUNT_SID')        || '').trim()
const TWILIO_AUTH_TOKEN         = (Deno.env.get('TWILIO_AUTH_TOKEN')         || '').trim()
const TWILIO_PHONE_NUMBER       = (Deno.env.get('TWILIO_PHONE_NUMBER')       || '').trim()
const TWILIO_WHATSAPP_FROM        = (Deno.env.get('TWILIO_WHATSAPP_FROM')        || '').trim()
const TWILIO_WHATSAPP_CONTENT_SID = (Deno.env.get('TWILIO_WHATSAPP_CONTENT_SID') || '').trim()
const SAFETY_CANCEL_SECRET        = (Deno.env.get('SAFETY_CANCEL_SECRET')        || '').trim()

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

function fmtDate(iso: string) {
  try { return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) } catch { return iso }
}

// HMAC-SHA256 → base64url. Matches studio-cancel-booking's verifier so
// the {t=<token>} query param it consumes is generated identically here.
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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')    return json({ error: 'POST only' }, 405)

  // Caller must be a signed-in Wello user (the customer who just booked).
  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) return json({ error: 'Sign in required.' }, 401)
  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: userData, error: userErr } = await anonClient.auth.getUser(token)
  if (userErr || !userData?.user) return json({ error: 'Session expired.' }, 401)
  const customerId = userData.user.id

  let body: { booking_id?: string }
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON body.' }, 400) }
  const bookingId = String(body.booking_id || '').trim()
  if (!bookingId) return json({ error: 'booking_id required' }, 400)

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: booking, error: bkErr } = await supabase
    .from('bookings')
    .select('id, user_id, business_id, slot_id, booking_date, start_time, duration, credits_used, status, offering_type, notes, people_count')
    .eq('id', bookingId)
    .maybeSingle()
  if (bkErr) return json({ error: bkErr.message }, 500)
  if (!booking) return json({ error: 'Booking not found.' }, 404)
  if (booking.user_id !== customerId) return json({ error: 'Not your booking.' }, 403)
  if (booking.status !== 'confirmed') return json({ error: `Booking is ${booking.status}, not confirmed.` }, 409)

  const { data: business } = await supabase
    .from('businesses').select('id, name, address, email, phone, bookings_whatsapp, notify_sms_enabled, notify_whatsapp_enabled').eq('id', booking.business_id).maybeSingle()
  if (!business?.email) return json({ error: 'Venue has no email on file.' }, 400)

  const { data: profile } = await supabase
    .from('profiles').select('full_name, email').eq('id', customerId).maybeSingle()

  const { data: slot } = booking.slot_id
    ? await supabase.from('slots').select('name').eq('id', Number(booking.slot_id)).maybeSingle()
    : { data: null }

  const customerName = (profile?.full_name || profile?.email || 'A Wello member').trim()
  const firstName    = customerName.split(/\s+/)[0]
  const sessionName  = String(slot?.name || booking.offering_type || 'session')
  const dateHuman    = fmtDate(String(booking.booking_date))
  const timeShort    = String(booking.start_time || '').slice(0, 5)
  const cost         = Number(booking.credits_used) || 0
  const peopleCount  = Number(booking.people_count) || 1

  // ── Venue email — instant-book format (no accept/decline buttons) ──
  let venueEmailSent = false
  if (RESEND_API_KEY) {
    const html = `
      <div style="font-family:Manrope,Arial,sans-serif;max-width:540px;margin:0 auto;padding:24px;color:#1B1C19;background:#FBF9F4;">
        <h2 style="color:#213C18;font-size:18px;margin:0 0 14px;">New booking confirmed</h2>
        <p style="margin:0 0 16px;line-height:1.5;">${firstName} has booked ${sessionName} at ${business.name}. Booking is already confirmed — nothing to action from your side.</p>
        <table style="width:100%;border-collapse:collapse;background:#F5F3EE;border-radius:8px;padding:14px;margin:0 0 18px;">
          <tr><td style="padding:6px 12px;font-size:13px;color:#54584F;width:120px;">Session</td><td style="padding:6px 12px;font-size:13px;color:#1B1C19;font-weight:600;">${sessionName}</td></tr>
          <tr><td style="padding:6px 12px;font-size:13px;color:#54584F;">Date</td><td style="padding:6px 12px;font-size:13px;color:#1B1C19;font-weight:600;">${dateHuman}</td></tr>
          <tr><td style="padding:6px 12px;font-size:13px;color:#54584F;">Time</td><td style="padding:6px 12px;font-size:13px;color:#1B1C19;">${timeShort}</td></tr>
          <tr><td style="padding:6px 12px;font-size:13px;color:#54584F;">Duration</td><td style="padding:6px 12px;font-size:13px;color:#1B1C19;">${booking.duration || '—'}</td></tr>
          <tr><td style="padding:6px 12px;font-size:13px;color:#54584F;">Member</td><td style="padding:6px 12px;font-size:13px;color:#1B1C19;">${firstName}${peopleCount > 1 ? ` + ${peopleCount - 1} guest${peopleCount === 2 ? '' : 's'}` : ''}</td></tr>
          <tr><td style="padding:6px 12px;font-size:13px;color:#54584F;">Credits</td><td style="padding:6px 12px;font-size:13px;color:#1B1C19;font-weight:600;">◈ ${cost}</td></tr>
        </table>
        <p style="margin:0;font-size:11px;color:#54584F;line-height:1.55;">View this and all your bookings in your <a href="${PUBLIC_ORIGIN}/?portal=business" style="color:#213C18;font-weight:600;">Wello dashboard</a>.</p>
      </div>`
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Wello <hello@wello-wellness.com>',
        to: business.email,
        subject: `New booking · ${sessionName} · ${dateHuman} ${timeShort}`,
        html,
      }),
    }).catch(e => { console.error('Resend error:', e); return null })
    venueEmailSent = !!r?.ok
  }

  // ── Venue SMS (opt-in) ─────────────────────────────────────────
  let smsResult: string = 'not_attempted'
  if (!business.notify_sms_enabled) {
    smsResult = 'opted_out'
  } else if (business.phone && TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_PHONE_NUMBER) {
    const smsBody = `New Wello booking from ${firstName} for ${sessionName} on ${dateHuman} at ${timeShort}. Confirmed — no action needed. Dashboard: wello-wellness.com`
    const params = new URLSearchParams({ To: business.phone, From: TWILIO_PHONE_NUMBER, Body: smsBody })
    const auth = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)
    try {
      const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
        method: 'POST',
        headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      })
      smsResult = r.ok ? 'sent' : 'failed'
      if (!r.ok) {
        const txt = await r.text().catch(() => '')
        console.error('notify-venue-instant-booking: Twilio SMS failed', r.status, 'to:', business.phone, 'body:', txt)
      }
    } catch (e) {
      smsResult = 'failed'
      console.error('notify-venue-instant-booking: Twilio error', (e as Error).message)
    }
  } else {
    smsResult = !business.phone ? 'no_phone_on_file' : 'twilio_not_configured'
  }

  // ── Venue WhatsApp (opt-in, uses approved template) ────────────
  // The template has a "Cancel booking here" CTA whose URL substitutes
  // {{6}} — we mint an HMAC-signed token that studio-cancel-booking
  // verifies. Expiry = session start with a 1-hour floor so a same-hour
  // booking still has a usable cancel window (mirrors the pattern in
  // instructor-booking-response).
  let whatsappResult: string = 'not_attempted'
  const waNumber = business.bookings_whatsapp || business.phone
  const sessionStartMs = new Date(`${booking.booking_date}T${(booking.start_time || '00:00').slice(0,5)}:00Z`).getTime()
  const cancelExpiryMs = Math.max(sessionStartMs || 0, Date.now() + 60 * 60 * 1000)
  const cancelExpiryIso = new Date(cancelExpiryMs).toISOString()
  const deadline = new Date(cancelExpiryMs).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

  let cancelToken = ''
  if (SAFETY_CANCEL_SECRET) {
    const payload = `${booking.id}.${cancelExpiryIso}`
    const sig     = await hmacSign(payload, SAFETY_CANCEL_SECRET)
    cancelToken   = `${encodeURIComponent(payload)}.${sig}`
    const { error: tokErr } = await supabase
      .from('bookings')
      .update({ safety_cancel_token: sig, safety_cancel_expires_at: cancelExpiryIso })
      .eq('id', booking.id)
    if (tokErr) console.error('notify-venue-instant-booking: could not persist cancel token', tokErr.message)
  } else {
    console.warn('notify-venue-instant-booking: SAFETY_CANCEL_SECRET not set — WhatsApp cancel button will be non-functional')
  }

  if (!business.notify_whatsapp_enabled) {
    whatsappResult = 'opted_out'
  } else if (waNumber && TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_WHATSAPP_FROM && TWILIO_WHATSAPP_CONTENT_SID) {
    const toFormatted = waNumber.startsWith('whatsapp:') ? waNumber : `whatsapp:${waNumber.replace(/\s+/g, '')}`
    const fromFormatted = TWILIO_WHATSAPP_FROM.startsWith('whatsapp:') ? TWILIO_WHATSAPP_FROM : `whatsapp:${TWILIO_WHATSAPP_FROM.replace(/\s+/g, '')}`
    const params = new URLSearchParams({
      From: fromFormatted,
      To: toFormatted,
      ContentSid: TWILIO_WHATSAPP_CONTENT_SID,
      ContentVariables: JSON.stringify({
        '1': firstName,
        '2': sessionName,
        '3': dateHuman,
        '4': timeShort,
        '5': deadline,
        // Signed cancel token — studio-cancel-booking verifies HMAC and
        // checks the token still matches bookings.safety_cancel_token.
        '6': cancelToken || String(booking.id),
      }),
    })
    const auth = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)
    try {
      const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
        method: 'POST',
        headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      })
      whatsappResult = r.ok ? 'sent' : 'failed'
      if (!r.ok) {
        const txt = await r.text().catch(() => '')
        console.error('notify-venue-instant-booking: WhatsApp send failed', r.status, 'body:', txt)
      }
    } catch (e) {
      whatsappResult = 'failed'
      console.error('notify-venue-instant-booking: WhatsApp error', (e as Error).message)
    }
  } else {
    whatsappResult = !waNumber ? 'no_whatsapp_on_file' : 'whatsapp_not_configured'
  }

  // ── Customer confirmation email ───────────────────────────────
  let customerEmailSent = false
  if (RESEND_API_KEY && profile?.email) {
    const customerHtml = `
      <div style="font-family:Manrope,Arial,sans-serif;max-width:540px;margin:0 auto;padding:24px;color:#1B1C19;background:#FBF9F4;">
        <h2 style="color:#213C18;font-size:20px;margin:0 0 12px;">Booking confirmed</h2>
        <p style="margin:0 0 16px;line-height:1.55;">Hi ${firstName}, your ${sessionName} at <b>${business.name}</b> is booked.</p>
        <table style="width:100%;border-collapse:collapse;background:#F5F3EE;border-radius:8px;padding:14px;margin:0 0 18px;">
          <tr><td style="padding:6px 12px;font-size:13px;color:#54584F;width:120px;">When</td><td style="padding:6px 12px;font-size:13px;color:#1B1C19;font-weight:600;">${dateHuman} at ${timeShort}</td></tr>
          <tr><td style="padding:6px 12px;font-size:13px;color:#54584F;">Where</td><td style="padding:6px 12px;font-size:13px;color:#1B1C19;">${business.name}${business.address ? `<br><span style="color:#54584F;">${business.address}</span>` : ''}</td></tr>
          <tr><td style="padding:6px 12px;font-size:13px;color:#54584F;">Credits</td><td style="padding:6px 12px;font-size:13px;color:#1B1C19;">◈ ${cost}</td></tr>
        </table>
        <p style="margin:0 0 6px;font-size:12px;color:#54584F;line-height:1.55;">Manage this booking in your <a href="${PUBLIC_ORIGIN}/profile" style="color:#213C18;font-weight:600;">Wello reservations</a>.</p>
      </div>`
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Wello <hello@wello-wellness.com>',
        to: profile.email,
        subject: `Booking confirmed — ${sessionName} · ${dateHuman}`,
        html: customerHtml,
      }),
    }).catch(e => { console.error('Customer email error:', e); return null })
    customerEmailSent = !!r?.ok
  }

  return json({
    ok: true,
    venue_email:    venueEmailSent ? 'sent' : (RESEND_API_KEY ? 'failed' : 'no_resend_key'),
    sms:            smsResult,
    whatsapp:       whatsappResult,
    customer_email: customerEmailSent ? 'sent' : (profile?.email && RESEND_API_KEY ? 'failed' : 'no_recipient'),
  })
})
