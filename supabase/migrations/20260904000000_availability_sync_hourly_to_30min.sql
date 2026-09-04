-- Tighten the baseline availability-sync cadence from hourly (5 * * * *)
-- to every 30 minutes (*/30 * * * *).
--
-- Why: partners with quiet days / far-future-only schedules were only
-- being touched once an hour; the urgent job (*/15) already covers
-- partners with a session today. 30 min halves the freshness lag for
-- the tail-case partners at negligible cost:
--   • 1 HTTP GET per partner per run — well under any adapter rate limit
--   • edge-fn invocation count doubles but stays deep inside free tier
--   • DB write footprint is unchanged per run
--
-- Unschedule the existing hourly job first (by name) so we don't end up
-- with two jobs firing. Urgent (*/15) is untouched.

do $$
declare
  jid bigint;
begin
  select jobid into jid from cron.job where jobname = 'wello_availability_sync_hourly';
  if jid is not null then perform cron.unschedule(jid); end if;
end $$;

select cron.schedule(
  'wello_availability_sync_hourly',
  '*/30 * * * *',
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
