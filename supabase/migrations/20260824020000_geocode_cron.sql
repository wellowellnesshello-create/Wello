-- Schedule the geocode backfill so any row the previous migration flagged
-- (geocoded_from = null) gets processed within ~5 minutes. Zero manual
-- intervention after the one-time token setup (see
-- scripts/setup-geocode-cron.sql).
--
-- Uses pg_cron to fire and pg_net to make the outbound HTTP call. Auth
-- to backfill-geocodes is via the ADMIN_CLI_TOKEN X-Admin-Token header
-- (matches the ephemeral CLI bypass in _shared/admin_auth.ts), with the
-- token stored in Vault so we never bake secrets into the migration.
--
-- Idempotent: unschedules any prior version of this job by name before
-- re-scheduling, so migrations can be replayed without accumulating
-- duplicate schedules.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net  with schema extensions;

-- Drop any prior instance of the schedule by name.
do $$
declare
  jid bigint;
begin
  select jobid into jid from cron.job where jobname = 'wello_geocode_backfill';
  if jid is not null then perform cron.unschedule(jid); end if;
end $$;

-- Schedule every 5 minutes. Reads the admin token from Vault at call
-- time so rotating the token doesn't require re-migrating. If the vault
-- entry hasn't been created yet (setup script not run), the request goes
-- out with an empty X-Admin-Token and the edge function returns 403 —
-- cron re-runs 5 minutes later, so setup can happen at any time.
select cron.schedule(
  'wello_geocode_backfill',
  '*/5 * * * *',
  $cron$
    select net.http_post(
      url     := 'https://esocyyhnphjqcfjidffu.supabase.co/functions/v1/backfill-geocodes',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-admin-token', coalesce(
          (select decrypted_secret from vault.decrypted_secrets where name = 'wello_admin_cli_token'),
          ''
        )
      ),
      body    := jsonb_build_object('force', false, 'limit', 8)
    ) as request_id;
  $cron$
);

comment on extension pg_cron is
  'Wello uses pg_cron for the automated geocode backfill (every 5 min) — see wello_geocode_backfill in cron.job.';
