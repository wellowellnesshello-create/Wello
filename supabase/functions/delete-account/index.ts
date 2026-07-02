import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Wello customer account deletion.
//
// GDPR-friendly cascade:
//   1. Anonymise bookings — set user_id to NULL so partner-side dashboards
//      still see the historical booking (as "Deleted Wello member") without
//      the customer's identity attached.
//   2. Null out gifts.claimed_by_user_id — the gift row stays for audit,
//      but no longer points back at a deleted user.
//   3. Delete the profiles row — removes name, email, phone, credits balance,
//      preferences.
//   4. Delete the auth.users row via the admin API — the actual identity is
//      gone.
//
// Idempotent: calling twice is safe (subsequent calls fail auth because the
// user is already gone). Only the user themselves can trigger it; we verify
// their JWT before touching anything.

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')    return json({ error: 'POST only' }, 405)

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Please sign in.' }, 401)
    const token = authHeader.replace(/^Bearer\s+/i, '')

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) return json({ error: 'Please sign in.' }, 401)

    const uid = user.id
    const results: Record<string, unknown> = {}

    // 1. Anonymise bookings — preserve partner-side history.
    const { count: bookingCount, error: bookingsErr } = await supabase
      .from('bookings')
      .update({ user_id: null })
      .eq('user_id', uid)
      .select('id', { count: 'exact', head: true })
    if (bookingsErr) console.warn('delete-account: booking anonymise partial', bookingsErr.message)
    results.bookings_anonymised = bookingCount ?? 0

    // 2. Null out gifts.claimed_by_user_id.
    const { count: giftsCount, error: giftsErr } = await supabase
      .from('gifts')
      .update({ claimed_by_user_id: null })
      .eq('claimed_by_user_id', uid)
      .select('id', { count: 'exact', head: true })
    if (giftsErr) console.warn('delete-account: gift anonymise partial', giftsErr.message)
    results.gifts_anonymised = giftsCount ?? 0

    // 3. Delete the profile row.
    const { error: profileErr } = await supabase
      .from('profiles').delete().eq('id', uid)
    if (profileErr) {
      console.error('delete-account: profile delete failed', profileErr.message)
      return json({ error: 'Could not delete your profile. Please try again.' }, 500)
    }
    results.profile_deleted = true

    // 4. Delete the auth user itself.
    const { error: authDelErr } = await supabase.auth.admin.deleteUser(uid)
    if (authDelErr) {
      console.error('delete-account: auth delete failed', authDelErr.message)
      // Profile is gone, but the auth user survives. Flag so the client can
      // surface a helpful message; the customer's PII is already removed.
      return json({
        error: 'Your data was cleared but the sign-in record could not be removed. Please contact hello@wello-wellness.com.',
        partial: true,
        ...results,
      }, 500)
    }
    results.auth_deleted = true

    console.log('delete-account: complete', { user: uid, ...results })
    return json({ success: true, ...results })
  } catch (e) {
    console.error('delete-account exception:', e)
    return json({ error: (e as Error).message || 'Unexpected error' }, 500)
  }
})
