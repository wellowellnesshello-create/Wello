import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Resend Broadcasts audience sync.
//
// Keeps the Resend audience list in step with profiles.marketing_opt_in
// so that when the first marketing campaign fires, the recipients are
// the same people who actually consented — no manual export/import.
//
// Called by:
//   * App.jsx Settings → Email preferences toggle (user JWT)
//   * marketing-unsubscribe edge fn (service role, on one-click unsubscribe)
//   * delete-account edge fn (service role, on account deletion)
//
// Auth model: either
//   (a) valid user JWT whose email matches the requested email, OR
//   (b) X-Cron-Token matching CRON_INVOKE_SECRET (server-to-server path)
// The (b) path lets other edge fns call this one without shipping a JWT.
//
// No-ops gracefully when RESEND_API_KEY or RESEND_AUDIENCE_ID isn't set,
// so the app still works before the Resend audience is created.

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY            = Deno.env.get('RESEND_API_KEY')       || ''
const RESEND_AUDIENCE_ID        = Deno.env.get('RESEND_AUDIENCE_ID')   || ''
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

async function addToAudience(email: string, firstName: string | null, lastName: string | null): Promise<'sent' | 'skipped' | 'failed'> {
  if (!RESEND_API_KEY || !RESEND_AUDIENCE_ID) return 'skipped'
  const res = await fetch(`https://api.resend.com/audiences/${RESEND_AUDIENCE_ID}/contacts`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      first_name: firstName || undefined,
      last_name:  lastName  || undefined,
      unsubscribed: false,
    }),
  }).catch(e => { console.error('resend-audience-sync add fetch error:', (e as Error).message); return null })
  if (!res) return 'failed'
  // Resend returns 200/201 for create, 409 or similar for "already exists" —
  // treat non-2xx as failure so we surface it, but don't retry.
  if (res.ok) return 'sent'
  const txt = await res.text().catch(() => '')
  console.warn('resend-audience-sync: add non-ok', res.status, txt.slice(0, 200))
  return 'failed'
}

async function removeFromAudience(email: string): Promise<'sent' | 'skipped' | 'failed'> {
  if (!RESEND_API_KEY || !RESEND_AUDIENCE_ID) return 'skipped'
  const res = await fetch(`https://api.resend.com/audiences/${RESEND_AUDIENCE_ID}/contacts/${encodeURIComponent(email)}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}` },
  }).catch(e => { console.error('resend-audience-sync remove fetch error:', (e as Error).message); return null })
  if (!res) return 'failed'
  // 200/204 for delete, 404 if the contact was never added — both are
  // fine outcomes here (idempotent).
  if (res.ok || res.status === 404) return 'sent'
  const txt = await res.text().catch(() => '')
  console.warn('resend-audience-sync: remove non-ok', res.status, txt.slice(0, 200))
  return 'failed'
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

  const result = action === 'add'
    ? await addToAudience(email, firstName, lastName)
    : await removeFromAudience(email)

  return json({ success: true, result })
})
