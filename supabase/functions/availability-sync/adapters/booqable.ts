import type { AvailabilityAdapter, AvailabilityRow } from '../../_shared/availability_types.ts'

// Booqable adapter — pulls per-product per-day availability for the
// next 30 days.
//
// Two calls per sync:
//   1. GET /api/1/products?per_page=100        — id → name map
//   2. GET /api/boomerang/availabilities       — per-product per-day
//                                                 quantity_available
//                                                 (widget endpoint;
//                                                 same store subdomain,
//                                                 accepts bearer auth)
//
// External id is <product_uuid>:<YYYY-MM-DD> so re-runs upsert cleanly
// without duplicating.

const HORIZON_DAYS = 30

interface BqProduct {
  id: string
  name?: string
  stock_count?: number
}

interface BqAvailability {
  product_id?: string
  date?: string
  quantity_available?: number
  total_stock?: number
}

async function bqFetch(subdomain: string, apiKey: string, path: string, debugHeaders: boolean, partnerId: number): Promise<Response> {
  const url = `https://${subdomain}.booqable.com${path.startsWith('/') ? '' : '/'}${path}`
  const r = await fetch(url, { headers: { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json' } })
  if (debugHeaders) {
    const hdrs: Record<string, string> = {}
    r.headers.forEach((v, k) => { hdrs[k] = v })
    console.log(`[booqable headers partner=${partnerId} path=${path}]`, JSON.stringify(hdrs))
  }
  return r
}

function madridDateStr(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d)
  return `${parts.find(p => p.type === 'year')!.value}-${parts.find(p => p.type === 'month')!.value}-${parts.find(p => p.type === 'day')!.value}`
}

// Iterate-once DST correction, same pattern as send-booking-reminders.
function madridLocalToUtcIso(dateStr: string, timeStr: string): string {
  const off = (x: Date) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Madrid', hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(x).map(k => [k.type, k.value] as const))
    return (Date.UTC(+p.year, +p.month - 1, +p.day, +(p.hour === '24' ? '00' : p.hour), +p.minute, +p.second) - x.getTime()) / 60000
  }
  const naive = new Date(`${dateStr}T${timeStr}:00Z`)
  const first = new Date(naive.getTime() - off(naive) * 60000)
  return new Date(naive.getTime() - off(first) * 60000).toISOString()
}

export const booqableAdapter: AvailabilityAdapter = {
  source: 'booqable',
  async fetchAvailability({ partnerId, config, token, debugHeaders }): Promise<AvailabilityRow[]> {
    const subdomain = config.subdomain
    if (typeof subdomain !== 'string' || !subdomain) {
      throw new Error('booqable: sync_config.subdomain missing')
    }
    if (!token) throw new Error('booqable: token missing (check sync_secret_name in Vault)')

    // ── Products ───────────────────────────────────────────────
    const prodRes = await bqFetch(subdomain, token, '/api/1/products?per_page=100', debugHeaders, partnerId)
    if (!prodRes.ok) {
      const txt = await prodRes.text().catch(() => '')
      throw new Error(`booqable products HTTP ${prodRes.status} — ${txt.slice(0, 200)}`)
    }
    const prodData = await prodRes.json().catch(() => null) as { products?: BqProduct[] } | null
    const products = Array.isArray(prodData?.products) ? prodData!.products! : []
    const nameById = new Map<string, string>()
    const totalStockById = new Map<string, number>()
    for (const p of products) {
      if (!p.id) continue
      nameById.set(String(p.id), String(p.name || 'Rental'))
      if (Number.isFinite(p.stock_count)) totalStockById.set(String(p.id), Number(p.stock_count))
    }
    if (products.length === 0) return []

    // ── Availabilities ─────────────────────────────────────────
    const now = new Date()
    const fromStr = madridDateStr(now)
    const tillStr = madridDateStr(new Date(now.getTime() + HORIZON_DAYS * 86400000))
    const availUrl =
      `/api/boomerang/availabilities` +
      `?filter[from]=${fromStr}` +
      `&filter[till]=${tillStr}` +
      `&per_page=1000`
    const availRes = await bqFetch(subdomain, token, availUrl, debugHeaders, partnerId)
    if (!availRes.ok) {
      const txt = await availRes.text().catch(() => '')
      throw new Error(`booqable availabilities HTTP ${availRes.status} — ${txt.slice(0, 200)}`)
    }
    const availData = await availRes.json().catch(() => null) as
      | { data?: Array<{ attributes?: BqAvailability } | BqAvailability> }
      | { availabilities?: BqAvailability[] }
      | null

    // Boomerang returns JSON:API-style { data: [{ attributes: {…} }] };
    // some deployments return { availabilities: [{…}] } flat. Handle both.
    const raw: BqAvailability[] =
      Array.isArray((availData as { data?: unknown })?.data)
        ? (availData as { data: Array<{ attributes?: BqAvailability } | BqAvailability> }).data.map(x =>
            (x && typeof x === 'object' && 'attributes' in x && x.attributes)
              ? x.attributes as BqAvailability
              : x as BqAvailability)
        : Array.isArray((availData as { availabilities?: BqAvailability[] })?.availabilities)
          ? (availData as { availabilities: BqAvailability[] }).availabilities
          : []

    const rows: AvailabilityRow[] = []
    for (const a of raw) {
      const pid = a.product_id ? String(a.product_id) : null
      const date = a.date
      if (!pid || !date) continue
      if (!nameById.has(pid)) continue // ignore availabilities for products we didn't list

      const qty = Math.max(0, Number(a.quantity_available ?? 0))
      const cap = Number.isFinite(a.total_stock)
        ? Number(a.total_stock)
        : (totalStockById.get(pid) ?? null)

      rows.push({
        external_id:   `${pid}:${date}`,
        partner_id:    partnerId,
        kind:          'item',
        title:         nameById.get(pid)!,
        start_at:      madridLocalToUtcIso(date, '09:00'),
        end_at:        madridLocalToUtcIso(date, '18:00'),
        duration_min:  null,
        available_qty: qty,
        capacity:      cap,
        status:        'active',
        meta: {
          product_id: pid,
          date,
        },
      })
    }
    return rows
  },
}
