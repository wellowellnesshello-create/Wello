-- Rental booking fields — enables the customer rental flow.
--
-- Rentals are inventory-based, multi-day. They don't fit the slot model
-- (single date + time). Two new columns on bookings:
--
--   end_date       — nullable. For rentals it's the last day the item is
--                    kept; for class bookings stays null and existing
--                    (booking_date, start_time) semantics apply.
--   rental_addons  — nullable jsonb array of {label, price_eur} snapshotted
--                    at booking time. Snapshot rather than reference so a
--                    partner editing add-on prices later doesn't retro-
--                    change the total on an already-paid booking.
--
-- No FK / constraint changes on booking_date — a rental booking has
-- booking_date = start_date + end_date = last_day (both dates inclusive).
-- duration_days = end_date - booking_date + 1 (computed on read).
--
-- Index for the overlap check that the customer-side availability query
-- needs to run cheaply:
--   "given (business_id, offering_type, start, end), how many active
--    bookings overlap?"
-- We already have bookings_status_created_idx and similar; add a covering
-- one for the rental overlap-count path.

alter table public.bookings
  add column if not exists end_date       date,
  add column if not exists rental_addons  jsonb;

comment on column public.bookings.end_date is
  'Last day of a rental booking (inclusive). Null for class/private/treatment bookings which use booking_date + start_time.';
comment on column public.bookings.rental_addons is
  'Snapshot of add-ons picked at booking time — [{label, price_eur}]. Snapshot not reference so add-on price edits on the offering don''t retroactively change past totals.';

-- Partial index covering the rental overlap check. Only includes rows
-- with a non-null end_date so it stays tiny — rentals will be a small
-- fraction of total bookings for the foreseeable future.
create index if not exists bookings_rental_overlap_idx
  on public.bookings (business_id, offering_type, booking_date, end_date)
  where end_date is not null
    and status in ('confirmed', 'pending_venue', 'pending_instructor');
