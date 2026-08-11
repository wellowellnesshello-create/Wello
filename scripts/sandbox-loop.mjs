// Sandbox loop for the credit_ledger PR.
//
// Seeds a self-contained fixture in the LOCAL Supabase (never touches
// the linked project), then drives the six-step payment + payout
// loop through edge functions / RPCs, and prints PASS/FAIL per step
// with the ledger state as evidence.
//
// Run:
//   SUPABASE_URL=http://127.0.0.1:54321 \
//   SUPABASE_SERVICE_ROLE_KEY=sb_secret_... \
//   SUPABASE_ANON_KEY=sb_publishable_... \
//   STRIPE_SECRET_KEY=sk_test_... \
//   STRIPE_WEBHOOK_SECRET=whsec_... \
//   STRIPE_CONNECT_ACCOUNT=acct_... \
//   node scripts/sandbox-loop.mjs

import { createClient } from '@supabase/supabase-js'
import crypto from 'node:crypto'

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_ANON_KEY,
  STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET,
  STRIPE_CONNECT_ACCOUNT,
} = process.env

for (const [name, val] of Object.entries({
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY,
  STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_CONNECT_ACCOUNT,
})) {
  if (!val) { console.error(`missing env: ${name}`); process.exit(1) }
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ── Reporting helpers ────────────────────────────────────────────
const results = []
function pass(step, detail) { results.push({ step, status: 'PASS', detail }) ; console.log(`✓ ${step}: PASS — ${detail}`) }
function fail(step, detail) { results.push({ step, status: 'FAIL', detail }) ; console.log(`✗ ${step}: FAIL — ${detail}`) }
function skip(step, detail) { results.push({ step, status: 'SKIP', detail }) ; console.log(`↷ ${step}: SKIP — ${detail}`) }

// ── Seed fixture ─────────────────────────────────────────────────
async function seed() {
  console.log('\n── Seeding fixture ─────────────────────────────────')

  // Fresh users every run — the trailing timestamp makes conflicts
  // impossible and any earlier sandbox rows cascade-clean when the
  // auth user is deleted at the end.
  const custEmail  = `sandbox-cust-${Date.now()}@test.local`
  const bizEmail   = `sandbox-biz-${Date.now()}@test.local`
  const password   = 'sandbox-loop-' + crypto.randomUUID()

  // 1. Customer + JWT (customer starts at zero credits — profile row
  //    inserted explicitly since some auth triggers only fire on auth
  //    UI paths).
  const { data: custUser, error: custErr } = await admin.auth.admin.createUser({
    email: custEmail, password, email_confirm: true,
  })
  if (custErr) throw new Error(`create customer: ${custErr.message}`)
  const custId = custUser.user.id
  await admin.from('profiles').upsert({ id: custId, email: custEmail, credits: 0 })

  const custClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: sess, error: sessErr } = await custClient.auth.signInWithPassword({
    email: custEmail, password,
  })
  if (sessErr) throw new Error(`sign in customer: ${sessErr.message}`)
  const custJwt = sess.session.access_token

  // 2. Business owner + business row.
  const { data: bizUser, error: bizErr } = await admin.auth.admin.createUser({
    email: bizEmail, password, email_confirm: true,
  })
  if (bizErr) throw new Error(`create biz owner: ${bizErr.message}`)
  const bizOwnerId = bizUser.user.id
  await admin.from('profiles').upsert({ id: bizOwnerId, email: bizEmail, credits: 0 })

  const { data: biz, error: bizInsErr } = await admin.from('businesses').insert({
    name: 'Sandbox Yoga Studio',
    category: 'Yoga',
    email: bizEmail,
    user_id: bizOwnerId,
    stripe_account_id: STRIPE_CONNECT_ACCOUNT,
    stripe_account_status: 'active',           // Bypasses the "account_not_active" skip
    terms_accepted_commission: 0.15,           // Required by planForBusiness
    terms_accepted_at: new Date().toISOString(),
    terms_version: 'sandbox',
    status: 'active',
    location: 'Palma',
    cr: 20,
  }).select('id').single()
  if (bizInsErr) throw new Error(`insert business: ${bizInsErr.message}`)

  // 3. Listing + slot (slot ~10 days out — booking will land inside
  //    cancel window for step 3).
  const { data: listing, error: lstErr } = await admin.from('listings').insert({
    name: 'Sandbox Yoga Studio',
    cat: 'Yoga',
    loc: 'Palma',
    cr: 20,
    business_id: biz.id,
    status: 'active',
  }).select('id').single()
  if (lstErr) throw new Error(`insert listing: ${lstErr.message}`)

  const slotDate = new Date(Date.now() + 10 * 24 * 3600e3)
  const iso      = slotDate.toISOString().slice(0, 10)
  const { data: slot, error: slotErr } = await admin.from('slots').insert({
    listing_id: listing.id,
    name: 'Morning Vinyasa',
    date: iso,
    time: '09:00',
    dur: '60 min',
    spots: 10,
    booked: 0,
    credits: 20,
    live: true,
    category: 'Yoga',
  }).select('id').single()
  if (slotErr) throw new Error(`insert slot: ${slotErr.message}`)

  console.log(`  customer:  ${custId}`)
  console.log(`  business:  #${biz.id}  (${STRIPE_CONNECT_ACCOUNT})`)
  console.log(`  listing:   #${listing.id}`)
  console.log(`  slot:      #${slot.id}   ${iso} 09:00`)
  return { custId, custEmail, custJwt, bizId: biz.id, listingId: listing.id, slotId: slot.id, slotDate: iso }
}

// ── Ledger inspection helpers ────────────────────────────────────
async function ledgerRows(userId) {
  const { data } = await admin.from('credit_ledger')
    .select('id, kind, delta, credit_type, remaining, source, booking_id, parent_id, note, created_at')
    .eq('user_id', userId).order('id', { ascending: true })
  return data || []
}
async function profileCredits(userId) {
  const { data } = await admin.from('profiles').select('credits').eq('id', userId).maybeSingle()
  return data?.credits ?? null
}
async function balance(userId) {
  const { data } = await admin.rpc('credit_balance', { p_user_id: userId })
  return Array.isArray(data) ? data[0] : data
}

// ── Signed Stripe webhook helper ─────────────────────────────────
// Build a checkout.session.completed event with the metadata the
// webhook expects, sign it with STRIPE_WEBHOOK_SECRET, and POST to
// the local endpoint. Bypasses Stripe entirely — we're testing the
// webhook → ledger path, not Stripe's plumbing.
function signStripeEvent(rawBody) {
  // Stripe SDKs use the whole "whsec_..." string as the HMAC key —
  // don't strip the prefix (this is how stripe-node's verifyHeader
  // does it).
  const ts = Math.floor(Date.now() / 1000)
  const signed = `${ts}.${rawBody}`
  const sig = crypto.createHmac('sha256', STRIPE_WEBHOOK_SECRET).update(signed).digest('hex')
  return `t=${ts},v1=${sig}`
}

async function fireCheckoutCompleted({ userId, credits, eventId }) {
  const event = {
    id: eventId,
    object: 'event',
    api_version: '2024-06-20',
    created: Math.floor(Date.now() / 1000),
    type: 'checkout.session.completed',
    livemode: false,
    data: {
      object: {
        id: `cs_test_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`,
        object: 'checkout.session',
        mode: 'payment',
        payment_status: 'paid',
        status: 'complete',
        amount_total: credits * 100,
        currency: 'eur',
        metadata: {
          user_id: userId,
          credits: String(credits),
          fee_cents: '250',
        },
      },
    },
  }
  const raw = JSON.stringify(event)
  const sig = signStripeEvent(raw)
  const res = await fetch(`${SUPABASE_URL}/functions/v1/stripe-webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'stripe-signature': sig },
    body: raw,
  })
  const text = await res.text()
  return { status: res.status, body: text, eventId }
}

// ── Step 1 · Buy credits ─────────────────────────────────────────
async function step1(ctx) {
  const before = await ledgerRows(ctx.custId)
  const eventId = `evt_test_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`
  const res = await fireCheckoutCompleted({ userId: ctx.custId, credits: 25, eventId })
  if (res.status !== 200) return fail('Step 1 — buy credits', `webhook returned ${res.status}: ${res.body.slice(0, 200)}`)

  const after = await ledgerRows(ctx.custId)
  const newRows = after.filter(r => !before.find(b => b.id === r.id))
  const grantRows = newRows.filter(r => r.kind === 'grant' && r.credit_type === 'purchased')
  if (grantRows.length !== 1) return fail('Step 1 — buy credits', `expected 1 new purchased grant, got ${grantRows.length}`)
  const g = grantRows[0]
  if (g.delta !== 25 || g.remaining !== 25) return fail('Step 1 — buy credits', `grant delta/remaining mismatch: delta=${g.delta} remaining=${g.remaining}`)

  const profCredits = await profileCredits(ctx.custId)
  if (profCredits !== 25) return fail('Step 1 — buy credits', `profiles.credits=${profCredits}, expected 25`)

  ctx.step1EventId = eventId
  return pass('Step 1 — buy credits',
    `webhook OK, purchased grant #${g.id} delta=25 remaining=25, profiles.credits=25`)
}

// ── Step 2 · Book (spend_credits via edge fn) ────────────────────
async function step2(ctx) {
  // Insert a booking row as the customer would through the UI, then
  // invoke spend-booking-credits with their JWT.
  const { data: booking, error: bkErr } = await admin.from('bookings').insert({
    user_id:      ctx.custId,
    business_id:  ctx.bizId,
    venue_id:     ctx.bizId,
    slot_id:      String(ctx.slotId),
    booking_date: ctx.slotDate,
    start_time:   '09:00',
    duration:     '60 min',
    credits_used: 20,
    status:       'confirmed',
  }).select('id').single()
  if (bkErr) return fail('Step 2 — book', `booking insert failed: ${bkErr.message}`)

  const custClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${ctx.custJwt}` } },
  })
  const invRes = await custClient.functions.invoke('spend-booking-credits', {
    body: { booking_id: booking.id, source: 'booking' },
  })
  if (invRes.error) return fail('Step 2 — book', `invoke error: ${invRes.error.message}`)
  if (invRes.data?.error) return fail('Step 2 — book', `fn returned error: ${JSON.stringify(invRes.data)}`)

  const rows  = await ledgerRows(ctx.custId)
  const spend = rows.find(r => r.kind === 'spend' && r.booking_id === booking.id)
  if (!spend)               return fail('Step 2 — book', `no spend row for booking ${booking.id}`)
  if (spend.delta !== -20)  return fail('Step 2 — book', `spend delta=${spend.delta}, expected -20`)
  const grant = rows.find(r => r.kind === 'grant')
  if (!grant || grant.remaining !== 5) return fail('Step 2 — book', `grant remaining=${grant?.remaining}, expected 5`)
  const profCredits = await profileCredits(ctx.custId)
  if (profCredits !== 5) return fail('Step 2 — book', `profiles.credits=${profCredits}, expected 5`)

  ctx.step2BookingId = booking.id
  return pass('Step 2 — book',
    `spend #${spend.id} linked to grant #${grant.id}, delta=-20, grant.remaining=5, profiles.credits=5`)
}

// ── Step 3 · Cancel (refund_by_booking via cancel-booking fn) ────
async function step3(ctx) {
  const custClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${ctx.custJwt}` } },
  })
  const invRes = await custClient.functions.invoke('cancel-booking', {
    body: { booking_id: ctx.step2BookingId },
  })
  if (invRes.error) return fail('Step 3 — cancel', `invoke error: ${invRes.error.message}`)
  if (invRes.data?.error) return fail('Step 3 — cancel', `fn returned error: ${JSON.stringify(invRes.data)}`)
  if (!invRes.data?.success) return fail('Step 3 — cancel', `success=false: ${JSON.stringify(invRes.data)}`)
  if (invRes.data.credits_refunded !== 20)
    return fail('Step 3 — cancel', `credits_refunded=${invRes.data.credits_refunded}, expected 20`)

  const rows = await ledgerRows(ctx.custId)
  const refund = rows.find(r => r.kind === 'refund' && r.booking_id === ctx.step2BookingId)
  if (!refund) return fail('Step 3 — cancel', 'no refund row for cancelled booking')
  const grant = rows.find(r => r.kind === 'grant')
  if (!grant || grant.remaining !== 25) return fail('Step 3 — cancel', `grant remaining=${grant?.remaining}, expected 25 after refund`)
  const profCredits = await profileCredits(ctx.custId)
  if (profCredits !== 25) return fail('Step 3 — cancel', `profiles.credits=${profCredits}, expected 25`)

  return pass('Step 3 — cancel',
    `refund #${refund.id} delta=${refund.delta}, grant.remaining restored to 25, profiles.credits=25`)
}

// ── Step 4 · Treatment request + forced rollback ─────────────────
// To exercise the rollback branch (booking inserted → spend fails →
// booking deleted), we make profiles.credits > offering price so the
// pre-check passes, while credit_ledger remaining is lower so the
// spend RPC raises insufficient_credits. Manual UPDATE on
// profiles.credits works because the trigger only fires on
// credit_ledger changes, not on direct profile writes.
async function step4(ctx) {
  // Configure the business with a 50-credit offering so 25 < 50.
  await admin.from('businesses').update({
    session_offerings: [{ type: 'Deep Tissue Massage', price_eur: 50, length_min: 60 }],
  }).eq('id', ctx.bizId)

  // Sanity: ledger balance right now is 25 (from step 3). Inflate the
  // cached total on profiles so the pre-check passes.
  await admin.from('profiles').update({ credits: 999 }).eq('id', ctx.custId)

  const custClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${ctx.custJwt}` } },
  })
  const rowsBefore = await ledgerRows(ctx.custId)

  const preferredDate = new Date(Date.now() + 5 * 24 * 3600e3).toISOString().slice(0, 10)
  const invRes = await custClient.functions.invoke('request-treatment-booking', {
    body: {
      business_id: ctx.bizId,
      offering_type: 'Deep Tissue Massage',
      preferred_date: preferredDate,
      time_pref: 'morning',
    },
  })

  // Expect insufficient_credits since the ledger only has 25.
  // functions.invoke throws on 4xx; unwrap via .context.body when
  // needed since data is null on non-2xx.
  let errText = invRes.data?.error || invRes.error?.message || ''
  if (!errText.includes('insufficient_credits') && invRes.error?.context?.body) {
    try {
      const body = await invRes.error.context.text?.() ?? invRes.error.context.body
      if (typeof body === 'string' && body.includes('insufficient_credits')) errText = body
    } catch { /* noop */ }
  }
  // Fallback: hit the fn directly to read the error body.
  if (!errText.includes('insufficient_credits')) {
    const direct = await fetch(`${SUPABASE_URL}/functions/v1/request-treatment-booking`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ctx.custJwt}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        business_id: ctx.bizId,
        offering_type: 'Deep Tissue Massage',
        preferred_date: preferredDate,
        time_pref: 'morning',
      }),
    })
    const txt = await direct.text()
    if (!txt.includes('insufficient_credits')) {
      return fail('Step 4 — treatment rollback', `expected insufficient_credits, got HTTP ${direct.status}: ${txt.slice(0, 200)}`)
    }
  }

  // Verify no ghost booking left behind for this customer + offering.
  const { data: ghosts } = await admin.from('bookings')
    .select('id, status').eq('user_id', ctx.custId)
    .eq('business_id', ctx.bizId).eq('offering_type', 'Deep Tissue Massage')
  if (ghosts && ghosts.length > 0) {
    return fail('Step 4 — treatment rollback',
      `${ghosts.length} orphaned booking row(s) remain: ${JSON.stringify(ghosts)}`)
  }

  // Verify no orphaned spend rows landed.
  const rowsAfter = await ledgerRows(ctx.custId)
  const newSpends = rowsAfter.filter(r => r.kind === 'spend' && !rowsBefore.find(b => b.id === r.id))
  if (newSpends.length > 0) {
    return fail('Step 4 — treatment rollback',
      `${newSpends.length} orphaned spend rows: ${JSON.stringify(newSpends)}`)
  }

  // Restore profiles.credits from the ledger so the trigger and cached
  // total realign for later steps.
  await admin.from('credit_ledger').update({ note: 'sandbox realign' })
    .eq('user_id', ctx.custId).eq('kind', 'grant').limit(1)

  return pass('Step 4 — treatment rollback',
    'insufficient_credits raised after booking insert; no orphaned booking or spend rows remain')
}

// ── Step 5 · Manual payout ───────────────────────────────────────
// Seed a delivered confirmed booking (session yesterday) so
// run-weekly-payouts finds something to pay.
async function step5(ctx) {
  // 7 days back sits before any reasonable weekly cutoff (function
  // uses "last Monday Madrid noon" or similar).
  const past = new Date(Date.now() - 7 * 24 * 3600e3).toISOString().slice(0, 10)
  const { data: pastBk, error: pastErr } = await admin.from('bookings').insert({
    user_id:       ctx.custId,
    business_id:   ctx.bizId,
    venue_id:      ctx.bizId,
    slot_id:       String(ctx.slotId),
    booking_date:  past,
    start_time:    '09:00',
    duration:      '60 min',
    credits_used:  20,
    status:        'confirmed',
    payout_at:     null,
  }).select('id').single()
  if (pastErr) return fail('Step 5 — payout', `seed past booking: ${pastErr.message}`)

  // Invoke run-weekly-payouts with service-role auth (path A).
  const res = await fetch(`${SUPABASE_URL}/functions/v1/run-weekly-payouts`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({ dry_run: false }),
  })
  const text = await res.text()
  let payload
  try { payload = JSON.parse(text) } catch { payload = { raw: text.slice(0, 500) } }

  if (res.status !== 200) {
    return fail('Step 5 — payout', `HTTP ${res.status}: ${text.slice(0, 400)}`)
  }

  // Look at what the function reported and cross-check DB state.
  const businessOutcomes = payload.businesses || payload.results || []
  const ourOutcome = Array.isArray(businessOutcomes)
    ? businessOutcomes.find(b => b.business_id === ctx.bizId)
    : null

  const { data: log } = await admin.from('payout_log')
    .select('id, business_id, status, stripe_transfer_id, statement_path, statement_email_status, net_cents, gross_cents, error_message')
    .eq('business_id', ctx.bizId).eq('status', 'paid').order('id', { ascending: false }).limit(1)
  const logRow = log?.[0]

  // Missing email doesn't fail per user's instruction — but PDF must exist.
  if (!logRow) return fail('Step 5 — payout', `no paid payout_log row for business ${ctx.bizId}; response: ${JSON.stringify(payload).slice(0, 400)}`)
  if (!logRow.stripe_transfer_id) return fail('Step 5 — payout', `payout_log has no stripe_transfer_id; row: ${JSON.stringify(logRow)}`)
  if (!logRow.statement_path) return fail('Step 5 — payout', `no statement_path recorded; row: ${JSON.stringify(logRow)}`)

  // Verify PDF actually landed in storage.
  const { data: dl, error: dlErr } = await admin.storage.from('payout-statements').download(logRow.statement_path)
  if (dlErr || !dl) return fail('Step 5 — payout', `statement PDF not in storage: ${dlErr?.message}`)
  const buf = new Uint8Array(await dl.arrayBuffer())
  const header = String.fromCharCode(...buf.slice(0, 5))
  if (!header.startsWith('%PDF-')) return fail('Step 5 — payout', `stored file is not a PDF (header="${header}")`)

  const emailNote = logRow.statement_email_status === 'sent'    ? 'email sent'
                  : logRow.statement_email_status === 'no_resend_key' ? 'email skipped (no RESEND_API_KEY, allowed)'
                  : `statement_email_status=${logRow.statement_email_status}`

  return pass('Step 5 — payout',
    `transfer=${logRow.stripe_transfer_id}, PDF ${logRow.statement_path} (${buf.length}B, valid header), net=${logRow.net_cents}c; ${emailNote}`)
}

// ── Step 6 · Idempotency (replay the step 1 webhook) ─────────────
async function step6(ctx) {
  if (!ctx.step1EventId) return skip('Step 6 — idempotency', 'no step-1 event id')
  const rowsBefore   = await ledgerRows(ctx.custId)
  const balBefore    = await balance(ctx.custId)
  const grantCountBefore = rowsBefore.filter(r => r.kind === 'grant' && r.source === 'stripe').length

  // Replay: fire a webhook that carries the SAME event id + metadata.
  const raw = JSON.stringify({
    id: ctx.step1EventId,
    object: 'event',
    api_version: '2024-06-20',
    created: Math.floor(Date.now() / 1000),
    type: 'checkout.session.completed',
    livemode: false,
    data: {
      object: {
        id: `cs_test_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`,
        object: 'checkout.session',
        mode: 'payment',
        payment_status: 'paid',
        status: 'complete',
        amount_total: 2500,
        currency: 'eur',
        metadata: { user_id: ctx.custId, credits: '25', fee_cents: '250' },
      },
    },
  })
  const sig = signStripeEvent(raw)
  await fetch(`${SUPABASE_URL}/functions/v1/stripe-webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'stripe-signature': sig },
    body: raw,
  })

  const rowsAfter        = await ledgerRows(ctx.custId)
  const grantCountAfter  = rowsAfter.filter(r => r.kind === 'grant' && r.source === 'stripe').length
  const balAfter         = await balance(ctx.custId)

  if (grantCountAfter !== grantCountBefore || balAfter.purchased !== balBefore.purchased || balAfter.bonus !== balBefore.bonus) {
    return fail('Step 6 — idempotency',
      `webhook replay CHANGED state — stripe-grants ${grantCountBefore}→${grantCountAfter}, purchased ${balBefore.purchased}→${balAfter.purchased}. Webhook has no dedup guard.`)
  }
  return pass('Step 6 — idempotency',
    `replay landed but state unchanged (stripe-grants=${grantCountAfter}, purchased=${balAfter.purchased})`)
}

// ── Transcend fixture ────────────────────────────────────────────
// One business (NOT Private Instructor — so studio pending_venue
// path exercises), one listing, multiple slots at 13:00 for
// collision, request-mode slots at 15:00 and 16:00 for booking-mode
// tests, and one sibling to prove the pending_venue hold blocks
// overlapping slots.
//
// Also grants the customer 100 bonus credits so steps 7-9 have
// enough runway on top of whatever step 1's grant left after
// steps 2-4.
async function seedTranscend(ctx) {
  console.log('\n── Seeding Transcend fixture ────────────────────')

  await admin.rpc('grant_credits', {
    p_user_id:     ctx.custId,
    p_amount:      100,
    p_credit_type: 'bonus',
    p_source:      'sandbox_transcend_runway',
    p_expires_at:  null,
    p_note:        'runway for steps 7-9',
  })

  const email = `sandbox-transcend-${Date.now()}@test.local`
  const { data: biz, error: bizErr } = await admin.from('businesses').insert({
    name: 'Sandbox Transcend',
    category: 'Wellness',
    status: 'active',
    email,
  }).select('id').single()
  if (bizErr) throw new Error(`transcend biz: ${bizErr.message}`)

  const { data: lst, error: lstErr } = await admin.from('listings').insert({
    name: 'Sandbox Transcend Studio',
    cat: 'Wellness',
    loc: 'Palma',
    cr: 10,
    business_id: biz.id,
    status: 'active',
  }).select('id').single()
  if (lstErr) throw new Error(`transcend listing: ${lstErr.message}`)

  const date = new Date(Date.now() + 14 * 24 * 3600e3).toISOString().slice(0, 10)

  async function makeSlot({ time, dur, mode = 'instant' }) {
    const { data, error } = await admin.from('slots').insert({
      listing_id:   lst.id,
      name:         `${dur} Session`,
      date, time, dur,
      spots: 1, booked: 0, credits: 10, live: true,
      booking_mode: mode,
    }).select('id').single()
    if (error) throw new Error(`slot ${time}/${dur}/${mode}: ${error.message}`)
    return data.id
  }

  const slots = {
    // 13:00 siblings, all instant — step 7 collision fixture.
    s30_1300: await makeSlot({ time: '13:00', dur: '30 min' }),
    s45_1300: await makeSlot({ time: '13:00', dur: '45 min' }),
    s60_1300: await makeSlot({ time: '13:00', dur: '60 min' }),
    s90_1300: await makeSlot({ time: '13:00', dur: '90 min' }),
    // 15:00 request-mode — step 8 accept path.
    request_1500: await makeSlot({ time: '15:00', dur: '60 min', mode: 'request' }),
    // 16:00 request-mode + sibling — step 9 pending-hold + decline.
    request_1600: await makeSlot({ time: '16:00', dur: '60 min', mode: 'request' }),
    s30_1600:     await makeSlot({ time: '16:00', dur: '30 min' }),
  }

  console.log(`  transcend biz:  #${biz.id}  (studio, not Private Instructor)`)
  console.log(`  listing:        #${lst.id}`)
  console.log(`  slots @ ${date}: ${Object.keys(slots).length} rows`)

  ctx.transcendBiz     = biz.id
  ctx.transcendListing = lst.id
  ctx.transcendDate    = date
  ctx.slots            = slots
}

// ── Booking helpers shared by steps 7-9 ──────────────────────────
function customerClient(ctx) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${ctx.custJwt}` } },
  })
}

async function insertBooking({ ctx, slotId, time, duration, status, cost = 10 }) {
  const { data, error } = await admin.from('bookings').insert({
    user_id:      ctx.custId,
    business_id:  ctx.transcendBiz,
    venue_id:     ctx.transcendBiz,
    slot_id:      String(slotId),
    booking_date: ctx.transcendDate,
    start_time:   time,
    duration,
    credits_used: cost,
    status,
  }).select('id').single()
  if (error) throw new Error(`insert booking: ${error.message}`)
  return data.id
}

async function bumpSlotBooked(slotId, delta) {
  const { data: row } = await admin.from('slots').select('booked').eq('id', slotId).maybeSingle()
  const next = Math.max(0, (row?.booked || 0) + delta)
  await admin.from('slots').update({ booked: next }).eq('id', slotId)
  return next
}

async function blockedSet(listingId) {
  const { data } = await admin.rpc('slot_ids_blocked_by_bookings', { p_listing_ids: [listingId] })
  return new Set((data || []).map(id => Number(id)))
}

// notify-venue-slot-request builds accept/decline URLs using
// SUPABASE_URL as seen INSIDE the edge runtime container — which
// is Kong's Docker hostname (`http://kong:8000`). The driver runs
// outside Docker and can't resolve that. Rewrite to the URL the
// driver uses.
function fixupHost(url) {
  return url.replace(/^https?:\/\/[^/]+/, SUPABASE_URL)
}

// ── Step 7 · Collision (marketplace filter + booking-time reject) ─
async function step7(ctx) {
  // Book the 45-min slot at 13:00 via the same path the frontend uses.
  const bookingId = await insertBooking({
    ctx, slotId: ctx.slots.s45_1300,
    time: '13:00', duration: '45 min', status: 'confirmed',
  })
  const spend = await customerClient(ctx).functions.invoke('spend-booking-credits', {
    body: { booking_id: bookingId, source: 'booking' },
  })
  if (spend.error || spend.data?.error) {
    return fail('Step 7 — collision', `initial book failed: ${JSON.stringify(spend.data || spend.error)}`)
  }

  // Read filter: siblings 30/60/90 at 13:00 must be blocked; the
  // booked slot itself must NOT appear (spots/booked handles that).
  const blocked = await blockedSet(ctx.transcendListing)
  const siblings = ['s30_1300', 's60_1300', 's90_1300']
  const missing  = siblings.filter(k => !blocked.has(Number(ctx.slots[k])))
  if (missing.length) return fail('Step 7 — collision', `siblings not blocked: ${missing.join(', ')}`)
  if (blocked.has(Number(ctx.slots.s45_1300))) return fail('Step 7 — collision', 'booked slot appears in block set')

  // Write gate: attempting to book the 30-min sibling must be
  // rejected with slot_collision and the booking row rolled back.
  const collidingId = await insertBooking({
    ctx, slotId: ctx.slots.s30_1300,
    time: '13:00', duration: '30 min', status: 'confirmed',
  })
  // Raw fetch — functions.invoke opaques out non-2xx bodies. We want
  // the exact status + { error: 'slot_collision' } payload.
  const collideRes = await fetch(`${SUPABASE_URL}/functions/v1/spend-booking-credits`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${ctx.custJwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ booking_id: collidingId, source: 'booking' }),
  })
  const collideBody = await collideRes.text()
  if (collideRes.status !== 409 || !collideBody.includes('slot_collision')) {
    return fail('Step 7 — collision',
      `expected 409 slot_collision on 30-min sibling, got ${collideRes.status}: ${collideBody.slice(0, 200)}`)
  }
  const { data: leftover } = await admin.from('bookings').select('id').eq('id', collidingId).maybeSingle()
  if (leftover) return fail('Step 7 — collision', 'orphan booking row remains after slot_collision reject')

  // slots.booked accounting after the collision reject:
  //   s45_1300: booked=1 from the initial successful book
  //   s30_1300: bump_slot_on_booking auto-fired on the rejected
  //             INSERT; unbump_slot_on_cancel must also fire on
  //             DELETE so this returns to 0. If it doesn't, the
  //             rejected sibling silently loses a unit of
  //             capacity forever.
  //   s60_1300, s90_1300: never touched, still 0.
  const { data: slotRows } = await admin.from('slots')
    .select('id, booked')
    .in('id', [ctx.slots.s30_1300, ctx.slots.s45_1300, ctx.slots.s60_1300, ctx.slots.s90_1300])
  const bookedById = Object.fromEntries((slotRows || []).map(r => [Number(r.id), r.booked]))
  const expected = {
    [ctx.slots.s45_1300]: 1,
    [ctx.slots.s30_1300]: 0,
    [ctx.slots.s60_1300]: 0,
    [ctx.slots.s90_1300]: 0,
  }
  const wrong = Object.entries(expected)
    .filter(([id, want]) => bookedById[Number(id)] !== want)
    .map(([id, want]) => `slot ${id}: booked=${bookedById[Number(id)]} (expected ${want})`)
  if (wrong.length > 0) {
    return fail('Step 7 — collision',
      `slots.booked drifted after collision reject: ${wrong.join('; ')}`)
  }

  return pass('Step 7 — collision',
    `45-min booked; 30/60/90-min siblings blocked in read filter; 30-min booking attempt rejected with slot_collision + row rolled back; slots.booked correct across all four siblings (rejected DELETE released its slot)`)
}

// ── Step 8 · Booking mode (request → pending_venue → accept) ─────
async function step8(ctx) {
  // slots.booked is auto-managed by two AFTER triggers on bookings
  // (booking_inserted_bump_slot, booking_cancelled_unbump_slot), so
  // no explicit bump / unbump from the driver.
  const bookingId = await insertBooking({
    ctx, slotId: ctx.slots.request_1500,
    time: '15:00', duration: '60 min', status: 'pending_venue',
  })
  const spend = await customerClient(ctx).functions.invoke('spend-booking-credits', {
    body: { booking_id: bookingId, source: 'booking_hold' },
  })
  if (spend.error || spend.data?.error) {
    return fail('Step 8 — request mode + accept', `spend failed: ${JSON.stringify(spend.data || spend.error)}`)
  }

  // Notify the venue → mints tokens, returns accept_url.
  const notify = await customerClient(ctx).functions.invoke('notify-venue-slot-request', {
    body: { booking_id: bookingId },
  })
  if (notify.error) return fail('Step 8 — request mode + accept', `notify failed: ${notify.error.message}`)
  const acceptUrl = notify.data?.accept_url
  if (!acceptUrl) return fail('Step 8 — request mode + accept', `no accept_url returned: ${JSON.stringify(notify.data)}`)

  // Balance snapshot BEFORE accept so we can assert no refund happened.
  const balBefore = await balance(ctx.custId)

  // Simulate the venue clicking the accept link.
  const acceptRes = await fetch(fixupHost(acceptUrl), { method: 'POST' })
  if (acceptRes.status !== 200) {
    const body = await acceptRes.text()
    return fail('Step 8 — request mode + accept', `accept returned ${acceptRes.status}: ${body.slice(0, 400)}`)
  }

  const { data: bk } = await admin.from('bookings').select('status').eq('id', bookingId).maybeSingle()
  if (bk?.status !== 'confirmed') return fail('Step 8 — request mode + accept', `status=${bk?.status}, expected confirmed`)

  // Accept must NOT refund and must NOT decrement slots.booked.
  const balAfter = await balance(ctx.custId)
  if (balAfter.purchased + balAfter.bonus !== balBefore.purchased + balBefore.bonus) {
    return fail('Step 8 — request mode + accept',
      `credits changed on accept: before=${balBefore.purchased + balBefore.bonus}, after=${balAfter.purchased + balAfter.bonus} (accept should not refund)`)
  }
  const { data: slotRow } = await admin.from('slots').select('booked').eq('id', ctx.slots.request_1500).maybeSingle()
  if ((slotRow?.booked || 0) !== 1) {
    return fail('Step 8 — request mode + accept', `slots.booked=${slotRow?.booked}, expected 1 (accept preserves)`)
  }

  return pass('Step 8 — request mode + accept',
    `pending_venue → confirmed via accept token; credits held (not refunded), slots.booked preserved at 1`)
}

// ── Step 9 · Pending holds availability + decline releases ───────
async function step9(ctx) {
  const bookingId = await insertBooking({
    ctx, slotId: ctx.slots.request_1600,
    time: '16:00', duration: '60 min', status: 'pending_venue',
  })
  const spend = await customerClient(ctx).functions.invoke('spend-booking-credits', {
    body: { booking_id: bookingId, source: 'booking_hold' },
  })
  if (spend.error || spend.data?.error) {
    return fail('Step 9 — pending holds + decline', `spend failed: ${JSON.stringify(spend.data || spend.error)}`)
  }

  // A pending_venue booking with a slot_id must block overlapping
  // siblings via the read filter. 16:00·30min sibling ⊂ 16:00·60min.
  const blockedWhilePending = await blockedSet(ctx.transcendListing)
  if (!blockedWhilePending.has(Number(ctx.slots.s30_1600))) {
    return fail('Step 9 — pending holds + decline',
      `sibling 30-min at 16:00 was NOT blocked while pending_venue held the slot`)
  }

  // Balance snapshot BEFORE decline so we can assert the refund
  // landed. Also grab grant remainings so we can prove
  // refund_by_booking restored them.
  const balBefore = await balance(ctx.custId)

  const notify = await customerClient(ctx).functions.invoke('notify-venue-slot-request', {
    body: { booking_id: bookingId },
  })
  const declineUrl = notify.data?.decline_url
  if (!declineUrl) return fail('Step 9 — pending holds + decline', 'no decline_url returned')

  const declineRes = await fetch(fixupHost(declineUrl), { method: 'POST' })
  if (declineRes.status !== 200) {
    return fail('Step 9 — pending holds + decline', `decline returned ${declineRes.status}`)
  }

  const { data: bk } = await admin.from('bookings').select('status').eq('id', bookingId).maybeSingle()
  if (bk?.status !== 'cancelled') {
    return fail('Step 9 — pending holds + decline', `status=${bk?.status}, expected cancelled`)
  }

  const { data: slotRow } = await admin.from('slots').select('booked').eq('id', ctx.slots.request_1600).maybeSingle()
  if ((slotRow?.booked || 0) !== 0) {
    return fail('Step 9 — pending holds + decline', `slots.booked=${slotRow?.booked}, expected 0 (decline should decrement)`)
  }

  const balAfter = await balance(ctx.custId)
  const refunded = (balAfter.purchased + balAfter.bonus) - (balBefore.purchased + balBefore.bonus)
  if (refunded !== 10) {
    return fail('Step 9 — pending holds + decline',
      `refund delta=${refunded}, expected +10 (was ${balBefore.purchased + balBefore.bonus}, now ${balAfter.purchased + balAfter.bonus})`)
  }

  // And the sibling must now be free again.
  const blockedAfterDecline = await blockedSet(ctx.transcendListing)
  if (blockedAfterDecline.has(Number(ctx.slots.s30_1600))) {
    return fail('Step 9 — pending holds + decline', 'sibling still blocked after decline')
  }

  return pass('Step 9 — pending holds + decline',
    `pending_venue blocked sibling; decline cancelled booking, decremented slots.booked, refunded +10 credits, released sibling`)
}

// ── Main ─────────────────────────────────────────────────────────
const ctx = await seed()
console.log('\n── Running steps ───────────────────────────────────')
await step1(ctx)
await step2(ctx)
await step3(ctx)
await step4(ctx)
await step5(ctx)
await step6(ctx)

await seedTranscend(ctx)
console.log('\n── Running Transcend steps ────────────────────────')
await step7(ctx)
await step8(ctx)
await step9(ctx)

console.log('\n── Summary ────────────────────────────────────────')
for (const r of results) console.log(`${r.status.padEnd(4)}  ${r.step}`)
const failed = results.filter(r => r.status === 'FAIL').length
process.exit(failed > 0 ? 1 : 0)
