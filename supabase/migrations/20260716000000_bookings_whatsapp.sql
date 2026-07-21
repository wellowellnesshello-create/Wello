-- WhatsApp number for booking management. Separate from businesses.phone
-- (the public contact number shown on the venue card) — this one is the
-- partner's internal channel where they want to receive booking alerts
-- and manage confirmations from WhatsApp. Kept as free text since not
-- every partner uses a phone number that maps cleanly to E.164.

alter table businesses
  add column if not exists bookings_whatsapp text;
