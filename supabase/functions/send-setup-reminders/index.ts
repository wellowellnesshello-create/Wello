import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Setup-reminder emails for partners stuck in `setting_up`.
//
// Cadence (days since setting_up_at): 1, 3, 5. Each reminder generates
// a fresh 24h magic link so the "link expired" excuse never applies.
// Stops the moment businesses.user_id is populated (first successful
// login), because the query filters user_id IS NULL.
//
// Called daily via pg_cron with X-Cron-Token — same shared-secret
// pattern as auto-decline-stale-bookings and send-booking-reminders.

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY            = (Deno.env.get('RESEND_API_KEY') || '').trim()
const CRON_INVOKE_SECRET        = (Deno.env.get('CRON_INVOKE_SECRET') || '').trim()

// Cadence thresholds in days. Index matches setup_reminders_sent value.
// A partner with setup_reminders_sent=0 waits until day 1 threshold;
// after send we increment to 1, next check waits until day 3; etc.
const CADENCE_DAYS = [1, 3, 5] as const

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

// Reminder copy — one entry per cadence step. Kept as functions so
// each render can bake in the fresh magic link + partner first name.
function reminderContent(index: number, opts: { greetingName: string; name: string; magicLink: string }): { subject: string; html: string } {
  const { greetingName, name, magicLink } = opts
  const hi = greetingName ? `Hi ${greetingName}` : 'Hi'
  // Consistent visual shell across all three so partners recognise
  // it as part of the same conversation. Copy is the only diff.
  const shell = (title: string, body: string) => `<div style="font-family:Arial,sans-serif;max-width:480px;padding:32px;background:#FBF9F4;"><h1 style="color:#213C18;">wello</h1><div style="background:#fff;border-radius:12px;padding:28px;border:1px solid #E4E2DD;"><h2 style="color:#213C18;">${title}</h2>${body}<div style="text-align:center;margin:28px 0;"><a href="${magicLink}" style="display:inline-block;padding:13px 28px;background:#213C18;color:#fff;text-decoration:none;border-radius:2px;font-family:Arial,sans-serif;font-size:13px;font-weight:600;letter-spacing:0.3px;">Log in to your portal</a></div><p style="color:#A3A89E;font-size:11px;line-height:1.6;">This link logs you in automatically and expires after 24 hours.</p><p style="color:#1B1C19;font-weight:600;margin-top:22px;">James<br><span style="font-weight:400;color:#74796E;">Founder, Wello - <a href="mailto:hello@wello-wellness.com" style="color:#213C18;">hello@wello-wellness.com</a></span></p><p style="color:#A3A89E;font-size:10px;line-height:1.5;margin-top:18px;">Reply STOP or email hello@wello-wellness.com if you'd rather not get any more setup reminders.</p></div></div>`

  if (index === 0) {
    return {
      subject: `Still here when you're ready — ${name}`,
      html: shell(
        `Still here when you're ready`,
        `<p style="color:#74796E;line-height:1.7;">${hi}, just circling back with a fresh 24h link to finish setting ${name} up on Wello.</p><p style="color:#74796E;line-height:1.7;">Takes about 10 minutes — profile, sessions, price, done.</p>`,
      ),
    }
  }
  if (index === 1) {
    return {
      subject: `Anything I can help with — ${name}?`,
      html: shell(
        `Not stuck anywhere, are you?`,
        `<p style="color:#74796E;line-height:1.7;">${hi}, just wanted to check you're not stuck anywhere. Fresh link below.</p><p style="color:#74796E;line-height:1.7;">If any bit of the onboarding isn't obvious, reply here and I'll walk you through it.</p>`,
      ),
    }
  }
  // index === 2 — final nudge
  return {
    subject: `Last nudge from me — ${name}`,
    html: shell(
      `Last automated nudge`,
      `<p style="color:#74796E;line-height:1.7;">${hi}, last automated nudge from me on getting ${name} live on Wello.</p><p style="color:#74796E;line-height:1.7;">A fresh 24h link is below. If a call would help, reply here and we'll get one in the diary.</p>`,
    ),
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  // Cron auth — same X-Cron-Token pattern as other scheduled fns.
  if (!CRON_INVOKE_SECRET) return json({ error: 'CRON_INVOKE_SECRET not configured.' }, 500)
  const provided = (req.headers.get('X-Cron-Token') || req.headers.get('x-cron-token') || '').trim()
  if (!provided || provided.length !== CRON_INVOKE_SECRET.length) return json({ error: 'Unauthorized' }, 401)
  let diff = 0
  for (let i = 0; i < provided.length; i++) diff |= provided.charCodeAt(i) ^ CRON_INVOKE_SECRET.charCodeAt(i)
  if (diff !== 0) return json({ error: 'Unauthorized' }, 401)

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Candidates: still setting_up, never logged in, less than 3
  // reminders sent, and at least 1 day past the setting_up anchor.
  const { data: candidates, error } = await supabase
    .from('businesses')
    .select('id, name, email, contact_name, business_type, category, setting_up_at, setup_reminders_sent')
    .eq('status', 'setting_up')
    .is('user_id', null)
    .lt('setup_reminders_sent', CADENCE_DAYS.length)
    .not('setting_up_at', 'is', null)
  if (error) return json({ error: error.message }, 500)
  if (!candidates?.length) return json({ scanned: 0, sent: 0 })

  let sent = 0
  const failures: Array<{ id: number; error: string }> = []
  const skipped: Array<{ id: number; reason: string }> = []

  for (const biz of candidates) {
    const anchorMs = new Date(String(biz.setting_up_at)).getTime()
    if (!Number.isFinite(anchorMs)) { skipped.push({ id: biz.id, reason: 'invalid_setting_up_at' }); continue }
    const daysSince = (Date.now() - anchorMs) / 86_400_000
    const nextIndex = biz.setup_reminders_sent // 0, 1, or 2
    const threshold = CADENCE_DAYS[nextIndex]
    if (daysSince < threshold) { skipped.push({ id: biz.id, reason: `waiting_for_day_${threshold}` }); continue }

    if (!biz.email) { skipped.push({ id: biz.id, reason: 'no_email' }); continue }
    if (!RESEND_API_KEY) { skipped.push({ id: biz.id, reason: 'no_resend_key' }); continue }

    // Fresh 24h magic link per reminder — the whole point of the
    // cadence is to keep them supplied with a usable link.
    const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: biz.email,
      options: { redirectTo: 'https://www.wello-wellness.com/?portal=business' },
    })
    if (linkErr) { failures.push({ id: biz.id, error: `magiclink: ${linkErr.message}` }); continue }
    const magicLink = linkData?.properties?.action_link ?? 'https://www.wello-wellness.com'

    // Same greeting logic as notify-partner-status so tone stays consistent.
    const contactName = (typeof biz.contact_name === 'string' && biz.contact_name.trim()) || ''
    const isPrivateInstructor = biz.business_type === 'private_instructor'
      || (!biz.business_type && biz.category === 'Private Instructor')
    const greetingName = (contactName && contactName.split(' ')[0])
      || (isPrivateInstructor && biz.name ? String(biz.name).split(' ')[0] : '')
      || ''

    const { subject, html } = reminderContent(nextIndex, { greetingName, name: String(biz.name || 'your venue'), magicLink })

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'James at Wello <hello@wello-wellness.com>',
        to: biz.email,
        subject,
        html,
      }),
    }).catch(e => { console.error('Resend error:', e); return null })

    if (!emailRes?.ok) {
      failures.push({ id: biz.id, error: `resend: ${emailRes?.status ?? 'network'}` })
      continue
    }

    const { error: stampErr } = await supabase
      .from('businesses')
      .update({ setup_reminders_sent: nextIndex + 1 })
      .eq('id', biz.id)
      .eq('setup_reminders_sent', nextIndex) // guard against races if the fn double-fires
    if (stampErr) {
      failures.push({ id: biz.id, error: `stamp: ${stampErr.message}` })
      continue
    }

    sent++
  }

  return json({ scanned: candidates.length, sent, skipped, failures })
})
