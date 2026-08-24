-- Geocoding metadata on the businesses row.
--
--   geocoded_from  — the exact address string we last resolved. Client
--                    compares against businesses.address on save; if they
--                    differ (or geocoded_from is null), we re-run the
--                    Nominatim lookup. Prevents burning a rate-limited
--                    lookup on every save when nothing about the address
--                    changed.
--   geocode_failed — set when Nominatim returned zero results. The map
--                    falls back to the town centroid so a pin still
--                    renders, and admin-businesses surfaces the flag so
--                    the admin can fix the address.
--
-- lat/lng already exist on the businesses table from the baseline
-- migration; this migration only adds the two audit columns above.

alter table public.businesses
  add column if not exists geocoded_from text,
  add column if not exists geocode_failed boolean not null default false;

comment on column public.businesses.geocoded_from is
  'The address string that produced the current lat/lng. Client-side geocode-address invocations skip re-lookup when this matches businesses.address, so a partner saving unrelated settings doesn''t burn a Nominatim call.';

comment on column public.businesses.geocode_failed is
  'True when the most recent geocode attempt returned no results. The map pin falls back to the town centroid; admin should verify or correct the address.';
