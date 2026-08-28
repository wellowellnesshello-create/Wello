-- Fix slots.venue_side stamping so studio slots don't inherit the
-- historical 'customer' default.
--
-- Background: the 20260814030000 migration added slots.venue_side with
-- default 'customer' — correct for private-instructor rows (which the
-- table originally only carried) but wrong for studio slots inserted
-- later. The 20260817000000 backfill fixed existing rows but the DB
-- default kept re-injecting 'customer' on every new INSERT. Studios
-- created after that migration (like the Yoga venue that surfaced this
-- bug) end up with venue_side='customer' → customer sees "At your home"
-- badges + travel-blocked panels on studio bookings.
--
-- Fix in two parts:
--   1. Drop the default entirely — every insert MUST now stamp
--      venue_side explicitly. notify-partner-status already does; a
--      NOT-NULL constraint would break if any caller forgets, so we
--      keep NOT NULL but rely on explicit inserts.
--   2. Add a BEFORE INSERT trigger as a safety net: if venue_side is
--      unset AND the parent business isn't a private instructor,
--      default to 'instructor'; otherwise keep 'customer'. Explicit
--      inserts pass through untouched.
--   3. Re-run the backfill so post-August-2026 studio slots get the
--      correct value.

-- Drop the naive default so accidental inserts don't silently mis-tag.
alter table public.slots alter column venue_side drop default;
alter table public.slots alter column venue_side drop not null;

-- Safety-net trigger: any INSERT that leaves venue_side null gets
-- category-aware defaulting so the historical PI-vs-studio behaviour
-- is preserved even for callers that forget to stamp.
create or replace function public.stamp_slot_venue_side()
returns trigger
language plpgsql
as $$
declare
  v_biz_type text;
  v_biz_cat  text;
begin
  if new.venue_side is not null then return new; end if;
  select b.business_type, b.category
    into v_biz_type, v_biz_cat
    from public.listings l
    join public.businesses b on b.id = l.business_id
   where l.id = new.listing_id;
  if coalesce(v_biz_type, '') = 'private_instructor'
     or coalesce(v_biz_cat, '')  = 'Private Instructor' then
    new.venue_side := 'customer';
  else
    new.venue_side := 'instructor';
  end if;
  return new;
end;
$$;

drop trigger if exists slots_stamp_venue_side on public.slots;
create trigger slots_stamp_venue_side
before insert on public.slots
for each row execute function public.stamp_slot_venue_side();

-- Re-backfill any studio slots still carrying 'customer' (i.e. rows
-- inserted after the August 2026 backfill). Same rule as before.
update public.slots s
   set venue_side = 'instructor'
  from public.listings l
  join public.businesses b on b.id = l.business_id
 where s.listing_id = l.id
   and s.venue_side = 'customer'
   and coalesce(b.business_type, '') <> 'private_instructor'
   and coalesce(b.category, '')      <> 'Private Instructor';
