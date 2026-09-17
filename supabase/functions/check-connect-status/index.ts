import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import Stripe from 'https://esm.sh/stripe@17.3.0?target=denonext'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Lightweight status check for a partner's Stripe Connect account.
//
// Called by the wizard's Payouts step when a partner returns from Stripe
// hosted onboarding via the return_url set by create-connect-onboarding.
// Rather than mint another Account Link (which is what create-connect-
// onboarding does — expensive + creates unused links), this fn just
// retrieves the account and returns the two booleans the wizard needs
// to decide: mark step complete OR show "Finish setting up with Stripe".
//
// The account.updated webhook is still the authoritative path for
// keeping businesses.stripe_account_status in step long-term. This is
// a foreground check so the partner sees "you're set up" instantly on
// return rather than waiting for webhook latency.

const STRIPE_SECRET_KEY         = Deno.env.get('STRIPE_SECRET_KEY')!
const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ADMIN_USER_IDS = (Deno.env.get('ADMIN_USER_IDS') || '')
  .split(',').map(s => s.trim()).filter(Boolean)

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
      .select('id, user_id, stripe_account_id, stripe_account_status')
      .eq('id', business_id)
      .maybeSingle()
    if (bizErr || !business) return json({ error: 'Business not found' }, 404)

    // Ownership check with the same admin bypass create-connect-onboarding
    // uses, so an admin can debug a partner's status without impersonating.
    const isAdmin = ADMIN_USER_IDS.includes(user.id)
    if (!isAdmin && business.user_id && business.user_id !== user.id) {
      return json({ error: 'This is not your venue.' }, 403)
    }

    // No account provisioned yet → nothing to check. Wizard will interpret
    // this as "user hasn't started onboarding" and show the primary CTA.
    if (!business.stripe_account_id) {
      return json({
        has_account: false,
        details_submitted: false,
        payouts_enabled:   false,
        charges_enabled:   false,
        db_status:         business.stripe_account_status ?? null,
      })
    }

    const acct = await stripe.accounts.retrieve(business.stripe_account_id)

    return json({
      has_account:       true,
      details_submitted: !!acct.details_submitted,
      payouts_enabled:   !!acct.payouts_enabled,
      charges_enabled:   !!acct.charges_enabled,
      requirements: {
        disabled_reason:      acct.requirements?.disabled_reason ?? null,
        currently_due:        acct.requirements?.currently_due ?? [],
        past_due:             acct.requirements?.past_due ?? [],
        eventually_due:       acct.requirements?.eventually_due ?? [],
        pending_verification: acct.requirements?.pending_verification ?? [],
        current_deadline:     acct.requirements?.current_deadline ?? null,
      },
      // Snapshot the DB mirror so callers can spot drift without a second
      // round trip. Not authoritative — the returned Stripe fields are.
      db_status: business.stripe_account_status ?? null,
      account_id: business.stripe_account_id,
    })
  } catch (e) {
    console.error('check-connect-status exception:', e)
    return json({ error: (e as Error).message || 'Unexpected error' }, 500)
  }
})
