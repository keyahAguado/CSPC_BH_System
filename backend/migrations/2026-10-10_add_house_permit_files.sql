-- Stores every file uploaded for a legal document (multiple images and/or PDF per permit).
-- The first file is still saved in the boarding_houses permit_* column, so compliance checks
-- and older screens keep working; this table holds the complete list shown to SASO.
-- Not needed on a brand-new database: backend/config/init.sql already includes it,
-- and the backend also creates it automatically on startup (config/db.js).
--
-- Usage (adjust container/credentials to match your setup):
--   docker exec -i <mysql_container_name> mysql -u root -p<password> cspc_boarding_db < backend/migrations/2026-10-10_add_house_permit_files.sql

CREATE TABLE IF NOT EXISTS `house_permit_files` (
  `id` int NOT NULL AUTO_INCREMENT,
  `house_id` int NOT NULL,
  `permit_key` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `file_path` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `house_permit` (`house_id`,`permit_key`),
  CONSTRAINT `house_permit_files_house` FOREIGN KEY (`house_id`) REFERENCES `boarding_houses` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
