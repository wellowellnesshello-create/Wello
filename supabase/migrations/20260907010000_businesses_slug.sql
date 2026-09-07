-- Adds a stable URL slug to each business so venues can be linked as
-- /venue/<slug>. Slug is derived once from the business name and never
-- rewritten by rename — a shareable URL that stops working the moment
-- a partner tweaks their name is worse than a slightly stale slug.

create extension if not exists unaccent with schema extensions;

alter table public.businesses add column if not exists slug text;

create or replace function public.slugify(input text) returns text
language sql immutable as $$
  select trim(both '-' from
    regexp_replace(lower(extensions.unaccent(coalesce(input, ''))), '[^a-z0-9]+', '-', 'g')
  )
$$;

-- Returns the next free slug for a given name, appending -2, -3, ...
-- if the base slug is already taken. `exclude_id` lets a row check
-- against every business except itself (used during backfill so a row
-- that has already been assigned its own base slug isn't treated as a
-- collision against itself).
create or replace function public.next_business_slug(input_name text, exclude_id bigint default null)
returns text
language plpgsql as $$
declare
  base_slug text;
  candidate text;
  n int := 1;
begin
  base_slug := public.slugify(input_name);
  if base_slug is null or base_slug = '' then
    base_slug := 'venue';
  end if;
  candidate := base_slug;
  while exists (
    select 1 from public.businesses
    where slug = candidate
      and (exclude_id is null or id <> exclude_id)
  ) loop
    n := n + 1;
    candidate := base_slug || '-' || n;
  end loop;
  return candidate;
end;
$$;

-- Row-by-row backfill so two businesses with the same name don't both
-- resolve to the same candidate slug (a single UPDATE would compute
-- against the pre-update snapshot).
do $$
declare
  r record;
begin
  for r in select id, name from public.businesses where slug is null order by created_at loop
    update public.businesses set slug = public.next_business_slug(r.name, r.id) where id = r.id;
  end loop;
end $$;

alter table public.businesses alter column slug set not null;
create unique index if not exists businesses_slug_key on public.businesses(slug);

create or replace function public.businesses_ensure_slug() returns trigger
language plpgsql as $$
begin
  if new.slug is null or new.slug = '' then
    new.slug := public.next_business_slug(new.name, new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_businesses_ensure_slug on public.businesses;
create trigger trg_businesses_ensure_slug
  before insert on public.businesses
  for each row execute function public.businesses_ensure_slug();
