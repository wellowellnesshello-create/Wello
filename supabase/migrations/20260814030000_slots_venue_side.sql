-- Per-slot flag for where the session physically happens.
--
-- Before: the BookingModal always required an address from the customer
-- whenever the parent business had category = 'Private Instructor'. That
-- worked for classic mobile-instructor bookings but broke for private
-- instructors who run some sessions at their own studio or a public spot
-- (e.g. Noor Yoga: "at her place or by the sea") — they'd end up asking
-- the customer to enter an address the instructor owns.
--
-- venue_side = 'instructor' → session happens at a location the instructor
--   controls (their studio, an outdoor spot they run classes from).
--   BookingModal skips the address prompt and travel-fee logic.
-- venue_side = 'customer'   → session happens at the customer's address.
--   BookingModal collects the address and applies zone-based travel fees.
--
-- Default 'customer' preserves current behaviour for every existing row.

alter table public.slots
  add column if not exists venue_side text not null default 'customer';

alter table public.slots
  drop constraint if exists slots_venue_side_ck;
alter table public.slots
  add  constraint slots_venue_side_ck
       check (venue_side in ('instructor', 'customer'));

comment on column public.slots.venue_side is
  'Where this session happens. instructor = at a location the partner controls (their studio, an outdoor spot). customer = at the customer''s address; the booking flow will collect the address and apply travel-zone fees. Default customer.';
