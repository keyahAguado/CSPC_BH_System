-- Additive only: historical occupants and booked dates are not rewritten.
SET @db_name = DATABASE();
SET @ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='bookings' AND COLUMN_NAME='occupancy_auto_started')=0,
 'ALTER TABLE bookings ADD COLUMN occupancy_auto_started TINYINT(1) NOT NULL DEFAULT 0','SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='bookings' AND COLUMN_NAME='occupancy_start_issue')=0,
 'ALTER TABLE bookings ADD COLUMN occupancy_start_issue VARCHAR(255) NULL','SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
