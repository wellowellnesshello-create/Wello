// One-shot backfill for partners created before geocode-on-save shipped.
// Finds every business with a populated address and null geocoded_from,
// runs Nominatim on each at 1 req/sec, writes lat/lng/geocoded_from/
// geocode_failed. Admin-invokes it via the admin dashboard.
//
// Idempotent: geocoded_from acts as the marker for "already tried". A row
// with geocode_failed=true is skipped on subsequent runs (admin fixes the
// address, which clears geocoded_from via saveSettings, which re-triggers
// the geocode). Pass `?force=1` in the body to re-geocode everything
// including previous failures — useful after a batch of address fixes.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireAdmin } from '../_shared/admin_auth.ts'

const SUPABASE_URL             = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const UA = 'Wello Wellness Pass (hello@wello-wellness.com)'
const MIN_INTERVAL_MS = 1100

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

async function geocode(address: string): Promise<{ ok: boolean; lat?: number; lng?: number }> {
  const params = new URLSearchParams({
    format:        'json',
    q:             address + (address.toLowerCase().includes('mallorca') ? '' : ', Mallorca'),
    countrycodes:  'es',
    viewbox:       '2.3,40.1,3.4,39.2',
    bounded:       '1',
    limit:         '1',
    addressdetails: '0',
  })
  const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } })
    if (!r.ok) return { ok: false }
    const arr = await r.json() as Array<{ lat?: string; lon?: string }>
    if (!Array.isArray(arr) || arr.length === 0) return { ok: false }
    const lat = Number(arr[0].lat), lng = Number(arr[0].lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { ok: false }
    return { ok: true, lat, lng }
  } catch { return { ok: false } }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')    return json({ error: 'POST only' }, 405)

  const gate = await requireAdmin(req)
  if (!gate.ok) return gate.response

  let body: { force?: boolean } = {}
  try { body = await req.json() } catch { /* empty body is fine */ }
  const force = !!body.force

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Pull the work queue up front — we don't want the row set to shift
  // under us as saveSettings calls in parallel add/remove candidates.
  let q = supabase.from('businesses').select('id, address, geocoded_from, geocode_failed').not('address', 'is', null)
  if (!force) q = q.is('geocoded_from', null)
  const { data: rows, error } = await q
  if (error) return json({ error: error.message }, 500)

  const results: Array<{ id: number; ok: boolean; reason?: string }> = []
  for (const row of (rows || [])) {
    const address = String(row.address || '').trim()
    if (address.length < 4) {
      results.push({ id: row.id, ok: false, reason: 'address_too_short' })
      continue
    }
    const geo = await geocode(address)
    const patch = geo.ok
      ? { lat: geo.lat, lng: geo.lng, geocoded_from: address, geocode_failed: false }
      : { geocoded_from: address, geocode_failed: true }
    const { error: pErr } = await supabase.from('businesses').update(patch).eq('id', row.id)
    if (pErr) results.push({ id: row.id, ok: false, reason: 'db_update_failed' })
    else      results.push({ id: row.id, ok: geo.ok, reason: geo.ok ? undefined : 'no_match' })
    // Rate-limit courtesy — Nominatim allows 1 req/sec.
    await new Promise(r => setTimeout(r, MIN_INTERVAL_MS))
  }

  return json({
    processed: results.length,
    succeeded: results.filter(r => r.ok).length,
    failed:    results.filter(r => !r.ok).length,
    results,
  })
})
