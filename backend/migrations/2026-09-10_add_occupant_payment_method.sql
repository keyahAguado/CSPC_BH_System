-- Adds a persisted payment_method to occupants so room tracking, the admin
-- ledger, and owner bookings can show HOW a resident paid (cash vs online),
-- not just whether they've paid. Mirrors the existing payment_status column,
-- which is already duplicated from bookings onto occupants for the same
-- "don't make every report join back to bookings" reason.
ALTER TABLE occupants
  ADD COLUMN payment_method VARCHAR(20) DEFAULT 'cash' AFTER payment_status;

-- Backfill existing rows from their originating booking where it was PayMongo
-- (everything else defaults to 'cash', which matches how they were created —
-- only the cash-approval path in owner.js wrote occupants before this column
-- existed for non-PayMongo bookings).
UPDATE occupants o
JOIN bookings b ON b.student_id = o.student_id AND b.room_id = o.room_id AND b.payment_method = 'paymongo'
SET o.payment_method = 'paymongo'
WHERE o.is_non_cspc = 0;
