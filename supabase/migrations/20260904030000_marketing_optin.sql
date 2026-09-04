-- Marketing opt-in on profiles + a durable suppression list.
--
-- Under Spanish LSSI-CE + UK PECR marketing emails need explicit consent.
-- We record:
--   * marketing_opt_in           — current state (bool)
--   * marketing_opt_in_at        — when the consent was given (Art 7(1) audit)
--   * marketing_opt_out_at       — when the member withdrew (audit trail)
--
-- The suppression list is separate because GDPR's right to object is
-- durable — once a user unsubscribes, they must never be re-added even if
-- a later signup form re-collects their email. Keyed by lowercased email
-- so it survives account deletion + re-registration.

alter table public.profiles
  add column if not exists marketing_opt_in         boolean not null default false,
  add column if not exists marketing_opt_in_at      timestamptz,
  add column if not exists marketing_opt_out_at     timestamptz;

comment on column public.profiles.marketing_opt_in is
  'Current marketing consent state. Consent required by Spanish LSSI-CE + UK PECR before sending non-transactional email.';
comment on column public.profiles.marketing_opt_in_at is
  'Timestamp of the most recent opt-in. GDPR Art 7(1) requires we demonstrate consent — this is the audit trail.';
comment on column public.profiles.marketing_opt_out_at is
  'Timestamp of the most recent opt-out. Never cleared; audit trail for the right to withdraw.';

-- Permanent suppression list. Emails here must never receive marketing
-- comms even if a new profile is created under the same email. Reason
-- codes: 'user_unsubscribe' | 'bounce' | 'complaint' | 'manual'.
create table if not exists public.marketing_suppressions (
  email          text primary key,
  suppressed_at  timestamptz not null default now(),
  reason         text not null check (reason in ('user_unsubscribe','bounce','complaint','manual'))
);

comment on table public.marketing_suppressions is
  'Durable email suppression list. GDPR right to object is permanent — once suppressed, never re-add.';

alter table public.marketing_suppressions enable row level security;

-- No user-facing RLS policies; only service role reads / writes this
-- (via the marketing-unsubscribe edge function + campaign sender).
