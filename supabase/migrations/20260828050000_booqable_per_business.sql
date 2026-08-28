-- Per-business Booqable credentials.
--
-- Booqable is per-partner: each rental venue (like Reynes cycling in
-- Deià) has their own Booqable account. The `booqable-sync` fn used
-- to read a single global API key from env, which was fine for a
-- stub but doesn't scale to multiple partners. Move the config onto
-- the businesses row so each partner supplies their own.
--
-- Fields:
--   booqable_subdomain  — the part before .booqable.com in the
--                         partner's admin URL, e.g. 'reynescycling'.
--   booqable_api_key    — a Booqable API key with read + write scope
--                         so we can list products, create orders,
--                         cancel orders. Plaintext for MVP; the row
--                         is already RLS-scoped to the owning
--                         partner + service_role so scope of exposure
--                         is limited to who could see it before.
--
-- Both nullable — no Booqable = fine, we just don't sync.

alter table public.businesses
  add column if not exists booqable_subdomain text,
  add column if not exists booqable_api_key   text;

comment on column public.businesses.booqable_subdomain is
  'Partner''s Booqable subdomain (e.g. "reynescycling" for reynescycling.booqable.com). Nullable — partners without Booqable leave it blank.';
comment on column public.businesses.booqable_api_key is
  'Partner''s Booqable API key. Plaintext in-DB; access is RLS-limited to the owning partner + service_role. Consider Vault-encrypting in a later hardening pass.';
