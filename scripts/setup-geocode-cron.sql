-- One-time setup for the automated geocode backfill.
--
-- After this runs, the pg_cron job scheduled in migration
-- 20260824020000_geocode_cron.sql will authenticate to the
-- backfill-geocodes edge function on every tick. Any row where
-- geocoded_from is null gets processed within 5 minutes — no admin
-- panel button, no manual invocation.
--
-- Steps:
--   1. Run this script in the Supabase SQL editor (or via psql). It
--      generates a random token, stores it in Vault, and prints the
--      value.
--   2. Copy the printed token and set it as the ADMIN_CLI_TOKEN edge
--      function secret:
--        supabase secrets set ADMIN_CLI_TOKEN=<token>
--      (Or via the Supabase dashboard: Edge Functions → Secrets.)
--   3. Redeploy the geocode-address and backfill-geocodes functions so
--      the new secret takes effect:
--        supabase functions deploy geocode-address backfill-geocodes
--
-- Idempotent: re-running rotates the token. Rotating the token
-- doesn't require re-running the migration, only re-running this
-- script + the secrets set + deploy sequence.

do $$
declare
  token text;
begin
  token := encode(gen_random_bytes(24), 'hex');

  -- Vault entry — read by pg_cron at every tick to attach to the
  -- X-Admin-Token header.
  delete from vault.secrets where name = 'wello_admin_cli_token';
  perform vault.create_secret(token, 'wello_admin_cli_token');

  raise notice '';
  raise notice '  wello_admin_cli_token set in Vault.';
  raise notice '';
  raise notice '  Next: copy the token below and set it as the edge fn secret.';
  raise notice '';
  raise notice '    supabase secrets set ADMIN_CLI_TOKEN=%', token;
  raise notice '';
  raise notice '  Then redeploy: supabase functions deploy geocode-address backfill-geocodes';
  raise notice '';
end $$;
