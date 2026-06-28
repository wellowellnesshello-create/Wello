import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Server-side booking sync. Takes a booking_id, looks up the business's Acuity
// credentials (service-role), POSTs to Acuity to create the appointment, then
// writes the returned Acuity appointment id back to bookings.acuity_appointment_id.
//
// Credentials never leave the server. The client only ever sends { booking_id }.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

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
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  try {
    const { booking_id, acuity_type_id } = await req.json()
    if (!booking_id) return json({ error: 'Missing booking_id' }, 400)

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // 1. Load booking + business (with credentials). Use the explicit FK hint
    //    because `bookings` has TWO FKs to `businesses` (business_id and
    //    venue_id) — without the hint PostgREST throws PGRST201 ambiguity.
    const { data: booking, error: bErr } = await supabase
      .from('bookings')
      .select('*, business:businesses!bookings_business_id_fkey(acuity_key, acuity_user_id, acuity_appointment_types, mindbody_site_id, ical_url, category)')
      .eq('id', booking_id)
      .single()

    if (bErr || !booking) {
      console.error('bookings-sync: booking not found', bErr?.message)
      return json({ error: 'Booking not found' }, 404)
    }

    const biz = Array.isArray(booking.business) ? booking.business[0] : booking.business
    if (!biz?.acuity_key || !biz?.acuity_user_id) {
      return json({ skipped: 'Business has no Acuity credentials' })
    }

    // 2. Pick the Acuity appointment type by explicit acuity_type_id only.
    //    Slot was stamped with acuity_type_id at onboarding (or via slot edit);
    //    no name-based guessing — refuse to sync rather than book the wrong type.
    const types: Array<{ id: number; name?: string }> = biz.acuity_appointment_types || []
    if (types.length === 0) {
      return json({ skipped: 'Business has Acuity creds but no selected appointment types' })
    }
    if (acuity_type_id == null) {
      return json({ skipped: 'Slot has no acuity_type_id — refusing to guess. Slot needs an explicit Acuity type mapping.' })
    }
    const matchingType = types.find(t => String(t.id) === String(acuity_type_id))
    if (!matchingType) {
      return json({ skipped: `acuity_type_id ${acuity_type_id} is not in this partner's selected Acuity types.` })
    }

    // 3. Get the customer details for the Acuity appointment
    let firstName = 'Wello'
    let lastName = 'Member'
    let email = 'noreply@wello-wellness.com'
    if (booking.user_id) {
      const { data: userData } = await supabase.auth.admin.getUserById(booking.user_id)
      const u = userData?.user
      if (u) {
        email = u.email || email
        const meta = (u.user_metadata || {}) as Record<string, string>
        firstName = meta.first_name || meta.firstName || (u.email?.split('@')[0] ?? firstName)
        lastName  = meta.last_name  || meta.lastName  || lastName
      }
    }

    // 4. POST to Acuity. Datetime in ISO 8601 (Acuity assumes account TZ).
    const datetime = `${booking.booking_date}T${booking.start_time}:00`
    const auth = btoa(`${biz.acuity_user_id}:${biz.acuity_key}`)

    const acuityRes = await fetch('https://acuityscheduling.com/api/v1/appointments', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        appointmentTypeID: matchingType.id,
        datetime,
        firstName,
        lastName,
        email,
        notes: booking.notes || `Wello booking ${booking.id}`,
      }),
    })

    const acuityText = await acuityRes.text()
    let acuityData: Record<string, unknown> = {}
    try { acuityData = acuityText ? JSON.parse(acuityText) : {} } catch { acuityData = { raw: acuityText } }

    if (!acuityRes.ok) {
      console.error('bookings-sync: Acuity rejected', acuityRes.status, acuityData)
      // Flag the booking so partners can spot and chase failed syncs in their dashboard.
      await supabase
        .from('bookings')
        .update({ status: 'acuity_sync_failed' })
        .eq('id', booking.id)
      return json(
        { acuity_status: acuityRes.status, acuity_error: acuityData?.message || acuityData?.error || acuityText.slice(0, 200) },
        200, // booking itself is still valid in Wello — return 200 so client doesn't bin it
      )
    }

    const acuityId = acuityData?.id ? String(acuityData.id) : null
    if (acuityId) {
      const { error: updErr } = await supabase
        .from('bookings')
        .update({ acuity_appointment_id: acuityId, status: 'confirmed' })
        .eq('id', booking.id)
      if (updErr) console.error('bookings-sync: failed to write back acuity id', updErr.message)
    }

    return json({ acuity_appointment_id: acuityId, ok: true })
  } catch (e) {
    console.error('bookings-sync error:', e)
    return json({ error: (e as Error).message || 'Unexpected error' }, 500)
  }
})
