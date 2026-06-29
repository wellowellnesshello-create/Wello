import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Handles the instructor's confirm/decline action on a pending_instructor
// booking. Auth-gated to the booking's instructor (we verify the JWT's user
// matches businesses.user_id). On confirm: status -> confirmed, credits
// deducted from the customer, emails sent. On decline: status -> cancelled,
// credits stay on the customer's profile, customer gets an email with
// alternative instructor suggestions where available.

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY            = Deno.env.get('RESEND_API_KEY')!

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

function fmtDate(iso: string) {
  try { return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) } catch { return iso }
}

async function sendEmail(to: string, subject: string, html: string, from = 'Wello <hello@wello-wellness.com>') {
  if (!RESEND_API_KEY) { console.warn('RESEND_API_KEY not set, skipping email to', to); return }
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, html }),
  }).catch(e => console.error('Resend error:', e))
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')    return json({ error: 'POST only' }, 405)

  try {
    const { booking_id, action } = await req.json()
    if (!booking_id) return json({ error: 'booking_id required' }, 400)
    if (action !== 'confirm' && action !== 'decline' && action !== 'auto_decline') {
      return json({ error: "action must be 'confirm', 'decline', or 'auto_decline'" }, 400)
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // auto_decline is called by the scheduled job — no JWT, runs as service role.
    // For confirm/decline by an instructor we verify their JWT matches the
    // business owner so a partner can't respond to someone else's bookings.
    let actingUserId: string | null = null
    if (action !== 'auto_decline') {
      const authHeader = req.headers.get('Authorization')
      if (!authHeader) return json({ error: 'Not authenticated' }, 401)
      const token = authHeader.replace(/^Bearer\s+/i, '')
      const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
      if (authErr || !user) return json({ error: 'Not authenticated' }, 401)
      actingUserId = user.id
    }

    // Load the booking and its business so we can verify ownership and decide
    // whether to deduct credits, send mail, etc.
    const { data: booking, error: bookErr } = await supabase
      .from('bookings')
      .select('id, user_id, business_id, slot_id, booking_date, start_time, duration, credits_used, notes, status')
      .eq('id', booking_id)
      .single()
    if (bookErr || !booking) return json({ error: 'Booking not found' }, 404)
    if (booking.status !== 'pending_instructor') {
      return json({ error: `Booking is no longer pending (status=${booking.status})` }, 409)
    }

    const { data: business, error: bizErr } = await supabase
      .from('businesses')
      .select('id, name, user_id, email, category, location, address')
      .eq('id', booking.business_id)
      .single()
    if (bizErr || !business) return json({ error: 'Business not found' }, 404)

    if (action !== 'auto_decline' && actingUserId && business.user_id && business.user_id !== actingUserId) {
      return json({ error: 'You can only respond to bookings for your own venues.' }, 403)
    }

    // Customer profile for emails + credit accounting.
    const { data: customer } = await supabase
      .from('profiles').select('id, full_name, email, credits').eq('id', booking.user_id).maybeSingle()

    // Pull the slot name so emails read naturally.
    const { data: slot } = await supabase
      .from('slots').select('name').eq('id', booking.slot_id).maybeSingle()
    const sessionName = slot?.name || 'your session'

    if (action === 'confirm') {
      // Mark confirmed AND deduct credits in two updates. We don't have a
      // single-statement transaction across two tables here, so deduct first
      // (the conservative side from the customer's POV); if it fails we leave
      // the booking pending so the instructor can retry.
      if (customer && (booking.credits_used ?? 0) > 0) {
        const newBalance = Math.max(0, (customer.credits ?? 0) - (booking.credits_used ?? 0))
        const { error: credErr } = await supabase
          .from('profiles').update({ credits: newBalance }).eq('id', customer.id)
        if (credErr) {
          console.error('Confirm: failed to deduct credits:', credErr.message)
          return json({ error: 'Could not deduct customer credits. ' + credErr.message }, 500)
        }
      }

      const { error: updErr } = await supabase
        .from('bookings').update({ status: 'confirmed' }).eq('id', booking.id)
      if (updErr) return json({ error: 'Could not update booking status. ' + updErr.message }, 500)

      // Confirmation emails — instructor + customer.
      const dateStr = fmtDate(booking.booking_date)
      const timeStr = (booking.start_time || '').slice(0,5)
      const customerName = customer?.full_name || customer?.email || 'your customer'
      const customerEmail = customer?.email
      const customerLoc = (booking.notes || '').replace(/^Customer location:\s*/i, '').trim() || 'see Wello dashboard'

      if (customerEmail) {
        await sendEmail(customerEmail, `Your booking with ${business.name} is confirmed`,
          `<div style="font-family:Arial,sans-serif;max-width:480px;padding:24px;background:#FBF9F4;"><h2 style="color:#213C18;">You're confirmed!</h2><p style="color:#54584F;line-height:1.7;">${business.name} has confirmed your booking for <strong>${sessionName}</strong> on <strong>${dateStr}</strong> at <strong>${timeStr}</strong>.</p><p style="color:#54584F;line-height:1.7;">${booking.credits_used} credits have been deducted from your balance.</p><p style="color:#54584F;line-height:1.7;">Have a great session,<br>Wello</p></div>`)
      }
      if (business.email) {
        await sendEmail(business.email, `Booking confirmed — ${customerName} on ${dateStr}`,
          `<div style="font-family:Arial,sans-serif;max-width:480px;padding:24px;background:#FBF9F4;"><h2 style="color:#213C18;">Booking confirmed</h2><p style="color:#54584F;line-height:1.7;"><strong>${customerName}</strong> for <strong>${sessionName}</strong> on <strong>${dateStr}</strong> at <strong>${timeStr}</strong>.</p><p style="color:#54584F;line-height:1.7;">Customer location: <strong>${customerLoc}</strong></p></div>`)
      }

      return json({ success: true, status: 'confirmed' })
    }

    // ─── DECLINE / AUTO_DECLINE ───────────────────────────────────────────
    // Find up to 3 alternative private instructors who could plausibly take
    // the customer. We match by category (always 'Private Instructor') and
    // prefer same-location overlap when possible. Excludes the declining venue.
    const { data: alts } = await supabase
      .from('listings')
      .select('id, name, loc, img, cr, business_id')
      .eq('cat', 'Private Instructor')
      .eq('status', 'active')
      .neq('business_id', business.id)
      .limit(20)

    let alternatives = alts || []
    // Prefer alternatives whose loc shares any token with the declining venue's
    // address/location. Falls back to the unsorted list if none match.
    if (alternatives.length > 0 && (business.address || business.location)) {
      const here = (business.address || business.location || '').toLowerCase()
      const tokens = here.split(/[,\s]+/).filter(t => t.length > 2)
      alternatives.sort((a, b) => {
        const aHit = tokens.some(t => (a.loc || '').toLowerCase().includes(t)) ? 1 : 0
        const bHit = tokens.some(t => (b.loc || '').toLowerCase().includes(t)) ? 1 : 0
        return bHit - aHit
      })
    }
    alternatives = alternatives.slice(0, 3)

    const { error: updErr } = await supabase
      .from('bookings').update({ status: 'cancelled' }).eq('id', booking.id)
    if (updErr) return json({ error: 'Could not update booking status. ' + updErr.message }, 500)

    // Credits were never deducted for pending_instructor, so nothing to refund
    // — but log a note in case future flows change that.
    console.log('Declined booking', booking.id, 'credits_used=', booking.credits_used, '(no refund needed — credits were only held)')

    const customerEmail = customer?.email
    if (customerEmail) {
      const dateStr = fmtDate(booking.booking_date)
      const timeStr = (booking.start_time || '').slice(0,5)
      const subject = action === 'auto_decline'
        ? `Your ${business.name} booking didn't go through`
        : `${business.name} couldn't take your booking`
      const opening = action === 'auto_decline'
        ? `Unfortunately ${business.name} didn't respond to your booking request for <strong>${sessionName}</strong> on <strong>${dateStr}</strong> at <strong>${timeStr}</strong>, so we've released it. Your credits are still on your account.`
        : `Unfortunately ${business.name} can't take your booking for <strong>${sessionName}</strong> on <strong>${dateStr}</strong> at <strong>${timeStr}</strong>. Your credits are still on your account.`
      const altsHtml = alternatives.length > 0
        ? `<p style="color:#54584F;line-height:1.7;margin:18px 0 8px;">Here are some other instructors who might be available:</p>` +
          alternatives.map(a =>
            `<div style="display:block;padding:12px 14px;border:1px solid #E4E2DD;border-radius:8px;margin-bottom:8px;background:#fff;"><div style="font-weight:700;color:#1B1C19;">${a.name}</div><div style="color:#54584F;font-size:13px;">${a.loc || 'Mallorca'} · ◈ ${a.cr} per session</div></div>`
          ).join('') +
          `<p style="color:#54584F;line-height:1.7;margin-top:18px;"><a href="https://wello-wellness.com" style="color:#213C18;font-weight:600;">Browse all instructors →</a></p>`
        : `<p style="color:#54584F;line-height:1.7;margin-top:16px;">We don't have another private instructor available for that slot right now. <a href="https://wello-wellness.com" style="color:#213C18;font-weight:600;">Browse the marketplace</a> for other options.</p>`

      await sendEmail(customerEmail, subject,
        `<div style="font-family:Arial,sans-serif;max-width:520px;padding:24px;background:#FBF9F4;"><h2 style="color:#213C18;">${subject}</h2><p style="color:#54584F;line-height:1.7;">${opening}</p>${altsHtml}<p style="color:#54584F;line-height:1.7;margin-top:18px;">Wello</p></div>`)
    }

    return json({ success: true, status: 'cancelled', alternatives_offered: alternatives.length })
  } catch (e) {
    console.error('instructor-booking-response exception:', e)
    return json({ error: (e as Error).message || 'Unexpected error' }, 500)
  }
})
