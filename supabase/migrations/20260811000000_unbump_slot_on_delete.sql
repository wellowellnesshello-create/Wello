-- Fire the slot-unbump trigger on DELETE as well as UPDATE.
--
-- Bug surfaced by the sandbox loop's collision step (step 7):
--
--   spend-booking-credits deletes the booking row when the
--   collision check rejects it. The existing
--   unbump_slot_on_cancel trigger was AFTER UPDATE only, so the
--   DELETE released the row but left slots.booked incremented
--   by the INSERT-side bump_slot_on_booking trigger. Result: a
--   collision reject leaked one unit of capacity on the
--   attempted-and-rejected sibling slot.
--
-- Extend the trigger function to handle TG_OP = 'DELETE' with
-- the same effect: if the row being deleted still points at a
-- slot and wasn't already cancelled, decrement slots.booked.
-- Being idempotent-ish protects against a future DELETE of an
-- already-cancelled row (in which case UPDATE-to-cancelled
-- already did the decrement, and DELETE shouldn't double it).
--
-- Retroactive: covers spend-booking-credits' collision path AND
-- any future callsite that DELETEs a bookings row. Doesn't
-- affect existing UPDATE-to-cancelled flows (cancel-booking,
-- studio-cancel-booking, instructor/venue decline).

create or replace function unbump_slot_on_cancel()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.slot_id is not null and coalesce(old.status, '') <> 'cancelled' then
      update slots
      set booked = greatest(coalesce(booked, 0) - 1, 0)
      where id::text = old.slot_id::text;
    end if;
    return old;
  end if;

  if old.status is distinct from new.status
     and new.status = 'cancelled'
     and old.slot_id is not null then
    update slots
    set booked = greatest(coalesce(booked, 0) - 1, 0)
    where id::text = old.slot_id::text;
  end if;
  return new;
end;
$$;

drop trigger if exists booking_cancelled_unbump_slot on bookings;
create trigger booking_cancelled_unbump_slot
  after update or delete on bookings
  for each row execute function unbump_slot_on_cancel();
