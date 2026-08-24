-- Optional per-class photo map on studio venues. Keyed by the class name
-- as it appears in businesses.slots[].name, values are storage URLs from
-- the venue-photos bucket. The partner uploads one photo per distinct
-- class name from their timetable; consumers (BizPanel timetable rows,
-- Explore category-rail cards) look up class_photos[slot.name] and fall
-- back to businesses.img when the entry is absent.
--
-- Additive: nullable, defaults to NULL. Existing rows are unaffected.
-- Not a schema break for anything reading businesses today.
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS class_photos jsonb;

COMMENT ON COLUMN public.businesses.class_photos IS
  'Optional map keyed by class name (matches slots[].name) → photo URL. Used to render class-specific photos on the marketplace where a slot appears. Falls back to businesses.img when the key is absent.';
