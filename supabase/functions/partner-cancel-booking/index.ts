import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Partner-initiated cancellation of a CONFIRMED booking.
//
// Wired from the partner portal's "Cancel booking" affordance. Available:
//   * before the session starts
//   * for up to 24 hours after it ends
// Beyond that window the partner contacts hello@wello-wellness.com and we
// handle it manually.
//
// Reason drives whether the cancellation counts against the partner's
// cancel rate under Partner terms 5.3 vs 5.5:
//   weather   / illness / facility -> 5.5, no rate hit
//   other                          -> 5.3, may count on review
//
// On success:
//   1. bookings.status -> 'cancelled', partner_cancel_reason/_note/_at stamped.
//      (trigger unbump_slot_on_cancel frees the slot automatically.)
//   2. refund_by_booking(source='partner_cancel') puts credits back.
//   3. Member receives an email with 2-3 similar alternatives at that
//      time-of-day (same pattern as venue-booking-response decline email).
//   4. hello@wello-wellness.com is BCC'd on the member email — Wello ops
//      sees every partner cancel in real time.

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY            = Deno.env.get('RESEND_API_KEY') || ''
const PUBLIC_ORIGIN             = Deno.env.get('PUBLIC_ORIGIN') || 'https://www.wello-wellness.com'
const OPS_BCC                   = 'hello@wello-wellness.com'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const VALID_REASONS = ['weather', 'illness', 'facility', 'other'] as const
type Reason = typeof VALID_REASONS[number]
const UNAVOIDABLE: Reason[] = ['weather', 'illness', 'facility']

function fmtDate(iso: string): string {
  if (!iso) return ''
  try {
    return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short',
    })
  } catch { return iso }
}

// Parse a duration string like "60 min", "1h 30m", "90m" into minutes.
// Falls back to 120 if unparseable — the cancel window is generous, so
// erring long here just means an extra hour of cancel eligibility.
function parseDurationMinutes(raw: string | null | undefined): number {
  if (!raw) return 120
  const s = String(raw).toLowerCase()
  const hMatch = s.match(/(\d+)\s*h/)
  const mMatch = s.match(/(\d+)\s*m/)
  const minMatch = s.match(/^(\d+)\s*min/)
  const minutes = (hMatch ? parseInt(hMatch[1], 10) * 60 : 0)
                + (mMatch ? parseInt(mMatch[1], 10) : 0)
                + (minMatch && !hMatch && !mMatch ? parseInt(minMatch[1], 10) : 0)
  return minutes > 0 ? minutes : 120
}

async function sendEmail(to: string, subject: string, htmlBody: string, bcc?: string): Promise<void> {
  if (!RESEND_API_KEY) { console.warn('partner-cancel-booking: RESEND_API_KEY not set — skipping email'); return }
  const body: Record<string, unknown> = {
    from: 'Wello <hello@wello-wellness.com>',
    to,
    subject,
    html: htmlBody,
  }
  if (bcc) body.bcc = bcc
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(e => { console.error('Resend error:', (e as Error).message) })
}

// Same "similar options at this time" pattern as the decline email in
// venue-booking-response. Kept local to keep this fn self-contained.
async function findAlternatives(
  supabase: ReturnType<typeof createClient>,
  { category, exceptBusinessId, targetHour }:
  { category: string | null; exceptBusinessId: number; targetHour: number },
) {
  if (!category) return []
  const { data: altListings } = await supabase
    .from('listings')
    .select('id, name, cat, loc, cr, business_id, slots(id, date, time, spots, booked)')
    .eq('cat', category)
    .eq('status', 'active')
    .neq('business_id', exceptBusinessId)
    .limit(20)
  return (altListings || [])
    .map(l => {
      const bookableSlots = ((l as { slots?: Array<{ date: string; time: string; spots: number; booked: number }> }).slots || []).filter(s => {
        const start = new Date(`${s.date}T${(s.time || '00:00').slice(0,5)}:00`)
        return start.getTime() > Date.now() && (s.booked ?? 0) < (s.spots ?? 1)
      })
      if (bookableSlots.length === 0) return null
      bookableSlots.sort((a, b) => {
        const ah = parseInt((a.time || '00:00').slice(0,2), 10)
        const bh = parseInt((b.time || '00:00').slice(0,2), 10)
        return Math.abs(ah - targetHour) - Math.abs(bh - targetHour)
      })
      return { ...(l as { id: number; name: string; loc: string; cr: number }), next_slot: bookableSlots[0] }
    })
    .filter(Boolean) as Array<{ id: number; name: string; loc: string; cr: number; next_slot: { date: string; time: string } }>
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')    return json({ error: 'POST only' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Please sign in.' }, 401)
  const token = authHeader.replace(/^Bearer\s+/i, '')

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return json({ error: 'Please sign in.' }, 401)

  let payload: { booking_id?: string; reason?: string; note?: string }
  try { payload = await req.json() } catch { return json({ error: 'Invalid JSON body.' }, 400) }
  const bookingId = String(payload.booking_id || '').trim()
  const reason = String(payload.reason || '').trim() as Reason
  const note = payload.note ? String(payload.note).slice(0, 500) : null
  if (!bookingId) return json({ error: 'booking_id required.' }, 400)
  if (!VALID_REASONS.includes(reason)) return json({ error: 'reason must be one of: ' + VALID_REASONS.join(', ') }, 400)

  const { data: booking, error: bookingErr } = await supabase
    .from('bookings')
    .select('id, user_id, business_id, slot_id, booking_date, start_time, duration, credits_used, status, offering_type')
    .eq('id', bookingId)
    .maybeSingle()
  if (bookingErr || !booking) return json({ error: 'Booking not found.' }, 404)
  if (booking.status !== 'confirmed') return json({ error: 'Only confirmed bookings can be cancelled here.' }, 409)

  const { data: business, error: bizErr } = await supabase
    .from('businesses')
    .select('id, user_id, name, email, category')
    .eq('id', booking.business_id)
    .maybeSingle()
  if (bizErr || !business) return json({ error: 'Business not found.' }, 404)
  if (business.user_id !== user.id) return json({ error: 'You can only cancel bookings on your own venue.' }, 403)

  // Cancel window: before session start OR within 24h after session end.
  const startIso = `${booking.booking_date}T${String(booking.start_time || '00:00').slice(0,5)}:00`
  const startMs = new Date(startIso).getTime()
  const durMin = parseDurationMinutes(booking.duration)
  const endMs = startMs + durMin * 60 * 1000
  const cancelDeadlineMs = endMs + 24 * 60 * 60 * 1000
  if (Number.isFinite(startMs) && Date.now() > cancelDeadlineMs) {
    return json({
      error: 'This booking is more than 24 hours past its end time. Please email hello@wello-wellness.com and we will handle it manually.',
    }, 410)
  }

  // Update the booking. The unbump_slot_on_cancel trigger fires on this
  // transition and frees the slot automatically.
  const nowIso = new Date().toISOString()
  const { error: updErr } = await supabase
    .from('bookings')
    .update({
      status: 'cancelled',
      partner_cancel_reason: reason,
      partner_cancel_note:   note,
      partner_cancelled_at:  nowIso,
    })
    .eq('id', bookingId)
    .eq('status', 'confirmed')
  if (updErr) {
    console.error('partner-cancel-booking: update failed', updErr.message)
    return json({ error: 'Could not cancel this booking. Please try again.' }, 500)
  }

  // Refund the credits.
  const refundSource = UNAVOIDABLE.includes(reason) ? 'partner_cancel_unavoidable' : 'partner_cancel'
  const refundNote = reason + (note ? `: ${note}` : '')
  const { data: refunded, error: refErr } = await supabase.rpc('refund_by_booking', {
    p_booking_id: bookingId,
    p_source:     refundSource,
    p_note:       refundNote,
  })
  if (refErr) {
    console.error('partner-cancel-booking: refund_by_booking failed', refErr.message)
    // Booking is already cancelled; surface the refund failure so ops can
    // reconcile. Don't roll back — a stale confirmed status would be
    // worse than a manual credit adjustment.
  }
  const creditsRefunded = Number(refunded ?? booking.credits_used ?? 0)

  // Fetch the customer so we can email them.
  const { data: customer } = await supabase
    .from('profiles').select('email, full_name').eq('id', booking.user_id).maybeSingle()

  if (customer?.email) {
    const targetHour = parseInt(String(booking.start_time || '00').slice(0, 2), 10) || 9
    const alts = await findAlternatives(supabase, {
      category: business.category || null,
      exceptBusinessId: Number(booking.business_id),
      targetHour,
    })
    const venueName   = business.name || 'the venue'
    const dateHuman   = fmtDate(String(booking.booking_date || ''))
    const timeShort   = String(booking.start_time || '').slice(0, 5)
    const sessionName = String(booking.offering_type || 'a session')
    const altsHtml = alts.length > 0
      ? `<p style="color:#54584F;line-height:1.7;margin:18px 0 8px;">Here are a few similar options at around that time:</p>` +
        alts.slice(0, 3).map(a => {
          const d = fmtDate(a.next_slot.date)
          const t = (a.next_slot.time || '').slice(0, 5)
          return `<div style="display:block;padding:12px 14px;border:1px solid #E4E2DD;border-radius:8px;margin-bottom:8px;background:#fff;"><div style="font-weight:700;color:#1B1C19;">${a.name}</div><div style="color:#54584F;font-size:13px;">${a.loc || 'Mallorca'} · Next slot ${d} ${t} · ◈ ${a.cr}</div></div>`
        }).join('') +
        `<p style="color:#54584F;line-height:1.7;margin-top:16px;"><a href="${PUBLIC_ORIGIN}" style="color:#213C18;font-weight:600;">Browse all venues →</a></p>`
      : `<p style="color:#54584F;line-height:1.7;margin-top:16px;">Nothing similar is on the marketplace at that time right now. <a href="${PUBLIC_ORIGIN}" style="color:#213C18;font-weight:600;">Browse other venues →</a></p>`

    const reasonBlurb = reason === 'weather'
      ? 'due to the weather'
      : reason === 'illness'
        ? 'because the instructor is unwell'
        : reason === 'facility'
          ? 'due to a facility issue'
          : ''

    const subject = `${venueName} can no longer host your ${sessionName}`
    await sendEmail(
      customer.email,
      subject,
      `<div style="font-family:Manrope,Arial,sans-serif;max-width:520px;padding:24px;background:#FBF9F4;">
        <h2 style="color:#213C18;">A quick change of plan</h2>
        <p style="color:#54584F;line-height:1.7;">Unfortunately ${venueName} can no longer host your <strong>${sessionName}</strong> on <strong>${dateHuman}</strong> at <strong>${timeShort}</strong>${reasonBlurb ? ' ' + reasonBlurb : ''}. Your ${creditsRefunded} credits have been returned to your account in full.</p>
        ${altsHtml}
        <p style="color:#54584F;line-height:1.7;margin-top:18px;">Wello</p>
      </div>`,
      OPS_BCC,
    )
  }

  console.log('partner-cancel-booking: complete', { booking: bookingId, business: booking.business_id, reason, refunded: creditsRefunded })
  return json({ success: true, credits_refunded: creditsRefunded, reason, counts_against_rate: !UNAVOIDABLE.includes(reason) })
})
