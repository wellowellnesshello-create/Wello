-- Per-partner cancellation window (hours before the session that a customer
-- can still cancel for a full credit refund). Previously hard-coded in the
-- client: 24h standard, 48h private instructor. Now editable per partner from
-- the settings screen — column defaults to 24 to match the old client fallback.
--
-- Backfill existing Private Instructor rows to 48 so their live windows don't
-- silently shorten on this migration. Everyone else stays at the default 24.

alter table public.businesses
  add column if not exists cancellation_window_hours smallint not null default 24;

-- Guard against nonsense values entered from the settings UI or SQL. 1h floor
-- keeps the field meaningful; 168h ceiling (one week) is generous enough for
-- any realistic wellness booking and prevents "999 hour" typos.
alter table public.businesses
  drop constraint if exists businesses_cancellation_window_hours_range_ck;
alter table public.businesses
  add  constraint businesses_cancellation_window_hours_range_ck
       check (cancellation_window_hours between 1 and 168);

-- Preserve prior behaviour for private instructors (previously 48h in code).
update public.businesses
   set cancellation_window_hours = 48
 where category = 'Private Instructor'
   and cancellation_window_hours = 24;

comment on column public.businesses.cancellation_window_hours is
  'Hours before session start that a customer can still cancel for a full refund. Default 24. Editable per-partner from the Settings screen; check constraint enforces 1..168.';
