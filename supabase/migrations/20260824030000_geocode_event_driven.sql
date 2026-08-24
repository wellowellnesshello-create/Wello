-- Event-driven geocoding: the DB trigger itself fires the HTTP call
-- when a business is inserted or its address changes. Replaces the
-- pg_cron every-5-minutes safety net — no more timer, no empty runs.
--
-- How it works:
--   1. Client saves an address (wizard, dashboard, admin, direct SQL).
--   2. BEFORE trigger (from 20260824010000) clears lat/lng/geocoded_from
--      in the same row so the row is unambiguously "needs geocoding".
--   3. AFTER trigger below fires net.http_post to backfill-geocodes,
--      which processes any pending row (there's typically just this one).
--   4. Nominatim returns; backfill writes the coords back to the row.
--
-- pg_net is async: the trigger returns immediately, the HTTP fires from
-- a background worker, response lands in net._http_response. If the
-- call fails (Nominatim down, network blip), the row stays flagged and
-- the next address change on any row re-triggers backfill, which picks
-- up all pending including the previously-failed one. Or admin clicks
-- the "Re-run geocoding backfill" button.

-- Drop the timed schedule — no longer needed.
do $$
declare
  jid bigint;
begin
  select jobid into jid from cron.job where jobname = 'wello_geocode_backfill';
  if jid is not null then perform cron.unschedule(jid); end if;
end $$;

-- AFTER trigger: fires the geocode kickoff. Kept separate from the
-- BEFORE trigger so responsibilities stay clean — BEFORE mutates the
-- row's own columns, AFTER does side effects.
create or replace function public.fire_geocode_on_address_change()
returns trigger
language plpgsql
security definer
as $$
declare
  admin_token text;
begin
  -- Only fire when we actually have an address to geocode.
  if new.address is null or length(trim(new.address)) < 4 then
    return new;
  end if;

  -- Pull the shared token from Vault at fire time so rotating doesn't
  -- require a migration. Missing token → invoke goes out with an empty
  -- header and the edge function returns 403; harmless (the row stays
  -- pending until the next trigger or a manual button click).
  select decrypted_secret into admin_token
    from vault.decrypted_secrets
   where name = 'wello_admin_cli_token'
   limit 1;

  -- Fire-and-forget. pg_net queues the request and returns a request_id
  -- immediately; the actual HTTP happens in a background worker.
  perform net.http_post(
    url     := 'https://esocyyhnphjqcfjidffu.supabase.co/functions/v1/backfill-geocodes',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-admin-token', coalesce(admin_token, '')
    ),
    body    := jsonb_build_object('force', false, 'limit', 5)
  );

  return new;
end;
$$;

drop trigger if exists business_address_fire_geocode on public.businesses;
create trigger business_address_fire_geocode
  after insert or update of address on public.businesses
  for each row execute function public.fire_geocode_on_address_change();

comment on function public.fire_geocode_on_address_change() is
  'AFTER INSERT/UPDATE trigger on businesses.address. Fires pg_net.http_post to backfill-geocodes so the row (already flagged as pending by the BEFORE trigger) gets geocoded immediately. Replaces the pg_cron schedule.';
