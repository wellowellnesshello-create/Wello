import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Resend Segments sync.
//
// Keeps a Resend Segment in step with profiles.marketing_opt_in so the
// launch / marketing broadcasts fire to the people who actually consented,
// no manual export/import required.
//
// Called by:
//   * App.jsx Settings → Email preferences toggle (user JWT)
//   * App.jsx pre-launch "Notify me at launch" modal (user JWT)
//   * marketing-unsubscribe edge fn (service role, on one-click unsubscribe)
//   * delete-account edge fn (service role, on account deletion)
//
// Auth model: either
//   (a) valid user JWT whose email matches the requested email, OR
//   (b) X-Cron-Token matching CRON_INVOKE_SECRET (server-to-server path)
// The (b) path lets other edge fns call this one without shipping a JWT.
//
// No-ops gracefully when RESEND_API_KEY or RESEND_SEGMENT_ID isn't set,
// so the app still works before the Resend segment is created.
//
// Migration note (2026-09): Resend renamed Audiences → Segments and moved
// membership onto contact-scoped endpoints:
//   OLD: POST   /audiences/{aud_id}/contacts        (single call, deprecated)
//   NEW: POST   /contacts                           (create/find the contact)
//        POST   /contacts/{contact_id}/segments     (attach to a segment)
// The old RESEND_AUDIENCE_ID env is still read as a fallback for one
// release cycle so a stale secret doesn't silently break things.

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY            = Deno.env.get('RESEND_API_KEY')       || ''
// Prefer RESEND_SEGMENT_ID; fall back to RESEND_AUDIENCE_ID so a project that
// still has the old secret configured keeps working after the fn deploys.
const RESEND_SEGMENT_ID         = (Deno.env.get('RESEND_SEGMENT_ID') || Deno.env.get('RESEND_AUDIENCE_ID') || '').trim()
const CRON_INVOKE_SECRET        = Deno.env.get('CRON_INVOKE_SECRET')   || ''

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

function ctEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

async function resendFetch(path: string, init: RequestInit): Promise<Response | null> {
  return fetch(`https://api.resend.com${path}`, {
    ...init,
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  }).catch(e => { console.error('resend fetch error:', path, (e as Error).message); return null })
}

// Look up an existing Resend contact by email. Used both when create-contact
// returns "already exists" and on the remove path where we need the contact
// id to detach from the segment. Returns null if no contact with that email
// is registered on the account. Resend's list endpoint supports ?email= as
// an equality filter on the primary key.
async function findContactIdByEmail(email: string): Promise<string | null> {
  const res = await resendFetch(`/contacts?email=${encodeURIComponent(email)}`, { method: 'GET' })
  if (!res || !res.ok) return null
  const body = await res.json().catch(() => null) as { data?: Array<{ id?: string; email?: string }> } | null
  const rows = body?.data || []
  const match = rows.find(r => (r.email || '').toLowerCase() === email.toLowerCase())
  return match?.id || null
}

// Return shape for the sync helpers. Rich enough that the caller can decide
// whether the sync succeeded and, when it didn't, tell the operator where in
// the two-step flow it broke. `stage` is the last Resend endpoint we hit;
// `status` + `body` capture what Resend actually said.
interface SyncOutcome {
  ok: boolean
  status: 'sent' | 'skipped' | 'failed'
  stage?: 'create_contact' | 'find_contact' | 'attach_segment' | 'detach_segment'
  http_status?: number
  body?: string
  contact_id?: string | null
  segment_id?: string | null
}

async function addToSegment(email: string, firstName: string | null, lastName: string | null): Promise<SyncOutcome> {
  if (!RESEND_API_KEY || !RESEND_SEGMENT_ID) {
    console.warn('resend-audience-sync: skipped (missing key or segment id)', { hasKey: !!RESEND_API_KEY, hasSegmentId: !!RESEND_SEGMENT_ID })
    return { ok: false, status: 'skipped', segment_id: RESEND_SEGMENT_ID || null }
  }
  console.log('resend-audience-sync add', { email, segment_id: RESEND_SEGMENT_ID })

  // Resend's Segments API attaches a contact to a segment via the CREATE
  // body, not a separate endpoint (POST /contacts/{id}/segments returns 405).
  // Segments membership is passed as an array of { id } objects.
  const createRes = await resendFetch(`/contacts`, {
    method: 'POST',
    body: JSON.stringify({
      email,
      first_name: firstName || undefined,
      last_name:  lastName  || undefined,
      unsubscribed: false,
      segments: [{ id: RESEND_SEGMENT_ID }],
    }),
  })
  if (createRes && createRes.ok) {
    const body = await createRes.json().catch(() => null) as { id?: string; data?: { id?: string } } | null
    const contactId = body?.id || body?.data?.id || null
    console.log('resend-audience-sync contact created + attached', { contact_id: contactId })
    return { ok: true, status: 'sent', stage: 'create_contact', contact_id: contactId, segment_id: RESEND_SEGMENT_ID }
  }
  const status = createRes?.status
  const txt = (createRes ? await createRes.text().catch(() => '') : '').slice(0, 400)
  console.warn('resend contacts create non-ok', status, txt)
  // Contact already exists path — the CREATE endpoint is our only way to
  // add to a segment (PATCH doesn't accept `segments`). Best we can do
  // without deleting the contact is delete + recreate. Rare in practice
  // (we skip the sync entirely when profiles.marketing_opt_in is already
  // true), so we just surface the error rather than doing destructive
  // recovery here.
  return {
    ok: false, status: 'failed', stage: 'create_contact',
    http_status: status, body: txt,
    segment_id: RESEND_SEGMENT_ID,
  }
}

async function removeFromSegment(email: string): Promise<SyncOutcome> {
  if (!RESEND_API_KEY || !RESEND_SEGMENT_ID) {
    return { ok: false, status: 'skipped', segment_id: RESEND_SEGMENT_ID || null }
  }
  // Since PATCH /contacts can't strip segment membership, the cleanest way
  // to fully honour an opt-out is to delete the contact from Resend. That
  // removes them from every segment they were in — matches what "opt out"
  // means for a marketing broadcast recipient. Resend accepts email in the
  // path directly, no lookup needed.
  const del = await resendFetch(`/contacts/${encodeURIComponent(email)}`, { method: 'DELETE' })
  if (!del) return { ok: false, status: 'failed', stage: 'detach_segment', segment_id: RESEND_SEGMENT_ID }
  if (del.ok || del.status === 404) return { ok: true, status: 'sent', stage: 'detach_segment', segment_id: RESEND_SEGMENT_ID }
  const txt = (await del.text().catch(() => '')).slice(0, 400)
  console.warn('resend contact delete non-ok', del.status, txt)
  return {
    ok: false, status: 'failed', stage: 'detach_segment',
    http_status: del.status, body: txt,
    segment_id: RESEND_SEGMENT_ID,
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')    return json({ error: 'POST only' }, 405)

  let payload: { action?: string; email?: string; first_name?: string; last_name?: string }
  try { payload = await req.json() } catch { return json({ error: 'Invalid JSON body.' }, 400) }

  const action = String(payload.action || '').trim()
  const email  = String(payload.email  || '').trim().toLowerCase()
  const firstName = payload.first_name ? String(payload.first_name).slice(0, 80) : null
  const lastName  = payload.last_name  ? String(payload.last_name).slice(0, 80)  : null

  if (action !== 'add' && action !== 'remove') return json({ error: 'action must be add or remove' }, 400)
  if (!email || !email.includes('@'))          return json({ error: 'valid email required' }, 400)

  // Auth: either service-to-service via X-Cron-Token, or user JWT whose
  // email matches the requested email. The email match stops a signed-in
  // user from adding/removing someone else.
  const cronToken = (req.headers.get('X-Cron-Token') || req.headers.get('x-cron-token') || '').trim()
  const authorized = cronToken && CRON_INVOKE_SECRET && cronToken.length === CRON_INVOKE_SECRET.length && ctEqual(cronToken, CRON_INVOKE_SECRET)

  if (!authorized) {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Please sign in.' }, 401)
    const token = authHeader.replace(/^Bearer\s+/i, '')
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) return json({ error: 'Please sign in.' }, 401)
    if ((user.email || '').trim().toLowerCase() !== email) {
      return json({ error: 'Email does not match your account.' }, 403)
    }
  }

  const outcome = action === 'add'
    ? await addToSegment(email, firstName, lastName)
    : await removeFromSegment(email)

  // `success` reflects whether the sync actually landed in Resend. The old
  // shape only returned success:true regardless — masking silent failures.
  // `result` kept for backwards compat with the existing App.jsx handler.
  return json({
    success: outcome.ok,
    result: outcome.status,
    stage: outcome.stage,
    http_status: outcome.http_status,
    resend_body: outcome.body,
    contact_id: outcome.contact_id,
    segment_id: outcome.segment_id,
  })
})
