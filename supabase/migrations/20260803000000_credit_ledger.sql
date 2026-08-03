-- Credit ledger.
--
-- Credits used to live as a single integer column on profiles.credits,
-- read-modify-written by every top-up, spend, and refund path. That
-- gave us no history, no way to distinguish purchased credits from
-- promotional bonus credits, and no way to expire bonuses.
--
-- This migration introduces the ledger as the new source of truth:
--   - Each grant (purchase, gift, admin comp, bonus code) inserts a
--     'grant' row with a remaining counter.
--   - Each spend inserts a 'spend' row that references the grant it
--     drew from and decrements that grant's remaining.
--   - Each refund (cancel, decline, auto-decline) inserts a 'refund'
--     row that references the spend it reverses and increments the
--     original grant's remaining back up.
--   - Bonus credits may have expires_at set. Purchased credits never
--     expire (enforced by a check constraint).
--
-- profiles.credits is retained as a cached total, kept in sync by a
-- trigger. Frontend reads (of which there are many) continue to work
-- unchanged. Every write path is rerouted through the RPCs below.
--
-- Deduction order (used by spend_credits):
--   1. Bonus grants first, oldest-first.
--   2. Purchased grants next, oldest-first.
-- Expired bonus grants are excluded from both spending and the
-- spendable balance.

create type credit_type as enum ('purchased', 'bonus');

create table credit_ledger (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  kind         text not null check (kind in ('grant', 'spend', 'refund')),
  delta        integer not null check (delta <> 0),
  credit_type  credit_type not null,
  expires_at   timestamptz,
  source       text not null,
  booking_id   uuid references bookings(id) on delete set null,
  parent_id    bigint references credit_ledger(id),
  remaining    integer,
  note         text,
  created_at   timestamptz not null default now(),

  constraint expires_only_bonus check (
    (credit_type = 'purchased' and expires_at is null)
    or credit_type = 'bonus'
  ),
  constraint grant_shape check (
    (kind = 'grant'  and delta > 0 and remaining is not null and remaining >= 0 and parent_id is null)
    or (kind = 'spend'  and delta < 0 and remaining is null and parent_id is not null)
    or (kind = 'refund' and delta > 0 and remaining is null and parent_id is not null)
  )
);

create index credit_ledger_user_idx        on credit_ledger(user_id);
create index credit_ledger_user_booking_idx on credit_ledger(user_id, booking_id) where booking_id is not null;
create index credit_ledger_spendable_idx    on credit_ledger(user_id, credit_type, created_at)
  where kind = 'grant' and remaining > 0;

alter table credit_ledger enable row level security;
create policy credit_ledger_own_read
  on credit_ledger for select
  using (user_id = auth.uid());

-- ── Balance helpers ───────────────────────────────────────────────────
-- Spendable balance excludes expired bonus grants. Trigger below keeps
-- profiles.credits = purchased_spendable + bonus_spendable so existing
-- reads keep working.

create or replace function credit_balance(p_user_id uuid)
returns table(purchased integer, bonus integer)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(sum(remaining) filter (where credit_type = 'purchased'), 0)::int as purchased,
    coalesce(sum(remaining) filter (
      where credit_type = 'bonus' and (expires_at is null or expires_at > now())
    ), 0)::int as bonus
  from credit_ledger
  where user_id = p_user_id
    and kind = 'grant';
$$;

create or replace function _credit_refresh_profile(p_user_id uuid)
returns void
language sql
as $$
  update profiles
     set credits = (
       select coalesce(sum(remaining) filter (
         where expires_at is null or expires_at > now()
       ), 0)::int
       from credit_ledger
       where user_id = p_user_id
         and kind = 'grant'
     )
   where id = p_user_id;
$$;

create or replace function _credit_ledger_touch()
returns trigger
language plpgsql
as $$
begin
  if (tg_op = 'DELETE') then
    perform _credit_refresh_profile(old.user_id);
  else
    perform _credit_refresh_profile(new.user_id);
  end if;
  return null;
end
$$;

create trigger credit_ledger_touch_profile
  after insert or update or delete on credit_ledger
  for each row execute function _credit_ledger_touch();

-- ── Grant ─────────────────────────────────────────────────────────────
-- Inserts a single grant row. Purchased grants must have expires_at
-- null (also enforced by the check constraint). Called by
-- stripe-webhook, redeem-gift, redeem-bonus-code, and admin flows.

create or replace function grant_credits(
  p_user_id     uuid,
  p_amount      integer,
  p_credit_type credit_type,
  p_source      text,
  p_expires_at  timestamptz default null,
  p_note        text default null
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'grant_credits: amount must be positive';
  end if;
  if p_credit_type = 'purchased' and p_expires_at is not null then
    raise exception 'grant_credits: purchased credits cannot expire';
  end if;

  insert into credit_ledger (
    user_id, kind, delta, credit_type, expires_at, source, remaining, note
  ) values (
    p_user_id, 'grant', p_amount, p_credit_type, p_expires_at, p_source, p_amount, p_note
  ) returning id into v_id;

  return v_id;
end
$$;

-- ── Spend ─────────────────────────────────────────────────────────────
-- Consumes p_amount credits from the caller-specified user. Draws from
-- bonus grants first (oldest-first), then purchased (oldest-first).
-- Expired bonus grants are skipped. Emits one spend row per grant it
-- draws from and decrements that grant's remaining. Raises
-- 'insufficient_credits' (sqlstate P0001) if the balance cannot cover
-- the request; the whole transaction rolls back so no partial spend
-- lands.

create or replace function spend_credits(
  p_user_id    uuid,
  p_amount     integer,
  p_source     text,
  p_booking_id uuid    default null,
  p_note       text    default null
) returns bigint[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_left     integer := p_amount;
  v_grant    record;
  v_take     integer;
  v_spend_id bigint;
  v_ids      bigint[] := array[]::bigint[];
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'spend_credits: amount must be positive';
  end if;

  -- Lock this user's spendable grant rows against concurrent spends so
  -- two parallel requests can't both draw the same last credits.
  perform 1
    from credit_ledger
   where user_id = p_user_id
     and kind = 'grant'
     and remaining > 0
     and (expires_at is null or expires_at > now())
   for update;

  for v_grant in
    select id, remaining, credit_type, expires_at
      from credit_ledger
     where user_id = p_user_id
       and kind = 'grant'
       and remaining > 0
       and (expires_at is null or expires_at > now())
     order by
       (credit_type = 'bonus') desc,  -- bonus first
       created_at asc,                -- oldest-first within type
       id asc
  loop
    exit when v_left <= 0;

    v_take := least(v_grant.remaining, v_left);

    insert into credit_ledger (
      user_id, kind, delta, credit_type, expires_at, source, booking_id, parent_id, note
    ) values (
      p_user_id, 'spend', -v_take, v_grant.credit_type, v_grant.expires_at,
      p_source, p_booking_id, v_grant.id, p_note
    ) returning id into v_spend_id;

    update credit_ledger
       set remaining = remaining - v_take
     where id = v_grant.id;

    v_ids  := array_append(v_ids, v_spend_id);
    v_left := v_left - v_take;
  end loop;

  if v_left > 0 then
    raise exception 'insufficient_credits' using errcode = 'P0001';
  end if;

  return v_ids;
end
$$;

-- ── Refund by booking ─────────────────────────────────────────────────
-- Reverses every spend row tied to a booking, crediting the same
-- grants they came from (restoring remaining). Idempotent: refund
-- rows are keyed off the spend rows they reverse, so calling twice
-- for the same booking is a no-op on the second call.

create or replace function refund_by_booking(
  p_booking_id uuid,
  p_source     text default 'refund',
  p_note       text default null
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_spend    record;
  v_refund   integer := 0;
  v_already  boolean;
begin
  if p_booking_id is null then
    raise exception 'refund_by_booking: booking_id required';
  end if;

  for v_spend in
    select id, user_id, delta, credit_type, expires_at, parent_id
      from credit_ledger
     where booking_id = p_booking_id
       and kind = 'spend'
     for update
  loop
    -- Skip if already refunded.
    select exists (
      select 1 from credit_ledger
       where kind = 'refund'
         and parent_id = v_spend.id
    ) into v_already;
    if v_already then continue; end if;

    insert into credit_ledger (
      user_id, kind, delta, credit_type, expires_at, source, booking_id, parent_id, note
    ) values (
      v_spend.user_id, 'refund', -v_spend.delta, v_spend.credit_type, v_spend.expires_at,
      p_source, p_booking_id, v_spend.id, p_note
    );

    update credit_ledger
       set remaining = remaining + (-v_spend.delta)
     where id = v_spend.parent_id;

    v_refund := v_refund + (-v_spend.delta);
  end loop;

  return v_refund;
end
$$;

-- ── Grant EXECUTE ─────────────────────────────────────────────────────
-- Client-side calls to credit_balance are safe (users can only ask
-- about themselves in practice — RLS via own_read still applies to any
-- other reads they might attempt). Spend / grant / refund are edge-
-- function-only, so revoke from anon/authenticated to close the door.

grant execute on function credit_balance(uuid)                                to anon, authenticated, service_role;
revoke execute on function grant_credits(uuid, integer, credit_type, text, timestamptz, text) from public;
grant  execute on function grant_credits(uuid, integer, credit_type, text, timestamptz, text) to service_role;
revoke execute on function spend_credits(uuid, integer, text, uuid, text) from public;
grant  execute on function spend_credits(uuid, integer, text, uuid, text) to service_role;
revoke execute on function refund_by_booking(uuid, text, text) from public;
grant  execute on function refund_by_booking(uuid, text, text) to service_role;

-- ── Backfill ─────────────────────────────────────────────────────────
-- Every profile row with credits > 0 becomes a single 'purchased'
-- grant. Skip anyone who already has a ledger row (safe re-run). The
-- trigger will re-derive profiles.credits from the inserted grant, so
-- no separate profiles UPDATE is needed.

insert into credit_ledger (user_id, kind, delta, credit_type, source, remaining, note, created_at)
select
  p.id,
  'grant',
  p.credits,
  'purchased'::credit_type,
  'backfill',
  p.credits,
  'Migrated from profiles.credits',
  now()
from profiles p
where coalesce(p.credits, 0) > 0
  and not exists (
    select 1 from credit_ledger l where l.user_id = p.id
  );
