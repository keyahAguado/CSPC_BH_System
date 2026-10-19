-- Retain the received payment and explain why it cannot secure/start a stay automatically.
SET @present=(SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='bookings' AND COLUMN_NAME='payment_review_reason');
SET @ddl=IF(@present=0,'ALTER TABLE bookings ADD COLUMN payment_review_reason TEXT NULL','SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
