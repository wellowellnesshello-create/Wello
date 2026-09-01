// Shared shape between availability-sync adapters and the orchestrator.
// Every adapter returns AvailabilityRow[]; the orchestrator upserts them
// into slots keyed on (listing_id, source, external_id).

export interface AvailabilityRow {
  // Upsert key — unique per (partner, source). Adapter guarantees
  // stability across runs so re-runs reconcile rather than duplicate.
  external_id: string

  // What & where
  partner_id: number              // Wello businesses.id
  kind: 'session' | 'item'        // class instance vs rentable item
  title: string                   // human-readable, used for offering match

  // When (all timestamps ISO 8601 UTC)
  start_at: string
  end_at: string | null           // date-range items; null for sessions
  duration_min: number | null     // sessions; null for items with end_at

  // Availability
  available_qty: number           // spotsRemaining / inventory - reserved
  capacity: number | null         // max total, informational
  status: 'active' | 'cancelled' | 'paused'

  // Passthrough for adapter-specific extras (teacher, room, image, ...)
  meta: Record<string, unknown>
}

// Adapter contract. Orchestrator loads sync_config + Vault-resolved
// token, calls fetchAvailability, hands the rows to the upsert loop.
// Throw on any hard failure — the orchestrator catches, records
// sync_last_error on the business row, and preserves the last known
// state (no slot writes on failure).
export interface AvailabilityAdapter {
  source: string
  fetchAvailability(input: {
    partnerId: number
    config: Record<string, unknown>
    token: string
    debugHeaders: boolean          // orchestrator flips true for first N runs
  }): Promise<AvailabilityRow[]>
}
