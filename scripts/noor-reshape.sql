-- Noor Yoga (business #48, listing #23) — reshape from timed-slot-only to
-- (one uncapped "Yoga" timetable class per time at her studio) +
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

-- 2. Rename Small group to bare "Yoga", drop the capacity cap, and set
--    the default price to 15 credits until Noor tells us otherwise. spots
--    goes to 999 as a sentinel ("no cap for now") since slots.spots is a
--    non-null integer and the day-list UI multiplies through it — a real
--    NULL would render as "NaN of null left". venue_side stays 'instructor'.
update slots
   set name    = 'Yoga',
       spots   = 999,
       credits = 15
 where listing_id = 23
   and name = 'Small group (2-4) · at her place or by the sea · 60 min';

-- 3. Populate businesses.session_offerings with a single request-based
--    offering. The party-size stepper in BookingModal replaces the old
--    "Private vs Group private" split: one Private offering, and
--    extra_person_eur handles the additional-guest cost.
--
--    - Private: 30cr at studio, 60cr + travel at home.
--    - extra_person_eur = 0 → adding guests costs nothing extra
--      (matches Noor's old Group-private-at-studio flat pricing).
--    - max_people = 6 → cap the party size. Required because
--      extra_person_eur = 0 means the client-side offeringMax fallback
--      would treat this as strict 1-on-1 otherwise.
--
--    NOTE: this changes the old "Group private at home = 30" price
--    point — under the unified model a group of N at home costs 60
--    (base) not 30. Bring this up with Noor if she wants a different
--    at-home group price (which would need extra_person_eur > 0 to
--    scale, or a separate offering).
--
--    length_min = 60. Legacy price_eur left at 0 since the locations
--    array drives pricing; the "from ◈ min" display on the offering
--    row derives from the locations.
update businesses
   set session_offerings = '[
     {
       "type": "Private",
       "length_min": 60,
       "extra_person_eur": 0,
       "max_people": 6,
       "locations": [
         { "label": "At studio",     "price_eur": 30, "venue_side": "instructor" },
         { "label": "At your home",  "price_eur": 60, "venue_side": "customer"   }
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

-- 5. Sanity: after this runs, listing 23 should have 62 slot rows all
--    named "Yoga" (15 credits, spots 999, venue_side 'instructor'), and
--    business 48 should have 1 session_offering (Private) with 2
--    locations, extra_person_eur = 0, max_people = 6. Run these to confirm:
--
--   select name, count(*), credits, venue_side, spots
--     from slots
--    where listing_id = 23
--    group by name, credits, venue_side, spots
--    order by name;
--
--   select jsonb_pretty(session_offerings) from businesses where id = 48;
