-- Stripe Connect for partner payouts.
--
-- Each partner gets a Stripe Express connected account. Onboarding is
-- Stripe-hosted (KYC + bank details collected on their UI). We store the
-- account id + a coarse status mirror on the businesses row so the portal
-- can render a status pill and gate goLive without hitting the Stripe API
-- on every render.
--
-- Bookings gain a payout audit trail: when the weekly transfer runs, we
-- write the Transfer id and timestamp onto every booking that was paid
-- out in that batch so we can't accidentally double-pay.
alter table businesses
  add column if not exists stripe_account_id     text,
  add column if not exists stripe_account_status text;
  -- status values: null (not started), 'pending' (onboarding in progress /
  -- requirements outstanding), 'active' (charges + payouts enabled),
  -- 'restricted' (Stripe disabled the account).

alter table bookings
  add column if not exists payout_transfer_id text,
  add column if not exists payout_at          timestamptz;

-- Index so the weekly payout cron can scan efficiently for unpaid
-- completed bookings per business.
create index if not exists bookings_payout_pending_idx
  on bookings (business_id)
  where payout_at is null and status = 'confirmed';
