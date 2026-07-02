import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import Stripe from 'https://esm.sh/stripe@17.3.0?target=denonext'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Wello gifting — create a Stripe Checkout Session so the sender pays before
// the gift is issued. On checkout.session.completed the stripe-webhook
// inserts the gifts row (status='available') and fires the recipient email
// + sender receipt. This keeps every gift tied to a paid Stripe session.

const STRIPE_SECRET_KEY         = Deno.env.get('STRIPE_SECRET_KEY')!
const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
// Same price row as regular credit top-ups: 1 credit = €1. The service fee
// is added as a separate line item so the sender sees the breakdown.
const PRICE_ID = 'price_1TnKWEAevsrt3aGkxH47QVpr'

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2024-09-30.acacia',
  httpClient: Stripe.createFetchHttpClient(),
})

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

// Human-readable claim code. Base32-ish alphabet skips 0/O/1/I so people
// don't misread when they type it in.
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function generateGiftCode(): string {
  let a = '', b = ''
  for (let i = 0; i < 4; i++) a += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
  for (let i = 0; i < 4; i++) b += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
  return `WELLO-${a}-${b}`
}

function isValidEmail(v: unknown): v is string {
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')    return json({ error: 'POST only' }, 405)

  try {
    const body = await req.json()
    const credits         = Math.floor(Number(body?.credits))
    const sender_email    = String(body?.sender_email || '').trim().toLowerCase()
    const sender_name     = (body?.sender_name    ? String(body.sender_name).trim() : '') || ''
    const recipient_email = body?.recipient_email ? String(body.recipient_email).trim().toLowerCase() : ''
    const recipient_name  = body?.recipient_name  ? String(body.recipient_name).trim() : ''
    // Stripe metadata values cap at 500 chars — we cap at 400 to leave headroom.
    const message         = body?.message         ? String(body.message).slice(0, 400) : ''
    const origin          = String(body?.origin || 'https://www.wello-wellness.com')

    if (!Number.isFinite(credits) || credits < 5) return json({ error: 'Minimum gift is 5 credits.' }, 400)
    if (credits > 5000)                            return json({ error: 'Maximum single gift is 5000 credits.' }, 400)
    if (!isValidEmail(sender_email))               return json({ error: 'Enter a valid email for yourself.' }, 400)
    if (recipient_email && !isValidEmail(recipient_email)) return json({ error: 'Recipient email looks invalid.' }, 400)

    const safeOrigin = /^https?:\/\/[a-z0-9.-]+(:\d+)?$/i.test(origin) ? origin : 'https://www.wello-wellness.com'

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Generate a code, retry a few times on collision (extremely unlikely
    // — 32^8 space, but we check anyway so a race can't hand out duplicates).
    let code = generateGiftCode()
    for (let attempt = 0; attempt < 4; attempt++) {
      const { data: existing } = await supabase.from('gifts').select('id').eq('code', code).maybeSingle()
      if (!existing) break
      code = generateGiftCode()
    }

    // Service fee = 10% of credit value, capped at €50 — same rule as the
    // regular credit top-up flow. Added as a separate Stripe line item so
    // the sender sees the breakdown on the checkout page.
    const creditValueEuros = credits * 1 // 1 credit = €1
    const feeEuros = Math.min(creditValueEuros * 0.10, 50)
    const feeCents = Math.round(feeEuros * 100)

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      { price: PRICE_ID, quantity: credits },
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
      // Send them back to the app with the code so the frontend can render
      // the "gift sent" success page. The gifts row is inserted by the
      // webhook, not here, so payment must complete before the code is real.
      success_url: `${safeOrigin}/?gift=sent&code=${encodeURIComponent(code)}`,
      cancel_url:  `${safeOrigin}/?gift=cancelled`,
      customer_email: sender_email,
      // Metadata on both the session AND the payment intent so the webhook
      // can read them regardless of which event fires first.
      metadata: {
        type:            'gift',
        code,
        credits:         String(credits),
        fee_cents:       String(feeCents),
        sender_email,
        sender_name,
        recipient_email,
        recipient_name,
        message,
      },
      payment_intent_data: {
        metadata: {
          type: 'gift',
          code,
          credits: String(credits),
        },
      },
    })

    return json({
      success: true,
      url: session.url,
      session_id: session.id,
      code, // returned so the frontend can pre-render success if it wants
    })
  } catch (e) {
    console.error('create-gift exception:', e)
    return json({ error: (e as Error).message || 'Unexpected error' }, 500)
  }
})
