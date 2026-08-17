-- Noor Yoga (business #48, listing #23) — reshape from timed-slot-only to
-- (timetable slots for Small group + Large group at her place) +
-- (request-to-book session_offerings for Private and Group private with
-- studio/at-home location options).
--
-- Idempotent-ish: the DELETE and UPDATE match on the old long slot names,
-- so a second run finds nothing to change. The session_offerings write is
-- an overwrite; safe to re-run.

-- 1. Drop the four offering types that leave the timetable.
--    - Private × 2 and Group at home move to session_offerings (below).
--    - Large group is collapsed into a single at-studio class along with
--      Small group; the surviving Small group rows are relabelled to "Yoga"
--      as the sole timetable class per time. Verified: zero bookings on
--      any of these rows.
delete from slots
 where listing_id = 23
   and name in (
     'Private · at her place or by the sea · 60 min',
     'Private · at your home · 60 min',
     'Group · at your home · 60 min',
     'Large group · at her place or by the sea · 60 min'
   );

-- 2. Rename Small group to bare "Yoga" and drop the capacity cap. spots
--    goes to 999 as a sentinel ("no cap for now") since slots.spots is a
--    non-null integer and the day-list UI multiplies through it — a real
--    NULL would render as "NaN of null left". 20cr per person stays.
--    venue_side stays 'instructor'.
update slots
   set name  = 'Yoga',
       spots = 999
 where listing_id = 23
   and name = 'Small group (2-4) · at her place or by the sea · 60 min';

-- 3. Populate businesses.session_offerings with the two request-based
--    offerings. Each carries a locations array; the request-treatment-
--    booking edge fn reads it to pick the base price and decide whether
--    to prompt for an address.
--
--    - Private: 30cr at studio, 60cr + travel at home. Capacity 1.
--    - Group private: 30cr at studio (no travel), 30cr + travel at home.
--      Capacity comes into play at booking (customer brings their group);
--      not enforced by session_offerings shape today.
--
--    length_min = 60 for both. Legacy price_eur left null-ish (0) since
--    the locations array drives pricing; the "from ◈ min" display on
--    the offering row derives from the locations.
update businesses
   set session_offerings = '[
     {
       "type": "Private",
       "length_min": 60,
       "locations": [
         { "label": "At studio",     "price_eur": 30, "venue_side": "instructor" },
         { "label": "At your home",  "price_eur": 60, "venue_side": "customer"   }
       ]
     },
     {
       "type": "Group private",
       "length_min": 60,
       "locations": [
         { "label": "At studio",     "price_eur": 30, "venue_side": "instructor" },
         { "label": "At your home",  "price_eur": 30, "venue_side": "customer"   }
       ]
     }
   ]'::jsonb
 where id = 48;

-- 4. Turn on the at-customer travel editor for Noor's dashboard so she can
--    edit her coverage + travel zones from Settings. (offers_at_customer
--    already backfilled to true if travel_areas populated, but her rows
--    are still empty; flip it on explicitly so the editor appears.)
update businesses
   set offers_at_customer = true
 where id = 48;

-- 5. Sanity: after this runs, listing 23 should have 124 slot rows across
--    2 distinct names, and business 48 should have 2 session_offerings
--    entries each with 2 locations. Run these to confirm:
--
--   select name, count(*), credits, venue_side, spots
--     from slots
--    where listing_id = 23
--    group by name, credits, venue_side, spots
--    order by name;
--
--   select jsonb_pretty(session_offerings) from businesses where id = 48;
