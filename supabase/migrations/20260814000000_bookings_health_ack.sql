-- Records the moment the customer ticked the health-suitability checkbox
-- in BookingModal. Populated by the client on insert; not touched again.
-- Nullable so historical rows (pre-launch of the ack) don't break — but
-- every booking created after this migration ships with a value.

alter table public.bookings
  add column if not exists health_ack_at timestamptz;

comment on column public.bookings.health_ack_at is
  'Timestamp the customer acknowledged responsibility for judging session suitability and disclosing conditions to the provider. Set client-side on the booking insert.';
