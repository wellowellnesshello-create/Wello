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

// Build a cascade of query strings, most-specific → most-forgiving.
// Real partner addresses often have flat suffixes ("113a"), postcodes,
// district phrases ("Platja de Palma i Pla de Sant Jordi"), and country
// tails ("Illes Balears, Spain") that Nominatim chokes on when combined.
// If the full query returns zero hits we try progressively simpler
// variants until one lands or we run out of ideas.
function buildAddressVariants(raw: string): string[] {
  const variants: string[] = []
  const add = (s: string) => {
    const trimmed = s.replace(/\s+/g, ' ').trim().replace(/^,\s*|\s*,\s*$/g, '')
    if (trimmed.length >= 4 && !variants.includes(trimmed)) variants.push(trimmed)
  }
  const withMallorca = (s: string) => s.toLowerCase().includes('mallorca') ? s : `${s}, Mallorca`

  // 0. As typed (plus ", Mallorca" if missing) — some addresses ARE well
  //    enough formed for the full query to resolve.
  add(withMallorca(raw))

  // 1. Strip the country / region tail. Nominatim's countrycodes=es
  //    already scopes to Spain so these tails are noise, and their
  //    presence sometimes confuses the parser.
  let stripped = raw
    .replace(/,?\s*(illes?\s+balears?|balearic\s+islands?|españa|espana|spain)\b/gi, '')
    .replace(/,?\s*\d{5}\b/g, '') // 5-digit Spanish postcode
  add(withMallorca(stripped))

  // 2. Drop flat / letter suffixes after house numbers ("113a" → "113",
  //    "10 bis" → "10", "5-B" → "5"). Common in Spanish addresses.
  const noFlatSuffix = stripped.replace(/(\d+)\s*[-\s]?[a-zA-Z](?![a-zA-Z])/g, '$1')
  add(withMallorca(noFlatSuffix))

  // 3. Just the first meaningful segment (street + number) + the
  //    town name if we can detect one. Split on commas and take the
  //    first non-empty part as the street; scan the rest for a known
  //    Mallorca town so a full-address paste still lands.
  const parts = stripped.split(',').map(p => p.trim()).filter(Boolean)
  if (parts.length > 1) {
    const street = parts[0]
    const townPart = parts.slice(1).find(p =>
      /\b(palma|alcudia|andratx|arta|calvi[àa]|dei[àa]|inca|manacor|pollen[çc]a|santany[íi]|s[óo]ller|valldemossa|magaluf|felanitx|llucmajor|port|cala|es\s+trenc|es\s+molinar|portitxol)\b/i.test(p)
    ) || parts[1]
    add(withMallorca(`${street}, ${townPart}`))
    add(withMallorca(street))
  }

  return variants
}

async function nominatimSearch(q: string): Promise<{ lat: number; lng: number; display_name: string | null } | null> {
  const params = new URLSearchParams({
    format:         'json',
    q,
    countrycodes:   'es',
    viewbox:        '2.3,40.1,3.4,39.2',
    bounded:        '1',
    limit:          '1',
    addressdetails: '0',
  })
  const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`
  await throttle()
  let upstream: Response
  try { upstream = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } }) }
  catch { return null }
  if (!upstream.ok) return null
  let arr: Array<{ lat?: string; lon?: string; display_name?: string }>
  try { arr = await upstream.json() } catch { return null }
  if (!Array.isArray(arr) || arr.length === 0) return null
  const lat = Number(arr[0].lat)
  const lng = Number(arr[0].lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng, display_name: arr[0].display_name || null }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')    return json({ ok: false, reason: 'POST only' }, 405)

  let body: { address?: string }
  try { body = await req.json() }
  catch { return json({ ok: false, reason: 'invalid_json' }, 400) }

  const raw = typeof body.address === 'string' ? body.address.trim() : ''
  if (raw.length < 4) return json({ ok: false, reason: 'address_too_short' }, 400)

  const variants = buildAddressVariants(raw)
  for (const q of variants) {
    const hit = await nominatimSearch(q)
    if (hit) {
      return json({ ok: true, lat: hit.lat, lng: hit.lng, display_name: hit.display_name, matched_query: q })
    }
  }
  return json({ ok: false, reason: 'no_match', tried: variants.length })
})
