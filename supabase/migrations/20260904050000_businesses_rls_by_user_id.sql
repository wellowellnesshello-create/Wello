-- Swap the businesses UPDATE policy from email-match to user_id-match.
--
-- The previous policy matched businesses.email against auth.jwt().email.
-- That works most of the time but silently blocks UPDATEs when the two
-- drift by a case-change, whitespace, or if a partner's auth email is
-- later rotated. When it fires, terms-acceptance saves 0 rows and the
-- accept modal re-prompts on every portal visit — the acceptAgreement
-- handler in App.jsx logs a specific warning about this.
--
-- user_id = auth.uid() is the reliable check: businesses.user_id is
-- set at registration and doesn't change. Add WITH CHECK so a partner
-- can't UPDATE user_id to another partner's uid.

drop policy if exists "Partners can update own business" on public.businesses;

create policy "Partners can update own business" on public.businesses
  for update to authenticated
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());
