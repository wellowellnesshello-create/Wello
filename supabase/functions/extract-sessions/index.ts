import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireAdmin } from '../_shared/admin_auth.ts'

// Internal admin-only edge function.
//
// Accepts a studio's timetable/price list as an image (jpg/png), a PDF, or
// pasted text and asks Claude to convert it into Wello's session schema
// (see EXTRACTION_SCHEMA below). No writes to businesses/slots happen here.
// Every call is logged to admin_extractions for QA (including the admin
// user id who ran the extraction).
//
// Gated by requireAdmin(). verify_jwt = true is not enough because the anon
// key is a valid JWT; requireAdmin additionally verifies the caller is on
// the ADMIN_USER_IDS allowlist.

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const MODEL = 'claude-sonnet-4-6'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SYSTEM_PROMPT = `You are Wello's internal timetable parser. You receive a studio's timetable, price list, or menu of services and convert it into strict JSON.

Return ONLY valid JSON matching this schema:

{
  "sessions": [
    {
      "name": string,
      "kind": "class" | "appointment",
      "duration_minutes": number | null,
      "price_eur": number | null,
      "capacity": number | null,
      "description": string | null,
      "schedule": [{ "day": "mon"|"tue"|"wed"|"thu"|"fri"|"sat"|"sun", "time": "HH:MM" }] | null,
      "confidence_flags": [string]
    }
  ]
}

Rules you MUST follow:
- Prices: use drop-in / single-session rates only. Ignore memberships, class packs, monthly passes, or multi-session bundles. If two drop-in prices exist for the same session (e.g. member vs non-member), pick the standard non-member drop-in and add a confidence flag naming the alternative.
- Currency: credits equal euros one for one. Assume prices are in EUR unless the source is explicit about another currency. If another currency is stated, convert nothing and add a confidence flag.
- Kind: a "class" is a scheduled group session (yoga, pilates, breathwork, sound healing, fitness classes, meditation groups). An "appointment" is a bookable treatment or 1-to-1 slot (any massage, private session, therapy, consultation). Treatments always have kind "appointment" and schedule: null even if the studio lists them under fixed times.
- Schedule: only for kind "class". Use 24-hour "HH:MM". Day codes are the three-letter lowercase forms above. If a class runs multiple days at the same time, include one entry per day. If a class has no visible time, set schedule to null and add a confidence flag.
- Capacity: only set if explicitly stated. Never invent a number. Leave null and add a "capacity not stated" flag if missing.
- Duration: parse from the source. If a treatment lists multiple lengths (e.g. 30/60/90 min massage), create one session row per length, naming each clearly (e.g. "Deep Tissue Massage 60 min"). If no duration is given, set null and add a flag.
- Confidence flags: short human-readable strings, one per uncertainty. Examples: "capacity not stated", "price ambiguous between drop-in and member rate", "no time visible on source", "duration missing", "currency unclear".
- Never invent sessions the source does not name. Never merge two distinct offerings into one row.
- Output MUST be valid JSON. No prose, no markdown, no code fences.`

interface ExtractRequest {
  business_id?: number | string | null
  business_type?: string | null
  input_kind: 'image' | 'pdf' | 'text'
  // base64 payload (no data: prefix) for image | pdf
  file_base64?: string
  // "image/jpeg" | "image/png" | "application/pdf"
  file_media_type?: string
  // text alternative when input_kind === 'text'
  text?: string
}

function stripJsonFences(s: string): string {
  return s.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
}

function buildUserContent(req: ExtractRequest): unknown[] {
  const ctx = req.business_type
    ? `Business type: ${req.business_type}. Extract every distinct session on offer.`
    : `Extract every distinct session on offer.`

  if (req.input_kind === 'text') {
    return [{ type: 'text', text: `${ctx}\n\nTimetable / price list:\n\n${req.text ?? ''}` }]
  }

  if (req.input_kind === 'image') {
    return [
      { type: 'text', text: ctx },
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: req.file_media_type || 'image/jpeg',
          data: req.file_base64,
        },
      },
    ]
  }

  // pdf
  return [
    { type: 'text', text: ctx },
    {
      type: 'document',
      source: {
        type: 'base64',
        media_type: 'application/pdf',
        data: req.file_base64,
      },
    },
  ]
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const gate = await requireAdmin(req)
  if (!gate.ok) return gate.response
  const adminUserId = gate.userId

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  let body: ExtractRequest
  try {
    body = await req.json()
  } catch (_e) {
    return new Response(JSON.stringify({ error: 'Invalid JSON body.' }), {
      status: 400,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  if (!body?.input_kind || !['image', 'pdf', 'text'].includes(body.input_kind)) {
    return new Response(JSON.stringify({ error: 'input_kind must be image, pdf, or text.' }), {
      status: 400,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
  if (body.input_kind === 'text' && !body.text?.trim()) {
    return new Response(JSON.stringify({ error: 'text is required when input_kind is text.' }), {
      status: 400,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
  if ((body.input_kind === 'image' || body.input_kind === 'pdf') && !body.file_base64) {
    return new Response(JSON.stringify({ error: 'file_base64 is required for image or pdf input.' }), {
      status: 400,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  const businessId = body.business_id == null || body.business_id === ''
    ? null
    : Number(body.business_id)

  let rawText = ''
  let parsed: unknown = null
  let errText: string | null = null

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildUserContent(body) }],
      }),
    })

    const d = await r.json()
    if (!r.ok) {
      errText = d?.error?.message || `Anthropic HTTP ${r.status}`
    } else {
      rawText = (d?.content || [])
        .map((b: { type?: string; text?: string }) => (b?.type === 'text' ? b.text || '' : ''))
        .join('')
      try {
        parsed = JSON.parse(stripJsonFences(rawText))
      } catch (_e) {
        errText = 'Model returned non-JSON output.'
      }
    }
  } catch (e) {
    errText = e instanceof Error ? e.message : String(e)
  }

  // Best-effort log; never fail the request because of a log failure.
  try {
    await supabase.from('admin_extractions').insert({
      admin_user_id: adminUserId,
      business_id: businessId,
      input_kind: body.input_kind,
      model: MODEL,
      raw_json: parsed,
      raw_text: rawText || null,
      error: errText,
    })
  } catch (e) {
    console.error('admin_extractions insert failed:', e)
  }

  if (errText) {
    return new Response(JSON.stringify({ error: errText, raw_text: rawText }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ result: parsed, model: MODEL }), {
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
})
