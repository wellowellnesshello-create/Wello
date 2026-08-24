-- bookings.id is uuid, not bigint. The initial payout_log migration
-- (20260721000000_payout_log.sql) declared booking_ids as bigint[],
-- which would raise a type-mismatch error the first time
-- run-weekly-payouts tried to persist a paid batch — after the Stripe
-- Transfer had already succeeded. Fix the column type before any run
-- lands data in the table.
--
-- payout_log has no rows yet (no payout run has completed), so a
-- drop-and-add is safe and simpler than an ALTER … TYPE with a USING
-- cast between incompatible types.

alter table payout_log drop column if exists booking_ids;
alter table payout_log add  column if not exists booking_ids uuid[];
