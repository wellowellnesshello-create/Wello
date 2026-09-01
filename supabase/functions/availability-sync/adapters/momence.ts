import type { AvailabilityAdapter, AvailabilityRow } from '../../_shared/availability_types.ts'

// Momence legacy Events endpoint. One call returns upcoming events for
// the host; response shape (per momence public docs):
//   { id, title, dateTime, duration, capacity, spotsRemaining,
//     isCancelled, isDeleted, teacher, teacherId, location, image,
//     link, type, tags, ... }
//
// hostId + token come from businesses.sync_config.host_id + the Vault
// secret whose name is on businesses.sync_secret_name. Auth is via
// query-string token (Momence convention).

const BASE = 'https://momence.com/_api/primary/api/v1/Events'

interface MomenceEvent {
  id: number | string
  title?: string
  dateTime?: string
  duration?: number
  capacity?: number
  spotsRemaining?: number
  isCancelled?: boolean
  isDeleted?: boolean
  teacher?: string
  teacherId?: number | string
  location?: string
  image?: string
  link?: string
  type?: string
  tags?: unknown
}

export const momenceAdapter: AvailabilityAdapter = {
  source: 'momence',
  async fetchAvailability({ partnerId, config, token, debugHeaders }): Promise<AvailabilityRow[]> {
    const hostId = config.host_id
    if (!hostId) throw new Error('momence: sync_config.host_id missing')
    if (!token)  throw new Error('momence: token missing (check sync_secret_name in Vault)')

    const url = `${BASE}?hostId=${encodeURIComponent(String(hostId))}&token=${encodeURIComponent(token)}`
    const r = await fetch(url, { headers: { 'Accept': 'application/json' } })

    if (debugHeaders) {
      const hdrs: Record<string, string> = {}
      r.headers.forEach((v, k) => { hdrs[k] = v })
      console.log(`[momence headers partner=${partnerId}]`, JSON.stringify(hdrs))
    }

    if (!r.ok) {
      const txt = await r.text().catch(() => '')
      throw new Error(`momence: HTTP ${r.status} — ${txt.slice(0, 200)}`)
    }

    const data = await r.json().catch(() => null) as
      | MomenceEvent[]
      | { events?: MomenceEvent[]; data?: MomenceEvent[] }
      | null

    // Response is documented as an array; guard against a wrapped
    // { events: [...] } / { data: [...] } shape that some Momence
    // endpoints return.
    const events: MomenceEvent[] = Array.isArray(data)
      ? data
      : Array.isArray(data?.events) ? data!.events!
      : Array.isArray(data?.data)   ? data!.data!
      : []

    const rows: AvailabilityRow[] = []
    for (const e of events) {
      if (e.id == null || !e.dateTime) continue
      const cancelled = !!(e.isCancelled || e.isDeleted)
      rows.push({
        external_id:   String(e.id),
        partner_id:    partnerId,
        kind:          'session',
        title:         String(e.title || 'Untitled'),
        start_at:      new Date(e.dateTime).toISOString(),
        end_at:        null,
        duration_min:  Number.isFinite(e.duration) ? Number(e.duration) : null,
        available_qty: Math.max(0, Number(e.spotsRemaining ?? 0)),
        capacity:      Number.isFinite(e.capacity) ? Number(e.capacity) : null,
        status:        cancelled ? 'cancelled' : 'active',
        meta: {
          teacher:     e.teacher ?? null,
          teacher_id:  e.teacherId ?? null,
          location:    e.location ?? null,
          image:       e.image ?? null,
          link:        e.link ?? null,
          type:        e.type ?? null,
          tags:        e.tags ?? null,
        },
      })
    }
    return rows
  },
}
