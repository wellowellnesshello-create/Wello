-- Explicit opt-in flag so any partner can reveal the coverage/travel-zone
-- editor in Settings, without needing business_type = 'private_instructor'.
--
-- Prior state: the dashboard's Coverage & travel editor gated on
-- (business_type = 'private_instructor'). Studios that ALSO offer
-- at-customer sessions (e.g. Noor Yoga: fixed premises + travel-to-home
-- privates) had no UI path to configure their travel zones — the editor
-- was invisible to them.
--
-- Rather than force a category or business_type change, add an explicit
-- toggle. Any partner ticking "This business travels to customers" gets
-- the editor. Private-instructor businesses still get it implicitly via
-- their business_type, so no behaviour change for them.
--
-- Backfill: any business that already has coverage_areas or travel_areas
-- populated is clearly using the travel feature; flip them to true so the
-- editor stays visible after this change without needing partner action.

alter table public.businesses
  add column if not exists offers_at_customer boolean not null default false;

update public.businesses
   set offers_at_customer = true
 where (coverage_areas is not null and jsonb_array_length(coverage_areas) > 0)
    or (travel_areas    is not null and jsonb_array_length(travel_areas)    > 0);

comment on column public.businesses.offers_at_customer is
  'Explicit opt-in: this business offers at-customer sessions (partner travels to the customer''s address). When true, the dashboard reveals the coverage/travel-zone editor. Private-instructor businesses have this implicitly via business_type and do not need to set it.';
