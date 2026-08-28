-- Drop the legacy AFTER INSERT trigger that blindly incremented
-- slots.booked on every booking insert.
--
-- Since try_reserve_slot (added in 20260828070000) now atomically
-- checks capacity + increments booked under an advisory lock, the
-- old trigger just causes double-counting: client inserts booking →
-- trigger bumps booked by +1 → spend-booking-credits calls
-- try_reserve_slot → RPC bumps booked by +people_count → real
-- count is off by (people_count - 1) at minimum, and the capacity
-- check refuses the last legitimate seat because the trigger's
-- pre-increment already put booked at or above spots.
--
-- The cancel path (unbump_slot_on_cancel) stays — it fires on
-- UPDATE when status flips to cancelled, and try_reserve_slot
-- doesn't touch that.

drop trigger if exists booking_inserted_bump_slot on public.bookings;

-- Re-run the same backfill as 20260828080000 because the double-
-- counted state could still be inflating booked for any slot that
-- was booked in the window between that migration and this one.
with active as (
  select slot_id::bigint as slot_id,
         coalesce(sum(coalesce(people_count, 1)), 0) as taken
    from public.bookings
   where status in ('confirmed', 'pending_venue', 'pending_instructor')
     and slot_id is not null
   group by slot_id::bigint
)
update public.slots s
   set booked = coalesce(a.taken, 0)
  from active a
 where s.id = a.slot_id;

update public.slots s
   set booked = 0
 where s.id not in (
   select slot_id::bigint
     from public.bookings
    where status in ('confirmed', 'pending_venue', 'pending_instructor')
      and slot_id is not null
 )
   and coalesce(s.booked, 0) <> 0;
