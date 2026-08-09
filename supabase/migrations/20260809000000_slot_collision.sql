-- Slot collision check (Option D from the design doc).
--
-- For a single-practitioner partner offering multiple durations
-- from the same daily window, generation creates overlapping
-- sibling slots (e.g. 13:00·30min + 13:00·45min + 13:00·60min).
-- Each is its own row with spots=1, so booking one doesn't touch
-- the others' `booked` count. Without a collision check, a
-- customer could book 13:00·45min AND another customer could
-- book 13:00·60min at the same time and the practitioner would
-- be double-booked.
--
-- This migration adds two helpers:
--   - slot_ids_blocked_by_bookings(listing_ids[]) — READ-time:
--     the marketplace calls this and filters blocked slots out
--     of the listing view before render.
--   - assert_no_slot_collision(booking_id) — WRITE-time:
--     spend-booking-credits calls this under an advisory lock
--     on (business_id, booking_date) so two concurrent bookings
--     serialize and only one wins.
--
-- Both look at 'confirmed', 'pending_instructor' and
-- 'pending_venue' bookings — all three hold credits per the
-- ledger PR, so all three should hold the slot.

-- ── Duration parsing ─────────────────────────────────────────────
-- bookings.duration and slots.dur are both stored as free text
-- ("60 min", "1 hour", "Open" for gym passes, etc). Mirrors the JS
-- parseDurationString and the Deno parseDurationMinutes in
-- run-weekly-payouts. Unparseable input returns 0 — the collision
-- check treats those as "no range" and skips them so a gym-pass
-- style "Open" booking can't accidentally block a timed slot.
create or replace function parse_duration_minutes(dur text)
returns integer
language sql
immutable
as $$
  with p as (
    select
      (regexp_match(coalesce(dur, ''), '^(\d+)\s*min',  'i'))[1] as m,
      (regexp_match(coalesce(dur, ''), '^(\d+)\s*hour', 'i'))[1] as h
  )
  select coalesce(
    nullif(m, '')::int,
    nullif(h, '')::int * 60,
    0
  ) from p;
$$;

-- ── Read-time filter ─────────────────────────────────────────────
-- Return the slot ids that are blocked by an active booking on
-- the SAME business + date whose time range overlaps the slot's.
-- A booking's own slot_id is excluded so we only surface SIBLING
-- overlaps — the slot's own spots/booked pair already handles
-- direct consumption in the marketplace UI.
--
-- Called by the frontend's fetchListings once per marketplace
-- load, with the full list of listing_ids in scope. The result
-- is small (only actually-blocked ids) so filtering client-side
-- is cheap.
create or replace function slot_ids_blocked_by_bookings(p_listing_ids bigint[])
returns setof bigint
language sql
stable
as $$
  with scoped as (
    select
      s.id           as slot_id,
      s.date         as slot_date,
      s.time         as slot_time,
      parse_duration_minutes(s.dur) as slot_dur_min,
      l.business_id
    from slots s
    join listings l on l.id = s.listing_id
    where s.listing_id = any(p_listing_ids)
  ),
  ranges as (
    select
      slot_id, business_id, slot_date,
      tsrange(
        (slot_date::text || ' ' || slot_time)::timestamp,
        (slot_date::text || ' ' || slot_time)::timestamp + (slot_dur_min || ' minutes')::interval,
        '[)'
      ) as slot_range
    from scoped
    where slot_dur_min > 0
  )
  select distinct r.slot_id
  from ranges r
  join bookings b
    on  b.business_id  = r.business_id
    and b.booking_date = r.slot_date
    and b.status in ('confirmed', 'pending_instructor', 'pending_venue')
  where (b.slot_id is null or b.slot_id::text <> r.slot_id::text)
    and parse_duration_minutes(b.duration) > 0
    and tsrange(
          (b.booking_date::text || ' ' || b.start_time)::timestamp,
          (b.booking_date::text || ' ' || b.start_time)::timestamp
            + (parse_duration_minutes(b.duration) || ' minutes')::interval,
          '[)'
        ) && r.slot_range;
$$;

grant execute on function slot_ids_blocked_by_bookings(bigint[]) to anon, authenticated, service_role;

-- ── Write-time gate ──────────────────────────────────────────────
-- Called after the booking row has been inserted, before the
-- credit spend commits. Raises 'slot_collision' (sqlstate P0001)
-- if another active booking overlaps this one on the same
-- business + date.
--
-- Under an xact-scoped advisory lock keyed to (business_id,
-- booking_date) so two concurrent bookings for the same day at
-- the same partner serialize on this check — the second one
-- sees the first's row (already visible in its snapshot after
-- the lock acquires) and raises. Without the lock, a check +
-- an insert are two operations and both can pass in an
-- interleaved read.
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

  -- Advisory lock scope: (business_id, booking_date). Derive a
  -- stable bigint by hashing "business_id:booking_date". Uses
  -- pg_advisory_xact_lock so the lock releases on tx commit /
  -- rollback, no manual unlock needed.
  v_lock := ('x' || substr(md5(v_b.business_id::text || ':' || v_b.booking_date::text), 1, 15))::bit(60)::bigint;
  perform pg_advisory_xact_lock(v_lock);

  v_dur_min := parse_duration_minutes(v_b.duration);
  if v_dur_min <= 0 or v_b.start_time is null or v_b.booking_date is null then
    -- Nothing to check: legacy row, unparseable duration, or
    -- open-ended booking. Fail open — the marketplace filter
    -- still hides overlaps at read time.
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

revoke execute on function assert_no_slot_collision(uuid) from public;
grant  execute on function assert_no_slot_collision(uuid) to service_role;
