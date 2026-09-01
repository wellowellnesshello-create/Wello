-- Pluggable availability-sync schema.
--
-- Businesses gain a small config surface for the sync orchestrator:
--   sync_source      — adapter key ('momence' | 'booqable' | null = manual)
--   sync_config      — non-secret adapter shape ({ host_id }, { subdomain })
--   sync_secret_name — Vault key holding the API token/key (convention
--                      <source>_token_biz_<id>)
--   sync_last_ok_at  — last successful run; drives fallback (on failure
--                      the orchestrator writes no slot rows, so the last
--                      known state stands)
--   sync_last_error  — truncated error from most recent failed run,
--                      surfaced to the partner in BizPanel later
--
-- Slots gain the upsert key + provenance:
--   source           — 'manual' (default) | 'momence' | 'booqable'
--   external_id      — adapter's stable id for this bookable instance
--   synced_at        — last time this row was touched by the orchestrator
--   sync_status      — 'active' (default) | 'cancelled' (adapter dropped
--                      it or marked cancelled) | 'needs_price' (no
--                      matching offering — see availability-sync)
--
-- The orchestrator upserts on (listing_id, source, external_id). Rows
-- that come back missing are marked 'cancelled' rather than deleted so
-- historical bookings retain their slot linkage.
--
-- Existing Booqable per-business creds (booqable_subdomain +
-- booqable_api_key columns from 20260828050000) are backfilled into
-- Vault + the new columns here. The old columns are LEFT IN PLACE for
-- now so the existing reserve/release path (booqable-sync) and the
-- Settings UI keep working unchanged. Cleanup is a follow-up commit
-- once the new read integration is verified.

-- ── businesses columns ───────────────────────────────────────────
alter table public.businesses
  add column if not exists sync_source      text,
  add column if not exists sync_config      jsonb default '{}'::jsonb,
  add column if not exists sync_secret_name text,
  add column if not exists sync_last_ok_at  timestamptz,
  add column if not exists sync_last_error  text;

comment on column public.businesses.sync_source is
  'Availability adapter key. NULL = manual (no automated sync). Adapters: momence, booqable.';
comment on column public.businesses.sync_config is
  'Adapter-specific non-secret config. Momence: {host_id:number}. Booqable: {subdomain:string}.';
comment on column public.businesses.sync_secret_name is
  'Vault entry name for the adapter API token/key. Convention: <source>_token_biz_<id>.';

-- ── slots columns ────────────────────────────────────────────────
alter table public.slots
  add column if not exists source      text default 'manual',
  add column if not exists external_id text,
  add column if not exists synced_at   timestamptz,
  add column if not exists sync_status text default 'active';

comment on column public.slots.source is
  'Provenance. manual = partner-configured, otherwise an adapter key. Only non-manual rows are touched by availability-sync.';
comment on column public.slots.external_id is
  'Adapter stable id. Momence event id, or Booqable <product_uuid>:<YYYY-MM-DD>. NULL for manual rows.';
comment on column public.slots.sync_status is
  'active | cancelled (adapter dropped or marked cancelled) | needs_price (adapter row had no matching Wello offering, credits left NULL).';

-- Upsert key. Partial index so manual rows (external_id NULL) don't
-- collide with each other.
create unique index if not exists slots_source_external_id_uidx
  on public.slots (listing_id, source, external_id)
  where external_id is not null;

-- ── Backfill existing Booqable partners into new location ────────
-- Copies booqable_api_key into Vault under the new naming convention
-- and populates sync_source / sync_config / sync_secret_name so the
-- orchestrator can pick these partners up immediately. Idempotent —
-- safe to re-run.
do $$
declare
  b             record;
  v_secret_name text;
begin
  for b in
    select id, booqable_subdomain, booqable_api_key
      from public.businesses
     where booqable_api_key is not null
       and booqable_subdomain is not null
  loop
    v_secret_name := 'booqable_token_biz_' || b.id;

    if not exists (select 1 from vault.secrets where name = v_secret_name) then
      perform vault.create_secret(b.booqable_api_key, v_secret_name);
    end if;

    update public.businesses
       set sync_source      = coalesce(sync_source, 'booqable'),
           sync_config      = coalesce(sync_config, '{}'::jsonb)
                              || jsonb_build_object('subdomain', b.booqable_subdomain),
           sync_secret_name = coalesce(sync_secret_name, v_secret_name)
     where id = b.id;
  end loop;
end $$;
