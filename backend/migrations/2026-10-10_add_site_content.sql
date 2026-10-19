-- Adds the landing page content tables managed from Admin > Landing page
-- (Core Features cards and footer details) to an EXISTING database.
-- Not needed on a brand-new database: backend/config/init.sql already includes them,
-- and the backend also creates them automatically on startup (config/db.js).
--
-- Safe to run more than once: CREATE TABLE IF NOT EXISTS, the feature seed only runs
-- while the table is empty, and INSERT IGNORE never overwrites edited settings.
--
-- Usage (adjust container/credentials to match your setup):
--   docker exec -i <mysql_container_name> mysql -u root -p<password> cspc_boarding_db < backend/migrations/2026-10-10_add_site_content.sql

CREATE TABLE IF NOT EXISTS `site_features` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(120) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `description` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `icon` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'shield-halved',
  `sort_order` int NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- The four cards previously hardcoded on the landing page.
INSERT INTO `site_features` (`title`, `description`, `icon`, `sort_order`)
SELECT * FROM (
  SELECT 'SASO-Accredited Listings Only' AS title, 'All boarding houses are verified and approved by the Student Affairs and Services Office (SASO) to ensure safety, compliance, and quality standards.' AS description, 'shield-halved' AS icon, 1 AS sort_order
  UNION ALL SELECT 'Advanced Search & Filters', 'Enables quick and efficient searching of boarding houses near CSPC campus to match students'' and parents'' specific needs.', 'magnifying-glass', 2
  UNION ALL SELECT 'Real Photos & Details', 'Actual photos of rooms and facilities plus full details: monthly rates, house rules, exact location, and owner contact information.', 'camera', 3
  UNION ALL SELECT 'User Friendly & Responsive', 'Accessible on desktop and mobile devices, with an intuitive interface designed for students and parents to use easily anytime, anywhere.', 'mobile-screen', 4
) AS defaults
WHERE NOT EXISTS (SELECT 1 FROM `site_features`);

CREATE TABLE IF NOT EXISTS `site_settings` (
  `setting_key` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `setting_value` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT IGNORE INTO `site_settings` (`setting_key`, `setting_value`) VALUES
('features_eyebrow', 'The Platform'),
('features_heading', 'Core Features'),
('footer_title', 'CSPC Boarding House Selection System'),
('footer_tagline', 'Official Student Affairs and Services Office (SASO) Accommodation Portal'),
('footer_office', ''),
('footer_address', ''),
('footer_email', ''),
('footer_phone', ''),
('footer_hours', ''),
('footer_facebook', ''),
('footer_website', ''),
('footer_custom', '[]'),
('footer_copyright', '© 2026 CSPC Boarding House Selection & Management System. All rights reserved.');
