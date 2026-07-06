import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Studio-side cancellation safety window — outbound notification.
//
// Fires for new confirmed bookings at businesses that have opted into the
// safety window (businesses.cancellation_safety_window=true, always false for
// private instructors who use the pending_instructor flow instead).
//
// Builds a one-time HMAC token, stores it on the booking row alongside a
// 2-hour expiry bounded to 9am-7pm Europe/Madrid business hours, then sends
// a WhatsApp alert with a cancel link. If Twilio returns an error for
// WhatsApp (channel not registered, template missing, etc.) we automatically
// retry as SMS on the same number so studios keep getting alerts while Meta
// Business verification is finalised.

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const TWILIO_ACCOUNT_SID        = Deno.env.get('TWILIO_ACCOUNT_SID')  || ''
const TWILIO_AUTH_TOKEN         = Deno.env.get('TWILIO_AUTH_TOKEN')   || ''
const TWILIO_PHONE_NUMBER       = Deno.env.get('TWILIO_PHONE_NUMBER') || ''
// Secret used to sign the cancel-link tokens. Must match studio-cancel-booking.
const SAFETY_CANCEL_SECRET      = Deno.env.get('SAFETY_CANCEL_SECRET') || ''

const BUSINESS_HOURS_START = 9   // 09:00 Europe/Madrid
const BUSINESS_HOURS_END   = 19  // 19:00 Europe/Madrid
const WINDOW_MS            = 2 * 60 * 60 * 1000 // 2 hours of open-business time

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

function fmtDate(iso: string) {
  try { return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) } catch { return iso }
}

// Compute the wall-clock hour in Europe/Madrid for a given Date. Uses
// Intl.DateTimeFormat rather than getUTCHours so summer/winter time is
// handled correctly.
function madridWallClock(d: Date): { hour: number; minute: number; y: number; m: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d)
  const map: Record<string, string> = {}
  for (const p of parts) if (p.type !== 'literal') map[p.type] = p.value
  return {
    hour: parseInt(map.hour, 10),
    minute: parseInt(map.minute, 10),
    y: parseInt(map.year, 10),
    m: parseInt(map.month, 10),
    day: parseInt(map.day, 10),
  }
}

// Build the timestamp N milliseconds forward through 9-19 Madrid business
// hours. Time spent outside business hours doesn't count towards the window,
// so a booking at 18:00 → 60 minutes until 19:00 counts + resumes 09:00 next
// day, giving 60 more minutes until 10:00 for a total 2h open-window window.
export function computeExpiryFromMadridHours(startUtc: Date, remainingMs: number, nowIso?: string): Date {
  let cursor = new Date(nowIso ? nowIso : startUtc.toISOString())
  let msLeft = remainingMs
  // Safety cap: never loop more than 8 business days ahead.
  for (let i = 0; i < 200; i++) {
    const wc = madridWallClock(cursor)
    // Are we currently inside business hours?
    const insideStart = wc.hour >= BUSINESS_HOURS_START && wc.hour < BUSINESS_HOURS_END
    if (insideStart) {
      // How many ms until 19:00 Madrid today?
      const target = new Date(Date.UTC(wc.y, wc.m - 1, wc.day, BUSINESS_HOURS_END, 0, 0))
      // The UTC representation of "19:00 Madrid on Y-M-D" depends on DST.
      // Cheapest correct fix: build via toLocaleString round-trip.
      const closeMadrid = madridLocalToUtc(wc.y, wc.m, wc.day, BUSINESS_HOURS_END, 0)
      const msToClose = closeMadrid.getTime() - cursor.getTime()
      if (msLeft <= msToClose) {
        return new Date(cursor.getTime() + msLeft)
      }
      msLeft -= msToClose
      cursor = closeMadrid
      // Fall through: cursor is now at close, jump to next day's 09:00.
    }
    // Advance cursor to the next 09:00 Madrid.
    // If cursor's Madrid hour < 9 (early morning), jump today. Otherwise tomorrow.
    const wc2 = madridWallClock(cursor)
    let nextY = wc2.y, nextM = wc2.m, nextD = wc2.day
    if (wc2.hour >= BUSINESS_HOURS_END) {
      // After hours: bump to tomorrow.
      const dt = new Date(Date.UTC(wc2.y, wc2.m - 1, wc2.day))
      dt.setUTCDate(dt.getUTCDate() + 1)
      nextY = dt.getUTCFullYear(); nextM = dt.getUTCMonth() + 1; nextD = dt.getUTCDate()
    }
    cursor = madridLocalToUtc(nextY, nextM, nextD, BUSINESS_HOURS_START, 0)
  }
  // Should be unreachable — fall back to a conservative 2h wall-clock expiry.
  return new Date(startUtc.getTime() + WINDOW_MS)
}

// Given a Madrid wall-clock Y/M/D/H/M, return the corresponding UTC Date.
// Uses Intl.DateTimeFormat to figure out the offset for that specific
// date (handles CET/CEST switch correctly).
function madridLocalToUtc(y: number, m: number, d: number, h: number, min: number): Date {
  // Start with the naive UTC guess, then shift by Madrid's offset at that
  // instant. Two iterations converge because Madrid never has a DST
  // transition mid-hour.
  let guess = new Date(Date.UTC(y, m - 1, d, h, min, 0))
  for (let i = 0; i < 2; i++) {
    const wc = madridWallClock(guess)
    const wallMinutes  = wc.hour * 60 + wc.minute
    const targetMinutes = h * 60 + min
    const diff = targetMinutes - wallMinutes
    if (diff === 0) return guess
    guess = new Date(guess.getTime() + diff * 60_000)
  }
  return guess
}

function fmtWindowEnd(iso: string) {
  // Format the expiry in a friendly way for the alert body, in Madrid time.
  try {
    return new Date(iso).toLocaleString('en-GB', {
      timeZone: 'Europe/Madrid',
      weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
    })
  } catch { return iso }
}

// HMAC-SHA256 helpers using WebCrypto (available in Deno edge runtime).
async function hmacSign(msg: string, key: string): Promise<string> {
  const enc = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey(
    'raw', enc.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(msg))
  return arrayBufferToBase64Url(sig)
}
function arrayBufferToBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function sendTwilio(to: string, body: string, useWhatsApp: boolean): Promise<{ ok: boolean; sid?: string; error?: string; status?: number }> {
  const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`
  const from = useWhatsApp ? `whatsapp:${TWILIO_PHONE_NUMBER}` : TWILIO_PHONE_NUMBER
  const target = useWhatsApp ? `whatsapp:${to}` : to
  const params = new URLSearchParams({ To: target, From: from, Body: body })
  const auth = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)
  const r = await fetch(twilioUrl, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
  const respBody = await r.json().catch(() => ({}))
  if (!r.ok) return { ok: false, status: r.status, error: respBody?.message || respBody?.error_message || `Twilio ${r.status}` }
  return { ok: true, sid: respBody.sid }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')    return json({ error: 'POST only' }, 405)

  try {
    if (!SAFETY_CANCEL_SECRET) return json({ error: 'SAFETY_CANCEL_SECRET not configured' }, 500)

    const { booking_id } = await req.json()
    if (!booking_id) return json({ error: 'booking_id required' }, 400)

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: booking, error: bookErr } = await supabase
      .from('bookings')
      .select('id, user_id, business_id, slot_id, booking_date, start_time, credits_used, status, safety_cancel_token')
      .eq('id', booking_id)
      .maybeSingle()
    if (bookErr || !booking) return json({ error: 'Booking not found: ' + (bookErr?.message || '') }, 404)

    // Idempotency: if we've already issued a token for this booking, do
    // nothing. The client may double-invoke on retry.
    if (booking.safety_cancel_token) {
      return json({ skipped: 'alert already sent for this booking' })
    }
    if (booking.status !== 'confirmed') {
      return json({ skipped: 'booking not confirmed (status=' + booking.status + ')' })
    }

    const { data: business, error: bizErr } = await supabase
      .from('businesses')
      .select('id, name, phone, category, cancellation_safety_window')
      .eq('id', booking.business_id)
      .maybeSingle()
    if (bizErr || !business) return json({ error: 'Business not found' }, 404)

    if (!business.cancellation_safety_window) {
      return json({ skipped: 'business has not opted into the safety window' })
    }
    if (!business.phone) {
      return json({ skipped: 'business has no phone number on file' })
    }

    // Load customer + slot for the alert body.
    const [{ data: profile }, { data: slot }] = await Promise.all([
      supabase.from('profiles').select('full_name, email').eq('id', booking.user_id).maybeSingle(),
      supabase.from('slots').select('name').eq('id', booking.slot_id).maybeSingle(),
    ])
    const customerName = (profile?.full_name || profile?.email || 'A Wello member').split(/\s+/)[0]
    const sessionName  = slot?.name || 'a session'
    const dateStr = fmtDate(booking.booking_date)
    const timeStr = (booking.start_time || '').slice(0,5)

    // Build the expiry: 2 hours of 9-19 Madrid time from now.
    const now = new Date()
    const expiry = computeExpiryFromMadridHours(now, WINDOW_MS)
    const expiryIso = expiry.toISOString()

    // Sign a token that ties {booking_id, expiry} together so it can't be
    // rewritten. studio-cancel-booking checks the same signature.
    const payload = `${booking.id}.${expiryIso}`
    const sig = await hmacSign(payload, SAFETY_CANCEL_SECRET)
    const token = `${encodeURIComponent(payload)}.${sig}`

    // Persist the token + expiry so we can reject reuse after the studio
    // uses it, and so we're idempotent on retries.
    const { error: updErr } = await supabase
      .from('bookings')
      .update({ safety_cancel_token: sig, safety_cancel_expires_at: expiryIso })
      .eq('id', booking.id)
    if (updErr) {
      console.error('booking-safety-alert: could not persist token', updErr.message)
      return json({ error: 'Could not persist cancel token' }, 500)
    }

    // Cancel link points directly at the studio-cancel-booking edge function.
    // Using the edge URL rather than the SPA origin avoids needing a
    // rewrite rule on the frontend host and keeps the whole flow inside
    // Supabase's function runtime.
    const cancelUrl  = `${SUPABASE_URL}/functions/v1/studio-cancel-booking?t=${token}`
    const windowEnds = fmtWindowEnd(expiryIso)
    const bodyText = `New booking confirmed: ${sessionName} on ${dateStr} at ${timeStr} with ${customerName}. If there is a conflict, you have until ${windowEnds} to cancel: ${cancelUrl}`

    const results: Record<string, unknown> = {}

    if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_PHONE_NUMBER) {
      // Try WhatsApp first, fall back to SMS on any Twilio error.
      const waResult = await sendTwilio(business.phone, bodyText, true)
      if (waResult.ok) {
        results.channel = 'whatsapp'
        results.sid = waResult.sid
      } else {
        console.warn('WhatsApp send failed, falling back to SMS:', waResult.error)
        const smsResult = await sendTwilio(business.phone, bodyText, false)
        if (smsResult.ok) {
          results.channel = 'sms'
          results.sid = smsResult.sid
          results.whatsapp_fallback_reason = waResult.error || `status_${waResult.status}`
        } else {
          console.error('Both WhatsApp and SMS failed:', waResult.error, smsResult.error)
          return json({ error: 'Twilio send failed on both channels', whatsapp: waResult.error, sms: smsResult.error }, 502)
        }
      }
    } else {
      results.channel = 'not_configured'
      results.warning = 'Twilio not configured; token stored but no message sent'
    }

    console.log(`booking-safety-alert: booking ${booking.id} channel=${results.channel} expires=${expiryIso}`)
    return json({ success: true, expiry: expiryIso, ...results })
  } catch (e) {
    console.error('booking-safety-alert exception:', e)
    return json({ error: (e as Error).message || 'Unexpected error' }, 500)
  }
})
