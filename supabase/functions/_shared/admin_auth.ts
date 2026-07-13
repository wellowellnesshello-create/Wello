import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Shared admin-check for internal edge functions.
//
// verify_jwt = true on the function is not enough: the public anon key is a
// valid JWT and would pass that gate. We additionally require the caller's
// authenticated user id to be listed in ADMIN_USER_IDS (comma-separated
// UUIDs on the function's secrets).
//
// Usage:
//   const gate = await requireAdmin(req)
//   if (!gate.ok) return gate.response
//   const adminUserId = gate.userId  // uuid, safe to log
//
// Verification path:
//   1. Extract Bearer token from Authorization header.
//   2. Call supabase.auth.getUser(token). Supabase validates the JWT
//      signature server-side and returns the user row.
//   3. Anon-key JWTs have no `sub`, so getUser returns null user -> 403.
//   4. Authenticated users are matched against ADMIN_USER_IDS -> 403 if
//      not present.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function forbidden(msg: string): Response {
  return new Response(JSON.stringify({ error: msg }), {
    status: 403,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

export type AdminGate =
  | { ok: true; userId: string }
  | { ok: false; response: Response }

export async function requireAdmin(req: Request): Promise<AdminGate> {
  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) return { ok: false, response: forbidden('Missing Authorization header.') }

  const allowlist = (Deno.env.get('ADMIN_USER_IDS') || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
  if (allowlist.length === 0) {
    // Fail closed. An empty allowlist means the secret hasn't been set
    // yet and the function should not accept anyone until it is.
    return { ok: false, response: forbidden('Admin allowlist not configured.') }
  }

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data, error } = await client.auth.getUser(token)
  if (error || !data?.user) return { ok: false, response: forbidden('Invalid or non-user token.') }

  if (!allowlist.includes(data.user.id)) {
    return { ok: false, response: forbidden('This account is not on the admin allowlist.') }
  }

  return { ok: true, userId: data.user.id }
}
