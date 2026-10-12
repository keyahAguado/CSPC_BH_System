-- Phase 1. Apply manually to an isolated test DB first; no business records are replaced.
-- Check users.email_verified_at before running the ALTER (run it only if missing).
ALTER TABLE users ADD COLUMN email_verified_at DATETIME NULL DEFAULT NULL;

CREATE TABLE IF NOT EXISTS applicant_email_verifications (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    token_hash CHAR(64) NOT NULL,
    expires_at DATETIME NOT NULL,
    used_at DATETIME NULL DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY applicant_verification_hash (token_hash),
    KEY applicant_verification_email (email, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
