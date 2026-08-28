-- Automated setup-reminder emails for partners who reach `setting_up`
-- but haven't logged in yet (businesses.user_id still null after the
-- initial notify-partner-status magic link email).
--
-- Cadence: day 1, day 3, day 5 after entering setting_up. Each
-- reminder generates a fresh 24h magic link so the "expired link"
-- excuse never applies. Stops the moment user_id is populated (which
-- happens on first successful login via the orphan-row backfill in
-- App.jsx loadVenues).
--
-- Two new columns:
--   setting_up_at         timestamptz — when the row entered setting_up.
--                                       Reset each time the status flips
--                                       back into setting_up so a
--                                       re-approval sequence chases the
--                                       partner cleanly.
--   setup_reminders_sent  int         — 0..3, matches the CADENCE array
--                                       index in send-setup-reminders.
--                                       Incremented after each send so
--                                       we never double-fire and can
--                                       reason about progress at a glance.
--
-- A BEFORE-trigger keeps both columns in sync with status transitions —
-- no reliance on the notify-partner-status fn always running.

alter table public.businesses
  add column if not exists setting_up_at         timestamptz,
  add column if not exists setup_reminders_sent  integer not null default 0;

comment on column public.businesses.setting_up_at is
  'Timestamp when the row most recently entered status=setting_up. Anchor for the day 1/3/5 reminder cadence in send-setup-reminders.';
comment on column public.businesses.setup_reminders_sent is
  '0..3 — how many setup-reminder emails have been sent to this partner. Reset to 0 on each re-entry into setting_up.';

create or replace function public.stamp_setting_up_transition()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'setting_up'
     and (tg_op = 'INSERT' or old.status is distinct from 'setting_up') then
    new.setting_up_at        := now();
    new.setup_reminders_sent := 0;
  end if;
  return new;
end;
$$;

drop trigger if exists businesses_stamp_setting_up on public.businesses;
create trigger businesses_stamp_setting_up
before insert or update on public.businesses
for each row execute function public.stamp_setting_up_transition();

-- Backfill: any partner currently in setting_up with a null anchor
-- gets stamped so the reminder cron picks them up on next run.
-- businesses has no updated_at, so anchor on created_at — worst case
-- an old row gets a reminder sooner than it strictly deserves; better
-- than never getting chased.
update public.businesses
   set setting_up_at = coalesce(setting_up_at, created_at)
 where status = 'setting_up'
   and setting_up_at is null;
