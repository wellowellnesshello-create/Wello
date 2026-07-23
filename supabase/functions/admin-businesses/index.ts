import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@17.3.0?target=denonext'
import { requireAdmin } from '../_shared/admin_auth.ts'

// Internal admin-only DB gateway.
//
// Wraps businesses reads/writes so the admin setup tool can operate on any
// venue regardless of the ownership RLS on `businesses` (which limits
// authenticated users to rows where email = auth.jwt() ->> 'email').
//
// Requests must include a valid admin JWT (see requireAdmin). All writes
// are constrained to a column whitelist so this cannot be used to grant
// approvals, bump commission, wipe stripe fields, etc.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') || ''

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Columns admin can patch on businesses. Anything else is a security or
// commercial decision and stays partner-side.
//
// `email` is included because the ownership-handoff step legitimately needs
// to transfer a row from the admin's account to the real partner's account.
// The update op treats an email change as a distinct action (see below):
// the old user_id is cleared so RLS delete/user_id policies don't leak
// access to the previous owner, and a row is written to
// admin_ownership_transfers for audit.
const UPDATE_COLUMN_WHITELIST = new Set([
  'description',
  'address',
  'tags',
  'slots',
  'session_offerings',
  'img',
  'gallery',
  'email',
  'contact_name',
])

interface AdminBusinessesRequest {
  op:
    | 'list'
    | 'get'
    | 'update'
    | 'insert_slots'
    | 'find_by_stripe_account'
    | 'stripe_diagnose'
    | 'stripe_create_connect_endpoint'
    | 'stripe_rotate_connect_endpoint'
    | 'stripe_nudge_account'
  business_id?: number | string | null
  patch?: Record<string, unknown>
  // When op === 'update' and patch.img is set, also mirror the URL onto
  // the business's active listing so Explore reflects the change without
  // waiting for a re-approval cycle. Matches the wizard's behaviour.
  mirror_img_to_listing?: boolean
  listing_id?: number | string | null
  slot_rows?: Array<Record<string, unknown>>
  // For op: find_by_stripe_account / stripe_diagnose — Stripe Connect
  // account id to look up on our side and (for diagnose) on Stripe's side.
  account_id?: string
  // For op: stripe_create_connect_endpoint — override the URL if we're
  // pointing at a non-default deployment. Defaults to the current
  // project's /functions/v1/stripe-webhook.
  endpoint_url?: string
}

function respond(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const gate = await requireAdmin(req)
  if (!gate.ok) return gate.response

  let body: AdminBusinessesRequest
  try {
    body = await req.json()
  } catch (_e) {
    return respond(400, { error: 'Invalid JSON body.' })
  }

  if (!body?.op) return respond(400, { error: 'op is required.' })

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // ── op: list ─────────────────────────────────────────────────────────
  if (body.op === 'list') {
    // stripe_account_id / stripe_account_status added so the admin
    // dropdown can tell overlapping test rows apart (one with an active
    // connected account vs one still pending, etc).
    const { data, error } = await supabase
      .from('businesses')
      .select('id, name, business_type, category, status, cr, slots, session_offerings, description, address, img, gallery, tags, email, contact_name, stripe_account_id, stripe_account_status')
      .order('name', { ascending: true })
    if (error) return respond(500, { error: error.message })
    return respond(200, { businesses: data || [] })
  }

  // ── op: find_by_stripe_account ───────────────────────────────────────
  // Reverse lookup: given a Stripe connected-account id, return the Wello
  // business row that owns it. Used for support triage when there are
  // multiple test rows and it isn't obvious from the name.
  if (body.op === 'find_by_stripe_account') {
    const acctId = String(body.account_id || '').trim()
    if (!acctId) return respond(400, { error: 'account_id is required.' })
    const { data, error } = await supabase
      .from('businesses')
      .select('id, name, email, user_id, stripe_account_id, stripe_account_status, commission_rate, terms_accepted_commission, founding_incentive_bookings, cancellation_safety_window')
      .eq('stripe_account_id', acctId)
      .maybeSingle()
    if (error) return respond(500, { error: error.message })
    if (!data) return respond(404, { error: `No business found with stripe_account_id = ${acctId}` })
    return respond(200, { business: data })
  }

  // ── op: get ──────────────────────────────────────────────────────────
  if (body.op === 'get') {
    const bid = body.business_id == null || body.business_id === '' ? null : Number(body.business_id)
    if (!bid || !Number.isFinite(bid)) return respond(400, { error: 'business_id is required.' })

    const { data: biz, error: bizErr } = await supabase
      .from('businesses')
      .select('id, name, business_type, category, status, cr, slots, session_offerings, description, address, img, gallery, tags, email, contact_name')
      .eq('id', bid)
      .maybeSingle()
    if (bizErr) return respond(500, { error: bizErr.message })
    if (!biz) return respond(404, { error: 'Business not found.' })

    // Also surface the earliest listing id so the client's slot-insert path
    // knows whether the business is already active on the marketplace.
    const { data: listing } = await supabase
      .from('listings')
      .select('id')
      .eq('business_id', bid)
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle()

    return respond(200, { business: biz, listing_id: listing?.id ?? null })
  }

  // ── op: update ───────────────────────────────────────────────────────
  if (body.op === 'update') {
    const bid = body.business_id == null || body.business_id === '' ? null : Number(body.business_id)
    if (!bid || !Number.isFinite(bid)) return respond(400, { error: 'business_id is required.' })
    if (!body.patch || typeof body.patch !== 'object') return respond(400, { error: 'patch is required.' })

    const safePatch: Record<string, unknown> = {}
    const rejected: string[] = []
    for (const [k, v] of Object.entries(body.patch)) {
      if (UPDATE_COLUMN_WHITELIST.has(k)) safePatch[k] = v
      else rejected.push(k)
    }
    if (Object.keys(safePatch).length === 0) {
      return respond(400, { error: 'No writable columns in patch.', rejected })
    }

    // Ownership handoff: if email is being changed, look up the current
    // email + user_id first so we can audit the transfer and clear the
    // stale user_id in the same update. Clearing user_id means the
    // outgoing owner loses the delete-via-user_id RLS path (they already
    // lose SELECT/UPDATE because those check email) and the incoming
    // owner starts from a clean row.
    let ownershipTransfer:
      | { from_email: string | null; to_email: string | null; cleared_user_id: boolean }
      | null = null
    if ('email' in safePatch) {
      const newEmail = safePatch.email == null ? null : String(safePatch.email).trim().toLowerCase()
      const { data: current, error: curErr } = await supabase
        .from('businesses')
        .select('email, user_id')
        .eq('id', bid)
        .maybeSingle()
      if (curErr) return respond(500, { error: `pre-transfer lookup failed: ${curErr.message}`, rejected })
      const oldEmail = current?.email == null ? null : String(current.email).trim().toLowerCase()
      if (newEmail !== oldEmail) {
        safePatch.email = newEmail
        // Only clear user_id when it was actually populated. Avoids
        // rewriting null -> null and keeps the audit boolean truthful.
        if (current?.user_id) {
          ;(safePatch as Record<string, unknown>).user_id = null
          ownershipTransfer = { from_email: oldEmail, to_email: newEmail, cleared_user_id: true }
        } else {
          ownershipTransfer = { from_email: oldEmail, to_email: newEmail, cleared_user_id: false }
        }
      }
    }

    const { error } = await supabase.from('businesses').update(safePatch).eq('id', bid)
    if (error) return respond(500, { error: `businesses update failed: ${error.message}`, rejected })

    // Mirror img to listings row when requested — matches the wizard's
    // "photo change is visible on Explore immediately" behaviour.
    let mirrored = false
    if (body.mirror_img_to_listing && 'img' in safePatch) {
      const { error: listErr } = await supabase
        .from('listings')
        .update({ img: safePatch.img })
        .eq('business_id', bid)
      if (listErr) console.warn('listings img mirror failed:', listErr.message)
      else mirrored = true
    }

    // Best-effort audit write for the ownership transfer. Never fails the
    // request; the transfer itself is already committed.
    if (ownershipTransfer) {
      try {
        await supabase.from('admin_ownership_transfers').insert({
          admin_user_id: gate.userId,
          business_id: bid,
          from_email: ownershipTransfer.from_email,
          to_email: ownershipTransfer.to_email,
          cleared_user_id: ownershipTransfer.cleared_user_id,
        })
      } catch (e) {
        console.error('admin_ownership_transfers insert failed:', e)
      }
    }

    return respond(200, { ok: true, rejected, mirrored, ownership_transfer: ownershipTransfer })
  }

  // ── op: insert_slots ─────────────────────────────────────────────────
  if (body.op === 'insert_slots') {
    const listingId = body.listing_id == null || body.listing_id === '' ? null : Number(body.listing_id)
    if (!listingId || !Number.isFinite(listingId)) return respond(400, { error: 'listing_id is required.' })
    if (!Array.isArray(body.slot_rows) || body.slot_rows.length === 0) {
      return respond(400, { error: 'slot_rows must be a non-empty array.' })
    }

    // Whitelist the columns the client can send per row. Everything else
    // is stripped so the caller can't insert e.g. a booking count or
    // spoofed listing_id.
    const SLOT_COLS = new Set(['name', 'date', 'time', 'dur', 'spots', 'credits', 'acuity_type_id', 'category'])
    const rows = body.slot_rows.map(r => {
      const clean: Record<string, unknown> = { listing_id: listingId, booked: 0 }
      for (const [k, v] of Object.entries(r)) if (SLOT_COLS.has(k)) clean[k] = v
      return clean
    })

    const { error } = await supabase.from('slots').insert(rows)
    if (error) return respond(500, { error: `slots insert failed: ${error.message}` })

    return respond(200, { ok: true, inserted: rows.length })
  }

  // ── op: stripe_diagnose ──────────────────────────────────────────────
  // Support triage for Connect accounts that appear stuck. Returns the
  // fields the stripe-webhook handler keys on (charges_enabled,
  // payouts_enabled, requirements.disabled_reason) alongside recent
  // account.updated events for the same account_id, so we can tell
  // "onboarding genuinely incomplete" apart from "webhook leg broken".
  if (body.op === 'stripe_diagnose') {
    if (!STRIPE_SECRET_KEY) return respond(500, { error: 'STRIPE_SECRET_KEY not configured on this environment.' })
    const acctId = String(body.account_id || '').trim()
    if (!acctId) return respond(400, { error: 'account_id is required.' })
    const stripe = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: '2024-09-30.acacia',
      httpClient: Stripe.createFetchHttpClient(),
    })
    try {
      const account = await stripe.accounts.retrieve(acctId)
      // What our webhook handler would compute right now if this account
      // state arrived on an event. Lets us see whether the row *should* be
      // active but isn't, vs still genuinely pending.
      let derived_status: 'active' | 'pending' | 'restricted' = 'pending'
      if (account.charges_enabled && account.payouts_enabled) derived_status = 'active'
      if (account.requirements?.disabled_reason) derived_status = 'restricted'

      // Platform-scope events. account.updated for a Connect-managed
      // account fires under the *connected* account's scope, not the
      // platform's — so this list is only useful as a sanity check that
      // event listing itself is working. Real matches almost always come
      // from the Connect-scope pass below.
      const platformEvents = await stripe.events.list({
        type: 'account.updated',
        limit: 100,
      })
      const platformMatching = platformEvents.data
        .filter(e => (e.data?.object as { id?: string } | undefined)?.id === acctId)

      // Connect-scope events for this specific connected account. This
      // is where Stripe records account.updated for Express/Custom
      // accounts. Passing stripeAccount pins the request to that
      // account's event stream.
      let connectEvents: Stripe.ApiList<Stripe.Event> | null = null
      try {
        connectEvents = await stripe.events.list(
          { type: 'account.updated', limit: 100 },
          { stripeAccount: acctId },
        )
      } catch (e) {
        console.warn('stripe_diagnose: connect-scope events.list failed:', (e as Error).message)
      }
      const summariseEvents = (list: Stripe.Event[]) => list.map(e => {
        const obj = e.data?.object as Stripe.Account | undefined
        return {
          id: e.id,
          created: e.created,
          created_iso: new Date(e.created * 1000).toISOString(),
          livemode: e.livemode,
          charges_enabled: obj?.charges_enabled ?? null,
          payouts_enabled: obj?.payouts_enabled ?? null,
          details_submitted: obj?.details_submitted ?? null,
          disabled_reason: obj?.requirements?.disabled_reason ?? null,
          currently_due: obj?.requirements?.currently_due ?? [],
        }
      })

      // Webhook endpoint config. If none of the endpoints has
      // connect: true AND subscribes to account.updated (or *), Stripe
      // will never deliver Connect account.updated to us, no matter how
      // many events fire. This is the most common cause of a stuck
      // stripe_account_status mirror.
      let webhookEndpoints: Array<{
        id: string
        url: string
        status: string
        connect: boolean
        enabled_events: string[]
        api_version: string | null
        livemode: boolean
      }> = []
      try {
        const list = await stripe.webhookEndpoints.list({ limit: 100 })
        webhookEndpoints = list.data.map(w => ({
          id: w.id,
          url: w.url,
          status: w.status,
          // The Stripe types don't expose `connect` on the surface type,
          // but the API returns it and it's the field that decides
          // whether the endpoint receives connected-account events.
          connect: (w as unknown as { connect?: boolean }).connect === true,
          enabled_events: w.enabled_events,
          api_version: w.api_version,
          livemode: w.livemode,
        }))
      } catch (e) {
        console.warn('stripe_diagnose: webhookEndpoints.list failed:', (e as Error).message)
      }

      return respond(200, {
        account: {
          id: account.id,
          charges_enabled: account.charges_enabled,
          payouts_enabled: account.payouts_enabled,
          details_submitted: account.details_submitted,
          currently_due: account.requirements?.currently_due ?? [],
          past_due: account.requirements?.past_due ?? [],
          eventually_due: account.requirements?.eventually_due ?? [],
          disabled_reason: account.requirements?.disabled_reason ?? null,
        },
        derived_status,
        platform_scope_events: {
          searched: platformEvents.data.length,
          matching: summariseEvents(platformMatching),
        },
        connect_scope_events: connectEvents
          ? {
              searched: connectEvents.data.length,
              events: summariseEvents(connectEvents.data),
            }
          : { error: 'connect-scope events.list threw — see function logs' },
        webhook_endpoints: webhookEndpoints,
      })
    } catch (e) {
      return respond(500, { error: `stripe_diagnose failed: ${(e as Error).message}` })
    }
  }

  // ── op: stripe_create_connect_endpoint ───────────────────────────────
  // Creates a *Connect-scoped* webhook endpoint (connect: true) subscribed
  // to account.updated, pointing at our stripe-webhook function. Needed
  // because Stripe delivers account.updated for Express/Custom connected
  // accounts only to endpoints registered with connect: true — the
  // existing direct endpoint (connect: false) never receives them.
  //
  // Returns the endpoint's signing secret (`whsec_...`) in the response.
  // The caller is expected to persist it as STRIPE_WEBHOOK_SECRET_CONNECT
  // in Supabase Function secrets; the stripe-webhook handler tries both
  // secrets when verifying signatures.
  //
  // Runs in whichever Stripe mode STRIPE_SECRET_KEY currently belongs to.
  // For the live cutover this op needs to run again against the live key
  // to create the live-mode Connect endpoint.
  if (body.op === 'stripe_create_connect_endpoint') {
    if (!STRIPE_SECRET_KEY) return respond(500, { error: 'STRIPE_SECRET_KEY not configured on this environment.' })
    const stripe = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: '2024-09-30.acacia',
      httpClient: Stripe.createFetchHttpClient(),
    })
    const url = String(body.endpoint_url || `${SUPABASE_URL}/functions/v1/stripe-webhook`).trim()
    try {
      // Guard against double-creation: if a Connect endpoint pointing at
      // this URL already exists, return the existing one instead of
      // making a duplicate. Note: Stripe only returns the signing secret
      // on the create response; a pre-existing endpoint won't include
      // one, so the caller has to fetch it from the dashboard in that
      // path.
      const existing = await stripe.webhookEndpoints.list({ limit: 100 })
      const already = existing.data.find(w =>
        w.url === url &&
        (w as unknown as { connect?: boolean }).connect === true,
      )
      if (already) {
        return respond(200, {
          already_exists: true,
          id: already.id,
          url: already.url,
          enabled_events: already.enabled_events,
          livemode: already.livemode,
          message: 'A Connect endpoint at this URL already exists. Fetch its signing secret from the Stripe Dashboard (Developers → Webhooks) — Stripe only returns whsec on the initial create.',
        })
      }
      const created = await stripe.webhookEndpoints.create({
        url,
        enabled_events: ['account.updated'],
        connect: true,
        description: 'Wello Connect events (account.updated). Delivers to same handler as the direct endpoint; handler tries both signing secrets.',
      })
      return respond(200, {
        id: created.id,
        url: created.url,
        enabled_events: created.enabled_events,
        livemode: created.livemode,
        secret: created.secret,
        instructions: [
          '1. Copy the `secret` value below.',
          '2. In your terminal (not this chat), run:',
          `   supabase secrets set STRIPE_WEBHOOK_SECRET_CONNECT=<the-whsec-value>`,
          '3. Redeploy stripe-webhook so the new env var is picked up.',
        ],
      })
    } catch (e) {
      return respond(500, { error: `stripe_create_connect_endpoint failed: ${(e as Error).message}` })
    }
  }

  // ── op: stripe_rotate_connect_endpoint ───────────────────────────────
  // Delete every existing Connect endpoint at our stripe-webhook URL
  // and create a fresh one. Rotation = delete + create because Stripe
  // returns the signing secret only on the create response; there is no
  // API to reveal an existing endpoint's secret.
  //
  // Use case: the previous secret was exposed (e.g. pasted into a chat
  // log). After running this, set the returned secret as
  // STRIPE_WEBHOOK_SECRET_CONNECT and redeploy stripe-webhook.
  if (body.op === 'stripe_rotate_connect_endpoint') {
    if (!STRIPE_SECRET_KEY) return respond(500, { error: 'STRIPE_SECRET_KEY not configured on this environment.' })
    const stripe = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: '2024-09-30.acacia',
      httpClient: Stripe.createFetchHttpClient(),
    })
    const url = String(body.endpoint_url || `${SUPABASE_URL}/functions/v1/stripe-webhook`).trim()
    try {
      const existing = await stripe.webhookEndpoints.list({ limit: 100 })
      const toDelete = existing.data.filter(w =>
        w.url === url &&
        (w as unknown as { connect?: boolean }).connect === true,
      )
      const deleted: string[] = []
      for (const w of toDelete) {
        await stripe.webhookEndpoints.del(w.id)
        deleted.push(w.id)
      }
      const created = await stripe.webhookEndpoints.create({
        url,
        enabled_events: ['account.updated'],
        connect: true,
        description: 'Wello Connect events (account.updated). Rotated by stripe_rotate_connect_endpoint.',
      })
      return respond(200, {
        deleted,
        new_endpoint: {
          id: created.id,
          url: created.url,
          enabled_events: created.enabled_events,
          livemode: created.livemode,
        },
        secret: created.secret,
      })
    } catch (e) {
      return respond(500, { error: `stripe_rotate_connect_endpoint failed: ${(e as Error).message}` })
    }
  }

  // ── op: stripe_nudge_account ─────────────────────────────────────────
  // Touch a connected account's metadata so Stripe emits a fresh
  // account.updated event. Used to re-trigger delivery after a webhook
  // routing bug has been fixed — cleaner than manually flipping the
  // DB row because the row transition still comes from a real Stripe
  // event (proving the webhook leg works end-to-end).
  //
  // We stamp `metadata.wello_last_nudge_at` with the current ISO time.
  // Metadata changes are considered account updates by Stripe and fire
  // the event; leaving a timestamped audit trail also makes it obvious
  // in the Stripe Dashboard which nudges came from this tool.
  if (body.op === 'stripe_nudge_account') {
    if (!STRIPE_SECRET_KEY) return respond(500, { error: 'STRIPE_SECRET_KEY not configured on this environment.' })
    const acctId = String(body.account_id || '').trim()
    if (!acctId) return respond(400, { error: 'account_id is required.' })
    const stripe = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: '2024-09-30.acacia',
      httpClient: Stripe.createFetchHttpClient(),
    })
    try {
      const nowIso = new Date().toISOString()
      const updated = await stripe.accounts.update(acctId, {
        metadata: { wello_last_nudge_at: nowIso },
      })
      return respond(200, {
        ok: true,
        account_id: updated.id,
        nudged_at: nowIso,
        charges_enabled: updated.charges_enabled,
        payouts_enabled: updated.payouts_enabled,
        details_submitted: updated.details_submitted,
        disabled_reason: updated.requirements?.disabled_reason ?? null,
      })
    } catch (e) {
      return respond(500, { error: `stripe_nudge_account failed: ${(e as Error).message}` })
    }
  }

  return respond(400, { error: `Unknown op: ${body.op}` })
})
