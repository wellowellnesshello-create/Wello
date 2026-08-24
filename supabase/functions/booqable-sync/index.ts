import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Booqable rental sync — STUB until Booqable creds are provisioned.
//
// When a rental booking is accepted by the venue (venue-booking-response
// path), this function should reserve the corresponding inventory in
// Booqable so the partner's canonical rental calendar reflects the Wello
// booking. On decline / cancel it should release the reservation.
//
// The offering carries a `booqable_product_id` on session_offerings —
// partner sets it in the rental edit form. Nullable: leaving it blank
// means no Booqable sync (booking still lands in Wello's inbox and the
// partner manages it manually).
//
// Once creds are provisioned:
//   BOOQABLE_API_KEY     — bearer for https://<company>.booqable.com/api/1
//   BOOQABLE_COMPANY_URL — https://<company>.booqable.com (base URL)
// wire the fetch() calls below with real endpoints:
//   reserve: POST /orders  with { starts_at, stops_at, items: [{item_id, quantity}] }
//   release: DELETE /orders/:id
// Response shape needs BOOQABLE_API docs but the payload above matches
// their standard order-creation contract.

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const BOOQABLE_API_KEY          = Deno.env.get('BOOQABLE_API_KEY') || ''
const BOOQABLE_COMPANY_URL      = Deno.env.get('BOOQABLE_COMPANY_URL') || ''

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')    return json({ error: 'POST only' }, 405)

  // Service-role only. Called server-to-server from
  // venue-booking-response (or a future edge cron). No user JWT.
  const auth = req.headers.get('Authorization') || ''
  if (!auth.startsWith('Bearer ')) return json({ error: 'Missing service-role bearer' }, 401)

  let body: { op?: 'reserve' | 'release'; booking_id?: string }
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const op = body.op
  const bookingId = String(body.booking_id || '').trim()
  if (!op || !bookingId) return json({ error: 'op + booking_id required' }, 400)
  if (op !== 'reserve' && op !== 'release') return json({ error: 'op must be reserve|release' }, 400)

  // Not configured yet — no-op with an explicit reason so the caller
  // knows why. Booking flow continues; partner manages the rental in
  // their own tooling until Booqable is wired.
  if (!BOOQABLE_API_KEY || !BOOQABLE_COMPANY_URL) {
    return json({ ok: true, synced: false, reason: 'booqable_not_configured' })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Load booking + offering to get booqable_product_id.
  const { data: booking, error: bkErr } = await supabase
    .from('bookings')
    .select('id, business_id, offering_type, booking_date, end_date, rental_addons')
    .eq('id', bookingId)
    .maybeSingle()
  if (bkErr) return json({ error: bkErr.message }, 500)
  if (!booking) return json({ error: 'Booking not found' }, 404)
  if (!booking.end_date) return json({ ok: true, synced: false, reason: 'not_a_rental' })

  const { data: biz, error: bizErr } = await supabase
    .from('businesses')
    .select('session_offerings')
    .eq('id', booking.business_id)
    .maybeSingle()
  if (bizErr) return json({ error: bizErr.message }, 500)
  const offerings: Array<{ type?: string; kind?: string; booqable_product_id?: string }> = Array.isArray(biz?.session_offerings) ? biz.session_offerings : []
  const off = offerings.find(o => o?.type === booking.offering_type && o?.kind === 'rental')
  const productId = off?.booqable_product_id
  if (!productId) return json({ ok: true, synced: false, reason: 'no_booqable_product_id' })

  // TODO: real Booqable calls. Shape sketched below; validate against
  // their API docs before enabling.
  // if (op === 'reserve') {
  //   const r = await fetch(`${BOOQABLE_COMPANY_URL}/api/1/orders`, {
  //     method: 'POST',
  //     headers: { 'Authorization': `Bearer ${BOOQABLE_API_KEY}`, 'Content-Type': 'application/json' },
  //     body: JSON.stringify({
  //       starts_at: `${booking.booking_date}T09:00:00Z`,
  //       stops_at:  `${booking.end_date}T17:00:00Z`,
  //       items: [{ item_id: productId, quantity: 1 }],
  //     }),
  //   })
  //   const data = await r.json()
  //   await supabase.from('bookings').update({ booqable_order_id: data.id }).eq('id', bookingId)
  // } else if (op === 'release') {
  //   const { data: bk } = await supabase.from('bookings').select('booqable_order_id').eq('id', bookingId).maybeSingle()
  //   if (bk?.booqable_order_id) {
  //     await fetch(`${BOOQABLE_COMPANY_URL}/api/1/orders/${bk.booqable_order_id}`, {
  //       method: 'DELETE',
  //       headers: { 'Authorization': `Bearer ${BOOQABLE_API_KEY}` },
  //     })
  //   }
  // }

  return json({ ok: true, synced: false, reason: 'booqable_call_not_implemented', product_id: productId, op })
})
