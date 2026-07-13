-- Admin audit hardening.
--
-- Every admin-only edge function (extract-sessions, generate-magic-link)
-- now writes the caller's auth uid so we have a "who" against every
-- action, not just a "what". Both functions also enforce an allowlist
-- (ADMIN_USER_IDS env secret) so a valid anon or partner JWT can't invoke
-- them.

-- ── admin_extractions: capture the caller ─────────────────────────────
alter table admin_extractions
  add column if not exists admin_user_id uuid;

-- ── admin_magic_link_log: one row per generated link ──────────────────
create table if not exists admin_magic_link_log (
  id             bigserial primary key,
  created_at     timestamptz not null default now(),
  admin_user_id  uuid,
  business_id    bigint references businesses(id) on delete set null,
  business_email text,
  success        boolean not null default true,
  error          text
);

create index if not exists admin_magic_link_log_business_id_idx
  on admin_magic_link_log (business_id, created_at desc);
