import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Scheduled hourly via pg_cron / pg_net. Finds every booking still in status
// 'pending_instructor' or 'pending_venue' more than 48 hours after creation
// and triggers the auto_decline path on the appropriate handler:
//   - pending_instructor -> instructor-booking-response (existing flow)
//   - pending_venue      -> venue-booking-response      (studio/spa offering)
//
// Both handlers cancel the booking + email the customer with rule-based
// alternatives. Neither status ever deducts credits on insert, so no
// refund is needed here.

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
    const { data: stale, error } = await supabase
      .from('bookings')
      .select('id, status')
      .in('status', ['pending_instructor', 'pending_venue'])
      .lt('created_at', cutoff)
    if (error) return json({ error: error.message }, 500)
    if (!stale || stale.length === 0) return json({ scanned: 0, declined: 0 })

    // Fire one auto_decline per stale booking. Sequential to keep error
    // handling readable; 1 call/booking is cheap and the volume is small.
    // Route to the per-status handler: instructor bookings continue to go
    // through instructor-booking-response, venue offering requests go
    // through venue-booking-response.
    let declined = 0
    const failures: Array<{ id: number; error: string }> = []
    for (const row of stale) {
      const targetFn = row.status === 'pending_venue'
        ? 'venue-booking-response'
        : 'instructor-booking-response'
      const { data, error: fnErr } = await supabase.functions.invoke(targetFn, {
        body: { booking_id: row.id, action: 'auto_decline' },
      })
      if (fnErr) {
        failures.push({ id: row.id, error: fnErr.message })
        continue
      }
      if ((data as { error?: string })?.error) {
        failures.push({ id: row.id, error: (data as { error?: string }).error as string })
        continue
      }
      declined++
    }
    return json({ scanned: stale.length, declined, failures })
  } catch (e) {
    console.error('auto-decline-stale-bookings exception:', e)
    return json({ error: (e as Error).message || 'Unexpected error' }, 500)
  }
})
