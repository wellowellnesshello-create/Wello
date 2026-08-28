import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Booqable rental sync — per-business.
//
// Each partner has their own Booqable account. Credentials live on the
// businesses row (booqable_subdomain + booqable_api_key). We use them
// to reserve inventory in the partner's Booqable when a Wello booking
// is accepted, and release it on decline/cancel — so the partner's own
// booking calendar stays authoritative and doesn't double-book.
//
// Operations (JSON body `op`):
//   'reserve'         — venue-booking-response accept path. Creates an
//                       Order in Booqable spanning booking_date..end_date
//                       for the offering's booqable_product_id, and
//                       stores the returned order id on the booking row.
//   'release'         — cancel-booking / decline paths. Deletes the
//                       previously-created Order.
//   'test_connection' — used by the partner Settings "Test connection"
//                       button. Calls GET /api/1/products with a limit
//                       of 1 to verify the API key works. Returns
//                       `{ok:true, connected:true, product_count}` on
//                       success.
//
// Callers:
//   - venue-booking-response fires 'reserve' after applyAccept
//   - cancel-booking fires 'release' on customer cancel
//   - notify-venue-rental-request could fire 'release' on decline
//   - partner Settings button fires 'test_connection'
//
// All ops are best-effort: a Booqable failure never blocks the Wello
// booking itself. We log + return the reason so the caller can surface
// it if useful, but the transaction on the Wello side has already
// committed.

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

// Load a business row (id, subdomain, api key) with strict auth:
//   - service_role bearer → allowed for any biz (server-to-server callers)
//   - user JWT           → allowed only for the biz the user owns
// This lets the partner Settings button call test_connection with their
// own JWT without leaking credentials for other partners.
async function loadBusinessAuthorised(req: Request, businessId: number | string): Promise<
  | { ok: true; business: { id: number; booqable_subdomain: string | null; booqable_api_key: string | null } }
  | { ok: false; status: number; error: string }
> {
  const auth = req.headers.get('Authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!token) return { ok: false, status: 401, error: 'Missing bearer token' }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Service-role fast path — no user lookup, trust the caller.
  if (token === SUPABASE_SERVICE_ROLE_KEY) {
    const { data, error } = await admin
      .from('businesses')
      .select('id, booqable_subdomain, booqable_api_key')
      .eq('id', businessId)
      .maybeSingle()
    if (error) return { ok: false, status: 500, error: error.message }
    if (!data)  return { ok: false, status: 404, error: 'Business not found' }
    return { ok: true, business: data }
  }

  // User JWT path — verify + check ownership.
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: userData, error: userErr } = await anon.auth.getUser(token)
  if (userErr || !userData?.user) return { ok: false, status: 401, error: 'Session expired' }
  const userId = userData.user.id

  const { data: biz, error: bizErr } = await admin
    .from('businesses')
    .select('id, user_id, booqable_subdomain, booqable_api_key')
    .eq('id', businessId)
    .maybeSingle()
  if (bizErr) return { ok: false, status: 500, error: bizErr.message }
  if (!biz)   return { ok: false, status: 404, error: 'Business not found' }
  if (biz.user_id !== userId) return { ok: false, status: 403, error: 'Not your business' }
  return { ok: true, business: biz }
}

async function booqableFetch(subdomain: string, apiKey: string, path: string, init: RequestInit = {}): Promise<Response> {
  const url = `https://${subdomain}.booqable.com${path.startsWith('/') ? '' : '/'}${path}`
  const headers = new Headers(init.headers || {})
  headers.set('Authorization', `Bearer ${apiKey}`)
  if (!headers.has('Content-Type') && init.body) headers.set('Content-Type', 'application/json')
  return fetch(url, { ...init, headers })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')    return json({ error: 'POST only' }, 405)

  let body: {
    op?: 'reserve' | 'release' | 'test_connection' | 'sync_catalog' | 'check_availability'
    booking_id?: string
    business_id?: number | string
    product_id?: string
    starts_at?: string
    stops_at?: string
  }
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const op = body.op
  if (!op) return json({ error: 'op required' }, 400)

  // ── sync_catalog ─────────────────────────────────────────────
  // Pulls the partner's products from Booqable and mirrors them into
  // businesses.session_offerings. Idempotent — re-running refreshes
  // fields on existing offerings (price, inventory, image) matched by
  // booqable_product_id, and inserts new offerings for products that
  // aren't yet in Wello. Non-Booqable offerings are left untouched so
  // partners can hand-manage some offerings + auto-sync others.
  if (op === 'sync_catalog') {
    if (!body.business_id) return json({ error: 'business_id required' }, 400)
    const gate = await loadBusinessAuthorised(req, body.business_id)
    if (!gate.ok) return json({ error: gate.error }, gate.status)
    const { booqable_subdomain, booqable_api_key } = gate.business
    if (!booqable_subdomain || !booqable_api_key) {
      return json({ ok: false, reason: 'missing_credentials' }, 400)
    }
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    try {
      // Fetch up to 100 products in one page. Partners with more can
      // paginate later; MVP handles the common case.
      const r = await booqableFetch(booqable_subdomain, booqable_api_key, '/api/1/products?per_page=100')
      if (!r.ok) {
        const txt = await r.text().catch(() => '')
        return json({ ok: false, reason: `booqable_${r.status}`, detail: txt.slice(0, 200) }, 502)
      }
      // Booqable's response shape: { products: [{ id, name, base_price_in_cents, photo_url, stock_count, ... }] }
      const data = await r.json().catch(() => null) as { products?: Array<Record<string, unknown>> } | null
      const products = Array.isArray(data?.products) ? data!.products! : []

      // Load current offerings to merge.
      const { data: biz, error: bizErr } = await admin
        .from('businesses').select('session_offerings').eq('id', body.business_id).maybeSingle()
      if (bizErr) return json({ error: bizErr.message }, 500)
      const existing: Array<Record<string, unknown>> = Array.isArray(biz?.session_offerings) ? biz!.session_offerings! as Array<Record<string, unknown>> : []
      const byBooqableId = new Map<string, number>()
      existing.forEach((o, i) => {
        const pid = o.booqable_product_id
        if (typeof pid === 'string' && pid) byBooqableId.set(pid, i)
      })

      let created = 0, updated = 0
      const next = existing.slice()
      for (const p of products) {
        const productId = String(p.id ?? '')
        if (!productId) continue
        const name       = String(p.name || 'Rental')
        const cents      = Number(p.base_price_in_cents)
        const priceEur   = Number.isFinite(cents) && cents > 0 ? Math.round(cents / 100) : 0
        const stockCount = Number(p.stock_count)
        const inventory  = Number.isFinite(stockCount) && stockCount > 0 ? stockCount : 1
        const img        = typeof p.photo_url === 'string' ? p.photo_url : null

        const idx = byBooqableId.get(productId)
        if (idx == null) {
          // New offering — sensible defaults for fields Booqable doesn't
          // supply (min/max days, weekly discount, deposit).
          next.push({
            kind: 'rental',
            type: name,
            length_min: 60,
            price_eur: priceEur,
            capacity: 1,
            venue_side: 'instructor',
            booking_mode: 'request',
            inventory,
            weekly_price_eur: null,
            min_days: 1,
            max_days: 14,
            deposit_eur: null,
            addons: [],
            min_lead_hours: 48,
            booqable_product_id: productId,
            img,
            extra_person_eur: null,
            max_people: null,
          })
          created++
        } else {
          // Existing — refresh Booqable-owned fields only. Leaves
          // partner-configured fields (min_days, deposit, weekly rate,
          // addons, lead time) alone so re-syncs don't stomp on tweaks.
          const cur = next[idx]
          next[idx] = {
            ...cur,
            type: name,
            price_eur: priceEur || cur.price_eur,
            inventory,
            img: img || cur.img,
          }
          updated++
        }
      }

      const { error: writeErr } = await admin
        .from('businesses').update({ session_offerings: next }).eq('id', body.business_id)
      if (writeErr) return json({ error: writeErr.message }, 500)

      return json({ ok: true, synced: true, product_count: products.length, created, updated })
    } catch (e) {
      return json({ ok: false, reason: 'network_error', detail: (e as Error).message }, 500)
    }
  }

  // ── check_availability ───────────────────────────────────────
  // Client calls this from the rental card availability effect when
  // the offering has a booqable_product_id. Returns remaining stock
  // for the given date range according to Booqable — client takes
  // MIN(this, Wello-side count) so a booking made on either platform
  // reduces the number shown.
  if (op === 'check_availability') {
    if (!body.business_id) return json({ error: 'business_id required' }, 400)
    if (!body.product_id)  return json({ error: 'product_id required' }, 400)
    if (!body.starts_at)   return json({ error: 'starts_at required' }, 400)
    if (!body.stops_at)    return json({ error: 'stops_at required' }, 400)
    const gate = await loadBusinessAuthorised(req, body.business_id)
    if (!gate.ok) return json({ error: gate.error }, gate.status)
    const { booqable_subdomain, booqable_api_key } = gate.business
    if (!booqable_subdomain || !booqable_api_key) {
      return json({ ok: false, reason: 'missing_credentials' }, 400)
    }

    try {
      // Two-call approach:
      //   1. GET /api/1/products/:id — the stock count for this product
      //   2. GET /api/1/orders?item_id=:id&starts_at_lte&stops_at_gte — overlapping active orders
      // remaining = stock - overlapping_quantity.
      const [prodRes, ordersRes] = await Promise.all([
        booqableFetch(booqable_subdomain, booqable_api_key, `/api/1/products/${body.product_id}`),
        booqableFetch(booqable_subdomain, booqable_api_key, `/api/1/orders?filter[status]=reserved,started&per_page=100`),
      ])
      if (!prodRes.ok) {
        const txt = await prodRes.text().catch(() => '')
        return json({ ok: false, reason: `booqable_product_${prodRes.status}`, detail: txt.slice(0, 200) }, 502)
      }
      const prodData = await prodRes.json().catch(() => null) as { product?: Record<string, unknown> } | null
      const stockCount = Number(prodData?.product?.stock_count)
      const stock = Number.isFinite(stockCount) && stockCount > 0 ? stockCount : 0

      let overlappingQty = 0
      if (ordersRes.ok) {
        const ordersData = await ordersRes.json().catch(() => null) as { orders?: Array<Record<string, unknown>> } | null
        const orders = Array.isArray(ordersData?.orders) ? ordersData!.orders! : []
        const reqStart = new Date(body.starts_at).getTime()
        const reqStop  = new Date(body.stops_at).getTime()
        for (const o of orders) {
          const oStart = new Date(String(o.starts_at || '')).getTime()
          const oStop  = new Date(String(o.stops_at  || '')).getTime()
          if (!Number.isFinite(oStart) || !Number.isFinite(oStop)) continue
          // Overlap = NOT (oStop < reqStart OR oStart > reqStop)
          if (oStop >= reqStart && oStart <= reqStop) {
            const items = Array.isArray((o as { items?: Array<{ item_id?: string; quantity?: number }> }).items) ? (o as { items: Array<{ item_id?: string; quantity?: number }> }).items : []
            for (const it of items) {
              if (String(it.item_id) === body.product_id) {
                overlappingQty += Number(it.quantity) || 1
              }
            }
          }
        }
      }

      return json({ ok: true, stock, overlapping: overlappingQty, remaining: Math.max(0, stock - overlappingQty) })
    } catch (e) {
      return json({ ok: false, reason: 'network_error', detail: (e as Error).message }, 500)
    }
  }

  // ── test_connection ──────────────────────────────────────────
  if (op === 'test_connection') {
    if (!body.business_id) return json({ error: 'business_id required' }, 400)
    const gate = await loadBusinessAuthorised(req, body.business_id)
    if (!gate.ok) return json({ error: gate.error }, gate.status)
    const { booqable_subdomain, booqable_api_key } = gate.business
    if (!booqable_subdomain || !booqable_api_key) {
      return json({ ok: true, connected: false, reason: 'missing_credentials' })
    }
    try {
      const r = await booqableFetch(booqable_subdomain, booqable_api_key, '/api/1/products?per_page=1')
      if (!r.ok) {
        const txt = await r.text().catch(() => '')
        return json({ ok: true, connected: false, reason: `booqable_${r.status}`, detail: txt.slice(0, 200) })
      }
      const data = await r.json().catch(() => null) as { meta?: { total_count?: number }; products?: unknown[] } | null
      const productCount = data?.meta?.total_count ?? (Array.isArray(data?.products) ? data!.products!.length : 0)
      return json({ ok: true, connected: true, product_count: productCount })
    } catch (e) {
      return json({ ok: true, connected: false, reason: 'network_error', detail: (e as Error).message })
    }
  }

  // ── reserve / release ────────────────────────────────────────
  // Both need a booking_id and are server-to-server (service role).
  const bookingId = String(body.booking_id || '').trim()
  if (!bookingId) return json({ error: 'booking_id required' }, 400)

  const auth = req.headers.get('Authorization') || ''
  if (!auth.startsWith('Bearer ') || auth.replace(/^Bearer\s+/i, '').trim() !== SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'reserve/release require service-role bearer' }, 401)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: booking, error: bkErr } = await supabase
    .from('bookings')
    .select('id, business_id, offering_type, booking_date, end_date, start_time, rental_addons, booqable_order_id')
    .eq('id', bookingId)
    .maybeSingle()
  if (bkErr) return json({ error: bkErr.message }, 500)
  if (!booking) return json({ error: 'Booking not found' }, 404)
  if (!booking.end_date) return json({ ok: true, synced: false, reason: 'not_a_rental' })

  const { data: biz, error: bizErr } = await supabase
    .from('businesses')
    .select('booqable_subdomain, booqable_api_key, session_offerings')
    .eq('id', booking.business_id)
    .maybeSingle()
  if (bizErr) return json({ error: bizErr.message }, 500)
  if (!biz)   return json({ error: 'Business not found' }, 404)
  if (!biz.booqable_subdomain || !biz.booqable_api_key) {
    return json({ ok: true, synced: false, reason: 'booqable_not_configured' })
  }

  const offerings: Array<{ type?: string; kind?: string; booqable_product_id?: string }> = Array.isArray(biz.session_offerings) ? biz.session_offerings : []
  const off = offerings.find(o => o?.type === booking.offering_type && o?.kind === 'rental')
  const productId = off?.booqable_product_id

  // ── release ────────────────────────────────────────────────
  if (op === 'release') {
    if (!booking.booqable_order_id) return json({ ok: true, synced: false, reason: 'no_order_to_release' })
    try {
      const r = await booqableFetch(biz.booqable_subdomain, biz.booqable_api_key, `/api/1/orders/${booking.booqable_order_id}`, { method: 'DELETE' })
      if (!r.ok) {
        const txt = await r.text().catch(() => '')
        console.error('booqable-sync release failed', r.status, txt)
        return json({ ok: false, synced: false, reason: `booqable_${r.status}`, detail: txt.slice(0, 200) })
      }
      await supabase.from('bookings').update({ booqable_order_id: null }).eq('id', bookingId)
      return json({ ok: true, synced: true, released: true })
    } catch (e) {
      return json({ ok: false, synced: false, reason: 'network_error', detail: (e as Error).message })
    }
  }

  // ── reserve ────────────────────────────────────────────────
  if (op === 'reserve') {
    if (!productId) return json({ ok: true, synced: false, reason: 'no_booqable_product_id_on_offering' })
    if (booking.booqable_order_id) return json({ ok: true, synced: false, reason: 'already_reserved', order_id: booking.booqable_order_id })

    // Booqable orders take starts_at / stops_at datetimes. Anchor
    // pickup on the customer-picked start_time (falls back to 09:00
    // for legacy rentals) and return at 18:00 on the end date.
    const pickupTime = String(booking.start_time || '09:00').slice(0, 5)
    const startsAt = `${booking.booking_date}T${pickupTime}:00Z`
    const stopsAt  = `${booking.end_date}T18:00:00Z`

    try {
      const r = await booqableFetch(biz.booqable_subdomain, biz.booqable_api_key, '/api/1/orders', {
        method: 'POST',
        body: JSON.stringify({
          order: {
            starts_at: startsAt,
            stops_at:  stopsAt,
            items:     [{ item_id: productId, quantity: 1 }],
          },
        }),
      })
      if (!r.ok) {
        const txt = await r.text().catch(() => '')
        console.error('booqable-sync reserve failed', r.status, txt)
        return json({ ok: false, synced: false, reason: `booqable_${r.status}`, detail: txt.slice(0, 200) })
      }
      const data = await r.json().catch(() => null) as { order?: { id?: string } } | null
      const orderId = data?.order?.id
      if (orderId) {
        await supabase.from('bookings').update({ booqable_order_id: orderId }).eq('id', bookingId)
      }
      return json({ ok: true, synced: true, order_id: orderId })
    } catch (e) {
      return json({ ok: false, synced: false, reason: 'network_error', detail: (e as Error).message })
    }
  }

  return json({ error: 'op must be reserve|release|test_connection|sync_catalog|check_availability' }, 400)
})
