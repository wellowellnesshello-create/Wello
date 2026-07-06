-- Studio-side cancellation safety window
--
-- Opt-in feature for studios / hotels / spas (not private instructors, who
-- already have their own pending_instructor confirm/decline flow). When a
-- business turns this on:
--   1. Slots less than 2 hours from now stop appearing as bookable
--   2. New confirmed bookings send a WhatsApp/SMS alert to the studio with
--      a one-time cancel link valid for 2 hours of 9am-7pm business time
--   3. If the studio taps cancel within the window, the booking flips to
--      'cancelled', credits are refunded, the customer gets an email with
--      alternatives. If they don't respond, the booking stands.
--
-- The default remains zero-action-required — the studio only needs to touch
-- their phone if there is a genuine conflict.

-- ── Column on businesses (opt-in flag) ─────────────────────────────────
alter table businesses
  add column if not exists cancellation_safety_window boolean default false;

-- ── Columns on bookings (per-booking cancel token + window) ────────────
-- One-time-use HMAC token embedded in the WhatsApp link. Set when the
-- alert is sent; cleared when the studio uses it or when the window expires.
alter table bookings
  add column if not exists safety_cancel_token       text,
  add column if not exists safety_cancel_expires_at  timestamptz,
  add column if not exists safety_cancelled_at       timestamptz;

-- ── Reject <2h bookings at the DB level ────────────────────────────────
-- Client-side filtering hides these slots on Explore. This trigger is the
-- server-authoritative check so a stale cache or a direct API call can't
-- squeeze a last-minute booking into a business that opted into the window.
--
-- We interpret (booking_date, start_time) as Europe/Madrid wall time,
-- matching how the browser builds session times in App.jsx.
create or replace function bookings_safety_window_check()
returns trigger
language plpgsql
as $$
declare
  v_safety boolean;
  v_session_start timestamptz;
begin
  -- Only enforce on new confirmed bookings. pending_instructor bookings
  -- follow their own 48h flow and are exempt.
  if new.status is distinct from 'confirmed' then
    return new;
  end if;

  select b.cancellation_safety_window
    into v_safety
    from businesses b
   where b.id = new.business_id;

  if v_safety is not true then
    return new;
  end if;

  v_session_start := ((new.booking_date::text || ' ' || new.start_time::text)::timestamp)
                     at time zone 'Europe/Madrid';

  if v_session_start < (now() + interval '2 hours') then
    raise exception
      'This session is too close to start time to book. Please pick a slot at least 2 hours from now.'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

drop trigger if exists bookings_safety_window_trigger on bookings;
create trigger bookings_safety_window_trigger
  before insert on bookings
  for each row
  execute function bookings_safety_window_check();
