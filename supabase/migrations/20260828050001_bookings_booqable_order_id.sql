-- Track the Booqable order id per Wello booking so cancel-booking can
-- DELETE the specific order via booqable-sync 'release'. Nullable —
-- most bookings aren't Booqable-synced.

alter table public.bookings
  add column if not exists booqable_order_id text;

comment on column public.bookings.booqable_order_id is
  'Booqable Order ID returned when booqable-sync ''reserve'' created the reservation. Used by booqable-sync ''release'' on cancel/decline to delete the same order. NULL when the booking is not Booqable-synced.';
