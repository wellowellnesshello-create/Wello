import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

// CORS — open to all origins since this is called from the partner onboarding
// flow in any browser. The proxy itself doesn't expose anything sensitive;
// credentials are passed per-request in the body.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  try {
    const { userId, apiKey, endpoint, method = 'GET', body } = await req.json()

    if (!userId || !apiKey || !endpoint) {
      return json({ error: 'Missing required fields: userId, apiKey, endpoint' }, 400)
    }

    // Acuity uses HTTP Basic Auth: base64(userId:apiKey)
    const auth = btoa(`${userId}:${apiKey}`)
    const path = String(endpoint).replace(/^\/+/, '')
    const url = `https://acuityscheduling.com/api/v1/${path}`

    const acuityRes = await fetch(url, {
      method,
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    })

    // Acuity sometimes returns non-JSON on errors (HTML for 5xx). Be defensive.
    const text = await acuityRes.text()
    let data: unknown
    try { data = text ? JSON.parse(text) : null } catch { data = { raw: text } }

    if (!acuityRes.ok) {
      const message =
        (data as { message?: string; error?: string })?.message ||
        (data as { message?: string; error?: string })?.error ||
        (acuityRes.status === 401
          ? 'Invalid Acuity User ID or API key.'
          : `Acuity returned HTTP ${acuityRes.status}.`)
      return json({ error: message, status: acuityRes.status, body: data }, acuityRes.status)
    }

    return json(data)
  } catch (e) {
    return json({ error: (e as Error).message || 'Unexpected error in acuity-proxy' }, 500)
  }
})
