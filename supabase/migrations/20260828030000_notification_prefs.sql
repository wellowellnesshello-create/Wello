-- Per-business notification opt-ins.
--
-- Email always fires on booking activity — venues need to see requests.
-- SMS + WhatsApp are opt-in from the partner dashboard because:
--   • Twilio SMS + WhatsApp both have per-month limits + per-message cost
--   • WhatsApp Business API requires approved template messages, so we
--     can't spam it as freely as email
--   • Some venues prefer email-only, especially those with WhatsApp fatigue
--
-- Nullable, defaulting to false so existing partners aren't opted in
-- silently. Toggles live in the partner Settings tab; notify-venue-*
-- fns read these before firing the SMS / WhatsApp branch.

alter table public.businesses
  add column if not exists notify_sms_enabled       boolean not null default false,
  add column if not exists notify_whatsapp_enabled  boolean not null default false;

comment on column public.businesses.notify_sms_enabled is
  'When true, notify-venue-* fns fire a Twilio SMS to businesses.phone on new booking requests. Off by default; partner opts in from Settings.';
comment on column public.businesses.notify_whatsapp_enabled is
  'When true, notify-venue-* fns fire a WhatsApp message (via Twilio) to businesses.bookings_whatsapp (or phone as fallback) on new booking requests. Off by default; partner opts in from Settings.';
