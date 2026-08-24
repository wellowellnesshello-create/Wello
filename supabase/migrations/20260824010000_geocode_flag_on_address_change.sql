-- Flag businesses for re-geocoding whenever the address changes.
--
-- Sits BEFORE UPDATE so the reset happens in the same transaction that
-- writes the new address — no window where a stale (address, lat/lng)
-- pair could be read by anything else. Also fires on INSERT for
-- completeness, though geocoded_from defaults to NULL for new rows
-- anyway.
--
-- Combined with the pg_cron job in the next migration, this replaces
-- the manual "click the Re-run backfill button" flow: any code path
-- (wizard, dashboard, admin, direct SQL) that changes an address will
-- leave the row in a "needs geocoding" state, and the cron picks it up
-- within a few minutes.
--
-- Idempotent: dropping the trigger and re-creating it is safe.

create or replace function public.flag_business_for_geocode()
returns trigger
language plpgsql
as $$
begin
  -- Only reset when the address actually changed. Prevents a partner
  -- saving unrelated settings from burning a Nominatim call every time.
  if tg_op = 'INSERT' or (tg_op = 'UPDATE' and old.address is distinct from new.address) then
    new.geocoded_from  := null;
    new.geocode_failed := false;
    -- Also null out lat/lng so a stale address doesn't keep pointing at
    -- the wrong location until the cron catches up. The map falls back
    -- to the town centroid client-side in the meantime.
    new.lat := null;
    new.lng := null;
  end if;
  return new;
end;
$$;

drop trigger if exists business_address_flag_geocode on public.businesses;
create trigger business_address_flag_geocode
  before insert or update of address on public.businesses
  for each row execute function public.flag_business_for_geocode();

comment on function public.flag_business_for_geocode() is
  'On INSERT or address UPDATE, clear geocoded_from + geocode_failed + lat + lng so the pg_cron backfill picks the row up. Guarantees every address change is reflected in the geocode metadata, no matter which code path wrote it.';
