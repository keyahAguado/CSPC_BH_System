-- Additive only. Lets the tab that requested a verification link continue on its own
-- once the link is opened on any device (e.g. requested on a laptop, opened on a phone).
ALTER TABLE applicant_email_verifications
    ADD COLUMN poll_hash CHAR(64) NULL DEFAULT NULL AFTER token_hash,
    ADD COLUMN verified_at DATETIME NULL DEFAULT NULL AFTER used_at,
    ADD COLUMN claimed_at DATETIME NULL DEFAULT NULL AFTER verified_at,
    ADD UNIQUE KEY applicant_verification_poll (poll_hash);
