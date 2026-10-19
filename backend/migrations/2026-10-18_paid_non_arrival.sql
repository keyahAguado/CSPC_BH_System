-- Additive. Paid stays whose student never arrives (docs/paid-non-arrival.md):
--  * occupants.non_arrival_recorded_at / non_arrival_note: the owner's attendance record. Reversible by confirming arrival.
--  * bookings.status 'not_arrived': terminal outcome, set only on or after the booked checkout date.
-- Appending an ENUM value at the end is a metadata-only change in MySQL 8.0; existing rows are untouched.
SET @db_name = DATABASE();
SET @ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='occupants' AND COLUMN_NAME='non_arrival_recorded_at')=0,
 'ALTER TABLE occupants ADD COLUMN non_arrival_recorded_at DATETIME NULL, ADD COLUMN non_arrival_note VARCHAR(500) NULL','SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @ddl = IF((SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='bookings' AND COLUMN_NAME='status') NOT LIKE '%not\_arrived%',
 "ALTER TABLE bookings MODIFY COLUMN status ENUM('pending','confirmed','cancelled','rejected','completed','not_arrived') CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT 'pending'",'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
