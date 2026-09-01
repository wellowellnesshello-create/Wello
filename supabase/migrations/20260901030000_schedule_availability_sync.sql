-- pg_cron jobs for availability-sync.
--
-- Two schedules, matching the mapping presented on 2026-09-01:
--   • wello_availability_sync_hourly  — '5 * * * *'   — baseline; runs
--                                                        every sync-enabled
--                                                        partner
--   • wello_availability_sync_urgent  — '*/15 * * * *' — near-session
--                                                        boost; orchestrator
--                                                        pre-filters to
--                                                        partners with a
--                                                        session today
--
-- Same X-Cron-Token / Vault pattern as send-booking-reminders
-- (20260828010001). Idempotent — unschedules prior versions by name
-- before scheduling.
--
-- This migration ONLY adds these two jobs. It touches no existing
-- cron rows and does not enable/schedule anything else. Payout cron
-- remains deliberately unscheduled — nothing here reactivates it.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net  with schema extensions;

do $$
declare
  jid bigint;
begin
  select jobid into jid from cron.job where jobname = 'wello_availability_sync_hourly';
  if jid is not null then perform cron.unschedule(jid); end if;

  select jobid into jid from cron.job where jobname = 'wello_availability_sync_urgent';
  if jid is not null then perform cron.unschedule(jid); end if;
end $$;

select cron.schedule(
  'wello_availability_sync_hourly',
  '5 * * * *',
  $cron$
    select net.http_post(
      url     := 'https://esocyyhnphjqcfjidffu.supabase.co/functions/v1/availability-sync',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Cron-Token', coalesce(
          (select decrypted_secret from vault.decrypted_secrets where name = 'CRON_INVOKE_SECRET'),
          ''
        )
      ),
      body    := '{"mode":"all"}'::jsonb
    ) as request_id;
  $cron$
);

select cron.schedule(
  'wello_availability_sync_urgent',
  '*/15 * * * *',
  $cron$
    select net.http_post(
      url     := 'https://esocyyhnphjqcfjidffu.supabase.co/functions/v1/availability-sync',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Cron-Token', coalesce(
          (select decrypted_secret from vault.decrypted_secrets where name = 'CRON_INVOKE_SECRET'),
          ''
        )
      ),
      body    := '{"mode":"urgent"}'::jsonb
    ) as request_id;
  $cron$
);
