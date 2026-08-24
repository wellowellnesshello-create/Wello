-- Track how a slot row got into the table so the offering-based bulk
-- generator can regenerate its own output without stomping hand-managed
-- rows. Two sources today:
--
--   'manual'       — created individually via addSlotDb, seeded by the
--                    wizard, or extracted from Acuity/etc. Not touched
--                    by saveAvailability's wipe-and-regenerate.
--   'offering_gen' — emitted by saveAvailability from the
--                    session_offerings × availability_windows combo.
--                    Deleted on next saveAvailability run and re-emitted.
--
-- Existing rows default to 'manual' so PI partners' Save availability
-- runs are the only path that stamps 'offering_gen'. Without a backfill
-- into 'offering_gen', the next Save availability on an existing PI
-- account would ADD to their existing slots instead of replacing them.
-- Handled below via a targeted UPDATE for PI listings.

alter table public.slots
  add column if not exists source text not null default 'manual';

alter table public.slots
  add constraint slots_source_check
  check (source in ('manual', 'offering_gen'));

-- Backfill: rows on listings whose parent business is a private_instructor
-- are almost certainly offering-generated (the PI Schedule tab is the only
-- current write path for those partners, and it always uses saveAvailability).
-- Studio rows stay 'manual'. Non-destructive: subsequent Save availability
-- runs will re-emit these rows unchanged.
update public.slots s
   set source = 'offering_gen'
  from public.listings l
  join public.businesses b on b.id = l.business_id
 where s.listing_id = l.id
   and b.business_type = 'private_instructor';
