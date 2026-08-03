import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Wello booking cancellation.
//
// Enforces the cancellation policy set out in the Partner Agreement (clause
// 5.1): members can cancel a confirmed booking up to 24 hours before the
// session start for standard sessions, or 48 hours for private-instructor
// sessions. Cancellations inside those windows are rejected here so the
// customer can't sidestep the policy from the client.
//
// On successful cancel we:
//   1. Flip the booking to status='cancelled'
//   2. Refund the credits back onto the customer's profile
//   3. Decrement slots.booked so the slot re-opens on the marketplace

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const STANDARD_WINDOW_HOURS = 24
const PRIVATE_WINDOW_HOURS  = 48

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')    return json({ error: 'POST only' }, 405)

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Please sign in to cancel a booking.' }, 401)
    const token = authHeader.replace(/^Bearer\s+/i, '')

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) return json({ error: 'Please sign in to cancel a booking.' }, 401)

    const { booking_id } = await req.json()
    if (!booking_id) return json({ error: 'booking_id required' }, 400)

    // 1. Load the booking, verify it belongs to this user, and confirm it's
    // still in a cancellable state.
    const { data: booking, error: bookingErr } = await supabase
      .from('bookings')
      .select('id, user_id, business_id, slot_id, booking_date, start_time, credits_used, status')
      .eq('id', booking_id)
      .maybeSingle()
    if (bookingErr) {
      console.error('cancel-booking: booking lookup failed', bookingErr.message)
      return json({ error: 'Could not load that booking.' }, 500)
    }
    if (!booking)                   return json({ error: 'Booking not found.' }, 404)
    if (booking.user_id !== user.id) return json({ error: 'This booking is not yours.' }, 403)
    if (booking.status === 'cancelled') return json({ error: 'This booking is already cancelled.' }, 409)
    if (booking.status === 'declined')  return json({ error: 'This booking was declined.' }, 409)

    // Pending requests can be cancelled at any time for a full credit
    // return.
    //   - pending_venue holds credits at request time (see
    //     request-treatment-booking) so cancel means an actual refund.
    //   - pending_instructor currently deducts on confirm, not on
    //     request, so its refund is a no-op. Handled uniformly below.
    // The credit column update is conditional on the current balance so
    // that a concurrent refund cannot double-credit. We compute the new
    // balance from a fresh read to avoid stale data.
    if (booking.status === 'pending_instructor' || booking.status === 'pending_venue') {
      const { data: pUpdated, error: pUpdErr } = await supabase
        .from('bookings')
        .update({
          status: 'cancelled',
          venue_accept_token: null,
          venue_decline_token: null,
        })
        .eq('id', booking.id)
        .eq('status', booking.status)
        .select('id')
        .maybeSingle()
      if (pUpdErr) {
        console.error('cancel-booking: pending update failed', pUpdErr.message)
        return json({ error: 'Could not cancel the request.' }, 500)
      }
      if (!pUpdated) return json({ error: 'Request was already actioned.' }, 409)

      // Both pending flavours now hold credits at request time, so a
      // customer cancel is a genuine refund. refund_by_booking looks
      // up every spend row tagged with this booking and reverses each
      // one back onto the grant it came from. Idempotent, so a retry
      // after a partial failure is safe.
      let creditsRefunded = 0
      const cost = Number(booking.credits_used) || 0
      if (cost > 0) {
        const { data: refunded, error: refErr } = await supabase.rpc('refund_by_booking', {
          p_booking_id: booking.id,
          p_source:     'cancel_pending',
          p_note:       'customer cancel of pending booking',
        })
        if (refErr) {
          console.error('cancel-booking: refund_by_booking failed', refErr.message)
          return json({ success: true, credits_refunded: 0, refund_error: refErr.message, was_pending: true })
        }
        creditsRefunded = Number(refunded) || 0
      }

      console.log(`cancel-booking: pending booking ${booking.id} cancelled by customer ${user.id}, refunded ${creditsRefunded}`)
      return json({ success: true, credits_refunded: creditsRefunded, window_hours: null, was_pending: true })
    }

    // 2. Look up the business to find the category so we can pick the right
    // window (24h standard vs 48h private instructor).
    const { data: business, error: bizErr } = await supabase
      .from('businesses')
      .select('category')
      .eq('id', booking.business_id)
      .maybeSingle()
    if (bizErr) console.warn('cancel-booking: business lookup failed', bizErr.message)
    const windowHours = business?.category === 'Private Instructor' ? PRIVATE_WINDOW_HOURS : STANDARD_WINDOW_HOURS

    // 3. Enforce the cancellation window.
    const sessionStart = new Date(`${booking.booking_date}T${(booking.start_time || '00:00').slice(0, 5)}:00`)
    const hoursLeft = (sessionStart.getTime() - Date.now()) / (1000 * 60 * 60)
    if (!Number.isFinite(hoursLeft)) return json({ error: 'Could not determine session start time.' }, 500)
    if (hoursLeft < windowHours) {
      return json({
        error: `Cancellations must be made at least ${windowHours} hours before the session. This session is in ${Math.max(0, hoursLeft).toFixed(1)} hours.`,
        window_hours: windowHours,
        hours_left: hoursLeft,
      }, 400)
    }

    // 4. Flip the booking to cancelled. Conditional on the current status so
    // a race can't double-cancel (last-write-wins would otherwise credit them
    // twice if two requests fired at once).
    const { data: updated, error: updErr } = await supabase
      .from('bookings')
      .update({ status: 'cancelled' })
      .eq('id', booking.id)
      .eq('status', booking.status)
      .select('id')
      .maybeSingle()
    if (updErr) {
      console.error('cancel-booking: update failed', updErr.message)
      return json({ error: 'Could not cancel the booking.' }, 500)
    }
    if (!updated) return json({ error: 'Booking was cancelled by another session already.' }, 409)

    // 5. Refund credits via the ledger. If this fails we roll the
    // booking status back so the customer isn't left with a cancelled
    // booking + no refund. refund_by_booking is idempotent, so on a
    // partial failure the operator can safely re-invoke.
    const refund = Number(booking.credits_used) || 0
    if (refund > 0) {
      const { error: refundErr } = await supabase.rpc('refund_by_booking', {
        p_booking_id: booking.id,
        p_source:     'cancel_window',
        p_note:       `customer cancel in ${windowHours}h window`,
      })
      if (refundErr) {
        console.error('cancel-booking: refund_by_booking failed', refundErr.message)
        await supabase.from('bookings').update({ status: booking.status }).eq('id', booking.id)
        return json({ error: 'Could not refund your credits. The cancellation was rolled back.' }, 500)
      }
    }

    // 6. Free the slot back up on the marketplace. Best-effort — not fatal
    // if this fails since the cancellation itself has landed.
    if (booking.slot_id) {
      const { data: slot } = await supabase
        .from('slots').select('booked').eq('id', booking.slot_id).maybeSingle()
      if (slot && (slot.booked ?? 0) > 0) {
        await supabase.from('slots')
          .update({ booked: (slot.booked || 1) - 1 })
          .eq('id', booking.slot_id)
      }
    }

    console.log(`cancel-booking: booking ${booking.id} cancelled, refunded ${refund} credits to ${user.id}`)
    return json({ success: true, credits_refunded: refund, window_hours: windowHours })
  } catch (e) {
    console.error('cancel-booking exception:', e)
    return json({ error: (e as Error).message || 'Unexpected error' }, 500)
  }
})
