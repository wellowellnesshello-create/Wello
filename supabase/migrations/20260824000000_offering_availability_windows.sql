-- Move availability from the business onto each session_offerings entry.
--
-- Before: businesses.availability_windows was a single business-scoped
-- recurrence rule. saveAvailability multiplied it across every offering,
-- which implicitly assumed every offering runs at every window. Wrong
-- the moment a partner has two offerings on different schedules (e.g.
-- Noor's Yoga on Mon/Wed/Fri 08:00 + her Private by appointment only).
--
-- After: each session_offerings entry carries its own availability_windows
-- + availability_from + availability_to. The business-level columns stay
-- populated for one release so callers that haven't migrated still work;
-- a follow-up cleanup drops them.
--
-- This migration copies the business-level values down onto every entry
-- that doesn't already have them. Idempotent: an entry with an existing
-- availability_windows key is left alone so re-running doesn't overwrite
-- per-offering edits made after the migration first ran.

update public.businesses AS target
   set session_offerings = (
     select coalesce(
       jsonb_agg(
         case
           when o ? 'availability_windows' then o
           else o
             || jsonb_build_object(
               'availability_windows', coalesce(target.availability_windows, '[]'::jsonb),
               'availability_from',    to_jsonb(target.availability_from),
               'availability_to',      to_jsonb(target.availability_to)
             )
         end
       ),
       '[]'::jsonb
     )
     from jsonb_array_elements(coalesce(target.session_offerings, '[]'::jsonb)) as o
   )
 where jsonb_typeof(coalesce(target.session_offerings, '[]'::jsonb)) = 'array'
   and jsonb_array_length(coalesce(target.session_offerings, '[]'::jsonb)) > 0
   and exists (
     select 1
     from jsonb_array_elements(target.session_offerings) as o
     where not (o ? 'availability_windows')
   );
