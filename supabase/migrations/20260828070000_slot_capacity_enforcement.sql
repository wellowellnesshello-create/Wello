-- Enforce slot capacity server-side + fix the same-slot false-positive
-- in the collision check.
--
-- Two problems observed on 2026-08-28:
--   1. On a class with spots=3, the same customer could book 10 times.
--      The client filters unbookable slots off the marketplace, but a
--      stale fetch (or a rapid refresh) lets a customer keep booking a
--      full slot. Nothing on the DB side prevented it.
--   2. The 2nd+ booking on a shared class raised 'slot_collision'
--      because assert_no_slot_collision compared the new booking's
--      time range against every OTHER booking on the same business +
--      date — including other bookings on the same slot, which is
--      exactly what shared classes are about.
--
-- Fix:
--   • assert_no_slot_collision now ignores bookings on the same slot
--     (b.slot_id is distinct from v_b.slot_id). Sibling slots still
--     block each other; shared bookings on the same slot don't.
--   • New RPC try_reserve_slot(booking_id) atomically checks
--     slots.spots > slots.booked and increments booked by 1, all under
--     the same advisory lock as the collision check. Raises 'slot_full'
--     if the slot is already at capacity. spend-booking-credits will
--     call this before spending credits.
--   • For rental bookings (no slot_id) both functions are no-ops.

-- ── assert_no_slot_collision: ignore same-slot conflicts ─────────
create or replace function assert_no_slot_collision(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_b       bookings%rowtype;
  v_range   tsrange;
  v_dur_min integer;
  v_lock    bigint;
begin
  select * into v_b from bookings where id = p_booking_id;
  if not found then
    raise exception 'booking_not_found' using errcode = 'P0001';
  end if;

  v_lock := ('x' || substr(md5(v_b.business_id::text || ':' || v_b.booking_date::text), 1, 15))::bit(60)::bigint;
  perform pg_advisory_xact_lock(v_lock);

  v_dur_min := parse_duration_minutes(v_b.duration);
  if v_dur_min <= 0 or v_b.start_time is null or v_b.booking_date is null then
    return;
  end if;

  v_range := tsrange(
    (v_b.booking_date::text || ' ' || v_b.start_time)::timestamp,
    (v_b.booking_date::text || ' ' || v_b.start_time)::timestamp + (v_dur_min || ' minutes')::interval,
    '[)'
  );

  if exists (
    select 1
    from bookings b
    where b.business_id  = v_b.business_id
      and b.booking_date = v_b.booking_date
      and b.id != v_b.id
      -- Ignore bookings on the SAME slot — shared classes are the point.
      -- The slot's own spots/booked counter (enforced atomically by
      -- try_reserve_slot below) handles same-slot capacity.
      and b.slot_id is distinct from v_b.slot_id
      and b.status in ('confirmed', 'pending_instructor', 'pending_venue')
      and parse_duration_minutes(b.duration) > 0
      and tsrange(
            (b.booking_date::text || ' ' || b.start_time)::timestamp,
            (b.booking_date::text || ' ' || b.start_time)::timestamp
              + (parse_duration_minutes(b.duration) || ' minutes')::interval,
            '[)'
          ) && v_range
  ) then
    raise exception 'slot_collision' using errcode = 'P0001';
  end if;
end;
$$;

-- ── try_reserve_slot: atomic spots check + booked increment ──────
-- Called from spend-booking-credits after assert_no_slot_collision but
-- before spend_credits. Under the same (business_id, booking_date)
-- advisory lock so it serialises against concurrent booking attempts.
--
-- Rental bookings (no slot_id) are a no-op — rental capacity is enforced
-- by try_reserve_rental at insert time via its own overlap counting.
--
-- The UPDATE guards booked < spots at the DB level. Even without the
-- advisory lock, PostgreSQL's row locking would serialise the update,
-- so a second concurrent call would either succeed (if there's room)
-- or match 0 rows (if the previous call filled the last seat) — same
-- behaviour, just less contention.
create or replace function try_reserve_slot(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_b        bookings%rowtype;
  v_lock     bigint;
  v_updated  integer;
begin
  select * into v_b from bookings where id = p_booking_id;
  if not found then
    raise exception 'booking_not_found' using errcode = 'P0001';
  end if;

  if v_b.slot_id is null then
    -- No slot to reserve — rental / offering-only booking. try_reserve_rental
    -- handled inventory at insert time.
    return;
  end if;

  v_lock := ('x' || substr(md5(v_b.business_id::text || ':' || v_b.booking_date::text), 1, 15))::bit(60)::bigint;
  perform pg_advisory_xact_lock(v_lock);

  update slots
     set booked = coalesce(booked, 0) + 1
   where id::text = v_b.slot_id::text
     and coalesce(booked, 0) < coalesce(spots, 1);
  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'slot_full' using errcode = 'P0001';
  end if;
end;
$$;

revoke execute on function try_reserve_slot(uuid) from public;
grant  execute on function try_reserve_slot(uuid) to service_role;
