import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireAdmin } from '../_shared/admin_auth.ts'

// Internal admin-only. Creates a Wello-domain invite URL that the admin can
// paste into a handoff email or WhatsApp message. When the partner clicks
// it, the SPA calls redeem-partner-invite to swap the code for a fresh
// Supabase magic link, then redirects. This keeps the pasted URL on the
// wello domain so it doesn't read as a phishing link.
//
// Gated by requireAdmin(). verify_jwt = true is not enough because the anon
// key is a valid JWT; requireAdmin additionally verifies the caller is on
// the ADMIN_USER_IDS allowlist. Every call is logged to
// admin_magic_link_log so there is a "who / when / for whom" audit trail.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const PUBLIC_ORIGIN = Deno.env.get('PUBLIC_ORIGIN') || 'https://www.wello-wellness.com'
// Invite is valid for 7 days from creation to leave room for the admin's
// send-then-follow-up-later workflow. Single-use is enforced on redeem, so
// the longer window is not a re-use risk.
const INVITE_LIFETIME_DAYS = 7

function randomInviteCode(): string {
  // 24 base64url chars ~ 144 bits of entropy. Unguessable in practice.
  const bytes = new Uint8Array(18)
  crypto.getRandomValues(bytes)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const gate = await requireAdmin(req)
  if (!gate.ok) return gate.response
  const adminUserId = gate.userId

  let body: { business_id?: number | string | null }
  try {
    body = await req.json()
  } catch (_e) {
    return new Response(JSON.stringify({ error: 'Invalid JSON body.' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  const businessId = body?.business_id == null || body.business_id === ''
    ? null : Number(body.business_id)
  if (!businessId || !Number.isFinite(businessId)) {
    return new Response(JSON.stringify({ error: 'business_id is required.' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Best-effort audit log helper. Logs both success and failure paths so we
  // can see every attempted link generation, not just the ones that worked.
  async function auditLog(email: string | null, success: boolean, errorMsg: string | null) {
    try {
      await supabase.from('admin_magic_link_log').insert({
        admin_user_id: adminUserId,
        business_id: businessId,
        business_email: email,
        success,
        error: errorMsg,
      })
    } catch (e) {
      console.error('admin_magic_link_log insert failed:', e)
    }
  }

  const { data: biz, error: bizErr } = await supabase
    .from('businesses')
    .select('id, name, email')
    .eq('id', businessId)
    .maybeSingle()
  if (bizErr) {
    await auditLog(null, false, `businesses lookup failed: ${bizErr.message}`)
    return new Response(JSON.stringify({ error: `businesses lookup failed: ${bizErr.message}` }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
  if (!biz?.email) {
    await auditLog(null, false, 'No email on file for that business.')
    return new Response(JSON.stringify({ error: 'No email on file for that business.' }), {
      status: 404, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  // Insert an invite row. The wello.com invite URL wraps this random code;
  // when the partner clicks it, redeem-partner-invite verifies the row
  // (exists + not expired + not used), marks used_at, and mints a fresh
  // Supabase magic link at that moment. That gives us single-use + a
  // longer safe pasted-URL window without hard-baking the Supabase URL
  // into whatever channel we send.
  const code = randomInviteCode()
  const expiresAt = new Date(Date.now() + INVITE_LIFETIME_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const { error: invErr } = await supabase.from('partner_invites').insert({
    admin_user_id: adminUserId,
    business_id: businessId,
    code,
    expires_at: expiresAt,
  })
  if (invErr) {
    await auditLog(biz.email, false, `partner_invites insert failed: ${invErr.message}`)
    return new Response(JSON.stringify({ error: `Could not create invite: ${invErr.message}` }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  const inviteUrl = `${PUBLIC_ORIGIN.replace(/\/+$/, '')}/?invite=${encodeURIComponent(code)}`

  await auditLog(biz.email, true, null)
  return new Response(JSON.stringify({
    magic_link: inviteUrl,
    email: biz.email,
    business_name: biz.name,
    expires_at: expiresAt,
  }), {
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
})
