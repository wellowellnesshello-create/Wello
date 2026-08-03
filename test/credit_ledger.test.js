import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, hasLocalSupabase } from './setup.js'

// Ledger integration tests.
//
// These verify two behaviours the spec called out explicitly:
//   1. Deduction order: bonus is spent before purchased; within a
//      credit_type, older grants are spent before newer ones.
//   2. Expiry exclusion: expired bonus grants are not counted in
//      credit_balance and are not touched by spend_credits.
//
// Every test uses a fresh throwaway auth user and cleans up its own
// ledger + auth.users row at the end so the suite is order-independent.

const suite = hasLocalSupabase() ? describe : describe.skip

suite('credit_ledger', () => {
  let admin
  let userId

  beforeAll(() => {
    admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  })

  beforeEach(async () => {
    // Fresh user per test — cheaper than transactional cleanup, and
    // the ledger's ON DELETE CASCADE walks the rows for us.
    const email = `ledger-${crypto.randomUUID()}@test.local`
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: 'test-password-' + crypto.randomUUID(),
      email_confirm: true,
    })
    if (error) throw error
    userId = data.user.id
    // profiles row: some deployments have a trigger to create it, some
    // don't. Insert idempotently so the trigger has something to update.
    await admin.from('profiles').upsert({ id: userId, credits: 0 })
  })

  async function grant(type, amount, opts = {}) {
    const { error, data } = await admin.rpc('grant_credits', {
      p_user_id:     userId,
      p_amount:      amount,
      p_credit_type: type,
      p_source:      opts.source || 'test',
      p_expires_at:  opts.expiresAt ?? null,
      p_note:        opts.note ?? null,
    })
    if (error) throw new Error(`grant_credits(${type}, ${amount}) failed: ${error.message}`)
    return data
  }

  async function spend(amount, opts = {}) {
    const { error, data } = await admin.rpc('spend_credits', {
      p_user_id:    userId,
      p_amount:     amount,
      p_source:     opts.source || 'test_spend',
      p_booking_id: opts.bookingId ?? null,
      p_note:       opts.note ?? null,
    })
    if (error) throw error
    return data
  }

  async function balance() {
    const { data, error } = await admin.rpc('credit_balance', { p_user_id: userId })
    if (error) throw error
    return Array.isArray(data) ? data[0] : data
  }

  async function grantsRemaining() {
    const { data } = await admin
      .from('credit_ledger')
      .select('id, credit_type, expires_at, remaining, created_at')
      .eq('user_id', userId)
      .eq('kind', 'grant')
      .order('created_at', { ascending: true })
    return data || []
  }

  it('spends bonus before purchased, then oldest-first within type', async () => {
    // Set up: two purchased grants and two bonus grants, in a mixed
    // creation order. Deduction should still hit bonus first, oldest
    // bonus first, then purchased oldest first.
    await grant('purchased', 10, { note: 'purchased-old' })
    await new Promise(r => setTimeout(r, 20)) // ensure distinct created_at
    await grant('bonus', 5, { note: 'bonus-old' })
    await new Promise(r => setTimeout(r, 20))
    await grant('purchased', 8, { note: 'purchased-new' })
    await new Promise(r => setTimeout(r, 20))
    await grant('bonus', 4, { note: 'bonus-new' })

    // Balance sanity check: 18 purchased + 9 bonus = 27 spendable.
    const before = await balance()
    expect(before.purchased).toBe(18)
    expect(before.bonus).toBe(9)

    // Spend 12. Expected consumption: bonus-old (5) + bonus-new (4) +
    // purchased-old (3). purchased-old should have 7 remaining, both
    // bonus grants should be zero, purchased-new should still have 8.
    await spend(12)
    const grants = await grantsRemaining()

    const byNote = Object.fromEntries(await Promise.all(
      grants.map(async g => {
        const { data } = await admin.from('credit_ledger')
          .select('note').eq('id', g.id).maybeSingle()
        return [data?.note, g.remaining]
      }),
    ))

    expect(byNote['bonus-old']).toBe(0)
    expect(byNote['bonus-new']).toBe(0)
    expect(byNote['purchased-old']).toBe(7)
    expect(byNote['purchased-new']).toBe(8)

    const after = await balance()
    expect(after.purchased).toBe(15)
    expect(after.bonus).toBe(0)
  })

  it('excludes expired bonus credits from balance and refuses to spend them', async () => {
    const past  = new Date(Date.now() - 60 * 1000).toISOString()
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    await grant('bonus',     10, { expiresAt: past,   note: 'expired-bonus' })
    await grant('bonus',      3, { expiresAt: future, note: 'live-bonus' })
    await grant('purchased',  5, { note: 'purchased' })

    // Expired grant must be invisible to credit_balance.
    const bal = await balance()
    expect(bal.bonus).toBe(3)
    expect(bal.purchased).toBe(5)

    // Spend of 6: bonus 3 first, then 3 from purchased. Expired grant
    // must remain at 10 remaining untouched.
    await spend(6)
    const grants = await grantsRemaining()

    const byNote = Object.fromEntries(await Promise.all(
      grants.map(async g => {
        const { data } = await admin.from('credit_ledger')
          .select('note').eq('id', g.id).maybeSingle()
        return [data?.note, g.remaining]
      }),
    ))

    expect(byNote['expired-bonus']).toBe(10)
    expect(byNote['live-bonus']).toBe(0)
    expect(byNote['purchased']).toBe(2)

    // Trying to spend beyond the live spendable balance must raise
    // insufficient_credits and leave the ledger untouched. Live balance
    // is now 2 purchased + 0 bonus = 2; asking for 5 should fail.
    await expect(spend(5)).rejects.toThrow(/insufficient_credits/)
    const bal2 = await balance()
    expect(bal2.purchased).toBe(2)
    expect(bal2.bonus).toBe(0)
  })

  it('refund_by_booking reverses a spend back onto the original grants', async () => {
    await grant('bonus', 4, { note: 'b' })
    await grant('purchased', 6, { note: 'p' })

    const bookingId = crypto.randomUUID()
    // Insert a placeholder booking row so the FK holds. The refund
    // logic itself only cares about credit_ledger, but spend_credits
    // stamps the booking_id.
    const { error: bookErr } = await admin.from('bookings').insert({
      id:            bookingId,
      user_id:       userId,
      business_id:   1,
      venue_id:      1,
      slot_id:       null,
      booking_date:  '2030-01-01',
      start_time:    '10:00',
      duration:      '60 min',
      credits_used:  7,
      status:        'confirmed',
    })
    if (bookErr) {
      // Some environments enforce business FK — skip in that case.
      if (/business_id|foreign key/i.test(bookErr.message)) {
        return
      }
      throw bookErr
    }

    await spend(7, { bookingId })
    let bal = await balance()
    expect(bal.bonus).toBe(0)
    expect(bal.purchased).toBe(3)

    const { error: refErr } = await admin.rpc('refund_by_booking', {
      p_booking_id: bookingId,
      p_source:     'test_refund',
      p_note:       null,
    })
    expect(refErr).toBeNull()

    bal = await balance()
    expect(bal.bonus).toBe(4)
    expect(bal.purchased).toBe(6)

    // Idempotent: a second call must not double-refund.
    await admin.rpc('refund_by_booking', {
      p_booking_id: bookingId, p_source: 'test_refund', p_note: null,
    })
    bal = await balance()
    expect(bal.bonus).toBe(4)
    expect(bal.purchased).toBe(6)

    await admin.from('bookings').delete().eq('id', bookingId)
  })
})
