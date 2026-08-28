-- Hourly pg_cron job: invoke send-booking-reminders via pg_net.
--
-- Same X-Cron-Token / Vault pattern as the geocode backfill cron
-- (20260824020000_geocode_cron.sql). The shared secret lives in
-- vault.decrypted_secrets under name 'CRON_INVOKE_SECRET'; the edge
-- function constant-time compares against the CRON_INVOKE_SECRET env
-- var. Scheduled at :05 past the hour so it doesn't collide with the
-- top-of-hour geocode / auto-decline jobs.
--
-- Idempotent: unschedules any prior version by name before scheduling.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net  with schema extensions;

do $$
declare
  jid bigint;
begin
  select jobid into jid from cron.job where jobname = 'wello_send_booking_reminders';
  if jid is not null then perform cron.unschedule(jid); end if;
end $$;

select cron.schedule(
  'wello_send_booking_reminders',
  '5 * * * *',
  $cron$
    select net.http_post(
      url     := 'https://esocyyhnphjqcfjidffu.supabase.co/functions/v1/send-booking-reminders',
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
