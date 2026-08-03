import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Frontend booking spend gate.
//
// The client inserts the bookings row (it needs to for optimistic UI +
// downstream Acuity sync) and then calls this function to deduct
// credits via the ledger. Doing the spend server-side lets us use the
// SECURITY DEFINER spend_credits RPC (which enforces bonus-first /
// oldest-first draw + row locking) without exposing it to anon.
//
// If the spend fails (insufficient credits or DB error) we roll the
// booking back so the user isn't left with a phantom row.

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY         = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

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

  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) return json({ error: 'Sign in to book.' }, 401)

  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: userData, error: userErr } = await anonClient.auth.getUser(token)
  if (userErr || !userData?.user) return json({ error: 'Session expired, please sign in again.' }, 401)
  const userId = userData.user.id

  let body: { booking_id?: string; source?: string; note?: string }
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON body.' }, 400) }

  const bookingId = String(body.booking_id || '').trim()
  if (!bookingId) return json({ error: 'booking_id required' }, 400)

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Load the booking and verify ownership. We look up credits_used
  // from the row itself rather than trusting the caller — a malicious
  // client could otherwise pass a booking_id belonging to a €100
  // booking and spend €1.
  const { data: booking, error: bkErr } = await supabase
    .from('bookings')
    .select('id, user_id, status, credits_used')
    .eq('id', bookingId)
    .maybeSingle()
  if (bkErr) return json({ error: bkErr.message }, 500)
  if (!booking) return json({ error: 'Booking not found.' }, 404)
  if (booking.user_id !== userId) return json({ error: 'Not your booking.' }, 403)

  const cost = Number(booking.credits_used) || 0
  if (cost <= 0) return json({ ok: true, credits_spent: 0, note: 'no cost' })

  // Was this booking already spent for? refund_by_booking makes retries
  // safe on the refund side; do the same on the spend side by refusing
  // to double-spend if any spend row already exists for this booking.
  const { data: existing } = await supabase
    .from('credit_ledger')
    .select('id')
    .eq('booking_id', bookingId)
    .eq('kind', 'spend')
    .limit(1)
    .maybeSingle()
  if (existing?.id) {
    return json({ ok: true, credits_spent: cost, already: true })
  }

  const { error: spendErr } = await supabase.rpc('spend_credits', {
    p_user_id:    userId,
    p_amount:     cost,
    p_source:     body.source || 'booking',
    p_booking_id: bookingId,
    p_note:       body.note || null,
  })
  if (spendErr) {
    // Delete the client-inserted booking so the user isn't left with a
    // ghost row we can't collect payment for.
    await supabase.from('bookings').delete().eq('id', bookingId)
    const msg = spendErr.message || ''
    if (msg.includes('insufficient_credits')) {
      return json({ error: 'insufficient_credits' }, 402)
    }
    console.error('spend-booking-credits: spend failed', msg)
    return json({ error: msg }, 500)
  }

  // Trigger has already refreshed profiles.credits; return the new balance.
  const { data: profile } = await supabase
    .from('profiles').select('credits').eq('id', userId).maybeSingle()
  return json({ ok: true, credits_spent: cost, new_balance: profile?.credits ?? null })
})
