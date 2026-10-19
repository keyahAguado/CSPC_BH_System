-- Additive; never assign an old platform checkout to a newly connected owner.
CREATE TABLE IF NOT EXISTS owner_payment_connections (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  owner_id INT NOT NULL, mode VARCHAR(4) NOT NULL,
  email VARCHAR(254) NOT NULL, invitation_id VARCHAR(100) NOT NULL,
  account_id VARCHAR(100) NULL, status VARCHAR(32) NOT NULL DEFAULT 'pending',
  webhook_id VARCHAR(100) NULL, webhook_secret TEXT NULL, checked_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY owner_payment_mode (owner_id, mode), UNIQUE KEY merchant_payment_mode (account_id, mode)
);
SET @db_name = DATABASE();
SET @ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='bookings' AND COLUMN_NAME='paymongo_account_id')=0,
 'ALTER TABLE bookings ADD COLUMN paymongo_account_id VARCHAR(100) NULL','SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='bookings' AND COLUMN_NAME='paymongo_mode')=0,
 'ALTER TABLE bookings ADD COLUMN paymongo_mode VARCHAR(4) NULL','SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
