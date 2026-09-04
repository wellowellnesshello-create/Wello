-- Cancellation window: standard default 24h -> 12h (ClassPass-aligned).
-- Private Instructor rows stay at 48h (set by 20260814010000_businesses_cancellation_window.sql).
-- Any partner still on the old default of 24 is moved to 12. Partners who
-- have set a custom value that happens to be 24 will also move to 12 — this
-- is acceptable given the change is explicit and communicated in the portal.
-- Partners can re-override from Settings.

alter table public.businesses
  alter column cancellation_window_hours set default 12;

update public.businesses
   set cancellation_window_hours = 12
 where cancellation_window_hours = 24;

comment on column public.businesses.cancellation_window_hours is
  'Hours before a session that a customer can cancel and receive a full credit refund. Default 12; Private Instructor rows are 48 (per 20260814010000). Range 1-168.';
