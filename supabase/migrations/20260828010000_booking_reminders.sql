-- Reminder-sent columns on bookings so the hourly cron doesn't
-- double-fire. Nullable timestamptz set to now() when the send-booking-
-- reminders function successfully queues the email. Partial index keeps
-- the scan cheap: only confirmed bookings within the next 48h are ever
-- candidates for a reminder.

alter table public.bookings
  add column if not exists reminded_24h_at      timestamptz,
  add column if not exists reminded_morning_at  timestamptz;

comment on column public.bookings.reminded_24h_at is
  'When the 24-hour-out reminder email was sent to the customer. NULL until the send-booking-reminders cron picks it up.';
comment on column public.bookings.reminded_morning_at is
  'When the morning-of reminder email was sent to the customer. NULL until the send-booking-reminders cron picks it up.';

create index if not exists bookings_confirmed_upcoming_idx
  on public.bookings (booking_date, start_time)
  where status = 'confirmed';
