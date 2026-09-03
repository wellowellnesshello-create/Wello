-- Widen slots_source_check to allow adapter keys.
--
-- 20260818100000 added the check constraint restricting slots.source to
-- ('manual', 'offering_gen'). 20260901020000 (availability_sync_schema)
-- added the concept of adapter-sourced slots but did not update the
-- check, so availability-sync inserts with source='momence' / 'booqable'
-- fail silently with a CHECK violation and 0 rows land.
--
-- Adapter keys must match ADAPTERS in supabase/functions/availability-sync/index.ts.

alter table public.slots
  drop constraint if exists slots_source_check;

alter table public.slots
  add constraint slots_source_check
  check (source in ('manual', 'offering_gen', 'momence', 'booqable'));
