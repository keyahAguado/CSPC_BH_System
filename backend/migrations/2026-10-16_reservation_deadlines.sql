-- Adds nullable deadlines without assigning expiry to historical bookings.
SET @reservation_ddl = IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bookings' AND COLUMN_NAME = 'owner_response_due_at'), 'SELECT 1', 'ALTER TABLE bookings ADD COLUMN owner_response_due_at DATETIME NULL');
PREPARE reservation_stmt FROM @reservation_ddl;
EXECUTE reservation_stmt;
DEALLOCATE PREPARE reservation_stmt;
SET @reservation_ddl = IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bookings' AND COLUMN_NAME = 'payment_due_at'), 'SELECT 1', 'ALTER TABLE bookings ADD COLUMN payment_due_at DATETIME NULL');
PREPARE reservation_stmt FROM @reservation_ddl;
EXECUTE reservation_stmt;
DEALLOCATE PREPARE reservation_stmt;
SET @reservation_ddl = IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bookings' AND COLUMN_NAME = 'expired_at'), 'SELECT 1', 'ALTER TABLE bookings ADD COLUMN expired_at DATETIME NULL');
PREPARE reservation_stmt FROM @reservation_ddl;
EXECUTE reservation_stmt;
DEALLOCATE PREPARE reservation_stmt;
SET @reservation_ddl = IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bookings' AND COLUMN_NAME = 'expiry_reason'), 'SELECT 1', 'ALTER TABLE bookings ADD COLUMN expiry_reason VARCHAR(40) NULL');
PREPARE reservation_stmt FROM @reservation_ddl;
EXECUTE reservation_stmt;
DEALLOCATE PREPARE reservation_stmt;
