import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Sends an SMS to a private instructor when one of their slots gets booked
// (booking row inserted with status='pending_instructor'). Client invokes this
// directly after a successful insert; we fetch the booking + business + customer
// here so the browser never needs the instructor's phone number.

const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID')!
const TWILIO_AUTH_TOKEN  = Deno.env.get('TWILIO_AUTH_TOKEN')!
const TWILIO_PHONE_NUMBER = Deno.env.get('TWILIO_PHONE_NUMBER')!
const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

function fmtDate(iso: string) {
  // 2026-07-12 -> Sat 12 Jul
  try {
    return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
  } catch { return iso }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')    return json({ error: 'POST only' }, 405)

  try {
    const { booking_id } = await req.json()
    if (!booking_id) return json({ error: 'booking_id required' }, 400)

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Load the booking + instructor (business) + customer profile in one round trip.
    const { data: booking, error: bookErr } = await supabase
      .from('bookings')
      .select('id, user_id, business_id, slot_id, booking_date, start_time, duration, notes, status')
      .eq('id', booking_id)
      .single()
    if (bookErr || !booking) return json({ error: 'Booking not found: ' + (bookErr?.message || '') }, 404)

    if (booking.status !== 'pending_instructor') {
      return json({ skipped: 'booking not pending_instructor (status=' + booking.status + ')' })
    }

    const { data: business, error: bizErr } = await supabase
      .from('businesses')
      .select('id, name, phone, category, user_id')
      .eq('id', booking.business_id)
      .single()
    if (bizErr || !business) return json({ error: 'Business not found: ' + (bizErr?.message || '') }, 404)

    if (business.category !== 'Private Instructor') {
      return json({ skipped: 'business is not a private instructor (category=' + business.category + ')' })
    }
    if (!business.phone) {
      console.warn('notify-instructor-sms: instructor has no phone on file, booking_id=', booking_id)
      return json({ skipped: 'no phone on instructor profile' })
    }

    // Pull customer name + the slot's session name for the SMS body.
    const [{ data: profile }, { data: slot }] = await Promise.all([
      supabase.from('profiles').select('full_name, email').eq('id', booking.user_id).maybeSingle(),
      supabase.from('slots').select('name').eq('id', booking.slot_id).maybeSingle(),
    ])
    const customerName = profile?.full_name || profile?.email || 'A Wello member'
    const sessionName  = slot?.name || 'a session'
    const customerLoc  = (booking.notes || '').replace(/^Customer location:\s*/i, '').trim() || 'not provided'

    const body = `New Wello booking request from ${customerName} for ${sessionName} on ${fmtDate(booking.booking_date)} at ${(booking.start_time || '').slice(0,5)}. Location: ${customerLoc}. You have 48 hours to confirm at wello-wellness.com`

    // Twilio Messages API. Basic-auth with account SID + auth token.
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`
    const params = new URLSearchParams({
      To: business.phone,
      From: TWILIO_PHONE_NUMBER,
      Body: body,
    })
    const auth = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)
    const r = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    })
    const respBody = await r.json().catch(() => ({}))
    if (!r.ok) {
      console.error('Twilio send failed:', r.status, respBody)
      return json({ error: 'Twilio error', status: r.status, details: respBody }, 502)
    }
    console.log('notify-instructor-sms sent, sid=', respBody.sid, 'to=', business.phone)
    return json({ success: true, sid: respBody.sid })
  } catch (e) {
    console.error('notify-instructor-sms exception:', e)
    return json({ error: (e as Error).message || 'Unexpected error' }, 500)
  }
})
