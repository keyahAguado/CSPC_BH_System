-- Additive; retains original payment and booking history.
SET @present = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='bookings' AND COLUMN_NAME='cancellation_review');
SET @ddl = IF(@present=0,'ALTER TABLE bookings ADD COLUMN cancellation_review TEXT NULL','SELECT 1');
PREPARE statement FROM @ddl;
EXECUTE statement;
DEALLOCATE PREPARE statement;
