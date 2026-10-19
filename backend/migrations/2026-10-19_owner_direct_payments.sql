CREATE TABLE IF NOT EXISTS owner_direct_payment_connections (
            id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
            owner_id INT NOT NULL, mode VARCHAR(4) NOT NULL, current_slot TINYINT NULL DEFAULT 1,
            merchant_label VARCHAR(120) NOT NULL,
            secret_ciphertext TEXT NOT NULL, key_fingerprint CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
            key_last_four CHAR(4) NOT NULL, status VARCHAR(32) NOT NULL DEFAULT 'pending', issue_code VARCHAR(40) NULL,
            webhook_id VARCHAR(100) NULL, webhook_secret TEXT NULL, checked_at DATETIME NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY owner_direct_current (owner_id, mode, current_slot), UNIQUE KEY owner_direct_key (key_fingerprint),
            KEY owner_direct_history (owner_id, mode)
        );

CREATE TABLE IF NOT EXISTS owner_payment_events (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, owner_id INT NOT NULL,
            connection_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, action VARCHAR(50) NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, KEY owner_payment_event_owner (owner_id,id)
        );

-- Apply once; the application auto-migration checks whether the column already exists.
ALTER TABLE bookings ADD COLUMN paymongo_direct_connection_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL;
