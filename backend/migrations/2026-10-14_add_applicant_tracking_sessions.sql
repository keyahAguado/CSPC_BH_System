-- Additive only. "Remember this device for 7 days" on Track My Application.
-- Stores only a SHA-256 hash of each device token; sessions expire after 7 days and can be revoked.
-- The backend also creates this table automatically on startup (config/db.js), so running this
-- manually is optional; it is safe to run because of IF NOT EXISTS.
CREATE TABLE IF NOT EXISTS applicant_tracking_sessions (
    id INT NOT NULL AUTO_INCREMENT,
    email VARCHAR(255) NOT NULL,
    token_hash CHAR(64) NOT NULL,
    expires_at DATETIME NOT NULL,
    revoked_at DATETIME NULL DEFAULT NULL,
    last_used_at DATETIME NULL DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY applicant_tracking_token_hash (token_hash),
    KEY applicant_tracking_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
