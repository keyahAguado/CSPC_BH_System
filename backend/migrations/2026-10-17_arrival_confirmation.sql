-- Additive. An automatically started stay counts as a resident only after the owner confirms arrival.
-- Open automatic stays that already exist are marked as awaiting arrival; manual and legacy occupants are unchanged.
SET @db_name = DATABASE();
SET @ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='occupants' AND COLUMN_NAME='arrival_required')=0,
 'ALTER TABLE occupants ADD COLUMN arrival_required TINYINT(1) NOT NULL DEFAULT 0, ADD COLUMN arrival_confirmed_at DATETIME NULL','SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
UPDATE occupants o JOIN bookings b ON o.reference_no = CONCAT('REF-', LPAD(b.id, GREATEST(4,CHAR_LENGTH(b.id)), '0'))
 SET o.arrival_required = 1
 WHERE b.occupancy_auto_started = 1 AND o.arrival_confirmed_at IS NULL
   AND (o.check_out_date IS NULL OR o.check_out_date > DATE(DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR)));
-- The upfront amount agreed at approval (advance + deposit), so later changes to property terms do not alter it.
SET @ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='bookings' AND COLUMN_NAME='upfront_amount')=0,
 'ALTER TABLE bookings ADD COLUMN upfront_amount DECIMAL(10,2) NULL','SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
