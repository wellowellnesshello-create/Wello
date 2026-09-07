-- venue_views records every time a customer opens a BizPanel. Needed
-- pre-launch: views can't be backfilled, and joining views->bookings
-- later is the only way to measure conversion by venue.
--
-- Insert-only RLS: anon + authenticated can log a view, but nobody can
-- read the table. Partners must not be able to see other partners'
-- traffic, and customers must not be able to see other customers'
-- browsing history. Analytics reads happen with the service role.

create table if not exists public.venue_views (
  id           bigint generated always as identity primary key,
  business_id  bigint not null references public.businesses(id) on delete cascade,
  listing_id   bigint references public.listings(id) on delete set null,
  user_id      uuid references auth.users(id) on delete set null,
  source       text,
  created_at   timestamp with time zone not null default now()
);

create index if not exists venue_views_business_id_created_at_idx
  on public.venue_views (business_id, created_at desc);

alter table public.venue_views enable row level security;

-- Insert allowed for both roles. No SELECT / UPDATE / DELETE policy
-- means those actions are denied by default under RLS.
drop policy if exists "venue_views insert anon" on public.venue_views;
create policy "venue_views insert anon"
  on public.venue_views for insert
  to anon
  with check (user_id is null);

drop policy if exists "venue_views insert authenticated" on public.venue_views;
create policy "venue_views insert authenticated"
  on public.venue_views for insert
  to authenticated
  with check (user_id is null or user_id = auth.uid());
