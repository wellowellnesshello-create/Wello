-- Partner invite links + business contact_name.
--
-- Two adjacent fixes bundled together because they are both about the
-- admin -> partner handoff step.
--
-- 1. partner_invites
--    Turns the raw supabase.co magic link URL (which reads as a phishing
--    URL when pasted into a message) into a wello-domain URL:
--
--      https://www.wello-wellness.com/?invite=<code>
--
--    On click, the app calls redeem-partner-invite which validates the
--    code + expiry + not-yet-used flags, mints a fresh Supabase magic
--    link server-side, and redirects the browser to it. The partner
--    only sees the wello domain in the pasted link; they briefly see
--    the Supabase verify URL as the redirect happens.
--
-- 2. businesses.contact_name
--    Fixes the wizard's welcome copy. The old fallback derived a first
--    name from businesses.name.split(' ')[0], which produces "Yoga" for
--    "Yoga Del Mar". Storing a real contact name for studios (and using
--    it in every "hello" surface) means we can say "Welcome to Wello,
--    Maria" instead.

-- ── partner_invites ────────────────────────────────────────────────────
create table if not exists partner_invites (
  id             bigserial primary key,
  created_at     timestamptz not null default now(),
  admin_user_id  uuid,
  business_id    bigint references businesses(id) on delete cascade,
  code           text unique not null,
  expires_at     timestamptz not null,
  used_at        timestamptz
);

create index if not exists partner_invites_code_idx
  on partner_invites (code)
  where used_at is null;

create index if not exists partner_invites_business_idx
  on partner_invites (business_id, created_at desc);

-- ── businesses.contact_name ────────────────────────────────────────────
alter table businesses
  add column if not exists contact_name text;
