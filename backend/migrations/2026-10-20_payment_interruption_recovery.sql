-- Apply each column once; runtime migration checks existence before adding it.
ALTER TABLE bookings ADD COLUMN payment_interruption_notified_at DATETIME NULL, ADD COLUMN cash_recovery_requested_at DATETIME NULL, ADD COLUMN cash_recovery_session_id VARCHAR(255) NULL;
