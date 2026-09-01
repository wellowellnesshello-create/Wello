-- Close the race between assert_no_slot_collision and try_reserve_slot.
-- spend-booking-credits calls them as two separate RPCs, so each runs
-- in its own transaction and the pg_advisory_xact_lock is released
-- between them. A concurrent booking can complete both steps in the
-- gap, defeating the collision guard.
--
-- Fix: one RPC that takes the lock once and runs both checks inside
-- the same transaction.

create or replace function public.reserve_slot_atomic(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_b        bookings%rowtype;
  v_range    tsrange;
  v_dur_min  integer;
  v_lock     bigint;
  v_take     integer;
  v_updated  integer;
begin
  select * into v_b from bookings where id = p_booking_id;
  if not found then
    raise exception 'booking_not_found' using errcode = 'P0001';
  end if;

  v_lock := ('x' || substr(md5(v_b.business_id::text || ':' || v_b.booking_date::text), 1, 15))::bit(60)::bigint;
  perform pg_advisory_xact_lock(v_lock);

  -- ── Collision check (sibling slots on same business+date) ────────
  v_dur_min := parse_duration_minutes(v_b.duration);
  if v_dur_min > 0 and v_b.start_time is not null and v_b.booking_date is not null then
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
  end if;

  -- ── Capacity check + increment (same-slot capacity) ──────────────
  if v_b.slot_id is null then
    return;
  end if;

  v_take := greatest(1, coalesce(v_b.people_count, 1));

  update public.slots
     set booked = coalesce(booked, 0) + v_take
   where id::text = v_b.slot_id::text
     and coalesce(booked, 0) + v_take <= coalesce(spots, 1);
  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'slot_full' using errcode = 'P0001';
  end if;
end;
$$;

revoke execute on function public.reserve_slot_atomic(uuid) from public;
grant  execute on function public.reserve_slot_atomic(uuid) to service_role;

comment on function public.reserve_slot_atomic is
  'Atomic slot reserve: takes the (business_id, booking_date) advisory lock, runs the sibling-slot collision check, then bumps slots.booked by people_count guarded by spots. All in one transaction so a concurrent booking cannot slip between the two checks. Raises slot_collision or slot_full (both P0001) on failure.';
