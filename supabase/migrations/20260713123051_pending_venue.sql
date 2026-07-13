-- pending_venue bookings — studio/spa appointment offering requests.
--
-- Generalises the existing pending_instructor mechanism to studio/spa
-- treatment offerings. Everything that handles pending_instructor is
-- taught to handle pending_venue too:
--   - status check constraint accepts the new value
--   - auto-decline-stale-bookings sweeps both
--   - the customer's bookings UI badges both as "awaiting confirmation"
--   - the partner portal lists both for accept/decline
--
-- Data model additions:
--   offering_type              — which offering this request is against
--                                (studio offerings have no slot rows, so
--                                 slot_id stays null here)
--   venue_accept_token         — single-use HMAC token in the accept link
--   venue_decline_token        — single-use HMAC token in the decline link
--   venue_action_expires_at    — 48h window for both
--
-- Tokens are stored per row rather than derived so they can be single-use
-- (cleared on first use, matching the safety_cancel_token pattern).
-- Separate columns for accept vs decline mean a compromise of one leg
-- does not grant the other action.

-- ── Widen the status enum ──────────────────────────────────────────────
alter table bookings
  drop constraint if exists bookings_status_check;

alter table bookings
  add constraint bookings_status_check
  check (status = any (array[
    'pending'::text,
    'pending_instructor'::text,
    'pending_venue'::text,
    'confirmed'::text,
    'acuity_sync_failed'::text,
    'cancelled'::text
  ]));

-- ── Offering + venue-action columns ────────────────────────────────────
alter table bookings
  add column if not exists offering_type            text,
  add column if not exists venue_accept_token       text,
  add column if not exists venue_decline_token      text,
  add column if not exists venue_action_expires_at  timestamptz;

-- Index the venue action lookups so the accept/decline link endpoint
-- doesn't hot-scan bookings on every incoming click.
create index if not exists bookings_venue_accept_token_idx
  on bookings (venue_accept_token)
  where venue_accept_token is not null;

create index if not exists bookings_venue_decline_token_idx
  on bookings (venue_decline_token)
  where venue_decline_token is not null;
