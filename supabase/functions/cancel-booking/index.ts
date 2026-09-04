import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Wello booking cancellation.
//
// Enforces the cancellation policy set out in the Partner Agreement (clause
// 5.1): members can cancel a confirmed booking up to 12 hours before the
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

const STANDARD_WINDOW_HOURS = 12
const PRIVATE_WINDOW_HOURS  = 48
// Rentals default 24h. Partner-set overrides on the offering row win
// (session_offerings[i].rental_cancellation_hours) — respected below.
const RENTAL_WINDOW_HOURS   = 24

// Wello operates in Mallorca. booking_date / start_time are stored as
// local wall-clock strings; convert them into a UTC Date via the
// Europe/Madrid tz offset (DST-aware via Intl) so hoursLeft comparisons
// are correct regardless of where this function runs.
const VENUE_TZ = 'Europe/Madrid'
function tzOffsetMinutes(date: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const parts = Object.fromEntries(dtf.formatToParts(date).map(p => [p.type, p.value] as const)) as Record<string, string>
  const asUTC = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour === '24' ? '00' : parts.hour), Number(parts.minute), Number(parts.second),
  )
  return (asUTC - date.getTime()) / 60000
}
function localToUtc(dateStr: string, timeStr: string, tz: string): Date {
  const naive = new Date(`${dateStr}T${timeStr}:00Z`)
  const off1 = tzOffsetMinutes(naive, tz)
  const first = new Date(naive.getTime() - off1 * 60000)
  const off2 = tzOffsetMinutes(first, tz)
  return new Date(naive.getTime() - off2 * 60000)
}

// Fire-and-forget Booqable release call. Only fires for rentals with
// a booqable_product_id set; booqable-sync no-ops otherwise.
function fireBooqableRelease(bookingId: string) {
  fetch(`${SUPABASE_URL}/functions/v1/booqable-sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ op: 'release', booking_id: bookingId }),
  }).catch(e => console.warn('booqable-sync release invoke failed:', e?.message))
}

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
      .select('id, user_id, business_id, slot_id, booking_date, end_date, start_time, credits_used, status, offering_type, notes')
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
      // Booqable release for pending rentals — nothing was reserved yet
      // if the venue hadn't accepted, but calling release is safe (no-op
      // when no booqable_order_id was ever stored).
      if (booking.end_date) fireBooqableRelease(booking.id)
      return json({ success: true, credits_refunded: creditsRefunded, window_hours: null, was_pending: true })
    }

    // 2. Look up the business + resolve the cancellation window for this
    // booking's kind. Rentals prefer the offering's own
    // rental_cancellation_hours override; classes fall back to the
    // Private Instructor split (48h) vs standard (12h).
    const isRental = !!booking.end_date
    // Post-confirmation self-cancel is a slot-based (class) privilege
    // only — rentals + appointments (offering-based, no slot_id) require
    // the customer to contact the venue directly. This mirrors the
    // client-side gate; the server enforcement stops a crafted request
    // from bypassing it. Pending states are always cancellable (handled
    // above), so this only bites once status='confirmed'.
    const isClassBooking = !!booking.slot_id && !isRental
    if (!isClassBooking) {
      return json({
        error: isRental
          ? 'Confirmed rentals can only be changed by contacting the venue directly.'
          : 'Confirmed appointments can only be changed by contacting the venue directly.',
        contact_venue: true,
      }, 403)
    }
    const { data: business, error: bizErr } = await supabase
      .from('businesses')
      .select('category, session_offerings')
      .eq('id', booking.business_id)
      .maybeSingle()
    if (bizErr) console.warn('cancel-booking: business lookup failed', bizErr.message)
    let windowHours: number
    if (isRental) {
      const offs = Array.isArray(business?.session_offerings) ? business!.session_offerings : []
      const off = offs.find((o: { type?: string; kind?: string }) => o?.type === booking.offering_type && o?.kind === 'rental')
      const override = Number((off as { rental_cancellation_hours?: number })?.rental_cancellation_hours)
      windowHours = Number.isFinite(override) && override >= 0 ? override : RENTAL_WINDOW_HOURS
    } else {
      windowHours = business?.category === 'Private Instructor' ? PRIVATE_WINDOW_HOURS : STANDARD_WINDOW_HOURS
    }

    // 3. Enforce the cancellation window.
    // Rentals: window is measured against the customer-picked pickup
    // time on booking.start_time (persisted by try_reserve_rental).
    // Legacy rentals with no start_time fall back to 09:00. Classes:
    // against booking_date + start_time as before. Both are interpreted
    // as Europe/Madrid local so DST transitions don't shift the
    // effective cancellation deadline by an hour.
    const sessionStart = isRental
      ? localToUtc(booking.booking_date, String(booking.start_time || '09:00').slice(0, 5), VENUE_TZ)
      : localToUtc(booking.booking_date, String(booking.start_time || '00:00').slice(0, 5), VENUE_TZ)
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
    // Booqable release for confirmed rentals — release the reserved
    // inventory so it's bookable again. Safe no-op for classes.
    if (isRental) fireBooqableRelease(booking.id)
    return json({ success: true, credits_refunded: refund, window_hours: windowHours })
  } catch (e) {
    console.error('cancel-booking exception:', e)
    return json({ error: (e as Error).message || 'Unexpected error' }, 500)
  }
})
