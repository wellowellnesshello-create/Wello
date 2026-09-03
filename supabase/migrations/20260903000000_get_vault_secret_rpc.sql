-- get_vault_secret(secret_name) — read a Vault entry by name from
-- edge functions. Vault lives in the `vault` schema, which
-- PostgREST does not expose (only `public` + `graphql_public` are
-- reachable via REST), so the availability-sync orchestrator's
-- .from('vault.decrypted_secrets') call fails with PGRST106.
--
-- This wrapper is security-definer so the fn can read secrets by
-- name without SELECT on vault.decrypted_secrets. Execute is
-- restricted to service_role — anon/authenticated cannot call it.

create or replace function public.get_vault_secret(secret_name text)
returns text
language sql
security definer
set search_path = vault, public
as $$
  select decrypted_secret::text
    from vault.decrypted_secrets
   where name = secret_name
   limit 1;
$$;

revoke execute on function public.get_vault_secret(text) from public;
revoke execute on function public.get_vault_secret(text) from anon;
revoke execute on function public.get_vault_secret(text) from authenticated;
grant  execute on function public.get_vault_secret(text) to   service_role;

comment on function public.get_vault_secret(text) is
  'Reads a Vault secret by name. Service-role only. Used by edge functions (availability-sync) that need Vault access via PostgREST since the vault schema is not exposed to REST.';
