-- Backfill venue_side='instructor' for slots at fixed-premises partners.
--
-- The 20260814030000 migration added slots.venue_side with default 'customer'
-- for every existing row. That was correct for private-instructor partners
-- (who travel to the customer's address) but wrong for studios (customer
-- travels to the studio).
--
-- We're about to move the client-side address-prompt gate from
-- (biz.category === 'Private Instructor') to (slot.venue_side === 'customer'),
-- so studio slots currently defaulting to 'customer' would begin prompting
-- customers for a home address. This backfill flips them to 'instructor' so
-- behaviour stays identical for every existing partner.
--
-- Rule: business_type wins when set (that's the source of truth); category is
-- the legacy fallback for rows without business_type. A slot is treated as
-- fixed-premises when NEITHER signal identifies the parent as a private
-- instructor.
--
-- Any slot already at venue_side='instructor' (there shouldn't be many yet,
-- but future-proof) is left alone.

update slots s
   set venue_side = 'instructor'
  from listings l
  join businesses b on b.id = l.business_id
 where s.listing_id = l.id
   and s.venue_side = 'customer'
   and coalesce(b.business_type, '') <> 'private_instructor'
   and coalesce(b.category, '')      <> 'Private Instructor';
