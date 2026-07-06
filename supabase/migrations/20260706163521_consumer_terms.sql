-- Consumer terms of use audit trail.
--
-- Recorded on the profile row at signup, and immutable thereafter (the
-- upsert path in App.jsx only writes these fields when they are null,
-- so a re-login can't clobber the original acceptance timestamp).
alter table profiles
  add column if not exists consumer_terms_version     text,
  add column if not exists consumer_terms_accepted_at timestamptz;
