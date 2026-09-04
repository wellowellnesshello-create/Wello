import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// One-click marketing unsubscribe.
//
// Called from the footer of every marketing email. URL shape:
//   /functions/v1/marketing-unsubscribe?t=<b64url(email)>.<hmac>
//
// The HMAC proves the token was minted by us so a random URL can't be
// used to opt other people out. On success:
//   1. profiles.marketing_opt_in -> false
//   2. profiles.marketing_opt_out_at -> now()
//   3. INSERT INTO marketing_suppressions (email, reason='user_unsubscribe')
//      — durable so re-signup can't accidentally re-enrol them (GDPR
//      right to object is permanent under Art 21).
//
// Returns a small branded HTML page (not JSON) so the user gets a proper
// confirmation when they tap the link in their mail client.

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const UNSUB_SECRET              = Deno.env.get('MARKETING_UNSUBSCRIBE_SECRET') || ''
const CRON_INVOKE_SECRET        = Deno.env.get('CRON_INVOKE_SECRET') || ''

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

function html(body: string, status = 200): Response {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Wello — email preferences</title><style>body{font-family:-apple-system,BlinkMacSystemFont,'Manrope','Jost',system-ui,sans-serif;background:#FBF9F4;color:#1B1C19;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}.card{background:#fff;border-radius:16px;padding:36px 32px;max-width:440px;box-shadow:0 12px 40px rgba(27,28,25,0.08);text-align:center}.brand{font-size:20px;font-weight:800;color:#213C18;letter-spacing:-0.6px;margin-bottom:16px}h1{font-size:20px;font-weight:700;color:#213C18;margin:0 0 8px}p{font-size:14px;color:#54584F;line-height:1.65;margin:8px 0 0}a{color:#213C18;font-weight:600}</style></head><body><div class="card"><div class="brand">wello</div>${body}</div></body></html>`,
    { status, headers: { ...CORS, 'Content-Type': 'text/html; charset=utf-8' } }
  )
}

function b64urlDecode(s: string): string {
  const pad = '='.repeat((4 - (s.length % 4)) % 4)
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/')
  return atob(b64)
}

async function hmacHex(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg))
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function ctEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  if (!UNSUB_SECRET) {
    return html('<h1>Not configured</h1><p>Please contact <a href="mailto:hello@wello-wellness.com">hello@wello-wellness.com</a> and we\'ll remove you from the list manually.</p>', 500)
  }

  const url = new URL(req.url)
  const token = url.searchParams.get('t') || ''
  const parts = token.split('.')
  if (parts.length !== 2) {
    return html('<h1>Invalid link</h1><p>This unsubscribe link isn\'t valid. Email <a href="mailto:hello@wello-wellness.com">hello@wello-wellness.com</a> and we\'ll take care of it.</p>', 400)
  }

  const [payload, sig] = parts
  const expected = await hmacHex(UNSUB_SECRET, payload)
  if (!ctEqual(sig, expected)) {
    return html('<h1>Invalid link</h1><p>This unsubscribe link isn\'t valid. Email <a href="mailto:hello@wello-wellness.com">hello@wello-wellness.com</a> and we\'ll take care of it.</p>', 400)
  }

  let email = ''
  try { email = b64urlDecode(payload).toLowerCase().trim() } catch { /* fall through */ }
  if (!email || !email.includes('@')) {
    return html('<h1>Invalid link</h1><p>Email <a href="mailto:hello@wello-wellness.com">hello@wello-wellness.com</a> and we\'ll take care of it.</p>', 400)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Flip opt_in off on any matching profile (case-insensitive) and stamp
  // the opt-out timestamp. If no profile exists (e.g. deleted account)
  // we still add to the suppression list so a future re-registration
  // doesn't get marketed to.
  const nowIso = new Date().toISOString()
  const { error: profErr } = await supabase
    .from('profiles')
    .update({ marketing_opt_in: false, marketing_opt_out_at: nowIso })
    .ilike('email', email)
  if (profErr) console.error('marketing-unsubscribe profile update failed:', profErr.message)

  // Durable suppression. ON CONFLICT DO NOTHING — if they've unsubscribed
  // before, the earlier timestamp is the correct one to preserve.
  const { error: suppErr } = await supabase
    .from('marketing_suppressions')
    .upsert({ email, reason: 'user_unsubscribe' }, { onConflict: 'email', ignoreDuplicates: true })
  if (suppErr) console.error('marketing-unsubscribe suppression insert failed:', suppErr.message)

  // Also remove them from the Resend Broadcasts audience so no queued
  // campaign fires against them. Server-to-server via X-Cron-Token.
  // Non-critical: local suppression is the durable authority.
  if (CRON_INVOKE_SECRET) {
    supabase.functions.invoke('resend-audience-sync', {
      body: { action: 'remove', email },
      headers: { 'X-Cron-Token': CRON_INVOKE_SECRET },
    }).catch(() => { /* Non-critical */ })
  }

  return html(`<h1>You're unsubscribed</h1><p>We won't send you any more marketing emails at <strong>${email.replace(/</g, '&lt;')}</strong>. You'll still get transactional emails (booking confirmations, receipts) because those are needed to run your bookings.</p><p style="margin-top:16px"><a href="https://www.wello-wellness.com/">Back to Wello →</a></p>`)
})
