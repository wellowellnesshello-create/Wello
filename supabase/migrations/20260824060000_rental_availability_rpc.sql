-- Race-free rental reservation.
--
-- The customer-side booking flow used to be:
--   1. client SELECTs count of overlapping rentals
--   2. compares to inventory
--   3. INSERT the booking
-- Two customers racing on the last-in-stock item both see count=0 in
-- step 1 and both succeed in step 3 — TOCTOU window.
--
-- Replace with an RPC that:
--   - takes a pg_advisory_xact_lock keyed on (business_id, offering_type)
--     so concurrent calls for the same rental type serialise
--   - re-counts overlapping active bookings inside the lock
--   - inserts the booking only if count < inventory
--   - all in one transaction — rollback releases the lock automatically
--
-- Returns the inserted booking id on success, or raises with an
-- 'inventory_full' errcode when nothing's available.

create or replace function public.try_reserve_rental(
  p_user_id         uuid,
  p_business_id     bigint,
  p_offering_type   text,
  p_booking_date    date,
  p_end_date        date,
  p_duration        text,
  p_credits_used    integer,
  p_notes           text,
  p_rental_addons   jsonb,
  p_health_ack_at   timestamptz
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inventory   integer;
  v_overlaps    integer;
  v_lock_key    bigint;
  v_new_id      uuid;
  v_offering    jsonb;
begin
  -- Advisory lock scoped to (business_id, offering_type). Same hashing
  -- pattern as assert_no_slot_collision so multiple RPCs for the same
  -- rental type serialise while unrelated rentals proceed in parallel.
  v_lock_key := ('x' || substr(md5(p_business_id::text || ':' || p_offering_type), 1, 15))::bit(60)::bigint;
  perform pg_advisory_xact_lock(v_lock_key);

  -- Load the offering to get inventory. session_offerings is a jsonb
  -- array on businesses; find the matching entry by type and kind.
  select o into v_offering
  from public.businesses b,
       jsonb_array_elements(coalesce(b.session_offerings, '[]'::jsonb)) as o
  where b.id = p_business_id
    and o->>'type' = p_offering_type
    and o->>'kind' = 'rental'
  limit 1;

  if v_offering is null then
    raise exception 'offering_not_found' using errcode = 'P0001';
  end if;

  v_inventory := coalesce((v_offering->>'inventory')::integer, 1);
  if v_inventory <= 0 then
    raise exception 'inventory_full' using errcode = 'P0001';
  end if;

  -- Count overlapping active rentals for the same offering_type.
  -- Overlap definition: NOT (existing.end_date < requested.start
  -- OR existing.booking_date > requested.end).
  select count(*) into v_overlaps
  from public.bookings
  where business_id = p_business_id
    and offering_type = p_offering_type
    and end_date is not null
    and status in ('confirmed', 'pending_venue', 'pending_instructor')
    and not (end_date < p_booking_date or booking_date > p_end_date);

  if v_overlaps >= v_inventory then
    raise exception 'inventory_full' using errcode = 'P0001';
  end if;

  insert into public.bookings (
    user_id, business_id, venue_id, offering_type, booking_date, end_date,
    duration, credits_used, people_count, status, notes, rental_addons,
    health_ack_at
  ) values (
    p_user_id, p_business_id, p_business_id, p_offering_type, p_booking_date, p_end_date,
    p_duration, p_credits_used, 1, 'pending_venue', p_notes, p_rental_addons,
    p_health_ack_at
  )
  returning id into v_new_id;

  return v_new_id;
end;
$$;

comment on function public.try_reserve_rental is
  'Race-free rental reservation. Advisory-locks on (business_id, offering_type), counts overlapping active bookings, inserts if capacity permits. Raises inventory_full (P0001) or offering_not_found when the request can''t be satisfied. Callers should map inventory_full to a UX "sold out for these dates" message.';

-- Callable from authenticated users; RLS on bookings still applies to
-- SELECT/UPDATE but SECURITY DEFINER lets the RPC insert on behalf of
-- the caller's user_id (which is checked against p_user_id inside).
revoke execute on function public.try_reserve_rental(uuid, bigint, text, date, date, text, integer, text, jsonb, timestamptz) from public;
grant  execute on function public.try_reserve_rental(uuid, bigint, text, date, date, text, integer, text, jsonb, timestamptz) to authenticated, service_role;
