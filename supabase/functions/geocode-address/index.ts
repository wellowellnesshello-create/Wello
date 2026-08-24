// Resolve a Mallorca street address to {lat, lng} via Nominatim (the free
// OSM geocoder). Called from the partner dashboard on address save + from
// the admin backfill flow. Two hardened bits:
//
//   1. **Rate limit.** Nominatim's usage policy is one request per second.
//      This function enforces that itself via an in-memory "last hit"
//      timestamp — Deno reuses instances between invocations enough to
//      make it meaningful, though on cold start we still wait an extra
//      second to be safe.
//
//   2. **User-Agent.** Nominatim will 403 requests without one. We send
//      "Wello Wellness Pass (hello@wello-wellness.com)" per their
//      contact-name policy so if we misbehave they can email us.
//
// Response shape:
//   { ok: true,  lat: 39.57, lng: 2.65, display_name: "Palma, ..." }
//   { ok: false, reason: "no_match" }        // valid call, zero results
//   { ok: false, reason: "..." }             // upstream error / bad input
//
// The client persists lat/lng/geocoded_from/geocode_failed itself so this
// function stays pure — no DB writes here means no service_role secret in
// the function, and admin can dry-run a lookup without side effects.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const UA = 'Wello Wellness Pass (hello@wello-wellness.com)'
const MIN_INTERVAL_MS = 1100  // Nominatim: max 1 req/sec; small buffer.

let lastCallAt = 0

async function throttle() {
  const now  = Date.now()
  const wait = Math.max(0, MIN_INTERVAL_MS - (now - lastCallAt))
  if (wait > 0) await new Promise(r => setTimeout(r, wait))
  lastCallAt = Date.now()
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')    return json({ ok: false, reason: 'POST only' }, 405)

  let body: { address?: string }
  try { body = await req.json() }
  catch { return json({ ok: false, reason: 'invalid_json' }, 400) }

  const raw = typeof body.address === 'string' ? body.address.trim() : ''
  if (raw.length < 4) return json({ ok: false, reason: 'address_too_short' }, 400)

  // Bias to Mallorca / Balearic Islands so a bare "Palma" resolves in
  // Spain rather than, say, Palma del Río (Andalucía). countrycodes=es
  // narrows to Spain; the viewbox is roughly the Mallorca bounding box
  // and `bounded=1` makes it a hard filter.
  const params = new URLSearchParams({
    format:        'json',
    q:             raw + (raw.toLowerCase().includes('mallorca') ? '' : ', Mallorca'),
    countrycodes:  'es',
    viewbox:       '2.3,40.1,3.4,39.2',
    bounded:       '1',
    limit:         '1',
    addressdetails: '0',
  })
  const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`

  await throttle()

  let upstream: Response
  try {
    upstream = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } })
  } catch (e) {
    return json({ ok: false, reason: 'network_error', detail: (e as Error).message }, 502)
  }
  if (!upstream.ok) {
    return json({ ok: false, reason: 'upstream_error', status: upstream.status }, 502)
  }

  let arr: Array<{ lat?: string; lon?: string; display_name?: string }>
  try { arr = await upstream.json() }
  catch { return json({ ok: false, reason: 'upstream_bad_json' }, 502) }

  if (!Array.isArray(arr) || arr.length === 0) {
    // Legit "no match" — the address is well-formed but Nominatim doesn't
    // know it. The client should still persist geocoded_from + set
    // geocode_failed=true so we don't retry on every save.
    return json({ ok: false, reason: 'no_match' })
  }

  const hit = arr[0]
  const lat = Number(hit.lat)
  const lng = Number(hit.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return json({ ok: false, reason: 'upstream_bad_coords' }, 502)
  }
  return json({ ok: true, lat, lng, display_name: hit.display_name || null })
})
