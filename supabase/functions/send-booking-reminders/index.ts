import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Hourly booking-reminder cron. For every confirmed booking whose session
// starts inside the next ~26 hours:
//   - 24h out: send the "your session is tomorrow" email (once)
//   - morning-of (≤ 6h to start): send the "your session is today" email (once)
// Rentals use booking_date @ 09:00 as the anchor (same convention as
// cancel-booking) because they have no start_time. Send-once is enforced
// via reminded_24h_at / reminded_morning_at columns.
//
// Times are interpreted as Europe/Madrid local so DST transitions are
// handled correctly. The scan window is generous (48h ahead) so an hour
// of cron drift never causes a missed send.

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY            = Deno.env.get('RESEND_API_KEY') || ''
const CRON_INVOKE_SECRET        = Deno.env.get('CRON_INVOKE_SECRET') || ''
const PUBLIC_ORIGIN             = Deno.env.get('PUBLIC_ORIGIN') || 'https://wello-wellness.com'

const TZ = 'Europe/Madrid'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

// Offset (minutes east of UTC) for `tz` at `date`. Handles DST correctly
// because Intl.DateTimeFormat honours the transition rules baked into the
// runtime's tz database.
function tzOffsetMinutes(date: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const parts = Object.fromEntries(dtf.formatToParts(date).map(p => [p.type, p.value] as const)) as Record<string, string>
  const asUTC = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour === '24' ? '00' : parts.hour), Number(parts.minute), Number(parts.second),
  )
  return (asUTC - date.getTime()) / 60000
}

// Convert a naive local (Y-M-D + HH:MM in `tz`) to a UTC Date. Iterate
// once to correct for DST at the target instant (getting the offset from
// the naive-UTC date and applying it can be off by an hour across a DST
// boundary; one refinement is enough for our precision needs).
function localToUtc(dateStr: string, timeStr: string, tz: string): Date {
  const naive = new Date(`${dateStr}T${timeStr}:00Z`)
  const off1 = tzOffsetMinutes(naive, tz)
  const first = new Date(naive.getTime() - off1 * 60000)
  const off2 = tzOffsetMinutes(first, tz)
  return new Date(naive.getTime() - off2 * 60000)
}

function fmtDate(dateStr: string): string {
  try {
    return new Date(`${dateStr}T12:00:00Z`).toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
    })
  } catch { return dateStr }
}

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!RESEND_API_KEY) return false
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Wello <hello@wello-wellness.com>',
        to, subject, html,
      }),
    })
    return r.ok
  } catch (e) {
    console.warn('send-booking-reminders: Resend error', (e as Error).message)
    return false
  }
}

function reminderHtml(opts: {
  kind: '24h' | 'morning'
  firstName: string
  sessionName: string
  venueName: string
  venueAddress: string | null
  dateHuman: string
  timeShort: string | null
  isRental: boolean
  endDateHuman: string | null
}): string {
  const { kind, firstName, sessionName, venueName, venueAddress, dateHuman, timeShort, isRental, endDateHuman } = opts
  const headline = kind === '24h'
    ? (isRental ? 'Your rental starts tomorrow' : 'See you tomorrow')
    : (isRental ? 'Your rental starts today' : 'See you today')
  const whenLine = isRental
    ? `Pickup: <b>${dateHuman}</b>${endDateHuman ? ` — return by <b>${endDateHuman}</b>` : ''}`
    : `<b>${dateHuman}</b> at <b>${timeShort}</b>`
  return `
    <div style="font-family:Manrope,Arial,sans-serif;max-width:540px;margin:0 auto;padding:24px;color:#1B1C19;background:#FBF9F4;">
      <h2 style="color:#213C18;font-size:20px;margin:0 0 12px;">${headline}</h2>
      <p style="margin:0 0 16px;line-height:1.55;">Hi ${firstName}, this is a quick reminder about your ${isRental ? 'rental' : 'session'} at <b>${venueName}</b>.</p>
      <table style="width:100%;border-collapse:collapse;background:#F5F3EE;border-radius:8px;padding:14px;margin:0 0 18px;">
        <tr><td style="padding:6px 12px;font-size:13px;color:#54584F;width:120px;">${isRental ? 'Rental' : 'Session'}</td><td style="padding:6px 12px;font-size:13px;color:#1B1C19;font-weight:600;">${sessionName}</td></tr>
        <tr><td style="padding:6px 12px;font-size:13px;color:#54584F;">${isRental ? 'Dates' : 'When'}</td><td style="padding:6px 12px;font-size:13px;color:#1B1C19;">${whenLine}</td></tr>
        <tr><td style="padding:6px 12px;font-size:13px;color:#54584F;">Where</td><td style="padding:6px 12px;font-size:13px;color:#1B1C19;">${venueName}${venueAddress ? `<br><span style="color:#54584F;">${venueAddress}</span>` : ''}</td></tr>
      </table>
      <p style="margin:0 0 6px;font-size:12px;color:#54584F;line-height:1.55;">Need to cancel? Head to your <a href="${PUBLIC_ORIGIN}/profile" style="color:#213C18;">Wello reservations</a>. ${isRental ? 'Rentals must be cancelled at least 24h before pickup for a full credit refund.' : 'Cancellations up to 24 hours before the session are refunded in full.'}</p>
    </div>`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  // Same X-Cron-Token gate as auto-decline-stale-bookings.
  if (!CRON_INVOKE_SECRET) return json({ error: 'CRON_INVOKE_SECRET not configured.' }, 500)
  const provided = (req.headers.get('X-Cron-Token') || req.headers.get('x-cron-token') || '').trim()
  if (!provided || provided.length !== CRON_INVOKE_SECRET.length) return json({ error: 'Unauthorized' }, 401)
  let diff = 0
  for (let i = 0; i < provided.length; i++) diff |= provided.charCodeAt(i) ^ CRON_INVOKE_SECRET.charCodeAt(i)
  if (diff !== 0) return json({ error: 'Unauthorized' }, 401)

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const now = new Date()
  // Scan window: today + next 2 days (covers 48h even if this run drifts).
  const today = new Date(now.getTime()).toISOString().slice(0, 10)
  const twoDaysOut = new Date(now.getTime() + 2 * 86400000).toISOString().slice(0, 10)

  const { data: candidates, error } = await supabase
    .from('bookings')
    .select('id, user_id, business_id, booking_date, end_date, start_time, offering_type, reminded_24h_at, reminded_morning_at')
    .eq('status', 'confirmed')
    .gte('booking_date', today)
    .lte('booking_date', twoDaysOut)
  if (error) return json({ error: error.message }, 500)
  if (!candidates?.length) return json({ scanned: 0, sent_24h: 0, sent_morning: 0 })

  // Bulk-load businesses + profiles to avoid N+1 lookups.
  const bizIds  = Array.from(new Set(candidates.map(b => b.business_id).filter(Boolean)))
  const userIds = Array.from(new Set(candidates.map(b => b.user_id).filter(Boolean)))
  const [{ data: bizRows }, { data: profRows }] = await Promise.all([
    supabase.from('businesses').select('id, name, address').in('id', bizIds),
    supabase.from('profiles').select('id, full_name, email').in('id', userIds),
  ])
  const bizMap  = new Map((bizRows  || []).map(r => [r.id, r]))
  const profMap = new Map((profRows || []).map(r => [r.id, r]))

  let sent24 = 0, sentMorning = 0
  const failures: Array<{ id: string; error: string }> = []

  for (const bk of candidates) {
    const isRental = !!bk.end_date
    // Rentals now carry the customer-picked pickup time on start_time
    // (try_reserve_rental persists it). Legacy rentals inserted before
    // the pickup-time work fall back to 09:00.
    const startLocal = isRental
      ? localToUtc(bk.booking_date, String(bk.start_time || '09:00').slice(0, 5), TZ)
      : localToUtc(bk.booking_date, String(bk.start_time || '00:00').slice(0, 5), TZ)
    const hoursUntil = (startLocal.getTime() - now.getTime()) / 3_600_000
    if (!Number.isFinite(hoursUntil) || hoursUntil < -0.5) continue

    const need24h     = !bk.reminded_24h_at     && hoursUntil > 20 && hoursUntil <= 28
    const needMorning = !bk.reminded_morning_at && hoursUntil > 0  && hoursUntil <= 6
    if (!need24h && !needMorning) continue

    const biz  = bizMap.get(bk.business_id)
    const prof = profMap.get(bk.user_id)
    if (!prof?.email) continue

    const firstName   = String(prof.full_name || prof.email || '').split(/\s+/)[0] || 'there'
    const venueName   = String(biz?.name || 'your venue')
    const venueAddr   = biz?.address || null
    const sessionName = String(bk.offering_type || 'session')
    const dateHuman   = fmtDate(bk.booking_date)
    const endHuman    = bk.end_date ? fmtDate(bk.end_date) : null
    const timeShort   = bk.start_time ? String(bk.start_time).slice(0, 5) : null

    if (need24h) {
      const ok = await sendEmail(
        prof.email,
        `Reminder: ${sessionName} tomorrow at ${venueName}`,
        reminderHtml({ kind: '24h', firstName, sessionName, venueName, venueAddress: venueAddr, dateHuman, timeShort, isRental, endDateHuman: endHuman }),
      )
      if (ok) {
        const { error: uErr } = await supabase.from('bookings').update({ reminded_24h_at: new Date().toISOString() }).eq('id', bk.id)
        if (uErr) failures.push({ id: bk.id, error: `24h stamp: ${uErr.message}` })
        else sent24++
      } else {
        failures.push({ id: bk.id, error: '24h send failed' })
      }
    }
    if (needMorning) {
      const ok = await sendEmail(
        prof.email,
        `Today: ${sessionName} at ${venueName}`,
        reminderHtml({ kind: 'morning', firstName, sessionName, venueName, venueAddress: venueAddr, dateHuman, timeShort, isRental, endDateHuman: endHuman }),
      )
      if (ok) {
        const { error: uErr } = await supabase.from('bookings').update({ reminded_morning_at: new Date().toISOString() }).eq('id', bk.id)
        if (uErr) failures.push({ id: bk.id, error: `morning stamp: ${uErr.message}` })
        else sentMorning++
      } else {
        failures.push({ id: bk.id, error: 'morning send failed' })
      }
    }
  }

  return json({ scanned: candidates.length, sent_24h: sent24, sent_morning: sentMorning, failures })
})
