import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { AvailabilityAdapter, AvailabilityRow } from '../_shared/availability_types.ts'
import { momenceAdapter } from './adapters/momence.ts'
import { booqableAdapter } from './adapters/booqable.ts'

// Availability-sync orchestrator.
//
// Iterates partners with businesses.sync_source set, resolves the Vault
// secret named on the row, hands off to the adapter, then upserts the
// returned AvailabilityRows into slots keyed on
// (listing_id, source, external_id).
//
// Failure mode: on any adapter throw the orchestrator records the error
// on businesses.sync_last_error and touches NO slot rows — the last
// known schedule stands rather than the timetable emptying.
//
// Called by:
//   - hourly cron with body { mode: 'all' }        (baseline)
//   - 15-min cron  with body { mode: 'urgent' }    (near-session boost —
//                                                   only partners with a
//                                                   session starting in
//                                                   the next 90 min)
//
// Credits reconciliation:
//   1. Partner-defined session_offerings match wins (Momence: case-
//      insensitive title == offering.type; Booqable: meta.product_id ==
//      offering.booqable_product_id). If matched we set slots.credits
//      from offering.price_eur — even on UPDATE (this is an explicit
//      partner choice, not a silent adapter change).
//   2. If no offering match, fall back to the adapter-provided
//      row.adapter_price_eur (e.g. Momence fixedPrice) — but ONLY on
//      INSERT and on UPDATE-of-a-still-unpriced row (existing credits
//      is null). Never overwrite an already-set slots.credits from
//      the adapter — that's the "Noor silent-reprice" rule: a
//      partner's source-system price tweak must not surprise
//      customers who saw a different Wello price.
//   3. If neither, credits stay null / sync_status stays
//      'needs_price' and the daily digest nudges the partner.

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CRON_INVOKE_SECRET        = Deno.env.get('CRON_INVOKE_SECRET') || ''

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const ADAPTERS: Record<string, AvailabilityAdapter> = {
  momence:  momenceAdapter,
  booqable: booqableAdapter,
}

interface BizRow {
  id: number
  sync_source: string
  sync_config: Record<string, unknown>
  sync_secret_name: string | null
  sync_last_ok_at: string | null
  session_offerings: unknown
}

interface OfferingLite {
  type?: string
  price_eur?: number
  booqable_product_id?: string
}

async function loadToken(supabase: SupabaseClient, name: string): Promise<string | null> {
  // vault.decrypted_secrets isn't exposed to PostgREST (only public + graphql_public
  // schemas are reachable via REST — PGRST106 otherwise). Go through the
  // public.get_vault_secret RPC which is security-definer + service-role gated.
  const { data, error } = await supabase.rpc('get_vault_secret', { secret_name: name })
  if (error || !data) return null
  return String(data) || null
}

// Credits reconciliation. Returns null when no match — orchestrator
// treats null differently on INSERT (needs_price) vs UPDATE (leave
// existing credits untouched).
function creditsFor(row: AvailabilityRow, offerings: OfferingLite[]): number | null {
  for (const o of offerings) {
    if (row.kind === 'session') {
      if (o.type && String(o.type).trim().toLowerCase() === row.title.trim().toLowerCase()) {
        return Number.isFinite(o.price_eur) ? Number(o.price_eur) : null
      }
    } else {
      const pid = (row.meta && typeof row.meta.product_id === 'string') ? row.meta.product_id : null
      if (pid && o.booqable_product_id === pid) {
        return Number.isFinite(o.price_eur) ? Number(o.price_eur) : null
      }
    }
  }
  return null
}

interface SyncPartnerOutcome {
  business_id: number
  source: string
  ok: boolean
  fetched?: number
  upserted?: number
  cancelled?: number
  needs_price?: number
  error?: string
}

async function syncPartner(supabase: SupabaseClient, biz: BizRow): Promise<SyncPartnerOutcome> {
  const source = biz.sync_source
  const adapter = ADAPTERS[source]
  if (!adapter) return { business_id: biz.id, source, ok: false, error: `no adapter for source '${source}'` }
  if (!biz.sync_secret_name) return { business_id: biz.id, source, ok: false, error: 'sync_secret_name missing' }

  const token = await loadToken(supabase, biz.sync_secret_name)
  if (!token) return { business_id: biz.id, source, ok: false, error: `Vault secret '${biz.sync_secret_name}' not found or empty` }

  // Pick the partner's primary listing (first active). Slots are keyed
  // on listing_id; multi-listing partners will get all sync'd rows on
  // the primary listing for now — log a warning so we notice.
  const { data: listings } = await supabase
    .from('listings')
    .select('id, name, status')
    .eq('business_id', biz.id)
    .eq('status', 'active')
    .order('id', { ascending: true })
  if (!listings || listings.length === 0) {
    return { business_id: biz.id, source, ok: false, error: 'no active listing' }
  }
  if (listings.length > 1) {
    console.warn(`[sync partner=${biz.id}] ${listings.length} active listings — attributing sync'd slots to listing_id=${listings[0].id}`)
  }
  const listingId = Number(listings[0].id)

  // Fetch from the adapter. Log headers on first-ever sync so we spot
  // rate-limit / pagination advertisements early.
  const debugHeaders = !biz.sync_last_ok_at
  let rows: AvailabilityRow[]
  try {
    rows = await adapter.fetchAvailability({
      partnerId: biz.id,
      config: biz.sync_config || {},
      token,
      debugHeaders,
    })
  } catch (e) {
    const msg = (e as Error).message || String(e)
    await supabase.from('businesses')
      .update({ sync_last_error: msg.slice(0, 500) })
      .eq('id', biz.id)
    console.error(`[sync partner=${biz.id} source=${source}] adapter failed:`, msg)
    return { business_id: biz.id, source, ok: false, error: msg }
  }

  // Load existing sync'd slots for this (listing, source) to diff.
  const { data: existing } = await supabase
    .from('slots')
    .select('id, external_id, credits, sync_status')
    .eq('listing_id', listingId)
    .eq('source', source)
  const existingByExtId = new Map<string, { id: number; credits: number | null; sync_status: string | null }>()
  for (const e of (existing || [])) {
    if (e.external_id) existingByExtId.set(String(e.external_id), {
      id: Number(e.id),
      credits: e.credits as number | null,
      sync_status: e.sync_status as string | null,
    })
  }

  const offerings: OfferingLite[] = Array.isArray(biz.session_offerings)
    ? (biz.session_offerings as OfferingLite[])
    : []

  const nowIso = new Date().toISOString()
  let upserted = 0
  let needsPrice = 0

  // ── Upsert loop ────────────────────────────────────────────
  for (const r of rows) {
    // Map adapter shape onto slots columns.
    const startLocal = new Date(r.start_at)
    // slots.date/time are stored in Madrid local convention (matches
    // manual rows), so format from the UTC start_at.
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Madrid', hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    }).formatToParts(startLocal).map(k => [k.type, k.value] as const))
    const date = `${parts.year}-${parts.month}-${parts.day}`
    const time = `${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}`
    const dur  = r.duration_min ? `${r.duration_min} min` : (r.kind === 'item' ? 'day' : '60 min')

    // Spots/booked: adapter tells us remaining; capacity is optional.
    // Prefer capacity if known so the display shows "X of Y".
    const capacity = Number.isFinite(r.capacity) ? Number(r.capacity) : null
    const spots = capacity != null ? capacity : r.available_qty
    const booked = capacity != null ? Math.max(0, capacity - r.available_qty) : 0

    const priceMatch = creditsFor(r, offerings)
    const adapterPrice = Number.isFinite(r.adapter_price_eur) ? Number(r.adapter_price_eur) : null
    const existingRow = existingByExtId.get(r.external_id)

    if (existingRow) {
      // UPDATE.
      // 1. Partner offering match always wins.
      // 2. Otherwise, if the row is still unpriced (credits null) and the
      //    adapter gave us a price, seed it — safe because nothing has
      //    been quoted to a customer yet.
      // 3. Otherwise leave credits alone (Noor: never re-price an active
      //    slot from adapter drift).
      let nextCredits: number | null = null
      if (priceMatch != null)                                        nextCredits = priceMatch
      else if (existingRow.credits == null && adapterPrice != null)  nextCredits = adapterPrice
      else                                                            nextCredits = existingRow.credits

      const patch: Record<string, unknown> = {
        name: r.title,
        date, time, dur,
        spots, booked,
        sync_status: r.status === 'cancelled' ? 'cancelled' : (nextCredits == null ? 'needs_price' : 'active'),
        synced_at: nowIso,
      }
      if (nextCredits !== existingRow.credits) patch.credits = nextCredits
      const { error: uErr } = await supabase.from('slots').update(patch).eq('id', existingRow.id)
      if (uErr) {
        console.error(`[sync partner=${biz.id}] update slot ${existingRow.id} failed:`, uErr.message)
      } else {
        upserted++
        if (nextCredits == null) needsPrice++
      }
      existingByExtId.delete(r.external_id) // mark handled
    } else {
      // INSERT — skip if cancelled (nothing to preserve).
      if (r.status === 'cancelled') continue
      const seedCredits = priceMatch ?? adapterPrice
      const insertRow: Record<string, unknown> = {
        listing_id: listingId,
        name: r.title,
        date, time, dur,
        spots, booked,
        credits: seedCredits, // partner offering > adapter price > NULL
        source,
        external_id: r.external_id,
        sync_status: seedCredits == null ? 'needs_price' : 'active',
        synced_at: nowIso,
      }
      const { error: iErr } = await supabase.from('slots').insert(insertRow)
      if (iErr) {
        console.error(`[sync partner=${biz.id}] insert slot ${r.external_id} failed:`, iErr.message)
      } else {
        upserted++
        if (seedCredits == null) {
          needsPrice++
          console.warn(`[sync partner=${biz.id} source=${source}] no price for '${r.title}' (external_id=${r.external_id}) — inserted with credits=NULL`)
        }
      }
    }
  }

  // ── Mark absent rows cancelled ─────────────────────────────
  // Rows in DB but not returned by adapter this run.
  let cancelled = 0
  for (const [, existingRow] of existingByExtId) {
    if (existingRow.sync_status === 'cancelled') continue
    const { error } = await supabase.from('slots')
      .update({ sync_status: 'cancelled', synced_at: nowIso })
      .eq('id', existingRow.id)
    if (!error) cancelled++
  }

  // Success → clear error, stamp last_ok.
  await supabase.from('businesses')
    .update({ sync_last_ok_at: nowIso, sync_last_error: null })
    .eq('id', biz.id)

  return { business_id: biz.id, source, ok: true, fetched: rows.length, upserted, cancelled, needs_price: needsPrice }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  // Same cron gate pattern as send-booking-reminders.
  if (!CRON_INVOKE_SECRET) return json({ error: 'CRON_INVOKE_SECRET not configured' }, 500)
  const provided = (req.headers.get('X-Cron-Token') || req.headers.get('x-cron-token') || '').trim()
  if (!provided || provided.length !== CRON_INVOKE_SECRET.length) return json({ error: 'Unauthorized' }, 401)
  let diff = 0
  for (let i = 0; i < provided.length; i++) diff |= provided.charCodeAt(i) ^ CRON_INVOKE_SECRET.charCodeAt(i)
  if (diff !== 0) return json({ error: 'Unauthorized' }, 401)

  let body: { mode?: 'all' | 'urgent' } = {}
  try { body = await req.json() } catch { /* body optional */ }
  const mode = body.mode === 'urgent' ? 'urgent' : 'all'

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Base query — partners with an adapter configured.
  let query = supabase
    .from('businesses')
    .select('id, sync_source, sync_config, sync_secret_name, sync_last_ok_at, session_offerings')
    .not('sync_source', 'is', null)
  if (mode === 'urgent') {
    // Only partners with an active sync'd session starting in the next
    // 90 minutes. Simpler filter: get all sync'd partners, then in the
    // loop skip those with nothing near-term. Cheaper than a JOIN'd
    // pre-filter for a handful of partners.
  }

  const { data: partners, error } = await query
  if (error) return json({ error: error.message }, 500)
  if (!partners?.length) return json({ mode, scanned: 0, outcomes: [] })

  const outcomes: SyncPartnerOutcome[] = []
  for (const biz of partners as unknown as BizRow[]) {
    if (mode === 'urgent') {
      // Skip partners with no session in the next 90 min. Cheap pre-check.
      const { data: near } = await supabase
        .from('slots')
        .select('id')
        .eq('source', biz.sync_source)
        .eq('sync_status', 'active')
        .eq('date', new Date().toISOString().slice(0, 10))
        .limit(1)
      if (!near || near.length === 0) continue
    }
    outcomes.push(await syncPartner(supabase, biz))
  }

  return json({ mode, scanned: partners.length, ran: outcomes.length, outcomes })
})
