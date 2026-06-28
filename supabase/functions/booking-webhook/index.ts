import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Fan-out webhook for confirmed Wello bookings. Wired as a Supabase database
// webhook on the `bookings` table (INSERT + UPDATE). On each fire we:
//   1. Filter to status=confirmed transitions only (skip everything else so
//      Make.com only sees real confirmations, not partial inserts or status
//      bounces like acuity_sync_failed).
//   2. Enrich the row: business_name from the businesses table, customer name
//      and email from auth.users via service role. Slot/session name pulled
//      from the slots table via slot_id.
//   3. POST the enriched payload to MAKE_WEBHOOK_URL. Make.com routes from
//      there per partner (e.g. push to Mindbody, send Slack alert, etc).
//
// All credentials stay server-side. The webhook ignores the public anon key.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const MAKE_WEBHOOK_URL = Deno.env.get('MAKE_WEBHOOK_URL') ?? ''

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const payload = await req.json()
    // Supabase DB webhook shape: { type, table, record, old_record, schema }
    const record = payload?.record
    const oldRecord = payload?.old_record
    const eventType = payload?.type // 'INSERT' | 'UPDATE' | 'DELETE'

    if (!record || record.status !== 'confirmed') {
      return json({ skipped: 'Not a confirmed booking' })
    }

    // Only fire on the moment a booking *becomes* confirmed — i.e. INSERT or
    // an UPDATE where the previous status wasn't already confirmed. Avoids
    // duplicate fires when other columns on a confirmed row change later.
    const wasAlreadyConfirmed = eventType === 'UPDATE' && oldRecord?.status === 'confirmed'
    if (wasAlreadyConfirmed) {
      return json({ skipped: 'Already confirmed; no transition' })
    }

    if (!MAKE_WEBHOOK_URL) {
      console.error('booking-webhook: MAKE_WEBHOOK_URL secret not set')
      return json({ error: 'MAKE_WEBHOOK_URL not configured' }, 500)
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Enrich — business name
    let businessName: string | null = null
    if (record.business_id) {
      const { data: biz } = await supabase
        .from('businesses')
        .select('name')
        .eq('id', record.business_id)
        .maybeSingle()
      businessName = biz?.name ?? null
    }

    // Enrich — customer name + email from auth.users
    let customerName: string | null = null
    let customerEmail: string | null = null
    if (record.user_id) {
      const { data: userData } = await supabase.auth.admin.getUserById(record.user_id)
      const u = userData?.user
      if (u) {
        customerEmail = u.email ?? null
        const meta = (u.user_metadata || {}) as Record<string, string>
        customerName = meta.full_name || meta.firstName || (u.email?.split('@')[0] ?? null)
      }
    }

    // Enrich — session/slot name from slots table (slot_id is text in bookings;
    // slots.id is bigint, so we cast on the lookup side).
    let sessionName: string | null = null
    if (record.slot_id) {
      const slotIdNum = Number(record.slot_id)
      if (Number.isFinite(slotIdNum)) {
        const { data: slot } = await supabase
          .from('slots')
          .select('name')
          .eq('id', slotIdNum)
          .maybeSingle()
        sessionName = slot?.name ?? null
      }
    }

    const outbound = {
      booking_id: record.id,
      customer_name: customerName,
      customer_email: customerEmail,
      session_name: sessionName,
      date: record.booking_date,
      time: record.start_time,
      duration: record.duration,
      credits_used: record.credits_used,
      business_id: record.business_id,
      business_name: businessName,
      acuity_appointment_id: record.acuity_appointment_id ?? null,
      created_at: record.created_at,
    }

    const makeRes = await fetch(MAKE_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(outbound),
    })

    if (!makeRes.ok) {
      const errText = await makeRes.text().catch(() => '')
      console.error('booking-webhook: Make.com rejected', makeRes.status, errText.slice(0, 200))
      // Still return 200 — the booking itself is valid in Wello; we don't want
      // Supabase to retry the DB webhook in a loop.
      return json({ make_status: makeRes.status, make_error: errText.slice(0, 200) })
    }

    return json({ ok: true, posted: outbound })
  } catch (e) {
    console.error('booking-webhook error:', e)
    return json({ error: (e as Error).message || 'Unexpected error' }, 500)
  }
})
