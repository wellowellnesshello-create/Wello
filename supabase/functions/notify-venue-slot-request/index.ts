import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Slot-based request bookings: for a studio partner whose slot has
// booking_mode='request', we insert a pending_venue booking on the
// client side, then invoke this function to mint accept/decline
// tokens and email the venue.
//
// This mirrors the tail of request-treatment-booking (token minting +
// venue email), but keyed off an existing bookings row rather than
// creating one. Kept as a separate function so the offering-based
// flow (request-treatment-booking) stays self-contained and this
// slot-based path can evolve independently.

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY         = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY            = Deno.env.get('RESEND_API_KEY')            || ''
const SAFETY_CANCEL_SECRET      = Deno.env.get('SAFETY_CANCEL_SECRET')      || ''
const PUBLIC_ORIGIN             = Deno.env.get('PUBLIC_ORIGIN')             || 'https://wello-wellness.com'

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

  // Auth: caller must be a signed-in Wello user (the customer who
  // just inserted the booking).
  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) return json({ error: 'Sign in to request a booking.' }, 401)
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

  // Load booking, verify ownership + status.
  const { data: booking, error: bkErr } = await supabase
    .from('bookings')
    .select('id, user_id, business_id, slot_id, booking_date, start_time, duration, credits_used, status')
    .eq('id', bookingId)
    .maybeSingle()
  if (bkErr) return json({ error: bkErr.message }, 500)
  if (!booking) return json({ error: 'Booking not found.' }, 404)
  if (booking.user_id !== customerId) return json({ error: 'Not your booking.' }, 403)
  if (booking.status !== 'pending_venue') return json({ error: `Booking is ${booking.status}, not pending_venue` }, 409)

  // Venue + customer lookups for the email body.
  const { data: business } = await supabase
    .from('businesses').select('id, name, email, category').eq('id', booking.business_id).maybeSingle()
  if (!business?.email) return json({ error: 'Venue has no email on file.' }, 400)

  const { data: profile } = await supabase
    .from('profiles').select('full_name, email').eq('id', customerId).maybeSingle()

  const { data: slot } = booking.slot_id
    ? await supabase.from('slots').select('name').eq('id', Number(booking.slot_id)).maybeSingle()
    : { data: null }

  // Mint accept + decline tokens. Same 49h clock as
  // request-treatment-booking so auto-decline-stale-bookings sweeps
  // at the 48h mark before tokens expire.
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
    console.error('notify-venue-slot-request: token store failed:', tokErr.message)
    return json({ error: 'Could not store tokens.' }, 500)
  }

  const acceptUrl  = `${SUPABASE_URL}/functions/v1/venue-booking-response?a=accept&t=${acceptToken}`
  const declineUrl = `${SUPABASE_URL}/functions/v1/venue-booking-response?a=decline&t=${declineToken}`

  // Send the venue email (best-effort — if RESEND_API_KEY is unset
  // we return ok:true with sent:false so the client doesn't retry).
  const customerName = (profile?.full_name || profile?.email || 'A Wello member').trim()
  const firstName    = customerName.split(/\s+/)[0]
  const sessionName  = String(slot?.name || 'session')
  const dateHuman    = fmtDate(String(booking.booking_date))
  const timeShort    = String(booking.start_time || '').slice(0, 5)
  const cost         = Number(booking.credits_used) || 0

  if (!RESEND_API_KEY) {
    return json({ ok: true, sent: false, reason: 'no_resend_key', accept_url: acceptUrl, decline_url: declineUrl })
  }

  const html = `
    <div style="font-family:Manrope,Arial,sans-serif;max-width:540px;margin:0 auto;padding:24px;color:#1B1C19;background:#FBF9F4;">
      <h2 style="color:#213C18;font-size:18px;margin:0 0 14px;">New booking request</h2>
      <p style="margin:0 0 16px;line-height:1.5;">${firstName} has requested ${sessionName} at ${business.name}. Please accept or decline within 48 hours. If you do not respond, the request expires and the member's credits are returned in full.</p>
      <table style="width:100%;border-collapse:collapse;background:#F5F3EE;border-radius:8px;padding:14px;margin:0 0 18px;">
        <tr><td style="padding:6px 12px;font-size:13px;color:#54584F;width:120px;">Session</td><td style="padding:6px 12px;font-size:13px;color:#1B1C19;font-weight:600;">${sessionName}</td></tr>
        <tr><td style="padding:6px 12px;font-size:13px;color:#54584F;">Date</td><td style="padding:6px 12px;font-size:13px;color:#1B1C19;font-weight:600;">${dateHuman}</td></tr>
        <tr><td style="padding:6px 12px;font-size:13px;color:#54584F;">Time</td><td style="padding:6px 12px;font-size:13px;color:#1B1C19;">${timeShort}</td></tr>
        <tr><td style="padding:6px 12px;font-size:13px;color:#54584F;">Duration</td><td style="padding:6px 12px;font-size:13px;color:#1B1C19;">${booking.duration || '—'}</td></tr>
        <tr><td style="padding:6px 12px;font-size:13px;color:#54584F;">Member</td><td style="padding:6px 12px;font-size:13px;color:#1B1C19;">${firstName}</td></tr>
      </table>
      <div style="margin:0 0 18px;">
        <a href="${acceptUrl}" style="display:inline-block;padding:12px 22px;background:#213C18;color:#FBF9F4;text-decoration:none;border-radius:999px;font-weight:700;font-size:13px;margin-right:8px;">Accept booking</a>
        <a href="${declineUrl}" style="display:inline-block;padding:12px 22px;background:#fff;color:#213C18;text-decoration:none;border-radius:999px;font-weight:700;font-size:13px;border:1px solid rgba(33,60,24,0.2);">Decline</a>
      </div>
      <p style="margin:0;font-size:11px;color:#54584F;line-height:1.55;">Each link works once. Accepting deducts ${cost} credits from the member and confirms the booking. Declining returns their credits in full and offers alternatives.</p>
    </div>`

  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Wello <hello@wello-wellness.com>',
      to: business.email,
      subject: `New booking request for ${sessionName} on ${dateHuman}`,
      html,
    }),
  }).catch(e => { console.error('Resend error:', e); return null })

  return json({
    ok: true,
    sent: !!emailRes?.ok,
    accept_url: acceptUrl,
    decline_url: declineUrl,
    public_origin: PUBLIC_ORIGIN,
  })
})
