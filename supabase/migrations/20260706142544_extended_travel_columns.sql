-- Hotfix: add missing columns for the extended-travel-surcharge feature.
--
-- The client (App.jsx) has been reading and writing businesses.travel_areas
-- and businesses.travel_fee_eur (and the same on listings) since the
-- extended-travel-surcharge feature landed on 2026-07-03, but the DB
-- migration to actually create these columns was never applied. As a result
-- the listings query (which selects businesses(...travel_areas, ...
-- travel_fee_eur, ...)) returns HTTP 400 from PostgREST, the client silently
-- falls through to the demo LISTINGS constant, and every real partner
-- disappears from Explore.
--
-- Types match coverage_areas (jsonb) so the client's array serialisation
-- lands as-is. Fee is a plain integer of euros since the write side uses
-- parseInt.
alter table businesses
  add column if not exists travel_areas   jsonb,
  add column if not exists travel_fee_eur integer;

alter table listings
  add column if not exists travel_areas   jsonb,
  add column if not exists travel_fee_eur integer;
