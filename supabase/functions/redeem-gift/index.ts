import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Redeem a Wello gift code. Requires the caller to be authenticated —
// we credit their profile with the gift amount and mark the gift claimed.
//
// A gift can only be claimed once. If someone tries a code that's already
// been claimed we return a clear error so the UI can show "This gift was
// already redeemed" without the caller having to interpret status codes.

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
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

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Please sign in to redeem a gift.' }, 401)
    const token = authHeader.replace(/^Bearer\s+/i, '')

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) return json({ error: 'Please sign in to redeem a gift.' }, 401)

    const { code } = await req.json()
    const cleanCode = String(code || '').trim().toUpperCase()
    if (!cleanCode) return json({ error: 'Enter a claim code.' }, 400)

    // 1. Look up the gift.
    const { data: gift, error: giftErr } = await supabase
      .from('gifts')
      .select('id, code, credits, status, sender_email, sender_name')
      .eq('code', cleanCode)
      .maybeSingle()
    if (giftErr) {
      console.error('redeem-gift lookup error:', giftErr.message)
      return json({ error: 'Something went wrong. Please try again.' }, 500)
    }
    if (!gift) return json({ error: 'We could not find a gift for that code.' }, 404)

    if (gift.status === 'claimed')         return json({ error: 'This gift has already been claimed.' }, 409)
    if (gift.status === 'refunded')        return json({ error: 'This gift is no longer valid.' }, 410)
    if (gift.status !== 'available')       return json({ error: 'This gift is not ready to redeem yet.' }, 409)

    // 2. Atomically flip the gift to claimed. We do the update conditional
    // on status='available' to guard against simultaneous double-claim
    // attempts (last write wins otherwise). The ledger insert is a
    // separate step so a failing grant can be rolled back cleanly.
    const { data: claimedRow, error: claimErr } = await supabase
      .from('gifts')
      .update({
        status: 'claimed',
        claimed_by_user_id: user.id,
        claimed_at: new Date().toISOString(),
      })
      .eq('id', gift.id)
      .eq('status', 'available')
      .select('id')
      .maybeSingle()
    if (claimErr) {
      console.error('redeem-gift: claim update failed', claimErr.message)
      return json({ error: 'Could not claim gift. Please try again.' }, 500)
    }
    if (!claimedRow) {
      // Somebody beat us to it in the last few ms.
      return json({ error: 'This gift was just claimed by someone else.' }, 409)
    }

    // 3. Grant the credits via the ledger. Gifts are purchased credits
    // (the sender paid for them), so credit_type = 'purchased'.
    const { error: grantErr } = await supabase.rpc('grant_credits', {
      p_user_id:     user.id,
      p_amount:      gift.credits,
      p_credit_type: 'purchased',
      p_source:      'gift',
      p_expires_at:  null,
      p_note:        `gift ${gift.code}`,
    })
    if (grantErr) {
      // Roll the gift back so we don't leave it stuck 'claimed' with no credit landed.
      await supabase.from('gifts').update({
        status: 'available',
        claimed_by_user_id: null,
        claimed_at: null,
      }).eq('id', gift.id)
      console.error('redeem-gift: grant_credits failed', grantErr.message)
      return json({ error: 'Credits could not be added. Please try again.' }, 500)
    }

    // Read the trigger-refreshed balance so the response body reports it.
    const { data: profile } = await supabase
      .from('profiles').select('credits').eq('id', user.id).maybeSingle()
    const newBalance = profile?.credits ?? gift.credits

    console.log(`redeem-gift: +${gift.credits} credits to ${user.id} via ${gift.code}`)
    return json({
      success: true,
      credits_added: gift.credits,
      new_balance: newBalance,
      sender_name: gift.sender_name,
      sender_email: gift.sender_email,
    })
  } catch (e) {
    console.error('redeem-gift exception:', e)
    return json({ error: (e as Error).message || 'Unexpected error' }, 500)
  }
})
