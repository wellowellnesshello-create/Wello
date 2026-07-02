-- Wello gifting: credits that one person buys and sends to another.
-- Status lifecycle:
--   pending_payment → sender started checkout but Stripe hasn't confirmed yet
--   available       → payment confirmed, recipient can redeem
--   claimed         → recipient has redeemed and credits landed on their profile
--   refunded        → sender cancelled / Stripe refunded

create table if not exists gifts (
  id                  uuid primary key default gen_random_uuid(),
  code                text unique not null,                         -- claim code (WELLO-XXXX-XXXX)
  credits             integer not null check (credits > 0),
  sender_email        text not null,
  sender_name         text,
  recipient_email     text,                                         -- optional: sender may just want the code
  recipient_name      text,
  message             text,
  status              text not null default 'pending_payment'
                        check (status in ('pending_payment', 'available', 'claimed', 'refunded')),
  claimed_by_user_id  uuid references auth.users(id) on delete set null,
  claimed_at          timestamptz,
  stripe_session_id   text unique,
  created_at          timestamptz not null default now()
);

create index if not exists gifts_code_idx           on gifts (code);
create index if not exists gifts_recipient_email_idx on gifts (lower(recipient_email));
create index if not exists gifts_status_idx          on gifts (status);

-- Row-level security: locked down to service role only. All reads and writes
-- go through the create-gift / redeem-gift edge functions.
alter table gifts enable row level security;
drop policy if exists "Deny all direct access" on gifts;
create policy "Deny all direct access" on gifts for all to public using (false) with check (false);
