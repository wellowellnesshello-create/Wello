-- Change-detection column for the sync-price digest email.
--
-- send-sync-price-reminders (daily cron) computes a sha256 of the
-- sorted list of external_ids currently in sync_status='needs_price'
-- for each sync-enabled partner. If the hash matches the last one
-- stored, the set hasn't changed since we last emailed — skip.
-- Otherwise send + update the signature.
--
-- Rationale: a Momence recurring class generates dozens of needs_price
-- rows at once. We want ONE email per partner per day summarising the
-- count, and we don't want to spam if the partner is ignoring it.
-- Only re-send when the set of unpriced sessions actually changes
-- (partner added a new class in Momence, or fixed some but not all).

alter table public.businesses
  add column if not exists sync_price_digest_signature text;

comment on column public.businesses.sync_price_digest_signature is
  'sha256 of the sorted external_id list at the time of the last needs_price digest send. Digest re-sends only when the set changes.';
