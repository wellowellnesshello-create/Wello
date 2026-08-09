import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, hasLocalSupabase } from './setup.js'

// Slot-collision tests (Option D).
//
// Cover both the read-time filter (slot_ids_blocked_by_bookings)
// and the write-time gate (assert_no_slot_collision), plus the
// pending_venue / pending_instructor status inclusion the design
// specifies.

const suite = hasLocalSupabase() ? describe : describe.skip

suite('slot_collision', () => {
  let admin
  let bizId
  let listingId
  let userId
  const D = '2030-06-15' // Far-future test date so nothing else collides.

  beforeAll(() => {
    admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  })

  beforeEach(async () => {
    // Fresh business + listing + customer per test.
    const email = `collision-${crypto.randomUUID()}@test.local`
    const { data: usr } = await admin.auth.admin.createUser({
      email, password: 'x-' + crypto.randomUUID(), email_confirm: true,
    })
    userId = usr.user.id
    await admin.from('profiles').upsert({ id: userId, email, credits: 0 })

    const { data: biz } = await admin.from('businesses').insert({
      name: 'Collision Test Biz',
      category: 'Massage',
      status: 'active',
      email,
    }).select('id').single()
    bizId = biz.id

    const { data: lst } = await admin.from('listings').insert({
      name: 'Collision Test Listing',
      cat: 'Massage',
      loc: 'Palma',
      cr: 20,
      business_id: bizId,
      status: 'active',
    }).select('id').single()
    listingId = lst.id
  })

  async function makeSlot({ time, dur }) {
    const { data, error } = await admin.from('slots').insert({
      listing_id: listingId,
      name: `${dur} Slot`,
      date: D, time, dur, spots: 1, booked: 0, credits: 20, live: true,
    }).select('id').single()
    if (error) throw error
    return data.id
  }

  async function makeBooking({ time, dur, status, slotId = null }) {
    const { data, error } = await admin.from('bookings').insert({
      user_id: userId,
      business_id: bizId,
      venue_id: bizId,
      slot_id: slotId != null ? String(slotId) : null,
      booking_date: D,
      start_time: time,
      duration: dur,
      credits_used: 20,
      status,
    }).select('id').single()
    if (error) throw error
    return data.id
  }

  async function blockedIds() {
    const { data, error } = await admin.rpc('slot_ids_blocked_by_bookings', {
      p_listing_ids: [listingId],
    })
    if (error) throw error
    return new Set((data || []).map(id => Number(id)))
  }

  it('flags sibling slots as blocked when a confirmed booking overlaps them', async () => {
    // Three overlapping slots at 13:00 — 30, 45, 60 min. Book the 45.
    const s30 = await makeSlot({ time: '13:00', dur: '30 min' })
    const s45 = await makeSlot({ time: '13:00', dur: '45 min' })
    const s60 = await makeSlot({ time: '13:00', dur: '60 min' })

    await makeBooking({ time: '13:00', dur: '45 min', status: 'confirmed', slotId: s45 })

    const blocked = await blockedIds()
    // The booked slot itself is NOT in the blocked set — its own
    // spots/booked count handles that. Only siblings.
    expect(blocked.has(s45)).toBe(false)
    // 30-min at 13:00 (ends 13:30) overlaps 13:00-13:45 → blocked.
    expect(blocked.has(s30)).toBe(true)
    // 60-min at 13:00 (ends 14:00) overlaps 13:00-13:45 → blocked.
    expect(blocked.has(s60)).toBe(true)
  })

  it('leaves non-overlapping slots free', async () => {
    const s30_at1300 = await makeSlot({ time: '13:00', dur: '30 min' })
    const s30_at1400 = await makeSlot({ time: '14:00', dur: '30 min' }) // Gap after.

    // Book 13:00·30min — ends 13:30. 14:00 slot should stay free.
    await makeBooking({ time: '13:00', dur: '30 min', status: 'confirmed', slotId: s30_at1300 })

    const blocked = await blockedIds()
    expect(blocked.has(s30_at1400)).toBe(false)
  })

  it('includes pending_venue bookings in the block set', async () => {
    const s60 = await makeSlot({ time: '14:00', dur: '60 min' })
    // pending_venue bookings have no slot_id — they still hold the
    // practitioner's calendar via business_id + date + start_time.
    await makeBooking({ time: '14:00', dur: '60 min', status: 'pending_venue', slotId: null })

    const blocked = await blockedIds()
    expect(blocked.has(s60)).toBe(true)
  })

  it('includes pending_instructor bookings in the block set', async () => {
    const s60_at1500 = await makeSlot({ time: '15:00', dur: '60 min' })
    const s60_at1600 = await makeSlot({ time: '16:00', dur: '60 min' })
    // Pending_instructor booking on a DIFFERENT slot row overlapping ours.
    await makeBooking({ time: '15:30', dur: '60 min', status: 'pending_instructor', slotId: s60_at1600 })

    const blocked = await blockedIds()
    // 15:00-16:00 overlaps 15:30-16:30 → blocked as a sibling.
    expect(blocked.has(s60_at1500)).toBe(true)
  })

  it('does not include cancelled bookings', async () => {
    const s30 = await makeSlot({ time: '10:00', dur: '30 min' })
    await makeBooking({ time: '10:00', dur: '45 min', status: 'cancelled', slotId: null })

    const blocked = await blockedIds()
    expect(blocked.has(s30)).toBe(false)
  })

  it('assert_no_slot_collision passes when nothing overlaps', async () => {
    const bookingId = await makeBooking({ time: '11:00', dur: '30 min', status: 'confirmed' })
    const { error } = await admin.rpc('assert_no_slot_collision', { p_booking_id: bookingId })
    expect(error).toBeNull()
  })

  it('assert_no_slot_collision raises slot_collision when an overlap exists', async () => {
    await makeBooking({ time: '12:00', dur: '60 min', status: 'confirmed' })
    const bookingId = await makeBooking({ time: '12:30', dur: '30 min', status: 'confirmed' })
    const { error } = await admin.rpc('assert_no_slot_collision', { p_booking_id: bookingId })
    expect(error).not.toBeNull()
    expect(error.message).toMatch(/slot_collision/)
  })
})
