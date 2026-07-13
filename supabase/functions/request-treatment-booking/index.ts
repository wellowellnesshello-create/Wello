import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Customer-initiated request booking for a studio/spa offering.
//
// This is the counterpart to the existing pending_instructor flow but
// hangs off businesses.session_offerings entries rather than expanded
// slot rows. It creates a booking with status='pending_venue' and no
// slot_id (studio treatments have no calendar row), mints two single-use
// HMAC-signed action tokens (accept + decline), and emails the venue
// with the two action links. Credits are held the same way
// pending_instructor holds them: no deduction on insert, deduction only
// on venue accept. No refund needed on decline / auto-decline because
// nothing was deducted.
//
// Client must send a valid Wello user JWT. The function itself uses the
// service role for the booking insert and the venue email.

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY         = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY            = Deno.env.get('RESEND_API_KEY')            || ''
const SAFETY_CANCEL_SECRET      = Deno.env.get('SAFETY_CANCEL_SECRET')      || ''
const PUBLIC_ORIGIN             = Deno.env.get('PUBLIC_ORIGIN')             || 'https://wello-wellness.com'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

// ── HMAC helpers ─ same primitives as studio-cancel-booking so the two
//    endpoints validate token pairs identically. Payload embeds action
//    (accept|decline) so a leak of one leg can't grant the other.
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

function fmtDate(iso: string) {
  try { return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) } catch { return iso }
}

// Time preference keys — must line up with the client picker options.
const TIME_PREF_LABEL: Record<string, string> = {
  morning:   'Morning (before 12:00)',
  afternoon: 'Afternoon (12:00 to 17:00)',
  evening:   'Evening (after 17:00)',
  specific:  'Specific time',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')    return json({ error: 'POST only' }, 405)

  if (!SAFETY_CANCEL_SECRET) return json({ error: 'Server not configured (missing SAFETY_CANCEL_SECRET).' }, 500)

  // ── Auth: caller must be a signed-in Wello user ────────────────────────
  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) return json({ error: 'Sign in to request a booking.' }, 401)
  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: userData, error: userErr } = await anonClient.auth.getUser(token)
  if (userErr || !userData?.user) return json({ error: 'Session expired, please sign in again.' }, 401)
  const customerId = userData.user.id

  // ── Body ───────────────────────────────────────────────────────────────
  let body: {
    business_id?: number | string
    offering_type?: string
    preferred_date?: string   // YYYY-MM-DD
    time_pref?: string        // morning | afternoon | evening | specific
    specific_time?: string    // HH:MM when time_pref === 'specific'
    note?: string
  }
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON body.' }, 400) }

  const businessId = Number(body.business_id)
  if (!Number.isFinite(businessId) || businessId <= 0) return json({ error: 'business_id is required.' }, 400)

  const offeringType = String(body.offering_type || '').trim()
  if (!offeringType) return json({ error: 'offering_type is required.' }, 400)

  // Preferred date: must be YYYY-MM-DD, at least tomorrow, at most 30 days away.
  const dateStr = String(body.preferred_date || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return json({ error: 'preferred_date must be YYYY-MM-DD.' }, 400)
  const day = new Date(dateStr + 'T00:00:00')
  if (Number.isNaN(day.getTime())) return json({ error: 'preferred_date is not a real date.' }, 400)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const minDay = new Date(today); minDay.setDate(today.getDate() + 1)
  const maxDay = new Date(today); maxDay.setDate(today.getDate() + 30)
  if (day < minDay || day > maxDay) return json({ error: 'Pick a date between tomorrow and 30 days from now.' }, 400)

  const timePref = String(body.time_pref || '').trim() || 'morning'
  if (!TIME_PREF_LABEL[timePref]) return json({ error: 'time_pref must be morning, afternoon, evening or specific.' }, 400)
  let specificTime: string | null = null
  if (timePref === 'specific') {
    specificTime = String(body.specific_time || '').trim()
    if (!/^\d{2}:\d{2}$/.test(specificTime)) return json({ error: 'specific_time must be HH:MM when time_pref is specific.' }, 400)
  }

  const noteRaw = typeof body.note === 'string' ? body.note.trim() : ''
  // Cap to keep the email tidy and prevent abuse.
  const note = noteRaw.slice(0, 500)

  // ── Server-side lookups: verify the business + offering exist, and the
  //    customer has enough credits. Uses service role to bypass RLS and
  //    reach the same rows a public listing view can see.
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: business, error: bizErr } = await supabase
    .from('businesses')
    .select('id, name, email, category, session_offerings')
    .eq('id', businessId)
    .maybeSingle()
  if (bizErr || !business) return json({ error: 'Venue not found.' }, 404)
  if (!business.email) return json({ error: 'Venue has no email on file, cannot deliver the request.' }, 400)

  const offerings = Array.isArray(business.session_offerings) ? business.session_offerings : []
  const offering = offerings.find((o: { type?: string }) => String(o?.type || '') === offeringType)
  if (!offering) return json({ error: 'Offering not found on this venue.' }, 404)

  const priceEur = Number(offering.price_eur) > 0 ? Math.round(Number(offering.price_eur)) : 0
  if (priceEur <= 0) return json({ error: 'This offering has no price set, contact the venue.' }, 400)
  const durMin = Number(offering.length_min) > 0 ? Math.round(Number(offering.length_min)) : 60

  const { data: profile, error: profErr } = await supabase
    .from('profiles').select('id, credits, full_name, email')
    .eq('id', customerId).maybeSingle()
  if (profErr || !profile) return json({ error: 'Profile not found. Try signing out and back in.' }, 404)
  const balance = Number(profile.credits) || 0
  if (balance < priceEur) {
    return json({ error: 'insufficient_credits', required: priceEur, balance }, 402)
  }

  // Anchor start_time so the booking has a sensible sort value even for
  // preference-only requests. The venue will confirm the actual time.
  const anchorTime = timePref === 'specific'
    ? String(specificTime)
    : timePref === 'morning'   ? '09:00'
    : timePref === 'afternoon' ? '14:00'
    :                            '18:00'

  // Prevent one customer from spamming the same venue with duplicate
  // requests for the same offering while an earlier one is still pending.
  const { data: dupe } = await supabase
    .from('bookings')
    .select('id')
    .eq('user_id', customerId)
    .eq('business_id', businessId)
    .eq('offering_type', offeringType)
    .eq('status', 'pending_venue')
    .limit(1)
    .maybeSingle()
  if (dupe?.id) {
    return json({ error: 'You already have a pending request for this offering. The venue has up to 48 hours to respond.', duplicate_booking_id: dupe.id }, 409)
  }

  // ── Insert the pending booking ────────────────────────────────────────
  // Notes field is human-readable so notify-instructor-sms parsing has an
  // analogue if we ever want to consolidate — but the fields we care about
  // for pending_venue are the explicit columns.
  const notesBlob = [
    `Offering: ${offeringType} · ${durMin} min`,
    `Time preference: ${TIME_PREF_LABEL[timePref]}${timePref === 'specific' ? ` (${specificTime})` : ''}`,
    note ? `Notes: ${note}` : '',
  ].filter(Boolean).join('\n')

  const { data: inserted, error: insErr } = await supabase
    .from('bookings')
    .insert({
      user_id: customerId,
      business_id: businessId,
      venue_id: businessId,
      slot_id: null,
      booking_date: dateStr,
      start_time: anchorTime,
      duration: `${durMin} min`,
      credits_used: priceEur,
      status: 'pending_venue',
      notes: notesBlob,
      offering_type: offeringType,
    })
    .select('id, created_at')
    .single()
  if (insErr || !inserted) {
    console.error('request-treatment-booking insert failed:', insErr?.message)
    return json({ error: `Could not create request: ${insErr?.message || 'unknown error'}` }, 500)
  }
  const bookingId = inserted.id

  // ── Mint accept + decline tokens ──────────────────────────────────────
  // Same 48h clock as auto-decline plus a small buffer so late clicks
  // still land before the sweep. Separate signatures per action so one
  // leaked token doesn't unlock both operations.
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
    console.error('request-treatment-booking token store failed:', tokErr.message)
    // Best effort roll-back so the booking doesn't sit un-actionable.
    await supabase.from('bookings').delete().eq('id', bookingId)
    return json({ error: `Could not finalise request: ${tokErr.message}` }, 500)
  }

  const acceptUrl  = `${SUPABASE_URL}/functions/v1/venue-booking-response?a=accept&t=${acceptToken}`
  const declineUrl = `${SUPABASE_URL}/functions/v1/venue-booking-response?a=decline&t=${declineToken}`

  // ── Notify the venue by email ─────────────────────────────────────────
  // Mirrors the notify-instructor-sms email shape but replaces the "open
  // the portal" CTA with direct HMAC action links. WhatsApp/SMS is kept
  // behind the platform flag exactly like booking-safety-alert does.
  const customerName = (profile.full_name || profile.email || 'A Wello member').trim()
  const firstName    = customerName.split(/\s+/)[0]
  const dateHuman    = fmtDate(dateStr)
  const timeLabel    = TIME_PREF_LABEL[timePref] + (timePref === 'specific' ? ` (${specificTime})` : '')

  if (RESEND_API_KEY) {
    const html = `
      <div style="font-family:Manrope,Arial,sans-serif;max-width:540px;margin:0 auto;padding:24px;color:#1B1C19;background:#FBF9F4;">
        <h2 style="color:#213C18;font-size:18px;margin:0 0 14px;">New booking request</h2>
        <p style="margin:0 0 16px;line-height:1.5;">${firstName} has requested a session at ${business.name}. Please accept or decline within 48 hours. If you do not respond, the request expires and the member's credits are returned in full.</p>
        <table style="width:100%;border-collapse:collapse;background:#F5F3EE;border-radius:8px;padding:14px;margin:0 0 18px;">
          <tr><td style="padding:6px 12px;font-size:13px;color:#54584F;width:120px;">Session</td><td style="padding:6px 12px;font-size:13px;color:#1B1C19;font-weight:600;">${offeringType}</td></tr>
          <tr><td style="padding:6px 12px;font-size:13px;color:#54584F;">Duration</td><td style="padding:6px 12px;font-size:13px;color:#1B1C19;">${durMin} min</td></tr>
          <tr><td style="padding:6px 12px;font-size:13px;color:#54584F;">Requested date</td><td style="padding:6px 12px;font-size:13px;color:#1B1C19;font-weight:600;">${dateHuman}</td></tr>
          <tr><td style="padding:6px 12px;font-size:13px;color:#54584F;">Time preference</td><td style="padding:6px 12px;font-size:13px;color:#1B1C19;">${timeLabel}</td></tr>
          <tr><td style="padding:6px 12px;font-size:13px;color:#54584F;">Member</td><td style="padding:6px 12px;font-size:13px;color:#1B1C19;">${firstName}</td></tr>
          ${note ? `<tr><td style="padding:6px 12px;font-size:13px;color:#54584F;">Note</td><td style="padding:6px 12px;font-size:13px;color:#1B1C19;font-style:italic;">${note.replace(/</g, '&lt;')}</td></tr>` : ''}
        </table>
        <div style="margin:0 0 18px;">
          <a href="${acceptUrl}" style="display:inline-block;padding:12px 22px;background:#213C18;color:#FBF9F4;text-decoration:none;border-radius:999px;font-weight:700;font-size:13px;margin-right:8px;">Accept booking</a>
          <a href="${declineUrl}" style="display:inline-block;padding:12px 22px;background:#fff;color:#213C18;text-decoration:none;border-radius:999px;font-weight:700;font-size:13px;border:1px solid rgba(33,60,24,0.2);">Decline</a>
        </div>
        <p style="margin:0;font-size:11px;color:#54584F;line-height:1.55;">Each link works once. Accepting deducts ${priceEur} credits from the member and confirms the booking. Declining returns their credits in full and offers alternatives.</p>
      </div>`
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Wello <hello@wello-wellness.com>',
        to: business.email,
        subject: `New booking request for ${offeringType} on ${dateHuman}`,
        html,
      }),
    }).catch(e => { console.error('Resend error:', e); return null })
    if (!emailRes?.ok) console.warn('venue notify email did not succeed for booking', bookingId)
  }

  return json({
    booking_id: bookingId,
    status: 'pending_venue',
    expires_at: expiryIso,
    public_origin: PUBLIC_ORIGIN,
  })
})
