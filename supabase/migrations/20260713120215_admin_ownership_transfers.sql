-- Ownership handoff audit trail.
--
-- The admin setup tool can transfer a listing from the admin's email
-- (used to set it up) to the real partner's email. This is a material
-- change (they gain access to a real business row, we lose it), so every
-- transfer gets its own log line — separate from the general
-- admin_actions telemetry so it's easy to audit and restore from.

create table if not exists admin_ownership_transfers (
  id             bigserial primary key,
  created_at     timestamptz not null default now(),
  admin_user_id  uuid,
  business_id    bigint references businesses(id) on delete set null,
  from_email     text,
  to_email       text,
  cleared_user_id boolean not null default false
);

create index if not exists admin_ownership_transfers_business_id_idx
  on admin_ownership_transfers (business_id, created_at desc);
