-- try_reserve_rental was granted to `authenticated` as SECURITY DEFINER
-- but never verified auth.uid() matched the caller-supplied p_user_id.
-- Any signed-in user could therefore create a rental booking on behalf
-- of any other user by passing their uuid. Add the missing check.

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
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'not_authorised' using errcode = '42501';
  end if;

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
