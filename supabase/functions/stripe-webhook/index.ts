import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import Stripe from 'https://esm.sh/stripe@17.3.0?target=denonext'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Stripe webhook receiver. On checkout.session.completed, reads
// metadata.user_id + metadata.credits and increments profiles.credits
// using service-role. MUST be deployed with --no-verify-jwt because
// Stripe doesn't send a Supabase JWT; we verify Stripe's signature
// instead (HMAC against STRIPE_WEBHOOK_SECRET).

const STRIPE_SECRET_KEY        = Deno.env.get('STRIPE_SECRET_KEY')!
const STRIPE_WEBHOOK_SECRET    = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? ''
const SUPABASE_URL             = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2024-09-30.acacia',
  httpClient: Stripe.createFetchHttpClient(),
})

serve(async (req) => {
  if (req.method !== 'POST') return new Response('POST only', { status: 405 })

  if (!STRIPE_WEBHOOK_SECRET) {
    console.error('stripe-webhook: STRIPE_WEBHOOK_SECRET not configured')
    return new Response('Webhook secret not configured', { status: 500 })
  }

  try {
    const sig = req.headers.get('stripe-signature')
    if (!sig) return new Response('Missing stripe-signature header', { status: 400 })

    const rawBody = await req.text()

    let event: Stripe.Event
    try {
      event = await stripe.webhooks.constructEventAsync(rawBody, sig, STRIPE_WEBHOOK_SECRET)
    } catch (err) {
      console.error('stripe-webhook: signature verification failed:', (err as Error).message)
      return new Response('Invalid signature', { status: 400 })
    }

    if (event.type !== 'checkout.session.completed') {
      // Ack other events so Stripe doesn't retry — we just don't act on them.
      return new Response(JSON.stringify({ ignored: event.type }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      })
    }

    const session = event.data.object as Stripe.Checkout.Session

    // Stripe should only fire this when payment is actually settled, but
    // belt-and-braces: only credit if payment_status confirms it.
    if (session.payment_status !== 'paid') {
      console.log('stripe-webhook: session not paid, skipping', { id: session.id, payment_status: session.payment_status })
      return new Response(JSON.stringify({ skipped: 'not paid' }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      })
    }

    const userId  = session.metadata?.user_id
    const credits = parseInt(session.metadata?.credits || '0', 10)
    if (!userId || !credits || credits < 1) {
      console.error('stripe-webhook: missing or invalid metadata', session.metadata)
      return new Response(JSON.stringify({ error: 'Invalid metadata' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Read-then-update. Not a transaction; for high-volume billing you'd want
    // a Postgres function with FOR UPDATE. Fine for current scale.
    const { data: profile, error: readErr } = await supabase
      .from('profiles')
      .select('credits')
      .eq('id', userId)
      .single()

    if (readErr || !profile) {
      console.error('stripe-webhook: profile not found', userId, readErr?.message)
      return new Response('Profile not found', { status: 404 })
    }

    const newBalance = (profile.credits || 0) + credits
    const { error: updErr } = await supabase
      .from('profiles')
      .update({ credits: newBalance })
      .eq('id', userId)

    if (updErr) {
      console.error('stripe-webhook: profile update failed', updErr.message)
      return new Response('Update failed', { status: 500 })
    }

    console.log(`stripe-webhook: +${credits} credits to ${userId} (new balance ${newBalance}, session ${session.id})`)
    return new Response(JSON.stringify({ ok: true, user_id: userId, credits_added: credits, new_balance: newBalance }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('stripe-webhook unexpected error:', e)
    return new Response((e as Error).message || 'Unexpected error', { status: 500 })
  }
})
