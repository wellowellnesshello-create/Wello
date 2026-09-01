-- Auto-mirror partner Booqable creds into the sync location.
--
-- Partner Settings UI still writes booqable_subdomain +
-- booqable_api_key directly to columns on businesses. Without this
-- trigger, those columns would populate but sync_source /
-- sync_config / sync_secret_name / vault would stay empty, and the
-- availability-sync orchestrator would silently skip the partner.
--
-- This BEFORE INSERT OR UPDATE trigger:
--   1. Upserts a Vault secret named 'booqable_token_biz_<id>' holding
--      the api_key (create if missing, update if the key changed).
--   2. Mutates NEW so sync_source / sync_config.subdomain /
--      sync_secret_name are populated for the orchestrator.
--
-- Uses coalesce on the sync_* fields so a manually-configured partner
-- (e.g. sync_source='momence') is never clobbered by Booqable-column
-- writes. Uses BEFORE trigger + NEW mutation to avoid a second UPDATE
-- that would recurse.

create or replace function public.mirror_booqable_creds_to_vault()
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
  -- were cleared (previously set, now NULL) — leave sync_source /
  -- sync_secret_name where they are; the operator can wipe those
  -- manually if they really want to disconnect the partner.
  if NEW.booqable_subdomain is null or NEW.booqable_api_key is null then
    return NEW;
  end if;

  -- On UPDATE, only act if either cred actually changed OR the sync
  -- location hasn't been populated yet (backfill for existing rows).
  if TG_OP = 'UPDATE' then
    v_needs_work :=
      (OLD.booqable_api_key   is distinct from NEW.booqable_api_key)
   or (OLD.booqable_subdomain is distinct from NEW.booqable_subdomain)
   or (NEW.sync_source is null)
   or (NEW.sync_secret_name is null);
    if not v_needs_work then
      return NEW;
    end if;
  end if;

  v_secret_name := 'booqable_token_biz_' || NEW.id;

  -- Upsert the vault secret. update_secret rotates the value in
  -- place; create_secret adds it the first time.
  select id into v_existing_id from vault.secrets where name = v_secret_name;
  if v_existing_id is not null then
    perform vault.update_secret(v_existing_id, NEW.booqable_api_key, v_secret_name);
  else
    perform vault.create_secret(NEW.booqable_api_key, v_secret_name);
  end if;

  -- Mirror into sync columns. coalesce protects a manually-configured
  -- non-booqable source from being overwritten. sync_config.subdomain
  -- always reflects the current Booqable subdomain — Momence wouldn't
  -- read that key, so there's no collision.
  NEW.sync_source      := coalesce(NEW.sync_source, 'booqable');
  NEW.sync_config      := coalesce(NEW.sync_config, '{}'::jsonb)
                        || jsonb_build_object('subdomain', NEW.booqable_subdomain);
  NEW.sync_secret_name := coalesce(NEW.sync_secret_name, v_secret_name);

  return NEW;
end $$;

drop trigger if exists trg_mirror_booqable_creds on public.businesses;
create trigger trg_mirror_booqable_creds
  before insert or update of booqable_subdomain, booqable_api_key
  on public.businesses
  for each row
  execute function public.mirror_booqable_creds_to_vault();

comment on function public.mirror_booqable_creds_to_vault is
  'BEFORE trigger fn: when partner Settings writes booqable_subdomain + booqable_api_key, upserts vault secret ''booqable_token_biz_<id>'' and populates sync_source/sync_config/sync_secret_name so the availability-sync orchestrator picks the partner up automatically. coalesce on sync_* fields protects any manually-configured non-booqable source.';
