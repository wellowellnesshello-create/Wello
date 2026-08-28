-- Rentals now carry a customer-picked pickup time so the 48-hour lead
-- window is measured accurately (Wednesday 10:00 booking Friday 14:00 =
-- 52h out, passes; hard-coded 09:00 anchor mis-classified those as 47h).
--
-- Rebuild try_reserve_rental with an optional p_start_time parameter
-- and persist it onto bookings.start_time. Legacy rows keep NULL and
-- the reader-side fallback (09:00 in cancel-booking + send-booking-
-- reminders) covers them.

-- Drop the old signature explicitly — Postgres treats added params as
-- a new overload rather than a replacement, and we don't want two
-- versions in flight.
drop function if exists public.try_reserve_rental(
  uuid, bigint, text, date, date, text, integer, text, jsonb, timestamptz
);

create or replace function public.try_reserve_rental(
  p_user_id         uuid,
  p_business_id     bigint,
  p_offering_type   text,
  p_booking_date    date,
  p_end_date        date,
  p_start_time      text,
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
  v_start_time  time;
begin
  -- Same advisory-lock + inventory-check pattern as the prior version.
  v_lock_key := ('x' || substr(md5(p_business_id::text || ':' || p_offering_type), 1, 15))::bit(60)::bigint;
  perform pg_advisory_xact_lock(v_lock_key);

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

  -- Parse the pickup time. Accept HH:MM or HH:MM:SS; anything invalid
  -- becomes NULL so the reader-side fallback (09:00) kicks in.
  begin
    v_start_time := (p_start_time || (case when length(p_start_time) = 5 then ':00' else '' end))::time;
  exception when others then
    v_start_time := null;
  end;

  insert into public.bookings (
    user_id, business_id, venue_id, offering_type, booking_date, end_date,
    start_time, duration, credits_used, people_count, status, notes,
    rental_addons, health_ack_at
  ) values (
    p_user_id, p_business_id, p_business_id, p_offering_type, p_booking_date, p_end_date,
    v_start_time, p_duration, p_credits_used, 1, 'pending_venue', p_notes,
    p_rental_addons, p_health_ack_at
  )
  returning id into v_new_id;

  return v_new_id;
end;
$$;

comment on function public.try_reserve_rental is
  'Race-free rental reservation. Advisory-locks on (business_id, offering_type), counts overlapping active bookings, inserts if capacity permits. Persists the customer-picked pickup time onto bookings.start_time so lead-window + reminder logic matches what the customer selected. Raises inventory_full (P0001) or offering_not_found when the request can''t be satisfied.';

revoke execute on function public.try_reserve_rental(uuid, bigint, text, date, date, text, text, integer, text, jsonb, timestamptz) from public;
grant  execute on function public.try_reserve_rental(uuid, bigint, text, date, date, text, text, integer, text, jsonb, timestamptz) to authenticated, service_role;
