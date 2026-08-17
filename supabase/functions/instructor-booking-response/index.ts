import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Handles the instructor's confirm/decline action on a pending_instructor
// booking. Auth-gated to the booking's instructor (we verify the JWT's user
// matches businesses.user_id).
//
// Credits are HELD at request time (see onConfirm in App.jsx), so:
//   - confirm       : status -> confirmed, no credit movement (already held)
//   - decline       : status -> cancelled, refund held credits to customer
//   - auto_decline  : status -> cancelled, refund held credits to customer

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY            = Deno.env.get('RESEND_API_KEY')!
// Shared secret sent by auto-decline-stale-bookings in X-Cron-Token when
// invoking the auto_decline action. Same value used across the cron
// chain; mirrored into vault.secrets for the pg_cron caller.
const CRON_INVOKE_SECRET        = Deno.env.get('CRON_INVOKE_SECRET') || ''
// Signs the safety-window cancel token minted on confirm. Verified by
// studio-cancel-booking. Must match booking-safety-alert / studio-cancel.
const SAFETY_CANCEL_SECRET      = Deno.env.get('SAFETY_CANCEL_SECRET') || ''
// Public site origin used for the branded /cancel/:token SPA proxy URL.
const APP_ORIGIN                = Deno.env.get('APP_ORIGIN') || 'https://wello-wellness.com'

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

// HMAC-SHA256 → base64url. Mirrors booking-safety-alert / studio-cancel-booking
// so the tokens minted here validate against the same verifier.
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

    // Auth per action. confirm/decline: instructor's JWT must map to the
    // business owner (partner-portal caller). auto_decline: X-Cron-Token
    // matching CRON_INVOKE_SECRET (pg_cron caller via
    // auto-decline-stale-bookings, which forwards the header).
    let actingUserId: string | null = null
    if (action === 'auto_decline') {
      if (!CRON_INVOKE_SECRET) return json({ error: 'CRON_INVOKE_SECRET not configured.' }, 500)
      const provided = (req.headers.get('X-Cron-Token') || req.headers.get('x-cron-token') || '').trim()
      if (!provided || provided.length !== CRON_INVOKE_SECRET.length) return json({ error: 'Unauthorized' }, 401)
      let diff = 0
      for (let i = 0; i < provided.length; i++) diff |= provided.charCodeAt(i) ^ CRON_INVOKE_SECRET.charCodeAt(i)
      if (diff !== 0) return json({ error: 'Unauthorized' }, 401)
    } else {
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
      .select('id, name, user_id, email, category, location, address, cancellation_window_hours')
      .eq('id', booking.business_id)
      .single()
    if (bizErr || !business) return json({ error: 'Business not found' }, 404)

    // Cancellation window shown in the confirmation email. Prefer the
    // per-partner column; fall back to 48h private / 24h everything else
    // (mirrors cancelWindowHoursFor in the client).
    const cwhRaw = Number(business.cancellation_window_hours)
    const cancelWindowHours = (Number.isFinite(cwhRaw) && cwhRaw >= 1 && cwhRaw <= 168)
      ? cwhRaw
      : (business.category === 'Private Instructor' ? 48 : 24)

    if (action !== 'auto_decline' && actingUserId && business.user_id && business.user_id !== actingUserId) {
      return json({ error: 'You can only respond to bookings for your own venues.' }, 403)
    }

    // Customer profile for emails + credit accounting.
    const { data: customer } = await supabase
      .from('profiles').select('id, full_name, email, phone, credits').eq('id', booking.user_id).maybeSingle()

    // Pull the slot name so emails read naturally.
    const { data: slot } = await supabase
      .from('slots').select('name').eq('id', booking.slot_id).maybeSingle()
    const sessionName = slot?.name || 'your session'

    if (action === 'confirm') {
      // Credits were already held at request time so accept is a status
      // flip only, no credit movement. Conditional on the current status
      // so a race with a concurrent decline / auto_decline cannot leave
      // the row in a broken state.
      const { data: updated, error: updErr } = await supabase
        .from('bookings')
        .update({ status: 'confirmed' })
        .eq('id', booking.id)
        .eq('status', 'pending_instructor')
        .select('id')
        .maybeSingle()
      if (updErr) return json({ error: 'Could not update booking status. ' + updErr.message }, 500)
      if (!updated)  return json({ error: 'Booking was already actioned in another tab.' }, 409)

      // Mint the safety-window cancel token — same shape as booking-safety-alert
      // (payload = `${bookingId}.${expiryIso}`, HMAC-SHA256, base64url). Cleared
      // on first use inside studio-cancel-booking. Expiry = session start time,
      // with a 1h floor so a same-hour confirm still has a usable window.
      let cancelUrl:       string | null = null
      let cancelUrlDirect: string | null = null
      let cancelExpiryIso: string | null = null
      if (SAFETY_CANCEL_SECRET) {
        const sessionStartMs = new Date(`${booking.booking_date}T${(booking.start_time || '00:00').slice(0,5)}:00Z`).getTime()
        const minExpiryMs    = Date.now() + 60 * 60 * 1000
        const expiryMs       = Math.max(sessionStartMs || 0, minExpiryMs)
        cancelExpiryIso      = new Date(expiryMs).toISOString()
        const payload = `${booking.id}.${cancelExpiryIso}`
        const sig     = await hmacSign(payload, SAFETY_CANCEL_SECRET)
        const token   = `${encodeURIComponent(payload)}.${sig}`
        const { error: tokErr } = await supabase
          .from('bookings')
          .update({ safety_cancel_token: sig, safety_cancel_expires_at: cancelExpiryIso })
          .eq('id', booking.id)
        if (tokErr) {
          console.error('instructor-booking-response: could not persist cancel token', tokErr.message)
        } else {
          cancelUrl       = `${APP_ORIGIN}/cancel/${token}`
          cancelUrlDirect = `${SUPABASE_URL}/functions/v1/studio-cancel-booking?t=${token}`
        }
      } else {
        console.warn('instructor-booking-response: SAFETY_CANCEL_SECRET not set, skipping cancel-token mint')
      }

      // Confirmation emails — instructor + customer.
      const dateStr = fmtDate(booking.booking_date)
      const timeStr = (booking.start_time || '').slice(0,5)
      const customerName  = customer?.full_name || customer?.email || 'your customer'
      const customerEmail = customer?.email
      const customerPhone = customer?.phone || null
      // Parse the two-line composite notes the booking modal builds
      // ("Customer location: …\nNotes: …").
      const notesBlob = booking.notes || ''
      const locLine   = notesBlob.split('\n').find((l: string) => /^Customer location:/i.test(l)) || ''
      const noteLine  = notesBlob.split('\n').find((l: string) => /^Notes:/i.test(l)) || ''
      const customerLoc  = locLine.replace(/^Customer location:\s*/i, '').trim() || 'see Wello dashboard'
      const customerNote = noteLine.replace(/^Notes:\s*/i, '').trim()

      // ── Customer confirmation email ──────────────────────────
      if (customerEmail) {
        await sendEmail(customerEmail, `Your booking with ${business.name} is confirmed`,
          `<div style="font-family:Arial,sans-serif;max-width:520px;padding:24px;background:#FBF9F4;">
            <h2 style="color:#213C18;">You're confirmed!</h2>
            <p style="color:#54584F;line-height:1.7;">${business.name} has confirmed your booking for <strong>${sessionName}</strong> on <strong>${dateStr}</strong> at <strong>${timeStr}</strong>.</p>
            <div style="background:#fff;border-radius:8px;padding:16px 18px;border:1px solid #E4E2DD;margin:14px 0;">
              <p style="color:#54584F;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;margin:0 0 4px;">Session address</p>
              <p style="color:#213C18;font-weight:600;margin:0;line-height:1.5;">${customerLoc}</p>
            </div>
            <p style="color:#54584F;line-height:1.6;font-size:12px;">This session is provided by <strong style="color:#1B1C19;">${business.name}</strong>. Wello handles the booking and payment.</p>
            <p style="color:#54584F;line-height:1.6;font-size:12px;">Free cancellation up to <strong style="color:#1B1C19;">${cancelWindowHours} hours</strong> before the session — credits are returned in full.</p>
            <p style="color:#54584F;line-height:1.7;">The ${booking.credits_used} credits you held for this booking are now settled with the instructor.</p>
            <p style="color:#54584F;line-height:1.7;">Have a great session,<br>Wello</p>
          </div>`)
      }

      // ── Partner confirmation email — now includes phone + notes ──
      if (business.email) {
        const phoneLine = customerPhone
          ? `<p style="color:#54584F;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;margin:10px 0 4px;">Customer phone</p>
             <p style="color:#213C18;font-weight:600;margin:0;line-height:1.5;"><a href="tel:${customerPhone.replace(/\s+/g,'')}" style="color:#213C18;text-decoration:none;">📞 ${customerPhone}</a></p>`
          : ''
        const noteBlock = customerNote
          ? `<p style="color:#54584F;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;margin:10px 0 4px;">Arrival notes</p>
             <p style="color:#213C18;font-style:italic;margin:0;line-height:1.5;">${customerNote}</p>`
          : ''
        const cancelBlock = cancelUrl
          ? `<p style="color:#54584F;line-height:1.7;margin:18px 0 8px;font-size:13px;">If something changes and you can no longer take this booking, you can cancel it here:</p>
             <a href="${cancelUrl}" style="display:inline-block;padding:10px 18px;background:#213C18;color:#FBF9F4;text-decoration:none;border-radius:999px;font-weight:700;font-size:13px;">Cancel this booking</a>
             <p style="color:#A3B18A;font-size:11px;margin:10px 0 0;">The customer's credits will be returned in full and they'll be offered alternatives.</p>`
          : ''
        await sendEmail(business.email, `Booking confirmed — ${customerName} on ${dateStr}`,
          `<div style="font-family:Arial,sans-serif;max-width:520px;padding:24px;background:#FBF9F4;">
            <h2 style="color:#213C18;">Booking confirmed</h2>
            <p style="color:#54584F;line-height:1.7;"><strong>${customerName}</strong> for <strong>${sessionName}</strong> on <strong>${dateStr}</strong> at <strong>${timeStr}</strong>.</p>
            <div style="background:#fff;border-radius:8px;padding:16px 18px;border:1px solid #E4E2DD;margin:14px 0;">
              <p style="color:#54584F;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;margin:0 0 4px;">Session address</p>
              <p style="color:#213C18;font-weight:600;margin:0;line-height:1.5;">${customerLoc}</p>
              ${phoneLine}
              ${noteBlock}
            </div>
            ${cancelBlock}
          </div>`)
      }

      return json({
        success: true,
        status:  'confirmed',
        cancel_url:        cancelUrl,        // branded /cancel/:token proxy
        cancel_url_direct: cancelUrlDirect,  // edge function ?t=<token>
        cancel_expires_at: cancelExpiryIso,
      })
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

    const { data: declineUpdated, error: updErr } = await supabase
      .from('bookings')
      .update({ status: 'cancelled' })
      .eq('id', booking.id)
      .eq('status', 'pending_instructor')
      .select('id')
      .maybeSingle()
    if (updErr) return json({ error: 'Could not update booking status. ' + updErr.message }, 500)
    if (!declineUpdated) return json({ error: 'Booking was already actioned in another tab.' }, 409)

    // Free the slot back up so other customers can request the same time.
    // The booking row carries slot_id as a string; cast for the integer pk.
    if (booking.slot_id) {
      const slotIdNum = Number(booking.slot_id)
      if (Number.isFinite(slotIdNum)) {
        const { data: slotRow } = await supabase
          .from('slots').select('id, booked').eq('id', slotIdNum).maybeSingle()
        if (slotRow) {
          const newBooked = Math.max(0, (slotRow.booked || 0) - 1)
          const { error: slotErr } = await supabase
            .from('slots').update({ booked: newBooked }).eq('id', slotIdNum)
          if (slotErr) console.warn('Failed to decrement slots.booked on decline:', slotErr.message)
          else console.log('Decremented slots.booked for slot', slotIdNum, 'to', newBooked)
        }
      }
    }

    // Refund the held credits via the ledger. Best-effort: log loudly
    // if refund fails so support can spot orphaned holds, but do NOT
    // roll the cancellation back — a stuck-cancelled booking with a
    // missing refund is easier to reconcile than a stuck-pending row
    // nobody can action. refund_by_booking is idempotent so retrying
    // is safe.
    if (customer && (booking.credits_used ?? 0) > 0) {
      const { data: refunded, error: refErr } = await supabase.rpc('refund_by_booking', {
        p_booking_id: booking.id,
        p_source:     action === 'auto_decline' ? 'auto_decline' : 'decline',
        p_note:       `instructor ${action}`,
      })
      if (refErr) console.error('Decline: refund_by_booking failed for booking', booking.id, refErr.message)
      else console.log('Refunded', refunded, 'credits to', customer.id, 'for declined booking', booking.id)
    }

    const customerEmail = customer?.email
    if (customerEmail) {
      const dateStr = fmtDate(booking.booking_date)
      const timeStr = (booking.start_time || '').slice(0,5)
      const subject = action === 'auto_decline'
        ? `Your ${business.name} booking didn't go through`
        : `${business.name} couldn't take your booking`
      const opening = action === 'auto_decline'
        ? `Unfortunately ${business.name} didn't respond to your booking request for <strong>${sessionName}</strong> on <strong>${dateStr}</strong> at <strong>${timeStr}</strong>, so we've released it. Your ${booking.credits_used} credits have been returned to your account in full.`
        : `Unfortunately ${business.name} can't take your booking for <strong>${sessionName}</strong> on <strong>${dateStr}</strong> at <strong>${timeStr}</strong>. Your ${booking.credits_used} credits have been returned to your account in full.`
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
