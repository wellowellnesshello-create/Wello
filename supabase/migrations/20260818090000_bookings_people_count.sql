-- Head count on bookings. Replaces the client's "invite friends by email"
-- panel — which never actually sent invites — with a simple party-size
-- stepper. Partners need a single, authoritative field to see "2 people"
-- rather than dividing credits_used by per-person price (which breaks for
-- private-instructor extras where extra_person_eur ≠ base price).
--
-- Also fixes a slot-capacity accounting bug: bump_slot_on_booking always
-- incremented slots.booked by 1, so a studio group booking of 4 people
-- claimed 1 spot rather than 4. Same on the cancel/delete path.

alter table public.bookings
  add column if not exists people_count integer not null default 1;

alter table public.bookings
  add constraint bookings_people_count_check
  check (people_count >= 1 and people_count <= 50);

-- Backfill from the legacy notes shape ("People: N" line composed by
-- BookingModal for private bookings). Studio group bookings never wrote
-- this line and stay at 1 — best effort only; new writes populate the
-- column directly.
update public.bookings
set people_count = greatest(1, least(50,
      (regexp_match(notes, 'People:\s*(\d+)', 'i'))[1]::integer))
where notes ~* 'People:\s*\d+'
  and people_count = 1;

-- Bump slots.booked by the row's people_count so a group booking claims
-- the right amount of capacity. Falls back to 1 for defensive safety
-- (never bump by 0 or null).
create or replace function public.bump_slot_on_booking() returns trigger
  language plpgsql
  security definer
as $$
begin
  if new.slot_id is not null then
    update slots
    set booked = coalesce(booked, 0) + greatest(1, coalesce(new.people_count, 1))
    where id::text = new.slot_id::text;
  end if;
  return new;
end;
$$;

-- Mirror on the cancel/delete unbump path so capacity is released
-- symmetrically. Preserves the 20260811 DELETE-side fix.
create or replace function public.unbump_slot_on_cancel() returns trigger
  language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.slot_id is not null and coalesce(old.status, '') <> 'cancelled' then
      update slots
      set booked = greatest(coalesce(booked, 0) - greatest(1, coalesce(old.people_count, 1)), 0)
      where id::text = old.slot_id::text;
    end if;
    return old;
  end if;

  if old.status is distinct from new.status
     and new.status = 'cancelled'
     and old.slot_id is not null then
    update slots
    set booked = greatest(coalesce(booked, 0) - greatest(1, coalesce(old.people_count, 1)), 0)
    where id::text = old.slot_id::text;
  end if;
  return new;
end;
$$;
