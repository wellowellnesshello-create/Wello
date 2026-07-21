import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import Stripe from 'https://esm.sh/stripe@17.3.0?target=denonext'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Kicks off Stripe Connect Express onboarding for a partner.
//
// Flow:
//   1. Client (partner portal Payouts step) POSTs { business_id } with the
//      partner's JWT.
//   2. We verify the JWT owns the business.
//   3. If the business has no stripe_account_id, create a fresh Express
//      account (country=ES, capabilities=transfers).
//   4. Create a Stripe Account Link — the hosted onboarding URL where the
//      partner completes KYC, bank collection, ToS acceptance.
//   5. Return the URL. Client redirects the browser to it.
//   6. On completion Stripe fires account.updated to our stripe-webhook,
//      which flips businesses.stripe_account_status to 'active' /
//      'pending' / 'restricted' as appropriate.

const STRIPE_SECRET_KEY         = Deno.env.get('STRIPE_SECRET_KEY')!
const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const APP_ORIGIN                = Deno.env.get('APP_ORIGIN') || 'https://wello-wellness.com'
// Admins can re-issue onboarding links on behalf of any partner (support
// use case: partner lost their link, needs a fresh one). Same allowlist as
// extract-sessions, generate-magic-link, and run-weekly-payouts.
const ADMIN_USER_IDS = (Deno.env.get('ADMIN_USER_IDS') || '')
  .split(',').map(s => s.trim()).filter(Boolean)
// Test-mode detection is a straight prefix check on the secret. Stripe
// keys are opaque otherwise but the prefix is stable API.
const LIVEMODE = STRIPE_SECRET_KEY.startsWith('sk_live_')

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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')    return json({ error: 'POST only' }, 405)

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Not authenticated' }, 401)
    const token = authHeader.replace(/^Bearer\s+/i, '')

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) return json({ error: 'Not authenticated' }, 401)

    const { business_id } = await req.json().catch(() => ({}))
    if (!business_id) return json({ error: 'business_id required' }, 400)

    const { data: business, error: bizErr } = await supabase
      .from('businesses')
      .select('id, name, email, user_id, stripe_account_id, stripe_account_status')
      .eq('id', business_id)
      .maybeSingle()
    if (bizErr || !business) return json({ error: 'Business not found' }, 404)
    // Ownership check with an admin bypass — a partner can only hit their
    // own venue, but an admin (see ADMIN_USER_IDS) can hit any venue to
    // re-issue an onboarding link on their behalf.
    const isAdmin = ADMIN_USER_IDS.includes(user.id)
    if (!isAdmin && business.user_id && business.user_id !== user.id) {
      return json({ error: 'This is not your venue.' }, 403)
    }

    // Reuse an existing connected account if we already provisioned one.
    // Otherwise create fresh. Country is fixed to ES; the Partner Agreement
    // requires the Partner to be entitled to work in Spain, and Spanish
    // Connect accounts accept SEPA IBANs from any EU country so this is
    // permissive enough for expat partners with e.g. a UK Wise account.
    let accountId = business.stripe_account_id || null
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'ES',
        email: business.email || undefined,
        capabilities: {
          transfers:       { requested: true },
          card_payments:   { requested: false },
        },
        business_type: 'individual',
        metadata: {
          wello_business_id: String(business.id),
          wello_business_name: business.name || '',
        },
      })
      accountId = account.id
      // Persist immediately so a retry on this endpoint reuses the same
      // account rather than creating a duplicate.
      const { error: updErr } = await supabase
        .from('businesses')
        .update({ stripe_account_id: accountId, stripe_account_status: 'pending' })
        .eq('id', business.id)
      if (updErr) console.warn('create-connect-onboarding: could not persist stripe_account_id:', updErr.message)
    }

    // Account Links are one-shot — safe to create a fresh one every call.
    // refresh_url = they abandoned or timed out; return_url = Stripe thinks
    // they finished. In both cases we send them back to the portal Payouts
    // step, which reads the fresh status from the DB (updated by the
    // account.updated webhook) and shows the right pill.
    const returnUrl  = `${APP_ORIGIN}/?portal=business#payouts-return`
    const refreshUrl = `${APP_ORIGIN}/?portal=business#payouts-refresh`
    const link = await stripe.accountLinks.create({
      account:      accountId,
      refresh_url:  refreshUrl,
      return_url:   returnUrl,
      type:         'account_onboarding',
    })

    // Ground-truth account state. Used by the admin panel to render what
    // Stripe still needs from the partner (requirements.currently_due) and
    // whether charges/payouts are already live. Also lets the admin
    // compare Stripe's view against businesses.stripe_account_status,
    // which is a coarse-grained mirror maintained by the account.updated
    // webhook. If the mirror looks stale (e.g. Stripe says active but our
    // DB still says pending), the webhook probably didn't fire or wasn't
    // subscribed to the account.updated event.
    const acct = await stripe.accounts.retrieve(accountId)

    // livemode surfaces whether the deployed function is running against a
    // Stripe test key or a live key — cheap sanity check for the caller, and
    // essential when re-issuing onboarding links (an admin doesn't want to
    // hand a live-mode link to a test partner or vice versa).
    return json({
      url:        link.url,
      account_id: accountId,
      livemode:   LIVEMODE,
      // Snapshot our DB mirror so the admin can see drift at a glance.
      db_status: business.stripe_account_status,
      // Live account state from Stripe — the source of truth.
      account: {
        charges_enabled: acct.charges_enabled,
        payouts_enabled: acct.payouts_enabled,
        details_submitted: acct.details_submitted,
        requirements: {
          disabled_reason:      acct.requirements?.disabled_reason ?? null,
          currently_due:        acct.requirements?.currently_due ?? [],
          past_due:             acct.requirements?.past_due ?? [],
          eventually_due:       acct.requirements?.eventually_due ?? [],
          pending_verification: acct.requirements?.pending_verification ?? [],
          current_deadline:     acct.requirements?.current_deadline ?? null,
        },
        capabilities: acct.capabilities ?? {},
      },
    })
  } catch (e) {
    console.error('create-connect-onboarding exception:', e)
    return json({ error: (e as Error).message || 'Unexpected error' }, 500)
  }
})
