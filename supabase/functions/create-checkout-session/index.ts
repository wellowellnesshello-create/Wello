import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import Stripe from 'https://esm.sh/stripe@17.3.0?target=denonext'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Creates a Stripe Checkout Session for a Wello credit top-up.
// Client passes { quantity }. We use the configured Stripe price (1 unit =
// 1 credit @ €5) and tell Stripe the quantity. The customer's user_id and
// purchased credits are stored on the session metadata so the webhook can
// credit the right profile when the payment lands.

const STRIPE_SECRET_KEY        = Deno.env.get('STRIPE_SECRET_KEY')!
const SUPABASE_URL             = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const PRICE_ID = 'price_1TnKWEAevsrt3aGkxH47QVpr'

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2024-09-30.acacia',
  httpClient: Stripe.createFetchHttpClient(),
})

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')    return json({ error: 'POST only' }, 405)

  try {
    const { quantity, origin } = await req.json()
    const q = Math.floor(Number(quantity))
    if (!Number.isFinite(q) || q < 1) return json({ error: 'Invalid quantity' }, 400)
    if (q > 5000) return json({ error: 'Quantity above the per-purchase cap' }, 400)

    // Return URL: prefer the requesting origin (so localhost tests bounce back
    // to localhost) but fall back to prod if the client didn't send one.
    const safeOrigin = (typeof origin === 'string' && /^https?:\/\/[a-z0-9.-]+(:\d+)?$/i.test(origin))
      ? origin
      : 'https://www.wello-wellness.com'

    // Identify the user from the Supabase JWT in the Authorization header.
    // Required so we can store user_id in metadata and the webhook can credit
    // the right profile.
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Not authenticated' }, 401)
    const token = authHeader.replace(/^Bearer\s+/i, '')

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) return json({ error: 'Not authenticated' }, 401)

    // Service fee = 10% of credit value (1 credit = €1), capped at €50.
    // Computed server-side so the client can't underpay. Added as a separate
    // line item so the customer sees the breakdown on Stripe Checkout.
    const creditValueEuros = q * 1 // 1 credit = €1
    const feeEuros = Math.min(creditValueEuros * 0.10, 50)
    const feeCents = Math.round(feeEuros * 100)

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      { price: PRICE_ID, quantity: q },
    ]
    if (feeCents > 0) {
      lineItems.push({
        price_data: {
          currency: 'eur',
          product_data: { name: 'Service fee', description: '10% of credits, capped at €50' },
          unit_amount: feeCents,
        },
        quantity: 1,
      })
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: lineItems,
      success_url: `${safeOrigin}/?credits=added`,
      cancel_url:  `${safeOrigin}/`,
      customer_email: user.email ?? undefined,
      // Both top-level metadata AND payment_intent metadata so the webhook
      // can read them regardless of which event fires first.
      metadata: { user_id: user.id, credits: String(q), fee_cents: String(feeCents) },
      payment_intent_data: {
        metadata: { user_id: user.id, credits: String(q), fee_cents: String(feeCents) },
      },
    })

    return json({ url: session.url, session_id: session.id })
  } catch (e) {
    console.error('create-checkout-session error:', e)
    return json({ error: (e as Error).message || 'Unexpected error' }, 500)
  }
})
