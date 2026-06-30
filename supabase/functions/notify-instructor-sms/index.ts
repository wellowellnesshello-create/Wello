import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Sends an SMS to a private instructor when one of their slots gets booked
// (booking row inserted with status='pending_instructor'). Client invokes this
// directly after a successful insert; we fetch the booking + business + customer
// here so the browser never needs the instructor's phone number.

const TWILIO_ACCOUNT_SID  = Deno.env.get('TWILIO_ACCOUNT_SID')  || ''
const TWILIO_AUTH_TOKEN   = Deno.env.get('TWILIO_AUTH_TOKEN')   || ''
const TWILIO_PHONE_NUMBER = Deno.env.get('TWILIO_PHONE_NUMBER') || ''
const RESEND_API_KEY      = Deno.env.get('RESEND_API_KEY')      || ''
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
      .select('id, name, phone, email, category, user_id')
      .eq('id', booking.business_id)
      .single()
    if (bizErr || !business) return json({ error: 'Business not found: ' + (bizErr?.message || '') }, 404)

    if (business.category !== 'Private Instructor') {
      return json({ skipped: 'business is not a private instructor (category=' + business.category + ')' })
    }

    // Pull customer name + the slot's session name for the email/SMS body.
    const [{ data: profile }, { data: slot }] = await Promise.all([
      supabase.from('profiles').select('full_name, email, phone').eq('id', booking.user_id).maybeSingle(),
      supabase.from('slots').select('name').eq('id', booking.slot_id).maybeSingle(),
    ])
    const customerName = profile?.full_name || profile?.email || 'A Wello member'
    const customerPhone = profile?.phone || ''
    const sessionName  = slot?.name || 'a session'
    // Notes come in as two lines: "Customer location: …" + "Notes: …"
    const notesBlob = booking.notes || ''
    const locLine   = notesBlob.split('\n').find((l: string) => /^Customer location:/i.test(l)) || ''
    const noteLine  = notesBlob.split('\n').find((l: string) => /^Notes:/i.test(l)) || ''
    const customerLoc  = locLine.replace(/^Customer location:\s*/i, '').trim() || 'not provided'
    const arrivalNote  = noteLine.replace(/^Notes:\s*/i, '').trim()
    const dateStr = fmtDate(booking.booking_date)
    const timeStr = (booking.start_time || '').slice(0,5)

    const results: Record<string, unknown> = {}

    // ── Email (always send if we have one) ─────────────────────────────
    if (business.email && RESEND_API_KEY) {
      const html = `
        <div style="font-family:Manrope,Arial,sans-serif;max-width:540px;margin:0 auto;padding:24px;color:#1B1C19;">
          <h2 style="color:#213C18;font-size:18px;margin:0 0 14px;">New booking request</h2>
          <p style="margin:0 0 16px;line-height:1.5;">${customerName} has requested a session. Please confirm or decline within 48 hours.</p>
          <table style="width:100%;border-collapse:collapse;background:#F5F3EE;border-radius:8px;padding:14px;margin:0 0 18px;">
            <tr><td style="padding:6px 12px;font-size:13px;color:#54584F;width:120px;">Session</td><td style="padding:6px 12px;font-size:13px;color:#1B1C19;font-weight:600;">${sessionName}</td></tr>
            <tr><td style="padding:6px 12px;font-size:13px;color:#54584F;">Date</td><td style="padding:6px 12px;font-size:13px;color:#1B1C19;font-weight:600;">${dateStr} at ${timeStr}</td></tr>
            <tr><td style="padding:6px 12px;font-size:13px;color:#54584F;">Location</td><td style="padding:6px 12px;font-size:13px;color:#1B1C19;">${customerLoc}</td></tr>
            ${customerPhone ? `<tr><td style="padding:6px 12px;font-size:13px;color:#54584F;">Customer phone</td><td style="padding:6px 12px;font-size:13px;color:#1B1C19;"><a href="tel:${customerPhone}" style="color:#213C18;">${customerPhone}</a></td></tr>` : ''}
            ${arrivalNote ? `<tr><td style="padding:6px 12px;font-size:13px;color:#54584F;">Notes</td><td style="padding:6px 12px;font-size:13px;color:#1B1C19;font-style:italic;">${arrivalNote}</td></tr>` : ''}
          </table>
          <a href="https://wello-wellness.com" style="display:inline-block;padding:12px 24px;background:#213C18;color:#FBF9F4;text-decoration:none;border-radius:999px;font-weight:700;font-size:13px;">Open the portal</a>
          <p style="margin:18px 0 0;font-size:11px;color:#A3B18A;">You have 48 hours from now. After that the request expires and the customer is redirected to alternative instructors.</p>
        </div>`
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Wello <hello@wello-wellness.com>',
          to: business.email,
          subject: `New booking request — ${customerName} · ${dateStr} ${timeStr}`,
          html,
        }),
      }).catch(e => { console.error('Resend error:', e); return null })
      results.email = emailRes?.ok ? 'sent' : 'failed'
    } else {
      results.email = business.email ? 'no_resend_key' : 'no_email_on_file'
    }

    // ── SMS (only if phone + Twilio configured) ────────────────────────
    if (business.phone && TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_PHONE_NUMBER) {
      const body = `New Wello booking request from ${customerName} for ${sessionName} on ${dateStr} at ${timeStr}. Location: ${customerLoc}. You have 48 hours to confirm at wello-wellness.com`
      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`
      const params = new URLSearchParams({ To: business.phone, From: TWILIO_PHONE_NUMBER, Body: body })
      const auth = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)
      const r = await fetch(twilioUrl, {
        method: 'POST',
        headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      })
      const respBody = await r.json().catch(() => ({}))
      if (!r.ok) {
        console.error('Twilio send failed:', r.status, respBody)
        results.sms = 'failed'
      } else {
        results.sms = 'sent'
        results.sms_sid = respBody.sid
      }
    } else {
      results.sms = !business.phone ? 'no_phone_on_file' : 'twilio_not_configured'
    }

    console.log('notify-instructor-sms results:', results)
    return json({ success: true, ...results })
  } catch (e) {
    console.error('notify-instructor-sms exception:', e)
    return json({ error: (e as Error).message || 'Unexpected error' }, 500)
  }
})
