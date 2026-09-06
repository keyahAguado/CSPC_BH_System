-- Adds the `courses` table (student dropdown + admin reporting) to an EXISTING
-- database that predates this feature. Not needed on a brand-new database —
-- backend/config/init.sql already includes this for a fresh `docker compose up`.
--
-- Safe to run more than once: CREATE TABLE IF NOT EXISTS + INSERT IGNORE mean
-- re-running this does nothing destructive and won't duplicate rows.
--
-- Usage (adjust container/credentials to match your setup):
--   docker exec -i <mysql_container_name> mysql -u root -p<password> cspc_boarding_db < backend/migrations/2026-09-06_add_courses.sql

CREATE TABLE IF NOT EXISTS `courses` (
  `id` int NOT NULL AUTO_INCREMENT,
  `course_code` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `course_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `department` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `course_code` (`course_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Sourced from CSPC's official "Programs Offered" list (Nabua + Buhi campuses).
INSERT IGNORE INTO `courses` (`course_code`, `course_name`, `department`) VALUES
('BSN', 'BS Nursing', 'CHS'),
('BSM', 'BS Midwifery', 'CHS'),
('BSIT', 'BS Information Technology', 'CCS'),
('BSIS', 'BS Information Systems', 'CCS'),
('BSCS', 'BS Computer Science', 'CCS'),
('BLIS', 'Bachelor of Library and Information Science', 'CCS'),
('BSECE', 'BS Electronics Engineering', 'CEA'),
('BSCE', 'BS Civil Engineering', 'CEA'),
('BSEE', 'BS Electrical Engineering', 'CEA'),
('BSME', 'BS Mechanical Engineering', 'CEA'),
('BSARCH', 'BS Architecture', 'CEA'),
('BSCPE', 'BS Computer Engineering', 'CEA'),
('BSHM', 'BS Hospitality Management', 'CTHBM'),
('BSOA', 'BS Office Administration', 'CTHBM'),
('BSEntrep', 'BS Entrepreneurship', 'CTHBM'),
('BSTM', 'BS Tourism Management', 'CTHBM'),
('BSBA-FM', 'BS Business Administration, Major in Financial Management', 'CTHBM'),
('BSMATH', 'BS Mathematics', 'CAS'),
('BSAM', 'BS Applied Mathematics', 'CAS'),
('BSDevCom', 'BS Development Communication', 'CAS'),
('ABELS', 'AB in English Language', 'CAS'),
('BPublicAd', 'Bachelor of Public Administration', 'CAS'),
('BHumServ', 'Bachelor in Human Services', 'CHS'),
('BSNEd', 'Bachelor of Special Needs Education', 'CTDE'),
('BPEd', 'Bachelor of Physical Education', 'CTDE'),
('BCAEd', 'Bachelor of Culture and Arts Education', 'CTDE'),
('BTVTEd', 'Bachelor in Technical Vocational Teacher Education', 'CTDE'),
('BECEd', 'Bachelor of Early Childhood Education', 'CTDE');

-- Placeholder for a student record whose stored course text ("BHS") doesn't
-- match any known CSPC program. Inactive so it never appears in the student
-- dropdown; edit/rename via Admin > Manage Courses once confirmed.
INSERT IGNORE INTO `courses` (`course_code`, `course_name`, `is_active`) VALUES
('BHS', 'Unconfirmed Program - Pending Verification', 0);

-- Consolidates known messy free-text variants from before the dropdown existed.
-- Harmless no-op wherever these exact variants don't already exist in `users.course`.
UPDATE users SET course = 'BSARCH' WHERE TRIM(course) IN ('BS ARCHITECTURE', 'BSARCH', 'BSARCHITECTURE');
UPDATE users SET course = 'BSMATH' WHERE TRIM(course) IN ('BS Math', 'BSMATH', 'BSMATHEMATICS');
