-- Daily pg_cron job: send-sync-price-reminders at 09:30 UTC.
--
-- Sits after setup-reminders (10:00) — no, actually before, chosen so
-- partners see the price digest before the setup reminder if both
-- would fire (a partner in setup won't be sync-enabled yet, so the
-- overlap is theoretical, but ordering is deterministic).
--
-- Same X-Cron-Token / Vault pattern as send-booking-reminders.
-- Idempotent — unschedules any prior version by name.
--
-- Only adds this job. Payout cron remains deliberately unscheduled.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net  with schema extensions;

do $$
declare
  jid bigint;
begin
  select jobid into jid from cron.job where jobname = 'wello_send_sync_price_reminders';
  if jid is not null then perform cron.unschedule(jid); end if;
end $$;

select cron.schedule(
  'wello_send_sync_price_reminders',
  '30 9 * * *',
  $cron$
    select net.http_post(
      url     := 'https://esocyyhnphjqcfjidffu.supabase.co/functions/v1/send-sync-price-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Cron-Token', coalesce(
          (select decrypted_secret from vault.decrypted_secrets where name = 'CRON_INVOKE_SECRET'),
          ''
        )
      ),
      body    := '{}'::jsonb
    ) as request_id;
  $cron$
);
