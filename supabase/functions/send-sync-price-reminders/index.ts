import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Daily digest to partners with sync'd sessions the orchestrator
// couldn't price. One email per partner per day, containing the total
// count + up to a handful of titles + a direct link to Session
// Offerings on their BizPanel.
//
// Change-detection: compute sha256 over the sorted list of
// external_ids currently in sync_status='needs_price' for the partner.
// If it matches businesses.sync_price_digest_signature, skip — the
// partner has already been told about this exact set. Update the
// signature after a successful send so the next actual change
// re-triggers.
//
// Called daily via pg_cron with the same X-Cron-Token gate as the
// other reminder crons.

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY            = (Deno.env.get('RESEND_API_KEY') || '').trim()
const CRON_INVOKE_SECRET        = (Deno.env.get('CRON_INVOKE_SECRET') || '').trim()
const PUBLIC_ORIGIN             = Deno.env.get('PUBLIC_ORIGIN') || 'https://wello-wellness.com'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

async function sha256(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function digestHtml(opts: { greetingName: string; bizName: string; source: string; count: number; sampleTitles: string[]; bizPanelUrl: string }): string {
  const { greetingName, bizName, source, count, sampleTitles, bizPanelUrl } = opts
  const hi = greetingName ? `Hi ${greetingName}` : 'Hi'
  const sourceLabel = source === 'momence' ? 'Momence' : (source === 'booqable' ? 'Booqable' : source)
  const listRows = sampleTitles.slice(0, 5).map(t => `<li style="margin:0 0 4px;">${t}</li>`).join('')
  const overflow = count > sampleTitles.length ? `<p style="color:#74796E;font-size:12px;margin:8px 0 0;">…and ${count - sampleTitles.length} more.</p>` : ''
  return `
    <div style="font-family:Arial,sans-serif;max-width:520px;padding:32px;background:#FBF9F4;">
      <h1 style="color:#213C18;margin:0 0 4px;">wello</h1>
      <div style="background:#fff;border-radius:12px;padding:28px;border:1px solid #E4E2DD;margin-top:14px;">
        <h2 style="color:#213C18;margin:0 0 12px;font-size:18px;">${count} ${count === 1 ? 'session needs' : 'sessions need'} a Wello price</h2>
        <p style="color:#74796E;line-height:1.7;margin:0 0 14px;">${hi}, we pulled the latest schedule for <b>${bizName}</b> from ${sourceLabel} and found ${count} ${count === 1 ? 'session' : 'sessions'} we couldn't match to a Wello offering. ${count === 1 ? 'It stays' : 'They stay'} hidden from customers until you add a matching offering (same name) with a credit price.</p>
        <ul style="color:#1B1C19;padding-left:20px;margin:0 0 12px;">${listRows}</ul>
        ${overflow}
        <div style="text-align:center;margin:22px 0 8px;">
          <a href="${bizPanelUrl}" style="display:inline-block;padding:12px 26px;background:#213C18;color:#fff;text-decoration:none;border-radius:2px;font-family:Arial,sans-serif;font-size:13px;font-weight:600;letter-spacing:0.3px;">Add pricing in Session Offerings</a>
        </div>
        <p style="color:#A3A89E;font-size:11px;line-height:1.55;margin-top:20px;">You'll only get this email again if the set of unpriced sessions changes. Reply if the schedule looks wrong or you want us to help.</p>
      </div>
    </div>`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  if (!CRON_INVOKE_SECRET) return json({ error: 'CRON_INVOKE_SECRET not configured' }, 500)
  const provided = (req.headers.get('X-Cron-Token') || req.headers.get('x-cron-token') || '').trim()
  if (!provided || provided.length !== CRON_INVOKE_SECRET.length) return json({ error: 'Unauthorized' }, 401)
  let diff = 0
  for (let i = 0; i < provided.length; i++) diff |= provided.charCodeAt(i) ^ CRON_INVOKE_SECRET.charCodeAt(i)
  if (diff !== 0) return json({ error: 'Unauthorized' }, 401)

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: partners, error } = await supabase
    .from('businesses')
    .select('id, name, email, contact_name, sync_source, sync_price_digest_signature')
    .not('sync_source', 'is', null)
  if (error) return json({ error: error.message }, 500)
  if (!partners?.length) return json({ scanned: 0, sent: 0 })

  let sent = 0
  const skipped: Array<{ id: number; reason: string }> = []

  for (const biz of partners) {
    // Find this partner's active listing (matches orchestrator's rule).
    const { data: listings } = await supabase
      .from('listings')
      .select('id')
      .eq('business_id', biz.id)
      .eq('status', 'active')
      .order('id', { ascending: true })
      .limit(1)
    const listingId = listings?.[0]?.id
    if (!listingId) { skipped.push({ id: biz.id, reason: 'no_listing' }); continue }

    const { data: needs } = await supabase
      .from('slots')
      .select('external_id, name')
      .eq('listing_id', listingId)
      .eq('source', biz.sync_source)
      .eq('sync_status', 'needs_price')
    const rows = needs || []
    if (rows.length === 0) {
      // Nothing outstanding — clear stored signature so if new
      // needs_price appears tomorrow we send fresh.
      if (biz.sync_price_digest_signature) {
        await supabase.from('businesses').update({ sync_price_digest_signature: null }).eq('id', biz.id)
      }
      skipped.push({ id: biz.id, reason: 'none_outstanding' })
      continue
    }

    const sortedIds = rows.map(r => String(r.external_id || '')).sort()
    const signature = await sha256(sortedIds.join('\n'))
    if (signature === biz.sync_price_digest_signature) {
      skipped.push({ id: biz.id, reason: 'unchanged_signature' })
      continue
    }

    if (!RESEND_API_KEY) { skipped.push({ id: biz.id, reason: 'no_resend_key' }); continue }
    if (!biz.email)      { skipped.push({ id: biz.id, reason: 'no_email' }); continue }

    // De-dupe titles for the sample list; we already have per-external_id
    // rows but the partner cares about class-name level.
    const uniqueTitles = Array.from(new Set(rows.map(r => String(r.name || 'Untitled'))))

    const greetingName = String(biz.contact_name || '').split(/\s+/)[0] || ''
    const html = digestHtml({
      greetingName,
      bizName: String(biz.name || 'your listing'),
      source: String(biz.sync_source),
      count: rows.length,
      sampleTitles: uniqueTitles,
      bizPanelUrl: `${PUBLIC_ORIGIN}/portal?tab=manage&sub=schedule`,
    })

    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'James at Wello <hello@wello-wellness.com>',
          to: biz.email,
          subject: `${rows.length} ${rows.length === 1 ? 'session needs' : 'sessions need'} a Wello price — ${biz.name || ''}`.trim(),
          html,
        }),
      })
      if (!r.ok) {
        const txt = await r.text().catch(() => '')
        console.error('send-sync-price-reminders: resend failed', r.status, txt.slice(0, 200))
        skipped.push({ id: biz.id, reason: `resend_${r.status}` })
        continue
      }
      await supabase.from('businesses')
        .update({ sync_price_digest_signature: signature })
        .eq('id', biz.id)
      sent++
    } catch (e) {
      console.error('send-sync-price-reminders: send error', (e as Error).message)
      skipped.push({ id: biz.id, reason: 'send_error' })
    }
  }

  return json({ scanned: partners.length, sent, skipped })
})
