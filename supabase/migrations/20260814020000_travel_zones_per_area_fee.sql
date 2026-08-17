-- Per-zone travel-fee pricing for private instructors.
--
-- Before: businesses.travel_areas was a jsonb string[] and every zone shared
-- a single scalar businesses.travel_fee_eur. Fine for one-tier flat surcharges,
-- but partners like Noor Yoga need different fees per zone (Palma free,
-- Andratx €10, Sóller €20).
--
-- After: businesses.travel_areas is a jsonb [{area, fee_eur}][]. The scalar
-- travel_fee_eur column is dropped. Same shape mirrored onto listings so
-- customer-facing queries don't need to re-join.
--
-- Backfill translates each existing string in travel_areas into an object
-- with fee_eur = the current row's travel_fee_eur (or 0 when it's null),
-- so a partner who had ["Andratx","Sóller"] + travel_fee_eur = 15 becomes
-- [{"area":"Andratx","fee_eur":15},{"area":"Sóller","fee_eur":15}] — same
-- behaviour post-migration, then editable per row from Settings.

-- ── businesses ─────────────────────────────────────────────────────────
update public.businesses b
   set travel_areas = coalesce(
     (select jsonb_agg(jsonb_build_object(
                'area',    elem,
                'fee_eur', coalesce(b.travel_fee_eur, 0)
              ))
        from jsonb_array_elements_text(b.travel_areas) elem),
     '[]'::jsonb
   )
 where b.travel_areas is not null
   and jsonb_typeof(b.travel_areas) = 'array'
   -- Only rewrite when the first element is a string (i.e. legacy shape).
   -- Idempotent: re-running skips already-migrated object rows.
   and (jsonb_array_length(b.travel_areas) = 0
        or jsonb_typeof(b.travel_areas -> 0) = 'string');

alter table public.businesses
  drop column if exists travel_fee_eur;

-- ── listings mirror ────────────────────────────────────────────────────
update public.listings l
   set travel_areas = coalesce(
     (select jsonb_agg(jsonb_build_object(
                'area',    elem,
                'fee_eur', coalesce(l.travel_fee_eur, 0)
              ))
        from jsonb_array_elements_text(l.travel_areas) elem),
     '[]'::jsonb
   )
 where l.travel_areas is not null
   and jsonb_typeof(l.travel_areas) = 'array'
   and (jsonb_array_length(l.travel_areas) = 0
        or jsonb_typeof(l.travel_areas -> 0) = 'string');

alter table public.listings
  drop column if exists travel_fee_eur;

comment on column public.businesses.travel_areas is
  'Extended travel zones. Array of {area:text, fee_eur:int}. Surcharge applies per booking when the customer''s typed address matches the area (case-insensitive, diacritic-insensitive substring). Editable per row from the partner Settings screen.';
comment on column public.listings.travel_areas is
  'Mirror of businesses.travel_areas. Kept in sync by the client on save so marketplace queries don''t need to re-join.';
