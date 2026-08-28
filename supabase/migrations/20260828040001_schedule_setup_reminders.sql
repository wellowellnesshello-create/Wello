-- Daily pg_cron job: invoke send-setup-reminders via pg_net.
--
-- Runs at 10:00 UTC (11:00 Madrid winter / 12:00 Madrid summer) so
-- reminder emails land at a reasonable morning hour for partners.
-- The fn is a no-op for anyone who's logged in / opted through, so a
-- daily fire is safe even when there's no work to do.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net  with schema extensions;

do $$
declare
  jid bigint;
begin
  select jobid into jid from cron.job where jobname = 'wello_send_setup_reminders';
  if jid is not null then perform cron.unschedule(jid); end if;
end $$;

select cron.schedule(
  'wello_send_setup_reminders',
  '0 10 * * *',
  $cron$
    select net.http_post(
      url     := 'https://esocyyhnphjqcfjidffu.supabase.co/functions/v1/send-setup-reminders',
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
