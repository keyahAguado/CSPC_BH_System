-- Accountless boarding house application tracking (Track My Application).
-- All changes are additive and nullable, so existing records and screens keep working:
--   users.applicant_key_hash         bcrypt hash of the applicant's tracking access key
--   boarding_houses.application_status  SUBMITTED / UNDER_REVIEW / REVISION_REQUIRED / RESUBMITTED /
--                                     REJECTED / ACCOUNT_PENDING / ACTIVE (NULL for legacy rows)
--   house_photos.category            gallery photo category (NULL = uncategorised / legacy photo)
--   application_status_history       audit trail of status changes, remarks and snapshots
--   account_activation_tokens        one-time, expiring owner account activation links (hashed)
-- Not needed on a brand-new database: backend/config/init.sql already includes it,
-- and the backend also applies it automatically on startup (config/db.js).
-- Run once on an existing database (the ALTERs fail harmlessly if the column already exists).
--
-- Usage (adjust container/credentials to match your setup):
--   docker exec -i <mysql_container_name> mysql -u root -p<password> cspc_boarding_db < backend/migrations/2026-10-11_add_application_tracking.sql
--
-- Rollback:
--   DROP TABLE account_activation_tokens; DROP TABLE application_status_history;
--   ALTER TABLE house_photos DROP COLUMN category;
--   ALTER TABLE boarding_houses DROP COLUMN application_status;
--   ALTER TABLE users DROP COLUMN applicant_key_hash;

ALTER TABLE `users` ADD COLUMN `applicant_key_hash` varchar(255) DEFAULT NULL;
ALTER TABLE `boarding_houses` ADD COLUMN `application_status` varchar(30) DEFAULT NULL;
ALTER TABLE `house_photos` ADD COLUMN `category` varchar(30) DEFAULT NULL;

CREATE TABLE IF NOT EXISTS `application_status_history` (
  `id` int NOT NULL AUTO_INCREMENT,
  `house_id` int NOT NULL,
  `from_status` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `to_status` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `remarks` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci,
  `actor_type` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `actor_id` int DEFAULT NULL,
  `snapshot` json DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `application_status_history_house` (`house_id`,`created_at`),
  CONSTRAINT `application_status_history_house` FOREIGN KEY (`house_id`) REFERENCES `boarding_houses` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `account_activation_tokens` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `token_hash` char(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `expires_at` datetime NOT NULL,
  `used_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `account_activation_token_hash` (`token_hash`),
  KEY `account_activation_user` (`user_id`),
  CONSTRAINT `account_activation_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
