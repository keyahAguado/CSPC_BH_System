-- Existing bookings keep their current occupancy behavior; new bookings require explicit arrival confirmation.
SET @arrival_ddl = IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bookings' AND COLUMN_NAME = 'move_in_required'), 'SELECT 1', 'ALTER TABLE bookings ADD COLUMN move_in_required TINYINT(1) NOT NULL DEFAULT 0');
PREPARE arrival_stmt FROM @arrival_ddl;
EXECUTE arrival_stmt;
DEALLOCATE PREPARE arrival_stmt;
SET @arrival_ddl = IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bookings' AND COLUMN_NAME = 'move_in_confirmed_at'), 'SELECT 1', 'ALTER TABLE bookings ADD COLUMN move_in_confirmed_at DATETIME NULL');
PREPARE arrival_stmt FROM @arrival_ddl;
EXECUTE arrival_stmt;
DEALLOCATE PREPARE arrival_stmt;
SET @arrival_ddl = IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bookings' AND COLUMN_NAME = 'payment_review_required'), 'SELECT 1', 'ALTER TABLE bookings ADD COLUMN payment_review_required TINYINT(1) NOT NULL DEFAULT 0');
PREPARE arrival_stmt FROM @arrival_ddl;
EXECUTE arrival_stmt;
DEALLOCATE PREPARE arrival_stmt;
