import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Scheduled hourly via pg_cron / pg_net. Finds every booking still in status
// 'pending_instructor' more than 48 hours after creation and triggers the
// auto_decline path on instructor-booking-response (which cancels the row +
// emails the customer with alternative instructors).

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
      .select('id')
      .eq('status', 'pending_instructor')
      .lt('created_at', cutoff)
    if (error) return json({ error: error.message }, 500)
    if (!stale || stale.length === 0) return json({ scanned: 0, declined: 0 })

    // Fire one auto_decline per stale booking. Sequential to keep error
    // handling readable; 1 call/booking is cheap and the volume is small.
    let declined = 0
    const failures: Array<{ id: number; error: string }> = []
    for (const row of stale) {
      const { data, error: fnErr } = await supabase.functions.invoke('instructor-booking-response', {
        body: { booking_id: row.id, action: 'auto_decline' },
      })
      if (fnErr) {
        failures.push({ id: row.id, error: fnErr.message })
        continue
      }
      if ((data as any)?.error) {
        failures.push({ id: row.id, error: (data as any).error })
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
