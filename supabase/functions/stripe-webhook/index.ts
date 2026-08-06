import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import Stripe from 'https://esm.sh/stripe@17.3.0?target=denonext'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Stripe webhook receiver. Two flows share this endpoint:
//   1. Credit top-up:  metadata.user_id + metadata.credits -> profiles.credits += credits
//   2. Gift purchase:  metadata.type === 'gift' -> insert gifts row + fire notification emails
// Both are keyed off session.metadata so we can tell them apart. Deployed
// with --no-verify-jwt because Stripe doesn't send a Supabase JWT — we
// verify Stripe's signature (HMAC against STRIPE_WEBHOOK_SECRET) instead.

const STRIPE_SECRET_KEY             = Deno.env.get('STRIPE_SECRET_KEY')!
// Direct endpoint secret — used for platform events (checkout.session.completed).
const STRIPE_WEBHOOK_SECRET         = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? ''
// Connect endpoint secret — used for connected-account events
// (account.updated for Express partners onboarding). Stripe delivers
// Connect events only to endpoints registered with connect: true, which
// is a separate endpoint with its own signing secret. We try both when
// verifying — Stripe signs each delivery with the endpoint's own secret,
// so the wrong secret produces a signature mismatch, not a corrupted
// event, and it's safe to fall through.
const STRIPE_WEBHOOK_SECRET_CONNECT = Deno.env.get('STRIPE_WEBHOOK_SECRET_CONNECT') ?? ''
const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY            = Deno.env.get('RESEND_API_KEY') || ''

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2024-09-30.acacia',
  httpClient: Stripe.createFetchHttpClient(),
})

// ─── Gift email templates ──────────────────────────────────────
async function sendRecipientEmail(gift: {
  recipient_email: string; recipient_name?: string | null;
  sender_name?: string | null; sender_email: string;
  credits: number; code: string; message?: string | null;
  origin: string;
}) {
  if (!RESEND_API_KEY) return 'no_resend_key'
  const senderLabel = gift.sender_name?.trim() || gift.sender_email
  const claimUrl    = `${gift.origin}/?claim=${encodeURIComponent(gift.code)}`
  const html = `
    <div style="font-family:Manrope,Arial,sans-serif;max-width:540px;margin:0 auto;padding:28px;color:#1B1C19;background:#FBF9F4;">
      <h2 style="color:#213C18;font-size:20px;margin:0 0 6px;letter-spacing:-0.4px;">${senderLabel} sent you a Wello gift</h2>
      <p style="margin:0 0 20px;line-height:1.5;font-size:14px;color:#54584F;">${gift.credits} credits toward wellness anywhere on the island. Redeemable across all Wello partners.</p>
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
  recipient_email?: string | null;
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
  if (req.method !== 'POST') return new Response('POST only', { status: 405 })

  try {
    const sig = req.headers.get('stripe-signature')
    if (!sig) return new Response('Missing stripe-signature header', { status: 400 })

    const rawBody = await req.text()

    // Try the direct-endpoint secret first, then the Connect-endpoint
    // secret. Stripe signs each delivery with exactly one of the two,
    // so the wrong secret raises SignatureVerificationError and we fall
    // through to the other. If both fail, the payload isn't legitimately
    // ours.
    const candidateSecrets = [STRIPE_WEBHOOK_SECRET, STRIPE_WEBHOOK_SECRET_CONNECT].filter(Boolean)
    if (candidateSecrets.length === 0) {
      console.error('stripe-webhook: no signing secrets configured')
      return new Response('Webhook secret not configured', { status: 500 })
    }
    let event: Stripe.Event | null = null
    let lastErr: string | null = null
    for (const secret of candidateSecrets) {
      try {
        event = await stripe.webhooks.constructEventAsync(rawBody, sig, secret)
        break
      } catch (err) {
        lastErr = (err as Error).message
      }
    }
    if (!event) {
      console.error('stripe-webhook: signature verification failed against all configured secrets:', lastErr)
      return new Response('Invalid signature', { status: 400 })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // ── Idempotency gate ──────────────────────────────────────
    // Record event.id BEFORE running any side-effect. A duplicate
    // insert (23505) means Stripe already delivered this event and
    // we handled it — short-circuit with 200 so Stripe stops
    // retrying. Doing this in front of every branch means the guard
    // covers every event type, not just credit grants (gift claims,
    // account.updated mirrors, and any future branches).
    //
    // If the downstream side-effect later fails, we've committed to
    // "processed" for this event.id — the tradeoff is dropping a
    // legit event on a downstream failure vs. double-granting on a
    // Stripe retry. Double-granting is by far the worse of the two
    // for a credits ledger, so record-first is the right call.
    const { error: dedupErr } = await supabase
      .from('stripe_processed_events')
      .insert({ event_id: event.id, event_type: event.type })
    if (dedupErr) {
      if (dedupErr.code === '23505') {
        console.log(`stripe-webhook: replay of ${event.id} (${event.type}) — no-op`)
        return new Response(JSON.stringify({ ok: true, duplicate: true, event_id: event.id }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        })
      }
      console.error('stripe-webhook: dedup insert failed:', dedupErr.message)
      return new Response('Dedup check failed', { status: 500 })
    }

    // ── Connected-account updates (Stripe Connect onboarding progress) ──
    // Fired when a partner completes any step of Stripe's hosted onboarding,
    // when Stripe re-verifies documents, when payouts become enabled, and
    // when Stripe restricts an account for compliance reasons. We coarse-
    // grain-mirror this into businesses.stripe_account_status so the
    // portal can render a "pending / active / restricted" pill without
    // hitting the Stripe API on every render.
    if (event.type === 'account.updated') {
      const account = event.data.object as Stripe.Account
      let status: 'active' | 'pending' | 'restricted' = 'pending'
      if (account.charges_enabled && account.payouts_enabled) status = 'active'
      if (account.requirements?.disabled_reason)              status = 'restricted'
      const { data: updated, error: updErr } = await supabase
        .from('businesses')
        .update({ stripe_account_status: status })
        .eq('stripe_account_id', account.id)
        .select('id')
      if (updErr) console.error('stripe-webhook (account.updated): update failed', updErr.message)
      else console.log(`stripe-webhook (account.updated): ${account.id} -> ${status}${updated?.length ? '' : ' (no row matched)'}`)
      return new Response(JSON.stringify({ ok: true, status }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      })
    }

    if (event.type !== 'checkout.session.completed') {
      return new Response(JSON.stringify({ ignored: event.type }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      })
    }

    const session = event.data.object as Stripe.Checkout.Session

    if (session.payment_status !== 'paid') {
      console.log('stripe-webhook: session not paid, skipping', { id: session.id, payment_status: session.payment_status })
      return new Response(JSON.stringify({ skipped: 'not paid' }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      })
    }

    const meta = session.metadata || {}

    // ── Gift flow ──────────────────────────────────────────────
    if (meta.type === 'gift') {
      const code            = meta.code
      const credits         = parseInt(meta.credits || '0', 10)
      const sender_email    = meta.sender_email || ''
      const sender_name     = meta.sender_name    || null
      const recipient_email = meta.recipient_email || null
      const recipient_name  = meta.recipient_name  || null
      const message         = meta.message         || null
      if (!code || !credits || credits < 1 || !sender_email) {
        console.error('stripe-webhook (gift): missing metadata', meta)
        return new Response('Invalid gift metadata', { status: 400 })
      }
      // Idempotency: if the webhook re-fires (Stripe retries) we don't want
      // to duplicate the gift or resend emails. Look up by stripe_session_id.
      const { data: existing } = await supabase
        .from('gifts').select('id, code').eq('stripe_session_id', session.id).maybeSingle()
      if (existing) {
        console.log('stripe-webhook (gift): already processed', { session: session.id, code: existing.code })
        return new Response(JSON.stringify({ ok: true, duplicate: true, code: existing.code }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        })
      }
      const { data: inserted, error: insErr } = await supabase
        .from('gifts')
        .insert({
          code,
          credits,
          sender_email,
          sender_name,
          recipient_email: recipient_email || null,
          recipient_name:  recipient_name  || null,
          message,
          status: 'available',
          stripe_session_id: session.id,
        })
        .select('id, code, credits, sender_email, sender_name, recipient_email, message')
        .single()
      if (insErr || !inserted) {
        console.error('stripe-webhook (gift): insert failed', insErr?.message)
        return new Response('Gift insert failed', { status: 500 })
      }
      // Origin comes from the success_url — we saved it there so we can build claim links
      const origin = (session.success_url || 'https://www.wello-wellness.com').replace(/\/\?.*$/, '')
      const [recipientResult, senderResult] = await Promise.all([
        inserted.recipient_email
          ? sendRecipientEmail({
              recipient_email: inserted.recipient_email,
              recipient_name,
              sender_name:  inserted.sender_name,
              sender_email: inserted.sender_email,
              credits:      inserted.credits,
              code:         inserted.code,
              message:      inserted.message,
              origin,
            })
          : Promise.resolve('no_recipient'),
        sendSenderReceipt({
          sender_email:    inserted.sender_email,
          sender_name:     inserted.sender_name,
          recipient_email: inserted.recipient_email,
          credits:         inserted.credits,
          code:            inserted.code,
          origin,
        }),
      ])
      console.log('stripe-webhook (gift): created', { code: inserted.code, recipient_email: recipientResult, sender_receipt: senderResult })
      return new Response(JSON.stringify({ ok: true, code: inserted.code, credits: inserted.credits }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      })
    }

    // ── Credit top-up flow (existing) ──────────────────────────
    const userId  = meta.user_id
    const credits = parseInt(meta.credits || '0', 10)
    if (!userId || !credits || credits < 1) {
      console.error('stripe-webhook: missing or invalid metadata', meta)
      return new Response(JSON.stringify({ error: 'Invalid metadata' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      })
    }

    const { error: grantErr } = await supabase.rpc('grant_credits', {
      p_user_id:     userId,
      p_amount:      credits,
      p_credit_type: 'purchased',
      p_source:      'stripe',
      p_expires_at:  null,
      p_note:        `stripe session ${session.id}`,
    })

    if (grantErr) {
      console.error('stripe-webhook: grant_credits failed', grantErr.message)
      return new Response('Update failed', { status: 500 })
    }

    // The ledger trigger has already refreshed profiles.credits. Read
    // it back so the response body still carries a new_balance.
    const { data: profile } = await supabase
      .from('profiles').select('credits').eq('id', userId).maybeSingle()
    const newBalance = profile?.credits ?? credits

    console.log(`stripe-webhook: +${credits} credits to ${userId} (new balance ${newBalance}, session ${session.id})`)
    return new Response(JSON.stringify({ ok: true, user_id: userId, credits_added: credits, new_balance: newBalance }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('stripe-webhook unexpected error:', e)
    return new Response((e as Error).message || 'Unexpected error', { status: 500 })
  }
})
