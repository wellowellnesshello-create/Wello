-- Momence self-serve: mirrors the Booqable pattern from
-- 20260901050000_mirror_booqable_creds_to_vault.sql.
--
-- Partner Settings UI writes momence_host_id + momence_api_key to
-- columns on businesses. Without this trigger those writes never reach
-- the sync location and the orchestrator silently skips the partner.
--
-- BEFORE INSERT OR UPDATE trigger on the two momence_* columns:
--   1. Upserts a Vault secret named 'momence_token_biz_<id>' holding
--      the api_key (create first time, rotate on key change).
--   2. Mutates NEW so sync_source / sync_config.host_id /
--      sync_secret_name populate for the orchestrator.
--
-- coalesce protects a manually-configured non-Momence sync_source
-- (e.g. sync_source='booqable') from being clobbered by Momence-column
-- writes. sync_config.host_id is always refreshed to reflect the
-- current momence_host_id — Booqable wouldn't read that key so no
-- collision if a partner ever ran both sources on the same row.

alter table public.businesses
  add column if not exists momence_host_id  bigint,
  add column if not exists momence_api_key  text;

comment on column public.businesses.momence_host_id is
  'Momence host id (numeric). Partner-facing input; mirrored into sync_config.host_id by trigger.';
comment on column public.businesses.momence_api_key is
  'Momence API token. Partner-facing input; mirrored into vault secret ''momence_token_biz_<id>'' by trigger. Column value is only what the partner last saved — the source of truth for the sync is Vault.';

create or replace function public.mirror_momence_creds_to_vault()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret_name text;
  v_existing_id uuid;
  v_needs_work  boolean;
begin
  -- Do nothing if either cred is missing. Also do nothing if creds
  -- were cleared — leave sync_source / sync_secret_name where they are;
  -- the operator can wipe those manually if they really want to
  -- disconnect the partner.
  if NEW.momence_host_id is null or NEW.momence_api_key is null then
    return NEW;
  end if;

  -- On UPDATE, only act if either cred actually changed OR the sync
  -- location hasn't been populated yet (backfill for existing rows).
  if TG_OP = 'UPDATE' then
    v_needs_work :=
      (OLD.momence_api_key is distinct from NEW.momence_api_key)
   or (OLD.momence_host_id is distinct from NEW.momence_host_id)
   or (NEW.sync_source is null)
   or (NEW.sync_secret_name is null);
    if not v_needs_work then
      return NEW;
    end if;
  end if;

  v_secret_name := 'momence_token_biz_' || NEW.id;

  -- Upsert the vault secret. update_secret rotates the value in
  -- place; create_secret adds it the first time.
  select id into v_existing_id from vault.secrets where name = v_secret_name;
  if v_existing_id is not null then
    perform vault.update_secret(v_existing_id, NEW.momence_api_key, v_secret_name);
  else
    perform vault.create_secret(NEW.momence_api_key, v_secret_name);
  end if;

  -- Mirror into sync columns.
  NEW.sync_source      := coalesce(NEW.sync_source, 'momence');
  NEW.sync_config      := coalesce(NEW.sync_config, '{}'::jsonb)
                        || jsonb_build_object('host_id', NEW.momence_host_id);
  NEW.sync_secret_name := coalesce(NEW.sync_secret_name, v_secret_name);

  return NEW;
end $$;

drop trigger if exists trg_mirror_momence_creds on public.businesses;
create trigger trg_mirror_momence_creds
  before insert or update of momence_host_id, momence_api_key
  on public.businesses
  for each row
  execute function public.mirror_momence_creds_to_vault();

comment on function public.mirror_momence_creds_to_vault is
  'BEFORE trigger fn: when partner Settings writes momence_host_id + momence_api_key, upserts vault secret ''momence_token_biz_<id>'' and populates sync_source/sync_config/sync_secret_name so the availability-sync orchestrator picks the partner up automatically. Mirrors the Booqable pattern.';
