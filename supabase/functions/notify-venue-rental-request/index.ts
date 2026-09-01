import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Rental request notifications — mirrors notify-venue-slot-request but
// for rental bookings (end_date + rental_addons). Customer-side inserts
// the pending_venue booking row, then invokes this to mint HMAC
// accept/decline tokens and email the venue with rental-specific
// content (date range, add-ons, deposit).
//
// Kept separate from notify-venue-slot-request so the email template
// can evolve independently — rentals need date ranges, add-on lists,
// deposit lines that don't apply to class bookings.

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY         = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY            = Deno.env.get('RESEND_API_KEY')            || ''
const SAFETY_CANCEL_SECRET      = Deno.env.get('SAFETY_CANCEL_SECRET')      || ''
const PUBLIC_ORIGIN             = Deno.env.get('PUBLIC_ORIGIN')             || 'https://wello-wellness.com'
// Twilio for venue SMS on new rental. Silently no-ops if unset. Same
// pattern as notify-instructor-sms. Trim in case operators paste env
// values with stray whitespace/newlines — Twilio validates strictly and
// rejects anything with trailing "\n" as "Invalid Parameter" (20422).
const TWILIO_ACCOUNT_SID        = (Deno.env.get('TWILIO_ACCOUNT_SID')        || '').trim()
const TWILIO_AUTH_TOKEN         = (Deno.env.get('TWILIO_AUTH_TOKEN')         || '').trim()
const TWILIO_PHONE_NUMBER       = (Deno.env.get('TWILIO_PHONE_NUMBER')       || '').trim()
// Twilio WhatsApp — separate from-number + approved template Content SID
// (from Twilio Content API). Template variables map: {{1}}=customer
// first name, {{2}}=session/rental name, {{3}}=date, {{4}}=time,
// {{5}}=cancel-by deadline. Both env vars must be set for WhatsApp to
// fire; silently no-ops otherwise.
const TWILIO_WHATSAPP_FROM         = (Deno.env.get('TWILIO_WHATSAPP_FROM')         || '').trim()
const TWILIO_WHATSAPP_CONTENT_SID  = (Deno.env.get('TWILIO_WHATSAPP_CONTENT_SID')  || '').trim()

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

async function hmacSign(msg: string, key: string): Promise<string> {
  const enc = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey(
    'raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(msg))
  const bytes = new Uint8Array(sig)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fmtDate(iso: string) {
  try { return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) } catch { return iso }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')    return json({ error: 'POST only' }, 405)
  if (!SAFETY_CANCEL_SECRET) return json({ error: 'Server not configured (missing SAFETY_CANCEL_SECRET).' }, 500)

  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) return json({ error: 'Sign in to request a rental.' }, 401)
  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: userData, error: userErr } = await anonClient.auth.getUser(token)
  if (userErr || !userData?.user) return json({ error: 'Session expired, please sign in again.' }, 401)
  const customerId = userData.user.id

  let body: { booking_id?: string }
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON body.' }, 400) }
  const bookingId = String(body.booking_id || '').trim()
  if (!bookingId) return json({ error: 'booking_id required' }, 400)

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Load booking + verify it's a rental owned by the caller.
  const { data: booking, error: bkErr } = await supabase
    .from('bookings')
    .select('id, user_id, business_id, offering_type, booking_date, end_date, duration, credits_used, rental_addons, status, notes')
    .eq('id', bookingId)
    .maybeSingle()
  if (bkErr) return json({ error: bkErr.message }, 500)
  if (!booking) return json({ error: 'Booking not found.' }, 404)
  if (booking.user_id !== customerId) return json({ error: 'Not your booking.' }, 403)
  if (booking.status !== 'pending_venue') return json({ error: `Booking is ${booking.status}, not pending_venue` }, 409)
  if (!booking.end_date) return json({ error: 'Not a rental (end_date missing).' }, 400)

  const { data: business } = await supabase
    .from('businesses').select('id, name, email, phone, bookings_whatsapp, notify_sms_enabled, notify_whatsapp_enabled').eq('id', booking.business_id).maybeSingle()
  if (!business?.email) return json({ error: 'Venue has no email on file.' }, 400)

  const { data: profile } = await supabase
    .from('profiles').select('full_name, email').eq('id', customerId).maybeSingle()

  // Mint HMAC accept + decline tokens. Same 49h expiry as slot-based
  // requests so auto-decline-stale-bookings runs at the 48h mark.
  const expiryIso = new Date(Date.now() + 49 * 60 * 60 * 1000).toISOString()
  const acceptPayload  = `${bookingId}.${expiryIso}.accept`
  const declinePayload = `${bookingId}.${expiryIso}.decline`
  const acceptSig  = await hmacSign(acceptPayload,  SAFETY_CANCEL_SECRET)
  const declineSig = await hmacSign(declinePayload, SAFETY_CANCEL_SECRET)
  const acceptToken  = `${encodeURIComponent(acceptPayload)}.${acceptSig}`
  const declineToken = `${encodeURIComponent(declinePayload)}.${declineSig}`

  const { error: tokErr } = await supabase
    .from('bookings')
    .update({
      venue_accept_token:  acceptSig,
      venue_decline_token: declineSig,
      venue_action_expires_at: expiryIso,
    })
    .eq('id', bookingId)
  if (tokErr) {
    console.error('notify-venue-rental-request: token store failed:', tokErr.message)
    return json({ error: 'Could not store tokens.' }, 500)
  }

  const acceptUrl  = `${SUPABASE_URL}/functions/v1/venue-booking-response?a=accept&t=${acceptToken}`
  const declineUrl = `${SUPABASE_URL}/functions/v1/venue-booking-response?a=decline&t=${declineToken}`

  const customerName = (profile?.full_name || profile?.email || 'A Wello member').trim()
  const firstName    = customerName.split(/\s+/)[0]
  const rentalName   = String(booking.offering_type || 'rental')
  const startHuman   = fmtDate(String(booking.booking_date))
  const endHuman     = fmtDate(String(booking.end_date))
  const cost         = Number(booking.credits_used) || 0
  const addons       = Array.isArray(booking.rental_addons) ? booking.rental_addons : []
  const addonsLine   = addons.length > 0
    ? addons.map((a: { label?: string; price_eur?: number }) => `${a?.label}${(Number(a?.price_eur) || 0) > 0 ? ` (+€${a.price_eur})` : ''}`).join(', ')
    : ''

  if (!RESEND_API_KEY) {
    return json({ ok: true, sent: false, reason: 'no_resend_key', accept_url: acceptUrl, decline_url: declineUrl })
  }

  const html = `
    <div style="font-family:Manrope,Arial,sans-serif;max-width:540px;margin:0 auto;padding:24px;color:#1B1C19;background:#FBF9F4;">
      <h2 style="color:#213C18;font-size:18px;margin:0 0 14px;">New rental request</h2>
      <p style="margin:0 0 16px;line-height:1.5;">${firstName} has requested a ${rentalName} from ${business.name}. Please accept or decline within 48 hours. If you do not respond, the request expires and the member's credits are returned in full.</p>
      <table style="width:100%;border-collapse:collapse;background:#F5F3EE;border-radius:8px;padding:14px;margin:0 0 18px;">
        <tr><td style="padding:6px 12px;font-size:13px;color:#54584F;width:120px;">Rental</td><td style="padding:6px 12px;font-size:13px;color:#1B1C19;font-weight:600;">${rentalName}</td></tr>
        <tr><td style="padding:6px 12px;font-size:13px;color:#54584F;">Dates</td><td style="padding:6px 12px;font-size:13px;color:#1B1C19;font-weight:600;">${startHuman} → ${endHuman}</td></tr>
        <tr><td style="padding:6px 12px;font-size:13px;color:#54584F;">Duration</td><td style="padding:6px 12px;font-size:13px;color:#1B1C19;">${booking.duration || '—'}</td></tr>
        ${addonsLine ? `<tr><td style="padding:6px 12px;font-size:13px;color:#54584F;">Add-ons</td><td style="padding:6px 12px;font-size:13px;color:#1B1C19;">${addonsLine}</td></tr>` : ''}
        <tr><td style="padding:6px 12px;font-size:13px;color:#54584F;">Credits held</td><td style="padding:6px 12px;font-size:13px;color:#1B1C19;font-weight:600;">◈ ${cost}</td></tr>
        <tr><td style="padding:6px 12px;font-size:13px;color:#54584F;">Member</td><td style="padding:6px 12px;font-size:13px;color:#1B1C19;">${firstName}</td></tr>
      </table>
      <div style="margin:0 0 18px;">
        <a href="${acceptUrl}" style="display:inline-block;padding:12px 22px;background:#213C18;color:#FBF9F4;text-decoration:none;border-radius:999px;font-weight:700;font-size:13px;margin-right:8px;">Accept rental</a>
        <a href="${declineUrl}" style="display:inline-block;padding:12px 22px;background:#fff;color:#213C18;text-decoration:none;border-radius:999px;font-weight:700;font-size:13px;border:1px solid rgba(33,60,24,0.2);">Decline</a>
      </div>
      <p style="margin:0;font-size:11px;color:#54584F;line-height:1.55;">Each link works once. Accepting deducts ${cost} credits from the member and confirms the rental. Declining returns their credits in full.</p>
    </div>`

  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Wello <hello@wello-wellness.com>',
      to: business.email,
      subject: `New rental request for ${rentalName} · ${startHuman} → ${endHuman}`,
      html,
    }),
  }).catch(e => { console.error('Resend error:', e); return null })

  // ── Venue SMS ──────────────────────────────────────────────────
  // Opt-in per business (businesses.notify_sms_enabled). Silently
  // no-ops if the flag is off, or if any of phone / TWILIO_* are missing.
  let smsResult: string = 'not_attempted'
  if (!business.notify_sms_enabled) {
    smsResult = 'opted_out'
  } else if (business.phone && TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_PHONE_NUMBER) {
    const body = `New Wello rental request from ${firstName} for ${rentalName} (${startHuman} → ${endHuman}). ${cost} credits held. Accept or decline within 48h at wello-wellness.com`
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`
    const params = new URLSearchParams({ To: business.phone, From: TWILIO_PHONE_NUMBER, Body: body })
    const auth = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)
    try {
      const r = await fetch(twilioUrl, {
        method: 'POST',
        headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      })
      smsResult = r.ok ? 'sent' : 'failed'
      if (!r.ok) {
        const errBody = await r.text().catch(() => '')
        console.error('notify-venue-rental-request: Twilio SMS failed', r.status, 'to:', business.phone, 'body:', errBody)
      }
    } catch (e) {
      smsResult = 'failed'
      console.error('notify-venue-rental-request: Twilio error', (e as Error).message)
    }
  } else {
    smsResult = !business.phone ? 'no_phone_on_file' : 'twilio_not_configured'
  }

  // ── Venue WhatsApp ─────────────────────────────────────────────
  // Opt-in per business (businesses.notify_whatsapp_enabled). Uses
  // Twilio's Content API with an approved template — variables are
  // sent as a JSON object matching the template placeholders. The
  // template:
  //   "New Wello booking
  //    {{1}} has booked {{2}} on {{3}} at {{4}}.
  //    If this clashes with an existing booking, you can cancel
  //    free of charge before {{5}}."
  // {{5}} = "cancel free before" — for rental requests we use the
  // 48h accept deadline (auto-decline sweeps at this point).
  let whatsappResult: string = 'not_attempted'
  const waNumber = business.bookings_whatsapp || business.phone
  const acceptDeadline = new Date(Date.now() + 48 * 60 * 60 * 1000)
    .toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
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
        '2': rentalName,
        '3': `${startHuman} → ${endHuman}`,
        '4': 'rental',
        '5': acceptDeadline,
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
        console.error('notify-venue-rental-request: WhatsApp send failed', r.status, 'body:', txt,
          'sent params:', JSON.stringify({
            From: fromFormatted,
            To: toFormatted,
            ContentSid: TWILIO_WHATSAPP_CONTENT_SID,
            ContentVariables: {
              '1': firstName,
              '2': rentalName,
              '3': `${startHuman} → ${endHuman}`,
              '4': 'rental',
              '5': acceptDeadline,
            },
          }))
      }
    } catch (e) {
      whatsappResult = 'failed'
      console.error('notify-venue-rental-request: WhatsApp error', (e as Error).message)
    }
  } else {
    whatsappResult = !waNumber ? 'no_whatsapp_on_file' : 'whatsapp_not_configured'
  }

  // ── Customer confirmation email ────────────────────────────────
  // Reassures the customer that the request landed and sets
  // expectations on the 48h SLA. Silently skips when no Resend key
  // or the customer has no email on file. Sender is Wello.
  let customerEmailResult: 'sent' | 'failed' | 'no_customer_email' | 'no_resend_key' =
    !RESEND_API_KEY ? 'no_resend_key' : (!profile?.email ? 'no_customer_email' : 'failed')
  if (RESEND_API_KEY && profile?.email) {
    const customerHtml = `
      <div style="font-family:Manrope,Arial,sans-serif;max-width:540px;margin:0 auto;padding:24px;color:#1B1C19;background:#FBF9F4;">
        <h2 style="color:#213C18;font-size:20px;margin:0 0 12px;">Rental request received</h2>
        <p style="margin:0 0 16px;line-height:1.55;">Hi ${firstName}, thanks for your request. <b>${business.name}</b> has 48 hours to confirm your <b>${rentalName}</b> for <b>${startHuman} → ${endHuman}</b>.</p>
        <table style="width:100%;border-collapse:collapse;background:#F5F3EE;border-radius:8px;padding:14px;margin:0 0 18px;">
          <tr><td style="padding:6px 12px;font-size:13px;color:#54584F;width:140px;">Rental</td><td style="padding:6px 12px;font-size:13px;color:#1B1C19;font-weight:600;">${rentalName}</td></tr>
          <tr><td style="padding:6px 12px;font-size:13px;color:#54584F;">Dates</td><td style="padding:6px 12px;font-size:13px;color:#1B1C19;">${startHuman} → ${endHuman}</td></tr>
          ${addonsLine ? `<tr><td style="padding:6px 12px;font-size:13px;color:#54584F;">Add-ons</td><td style="padding:6px 12px;font-size:13px;color:#1B1C19;">${addonsLine}</td></tr>` : ''}
          <tr><td style="padding:6px 12px;font-size:13px;color:#54584F;">Credits held</td><td style="padding:6px 12px;font-size:13px;color:#1B1C19;font-weight:600;">◈ ${cost}</td></tr>
        </table>
        <p style="margin:0 0 8px;font-size:12px;color:#54584F;line-height:1.55;">We'll email you the moment the venue accepts. If they can't fulfil the request, your credits are returned in full.</p>
        <p style="margin:0;font-size:12px;color:#54584F;line-height:1.55;">Manage your rentals in your <a href="${PUBLIC_ORIGIN}/profile" style="color:#213C18;font-weight:600;">Wello reservations</a>.</p>
      </div>`
    try {
      const cr = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Wello <hello@wello-wellness.com>',
          to: profile.email,
          subject: `Rental request received — ${rentalName} · ${startHuman}`,
          html: customerHtml,
        }),
      })
      customerEmailResult = cr.ok ? 'sent' : 'failed'
      if (!cr.ok) {
        const txt = await cr.text().catch(() => '')
        console.error('notify-venue-rental-request: customer email failed', cr.status, txt.slice(0, 200))
      }
    } catch (e) {
      customerEmailResult = 'failed'
      console.error('notify-venue-rental-request: customer email error', (e as Error).message)
    }
  }

  return json({
    ok: true,
    sent: !!emailRes?.ok,
    sms: smsResult,
    whatsapp: whatsappResult,
    customer_email: customerEmailResult,
    accept_url: acceptUrl,
    decline_url: declineUrl,
    public_origin: PUBLIC_ORIGIN,
  })
})
