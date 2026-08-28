-- Two fixes for slots.booked accounting.
--
-- 1. BACKFILL. Prior to the 20260828070000 capacity migration there
--    was no server-side enforcement of booked < spots, so testing on
--    2026-08-28 pushed several slots to booked >> spots. These slots
--    now permanently return 'slot_full' on the atomic check in
--    try_reserve_slot because the WHERE clause (booked < spots) is
--    false. Reset booked to the actual live seat count = sum of
--    people_count for active bookings on that slot.
--
-- 2. try_reserve_slot now bumps by people_count instead of hard-coded
--    +1. A booking with party size 3 previously only counted as 1
--    seat, so the slot filled slower than reality. Fixes both the
--    display ("2 of 3 left" that was actually full) and the eventual
--    capacity check.

-- ── Backfill slots.booked from bookings ──────────────────────────
with active as (
  select slot_id::bigint as slot_id,
         coalesce(sum(coalesce(people_count, 1)), 0) as taken
    from bookings
   where status in ('confirmed', 'pending_venue', 'pending_instructor')
     and slot_id is not null
   group by slot_id::bigint
)
update public.slots s
   set booked = coalesce(a.taken, 0)
  from active a
 where s.id = a.slot_id;

-- Slots with NO active bookings: force booked = 0. (LEFT JOIN above
-- can't zero them because there's no matching aggregate row.)
update public.slots s
   set booked = 0
 where s.id not in (
   select slot_id::bigint
     from bookings
    where status in ('confirmed', 'pending_venue', 'pending_instructor')
      and slot_id is not null
 )
   and coalesce(s.booked, 0) <> 0;

-- ── try_reserve_slot: respect people_count ──────────────────────
create or replace function public.try_reserve_slot(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_b        bookings%rowtype;
  v_lock     bigint;
  v_updated  integer;
  v_take     integer;
begin
  select * into v_b from bookings where id = p_booking_id;
  if not found then
    raise exception 'booking_not_found' using errcode = 'P0001';
  end if;

  if v_b.slot_id is null then
    return;
  end if;

  v_lock := ('x' || substr(md5(v_b.business_id::text || ':' || v_b.booking_date::text), 1, 15))::bit(60)::bigint;
  perform pg_advisory_xact_lock(v_lock);

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
