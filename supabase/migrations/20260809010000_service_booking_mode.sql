-- Per-service booking_mode ('instant' | 'request').
--
-- Before this migration, mode was implicitly derived from
-- (category == 'Private Instructor') plus row kind. A partner like
-- Transcend (Fire & Ice as instant + Massage as request) had no way
-- to mix modes because the switch was per-business.
--
-- Add booking_mode as a column on `slots` — the per-service surface
-- for the slot-based flow. session_offerings entries get a
-- booking_mode key in a later PR when the "windowed appointment"
-- (Path B) admin flow lands; today every offering runs through
-- request-treatment-booking so their mode is effectively 'request'.
--
-- Backfill: every slot whose parent listing belongs to a Private
-- Instructor business becomes 'request' (matches existing behaviour
-- — pending_instructor with 48h auto-decline). Everything else
-- becomes 'instant' (unchanged behaviour). Day-one behaviour is
-- identical; the switch just becomes surface-able.

alter table slots
  add column booking_mode text not null default 'instant'
    check (booking_mode in ('instant', 'request'));

create index slots_booking_mode_idx on slots(booking_mode) where booking_mode = 'request';

update slots s
   set booking_mode = 'request'
  from listings l
  join businesses b on b.id = l.business_id
 where s.listing_id = l.id
   and b.category = 'Private Instructor';
