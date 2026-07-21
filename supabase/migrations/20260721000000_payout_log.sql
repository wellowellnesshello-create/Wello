-- Weekly payout audit log + statement storage.
--
-- payout_log is the durable ledger of every payout attempt: paid,
-- skipped (missing rate / no delivered bookings / account not active /
-- net not positive), or failed (Stripe API error, partial DB commit,
-- account restricted mid-run). One row per (run_id, business_id).
--
-- Guarantees:
--   - run_weekly-payouts inserts a row for EVERY business it evaluated,
--     including those that were skipped. This makes "why did partner X
--     not get paid this week" a single query.
--   - booking_ids is the exact set of bookings whose payout_at was
--     stamped by that run — the same set the statement PDF was built
--     from. If we ever have to reconstruct a payout the source of truth
--     is (a) bookings.payout_transfer_id + (b) this row's booking_ids.
--   - statement_path points at the PDF in the payout-statements bucket
--     for successful runs. Never overwritten (each run is a new object).
--
-- Money columns are cents (bigint). We already use 1 credit = €1, so
-- gross_cents = sum(bookings.credits_used) * 100 for that batch. Kept
-- in cents to match Stripe's Transfer.amount and avoid float drift on
-- 33.3% type commission calculations.

create table if not exists payout_log (
  id                     bigint primary key generated always as identity,
  run_id                 uuid   not null,
  business_id            bigint references businesses(id) on delete set null,
  status                 text   not null check (status in ('paid','skipped','failed')),
  -- Machine-readable skip / failure reason. Human-friendly detail goes
  -- in error_message. Kept as a text (not enum) so we can add new codes
  -- without another migration.
  --   Skip codes:   'no_delivered_bookings', 'account_not_active',
  --                 'no_commission_rate', 'no_positive_net',
  --                 'account_restricted', 'dry_run'
  --   Failure codes:'stripe_error', 'partial_db_commit',
  --                 'statement_generation_failed', 'unexpected'
  reason                 text,
  booking_ids            bigint[],
  gross_cents            bigint,
  commission_cents       bigint,
  net_cents              bigint,
  stripe_transfer_id     text,
  statement_path         text,
  statement_email_status text,           -- 'sent' | 'failed' | 'no_resend_key' | null
  error_message          text,
  created_at             timestamptz not null default now()
);

create index if not exists payout_log_business_created_idx
  on payout_log (business_id, created_at desc);

create index if not exists payout_log_run_idx
  on payout_log (run_id);

-- Private bucket for statement PDFs. Access is exclusively via signed
-- URLs generated server-side by the future Partner Payouts view; the
-- bucket has no public read policy and Storage RLS defaults to
-- service-role-only when no policies exist, which is what we want.
insert into storage.buckets (id, name, public)
  values ('payout-statements', 'payout-statements', false)
  on conflict (id) do nothing;
