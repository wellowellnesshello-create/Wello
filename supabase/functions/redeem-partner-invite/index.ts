import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Public. Exchanges a partner_invites.code for a fresh Supabase magic link.
//
// Called by the SPA when a partner clicks a wello-domain invite link:
//   https://www.wello-wellness.com/?invite=<code>
//
// Flow:
//   1. Look up the invite row by code.
//   2. Reject if not found, expired, or already used.
//   3. Look up the business + email.
//   4. Ensure the auth user exists for that email (idempotent).
//   5. Mint a fresh Supabase magic link with redirect_to = /?portal=business.
//   6. Mark the invite row used_at = now() so the code can't be replayed.
//   7. Return the magic link URL. The SPA does window.location.href to it.
//
// Not gated by verify_jwt (see config.toml) since the partner has no
// session when they click the link. The random code IS the auth here — 144
// bits of entropy, single-use, 7-day TTL.

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const PUBLIC_ORIGIN             = Deno.env.get('PUBLIC_ORIGIN') || 'https://www.wello-wellness.com'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')    return json({ error: 'POST only' }, 405)

  let body: { code?: string }
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON body.' }, 400) }
  const code = String(body?.code || '').trim()
  if (!code) return json({ error: 'code required' }, 400)

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: invite, error: invErr } = await supabase
    .from('partner_invites')
    .select('id, business_id, expires_at, used_at')
    .eq('code', code)
    .maybeSingle()
  if (invErr) return json({ error: `invite lookup failed: ${invErr.message}` }, 500)
  if (!invite) return json({ error: 'This invite link is invalid.' }, 404)
  if (invite.used_at) return json({ error: 'This invite link has already been used.' }, 409)
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    return json({ error: 'This invite link has expired. Ask your Wello contact for a fresh one.' }, 410)
  }

  const { data: biz, error: bizErr } = await supabase
    .from('businesses')
    .select('id, name, email')
    .eq('id', invite.business_id)
    .maybeSingle()
  if (bizErr) return json({ error: `businesses lookup failed: ${bizErr.message}` }, 500)
  if (!biz?.email) return json({ error: 'No email on file for this business.' }, 404)

  // Ensure the auth user exists so generateLink type=magiclink does not
  // return "user not found". Idempotent — swallow the already-registered
  // case exactly like notify-partner-status does.
  const { error: createErr } = await supabase.auth.admin.createUser({
    email: biz.email,
    email_confirm: true,
    user_metadata: { business_name: biz.name },
  })
  if (createErr && !String(createErr.message).includes('already been registered')) {
    return json({ error: `auth user create failed: ${createErr.message}` }, 500)
  }

  const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: biz.email,
    options: { redirectTo: `${PUBLIC_ORIGIN.replace(/\/+$/, '')}/?portal=business` },
  })
  if (linkErr) return json({ error: `generateLink failed: ${linkErr.message}` }, 500)
  const link = linkData?.properties?.action_link
  if (!link) return json({ error: 'generateLink returned no action_link.' }, 500)

  // Mark used BEFORE returning the link so a concurrent click cannot get
  // two magic links out of one invite. Conditional update on used_at is
  // null is our race guard.
  const { data: marked, error: markErr } = await supabase
    .from('partner_invites')
    .update({ used_at: new Date().toISOString() })
    .eq('id', invite.id)
    .is('used_at', null)
    .select('id')
    .maybeSingle()
  if (markErr) return json({ error: `mark used failed: ${markErr.message}` }, 500)
  if (!marked) return json({ error: 'This invite was just used in another tab.' }, 409)

  return json({ magic_link: link, business_name: biz.name })
})
