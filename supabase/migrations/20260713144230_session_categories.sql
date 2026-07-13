-- Multi-category venues — Phase 1 of the venue-wide vs session-specific
-- refactor. A studio like Yoga Del Mar runs yoga + sound healing +
-- breathwork under one venue but was forced to pick one primary category,
-- so a customer filtering for "Sound Bath" would never see them.
--
-- Model:
--   - businesses.category stays as the venue's primary/theme label. Used
--     for the marketplace card, alternatives-in-decline lookups, etc.
--   - businesses.slots[].category (JSONB field, additive — no column
--     migration needed for JSONB shape). When null it inherits the
--     venue primary category.
--   - businesses.session_offerings[].category same shape as above.
--   - businesses.session_categories text[] is the denormalised union so
--     filter queries hit an index instead of scanning JSONB.
--   - listings.session_categories text[] mirrors businesses on approval.
--   - slots.category text mirrors down on expansion for slot-level
--     queries (upcoming Explore Schedule view).
--
-- Backfill: existing rows get session_categories = ARRAY[category] so the
-- new filter path (cat = X OR X = ANY(session_categories)) returns the
-- same rows as the old one for every venue that was single-category.

-- ── New columns ────────────────────────────────────────────────────────
alter table businesses
  add column if not exists session_categories text[];

alter table listings
  add column if not exists session_categories text[];

alter table slots
  add column if not exists category text;

-- ── Backfill ───────────────────────────────────────────────────────────
-- One-off. Only touches rows where session_categories is null so re-run
-- is safe. Uses coalesce so venues with no category at all get an empty
-- array rather than [null].
update businesses
  set session_categories = case
    when category is null or category = '' then array[]::text[]
    else array[category]
  end
  where session_categories is null;

update listings
  set session_categories = case
    when cat is null or cat = '' then array[]::text[]
    else array[cat]
  end
  where session_categories is null;

-- Slot table backfill: pull the primary category from the parent listing.
-- Cheap because slots is small compared to the JSONB expansion done every
-- re-approval. Skips rows that already have a category set (idempotent).
update slots s
  set category = l.cat
  from listings l
  where s.listing_id = l.id
    and s.category is null
    and l.cat is not null
    and l.cat <> '';

-- ── Indexes for filter queries ────────────────────────────────────────
-- GIN on text[] lets `col && array[...]` and `x = any(col)` hit an index.
create index if not exists businesses_session_categories_gin_idx
  on businesses using gin (session_categories);

create index if not exists listings_session_categories_gin_idx
  on listings using gin (session_categories);

-- slots.category filter is likely used alongside date range for the
-- Explore Schedule view, so a btree on (category, date) beats gin here.
create index if not exists slots_category_date_idx
  on slots (category, date);
