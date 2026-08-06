-- Stripe webhook idempotency.
--
-- Stripe retries webhook deliveries whenever the endpoint doesn't
-- return 2xx quickly enough (network blip, cold start, deploy
-- flip) and can also be replayed manually from the dashboard. The
-- stripe-webhook function had no dedup guard, so every retry
-- would re-run its side-effects — most importantly grant_credits,
-- which would silently double a customer's balance on any hiccup.
--
-- This table records every event.id we've processed. The webhook
-- attempts an insert with a unique constraint on event.id BEFORE
-- running any side-effect; a duplicate insert => already
-- processed => short-circuit with 200.
--
-- The table is intentionally scoped to Stripe (not a generic
-- webhook table) so future non-Stripe webhooks can pick their own
-- idempotency strategy.

create table stripe_processed_events (
  event_id       text not null primary key,
  event_type     text,                  -- informational; not used for logic
  processed_at   timestamptz not null default now()
);

-- Access is service-role only (the webhook function). RLS default-deny
-- covers everything else — no reason for the API or client to see this.
alter table stripe_processed_events enable row level security;
