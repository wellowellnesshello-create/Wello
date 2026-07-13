import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
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

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-api-version',
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
  op: 'list' | 'get' | 'update' | 'insert_slots'
  business_id?: number | string | null
  patch?: Record<string, unknown>
  // When op === 'update' and patch.img is set, also mirror the URL onto
  // the business's active listing so Explore reflects the change without
  // waiting for a re-approval cycle. Matches the wizard's behaviour.
  mirror_img_to_listing?: boolean
  listing_id?: number | string | null
  slot_rows?: Array<Record<string, unknown>>
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
    const { data, error } = await supabase
      .from('businesses')
      .select('id, name, business_type, category, status, cr, slots, session_offerings, description, address, img, gallery, tags, email, contact_name')
      .order('name', { ascending: true })
    if (error) return respond(500, { error: error.message })
    return respond(200, { businesses: data || [] })
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

  return respond(400, { error: `Unknown op: ${body.op}` })
})
