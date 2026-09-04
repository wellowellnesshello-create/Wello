-- Partner-initiated cancellation metadata.
--
-- Wires up the "Cancel booking" affordance in the partner portal (see
-- partner-cancel-booking edge function). Only fires when a partner
-- cancels a confirmed booking outside the WhatsApp safety window:
-- before the session starts, or up to 24 hours after it ends.
--
-- Reason drives whether the cancellation counts against the partner's
-- cancel rate under Partner terms 5.3 vs 5.5:
--   weather   -> 5.5 (unavoidable), doesn't count against rate
--   illness   -> 5.5 (unavoidable), doesn't count against rate
--   facility  -> 5.5 (unavoidable), doesn't count against rate
--   other     -> 5.3, may count against rate on review
-- The rate calculation isn't wired yet — this column is the audit
-- trail so it can be added later without a schema change.

alter table public.bookings
  add column if not exists partner_cancel_reason  text
    check (partner_cancel_reason in ('weather','illness','facility','other')),
  add column if not exists partner_cancel_note    text,
  add column if not exists partner_cancelled_at   timestamptz;

comment on column public.bookings.partner_cancel_reason is
  'Reason category selected by the partner when cancelling a confirmed booking via the portal. weather/illness/facility fall under Partner terms 5.5; other under 5.3.';
comment on column public.bookings.partner_cancel_note is
  'Optional free-text note the partner attached to a cancellation.';
comment on column public.bookings.partner_cancelled_at is
  'When the partner triggered the cancellation via partner-cancel-booking. Set alongside status=cancelled.';
