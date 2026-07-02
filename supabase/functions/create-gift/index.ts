import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Wello gifting — create a gift row that a recipient can redeem for credits.
//
// PAYMENT STUB — Stripe not yet wired for gifts. Right now this function
// creates the gift row directly as status='available'. When Stripe is ready:
//   1. Change status default here to 'pending_payment'.
//   2. Route the user through Stripe checkout (see comment block below).
//   3. On checkout.session.completed the webhook flips status to 'available'
//      and sends the notification emails.
// Everything downstream (redeem-gift, the recipient email) works today.

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY            = Deno.env.get('RESEND_API_KEY') || ''

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

// Human-readable claim code. Base32-ish alphabet skips 0/O/1/I so people
// don't misread when they type it in.
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function generateGiftCode(): string {
  let a = '', b = ''
  for (let i = 0; i < 4; i++) a += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
  for (let i = 0; i < 4; i++) b += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
  return `WELLO-${a}-${b}`
}

function isValidEmail(v: unknown): v is string {
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
}

async function sendRecipientEmail(gift: {
  recipient_email: string; recipient_name?: string | null;
  sender_name?: string | null; sender_email: string;
  credits: number; code: string; message?: string | null;
  origin: string;
}) {
  if (!RESEND_API_KEY) { console.warn('create-gift: no RESEND_API_KEY, skipping recipient email'); return 'no_resend_key' }
  const senderLabel = gift.sender_name?.trim() || gift.sender_email
  const claimUrl    = `${gift.origin}/?claim=${encodeURIComponent(gift.code)}`
  const html = `
    <div style="font-family:Manrope,Arial,sans-serif;max-width:540px;margin:0 auto;padding:28px;color:#1B1C19;background:#FBF9F4;">
      <h2 style="color:#213C18;font-size:20px;margin:0 0 6px;letter-spacing:-0.4px;">${senderLabel} sent you a Wello gift</h2>
      <p style="margin:0 0 20px;line-height:1.5;font-size:14px;color:#54584F;">${gift.credits} credits toward wellness anywhere on the island. Yoga, gyms, hotel pools, spa treatments, private instructors and more.</p>
      ${gift.message ? `<div style="background:#F5F3EE;border-left:3px solid #A3B18A;padding:14px 18px;border-radius:6px;margin:0 0 20px;"><p style="margin:0;font-size:13px;color:#1B1C19;line-height:1.55;font-style:italic;">${gift.message.replace(/</g,'&lt;')}</p></div>` : ''}
      <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:8px;margin:0 0 22px;">
        <tr><td style="padding:12px 16px;font-size:12px;color:#54584F;">Claim code</td><td style="padding:12px 16px;font-size:15px;color:#213C18;font-weight:700;font-family:'SF Mono',ui-monospace,monospace;letter-spacing:0.5px;">${gift.code}</td></tr>
        <tr><td style="padding:12px 16px;font-size:12px;color:#54584F;border-top:1px solid #F5F3EE;">Credits</td><td style="padding:12px 16px;font-size:14px;color:#213C18;font-weight:600;border-top:1px solid #F5F3EE;">${gift.credits}</td></tr>
      </table>
      <a href="${claimUrl}" style="display:inline-block;padding:14px 28px;background:#213C18;color:#FBF9F4;text-decoration:none;border-radius:999px;font-weight:700;font-size:14px;letter-spacing:0.2px;">Claim your gift</a>
      <p style="margin:22px 0 0;font-size:11px;color:#A3B18A;line-height:1.5;">If the button doesn't work, sign in on wello-wellness.com and enter your claim code on the Redeem page.</p>
    </div>`
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Wello <hello@wello-wellness.com>',
      to: gift.recipient_email,
      subject: `${senderLabel} sent you a Wello gift`,
      html,
    }),
  }).catch(e => { console.error('Resend recipient error:', e); return null })
  return r?.ok ? 'sent' : 'failed'
}

async function sendSenderReceipt(gift: {
  sender_email: string; sender_name?: string | null;
  recipient_email?: string | null; recipient_name?: string | null;
  credits: number; code: string; origin: string;
}) {
  if (!RESEND_API_KEY) return 'no_resend_key'
  const claimUrl = `${gift.origin}/?claim=${encodeURIComponent(gift.code)}`
  const recipientLabel = gift.recipient_email || 'you (share it however you like)'
  const html = `
    <div style="font-family:Manrope,Arial,sans-serif;max-width:540px;margin:0 auto;padding:28px;color:#1B1C19;background:#FBF9F4;">
      <h2 style="color:#213C18;font-size:20px;margin:0 0 6px;letter-spacing:-0.4px;">Your Wello gift is ready</h2>
      <p style="margin:0 0 20px;line-height:1.5;font-size:14px;color:#54584F;">${gift.credits} credits, delivered to ${recipientLabel}. Keep this claim code somewhere safe in case you want to share it manually.</p>
      <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:8px;margin:0 0 22px;">
        <tr><td style="padding:12px 16px;font-size:12px;color:#54584F;">Claim code</td><td style="padding:12px 16px;font-size:15px;color:#213C18;font-weight:700;font-family:'SF Mono',ui-monospace,monospace;letter-spacing:0.5px;">${gift.code}</td></tr>
        <tr><td style="padding:12px 16px;font-size:12px;color:#54584F;border-top:1px solid #F5F3EE;">Claim link</td><td style="padding:12px 16px;font-size:12px;color:#213C18;border-top:1px solid #F5F3EE;word-break:break-all;"><a href="${claimUrl}" style="color:#213C18;">${claimUrl}</a></td></tr>
      </table>
      <p style="margin:0;font-size:11px;color:#A3B18A;line-height:1.5;">Any questions, reply to this email.</p>
    </div>`
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Wello <hello@wello-wellness.com>',
      to: gift.sender_email,
      subject: `Your Wello gift receipt (${gift.code})`,
      html,
    }),
  }).catch(e => { console.error('Resend sender error:', e); return null })
  return r?.ok ? 'sent' : 'failed'
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')    return json({ error: 'POST only' }, 405)

  try {
    const body = await req.json()
    const credits         = Math.floor(Number(body?.credits))
    const sender_email    = String(body?.sender_email || '').trim().toLowerCase()
    const sender_name     = (body?.sender_name    ? String(body.sender_name).trim() : null) || null
    const recipient_email = body?.recipient_email ? String(body.recipient_email).trim().toLowerCase() : null
    const recipient_name  = body?.recipient_name  ? String(body.recipient_name).trim() : null
    const message         = body?.message         ? String(body.message).slice(0, 400) : null
    const origin          = String(body?.origin || 'https://www.wello-wellness.com')

    if (!Number.isFinite(credits) || credits < 5) return json({ error: 'Minimum gift is 5 credits.' }, 400)
    if (credits > 5000)                            return json({ error: 'Maximum single gift is 5000 credits.' }, 400)
    if (!isValidEmail(sender_email))               return json({ error: 'Enter a valid email for yourself.' }, 400)
    if (recipient_email && !isValidEmail(recipient_email)) return json({ error: 'Recipient email looks invalid.' }, 400)

    const safeOrigin = /^https?:\/\/[a-z0-9.-]+(:\d+)?$/i.test(origin) ? origin : 'https://www.wello-wellness.com'

    // ── STRIPE PAYMENT SLOT ────────────────────────────────────────
    // When you're ready to gate this behind payment, replace the direct
    // insert below with a Stripe Checkout Session created here (same shape
    // as create-checkout-session), pass the generated code + all gift
    // fields as metadata, and have stripe-webhook do the insert (with
    // status='available') once the session settles. Everything else in
    // this file already produces the right shape.
    // ───────────────────────────────────────────────────────────────

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Generate a code, retry on collision (extremely unlikely — 32^8 space).
    let code = generateGiftCode()
    for (let attempt = 0; attempt < 4; attempt++) {
      const { data: existing } = await supabase.from('gifts').select('id').eq('code', code).maybeSingle()
      if (!existing) break
      code = generateGiftCode()
    }

    const { data: inserted, error: insErr } = await supabase
      .from('gifts')
      .insert({
        code,
        credits,
        sender_email,
        sender_name,
        recipient_email,
        recipient_name,
        message,
        status: 'available', // TODO: 'pending_payment' once Stripe is wired
      })
      .select('id, code, credits, sender_email, sender_name, recipient_email, recipient_name, message, status, created_at')
      .single()
    if (insErr || !inserted) {
      console.error('create-gift: insert failed', insErr?.message)
      return json({ error: 'Could not create gift. Please try again.' }, 500)
    }

    // Fire emails in parallel — no need to await the customer response.
    const [recipientEmailResult, senderReceiptResult] = await Promise.all([
      inserted.recipient_email
        ? sendRecipientEmail({
            recipient_email: inserted.recipient_email,
            recipient_name:  inserted.recipient_name,
            sender_name:     inserted.sender_name,
            sender_email:    inserted.sender_email,
            credits:         inserted.credits,
            code:            inserted.code,
            message:         inserted.message,
            origin:          safeOrigin,
          })
        : Promise.resolve('no_recipient'),
      sendSenderReceipt({
        sender_email:    inserted.sender_email,
        sender_name:     inserted.sender_name,
        recipient_email: inserted.recipient_email,
        recipient_name:  inserted.recipient_name,
        credits:         inserted.credits,
        code:            inserted.code,
        origin:          safeOrigin,
      }),
    ])
    console.log('create-gift:', { code: inserted.code, recipient_email: recipientEmailResult, sender_receipt: senderReceiptResult })

    return json({
      success: true,
      code: inserted.code,
      credits: inserted.credits,
      claim_url: `${safeOrigin}/?claim=${encodeURIComponent(inserted.code)}`,
    })
  } catch (e) {
    console.error('create-gift exception:', e)
    return json({ error: (e as Error).message || 'Unexpected error' }, 500)
  }
})
