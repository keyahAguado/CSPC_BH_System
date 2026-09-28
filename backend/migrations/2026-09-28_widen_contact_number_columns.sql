-- Widen contact_number / emergency_contact / phone columns from varchar(20) to varchar(50)
-- Fixes "Data too long" 500 error when users enter phone numbers with formatting
-- (spaces, dashes, country codes, etc.)

ALTER TABLE `bookings`
  MODIFY COLUMN `contact_number`   VARCHAR(50) DEFAULT NULL,
  MODIFY COLUMN `emergency_contact` VARCHAR(50) DEFAULT NULL;

ALTER TABLE `occupants`
  MODIFY COLUMN `contact_number`   VARCHAR(50) DEFAULT NULL,
  MODIFY COLUMN `emergency_contact` VARCHAR(50) DEFAULT NULL;

ALTER TABLE `users`
  MODIFY COLUMN `phone`            VARCHAR(50) DEFAULT NULL,
  MODIFY COLUMN `emergency_contact` VARCHAR(50) DEFAULT NULL;
pl