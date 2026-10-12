-- Additive only. Run manually on the intended database before enabling email.
-- Existing users, properties, notifications and financial records are unchanged.
CREATE TABLE IF NOT EXISTS notification_email_settings (
    id TINYINT UNSIGNED PRIMARY KEY,
    start_after_id BIGINT UNSIGNED NOT NULL
);
-- Keep the original cutoff on reruns. Old notifications are intentionally excluded.
INSERT IGNORE INTO notification_email_settings (id, start_after_id)
SELECT 1, COALESCE(MAX(id), 0) FROM notifications;

CREATE TABLE IF NOT EXISTS notification_email_deliveries (
    notification_id BIGINT UNSIGNED PRIMARY KEY,
    status VARCHAR(16) NOT NULL DEFAULT 'pending',
    attempts INT UNSIGNED NOT NULL DEFAULT 0,
    next_attempt_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    accepted_at DATETIME NULL,
    provider_message_id VARCHAR(255) NULL,
    INDEX notification_email_pending (status, next_attempt_at)
);
