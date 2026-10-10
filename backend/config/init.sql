-- MySQL dump 10.13  Distrib 8.0.46, for Linux (x86_64)
--
-- Host: localhost    Database: cspc_boarding_db
-- ------------------------------------------------------
-- Server version	8.0.46

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `boarding_houses`
--

DROP TABLE IF EXISTS `boarding_houses`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `boarding_houses` (
  `id` int NOT NULL AUTO_INCREMENT,
  `owner_id` int DEFAULT NULL,
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `img` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `img_1` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `img_2` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `img_3` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `location` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `barangay` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `map_link` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci,
  `price` decimal(10,2) DEFAULT NULL,
  `rooms` int DEFAULT NULL,
  `phone_contact` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci,
  `amenities_free` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `amenities_paid` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `rating` int DEFAULT '5',
  `house_status` enum('pending','accredited','archived','rejected') CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT 'pending',
  `status_before_archive` varchar(20) DEFAULT NULL,
  `permit_business_form` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `permit_cedula` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `permit_dti` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `permit_barangay` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `permit_building` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `permit_zoning` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `permit_sanitary` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `permit_fire` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `expiry_permit_business_form` date DEFAULT NULL,
  `expiry_permit_cedula` date DEFAULT NULL,
  `expiry_permit_dti` date DEFAULT NULL,
  `expiry_permit_barangay` date DEFAULT NULL,
  `expiry_permit_building` date DEFAULT NULL,
  `expiry_permit_zoning` date DEFAULT NULL,
  `expiry_permit_sanitary` date DEFAULT NULL,
  `expiry_permit_fire` date DEFAULT NULL,
  `compliance_status` enum('active','warning','expired') CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT 'active',
  `supplementary_status` enum('active','warning','expired') CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT 'active',
  `admin_comments` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci,
  `document_update_pending` tinyint(1) DEFAULT '0',
  `is_resubmission` tinyint(1) DEFAULT '0',
  `last_updated_document` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `resubmitted_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `latitude` decimal(10,8) DEFAULT NULL,
  `longitude` decimal(11,8) DEFAULT NULL,
  `advance_months` int DEFAULT '0',
  `deposit_months` int DEFAULT '0',
  `deposit_fixed_amount` decimal(10,2) DEFAULT '0.00',
  `deposit_type` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `owner_id` (`owner_id`),
  CONSTRAINT `boarding_houses_ibfk_1` FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `boarding_houses_chk_1` CHECK (json_valid(`amenities_free`)),
  CONSTRAINT `boarding_houses_chk_2` CHECK (json_valid(`amenities_paid`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `boarding_houses`
--

LOCK TABLES `boarding_houses` WRITE;
/*!40000 ALTER TABLE `boarding_houses` DISABLE KEYS */;
/*!40000 ALTER TABLE `boarding_houses` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `bookings`
--

DROP TABLE IF EXISTS `bookings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `bookings` (
  `id` int NOT NULL AUTO_INCREMENT,
  `student_id` int DEFAULT NULL,
  `house_id` int DEFAULT NULL,
  `room_id` int DEFAULT NULL,
  `status` enum('pending','confirmed','cancelled','rejected','completed') CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT 'pending',
  `resident_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `check_in_date` date DEFAULT NULL,
  `months` int DEFAULT '1',
  `age` int DEFAULT NULL,
  `contact_number` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `emergency_contact` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `guardian_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `address` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci,
  `payment_method` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT 'cash',
  `payment_status` enum('unpaid','paid','failed') CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT 'unpaid',
  `paymongo_session_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `paymongo_payment_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `amount` decimal(10,2) DEFAULT '0.00',
  `booking_date` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `extension_months` int DEFAULT '0',
  `is_extension_requested` tinyint(1) DEFAULT '0',
  `monthly_rent` decimal(10,2) DEFAULT '0.00',
  PRIMARY KEY (`id`),
  KEY `student_id` (`student_id`),
  KEY `house_id` (`house_id`),
  KEY `room_id` (`room_id`),
  CONSTRAINT `bookings_ibfk_1` FOREIGN KEY (`student_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `bookings_ibfk_2` FOREIGN KEY (`house_id`) REFERENCES `boarding_houses` (`id`) ON DELETE CASCADE,
  CONSTRAINT `bookings_ibfk_3` FOREIGN KEY (`room_id`) REFERENCES `rooms` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `bookings`
--

LOCK TABLES `bookings` WRITE;
/*!40000 ALTER TABLE `bookings` DISABLE KEYS */;
/*!40000 ALTER TABLE `bookings` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `checklist_criteria`
--

DROP TABLE IF EXISTS `checklist_criteria`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `checklist_criteria` (
  `id` int NOT NULL AUTO_INCREMENT,
  `label` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `is_permit_linked` tinyint(1) DEFAULT '0',
  `permit_key` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `house_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `house_id` (`house_id`),
  CONSTRAINT `checklist_criteria_ibfk_1` FOREIGN KEY (`house_id`) REFERENCES `boarding_houses` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=39 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `checklist_criteria`
--

LOCK TABLES `checklist_criteria` WRITE;
/*!40000 ALTER TABLE `checklist_criteria` DISABLE KEYS */;
INSERT INTO `checklist_criteria` VALUES (30,'Business Permit Application Form',1,'permit_business_form',NULL),(31,'Community Tax Certificate (Cedula)',1,'permit_cedula',NULL),(32,'DTI Registration Certificate',1,'permit_dti',NULL),(33,'Barangay Business Clearance',1,'permit_barangay',NULL),(34,'Certificate of Building Inspection',1,'permit_building',NULL),(35,'Zoning Certificate / Locational Clearance',1,'permit_zoning',NULL),(36,'Sanitary Permit / Health Clearance',1,'permit_sanitary',NULL),(37,'Valid Fire Safety Inspection Certificate',1,'permit_fire',NULL),(38,'Aff',0,NULL,25);
/*!40000 ALTER TABLE `checklist_criteria` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `checklist_results`
--

DROP TABLE IF EXISTS `checklist_results`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `checklist_results` (
  `id` int NOT NULL AUTO_INCREMENT,
  `house_id` int DEFAULT NULL,
  `criteria_id` int DEFAULT NULL,
  `is_verified` tinyint(1) DEFAULT '0',
  `verified_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `house_id` (`house_id`),
  KEY `criteria_id` (`criteria_id`),
  CONSTRAINT `checklist_results_ibfk_1` FOREIGN KEY (`house_id`) REFERENCES `boarding_houses` (`id`) ON DELETE CASCADE,
  CONSTRAINT `checklist_results_ibfk_2` FOREIGN KEY (`criteria_id`) REFERENCES `checklist_criteria` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `checklist_results`
--

LOCK TABLES `checklist_results` WRITE;
/*!40000 ALTER TABLE `checklist_results` DISABLE KEYS */;
/*!40000 ALTER TABLE `checklist_results` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `house_documents`
--

DROP TABLE IF EXISTS `house_documents`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `house_documents` (
  `id` int NOT NULL AUTO_INCREMENT,
  `house_id` int NOT NULL,
  `criteria_id` int NOT NULL,
  `file_path` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `expiry_date` date DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `house_id` (`house_id`),
  KEY `criteria_id` (`criteria_id`),
  CONSTRAINT `house_documents_ibfk_1` FOREIGN KEY (`house_id`) REFERENCES `boarding_houses` (`id`) ON DELETE CASCADE,
  CONSTRAINT `house_documents_ibfk_2` FOREIGN KEY (`criteria_id`) REFERENCES `checklist_criteria` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `house_documents`
--

LOCK TABLES `house_documents` WRITE;
/*!40000 ALTER TABLE `house_documents` DISABLE KEYS */;
/*!40000 ALTER TABLE `house_documents` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `notifications`
--

DROP TABLE IF EXISTS `notifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notifications` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int DEFAULT NULL,
  `message` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `link` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `is_read` tinyint(1) DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `notifications_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `notifications`
--

LOCK TABLES `notifications` WRITE;
/*!40000 ALTER TABLE `notifications` DISABLE KEYS */;
/*!40000 ALTER TABLE `notifications` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `occupants`
--

DROP TABLE IF EXISTS `occupants`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `occupants` (
  `id` int NOT NULL AUTO_INCREMENT,
  `room_id` int NOT NULL,
  `student_id` int DEFAULT NULL,
  `reference_no` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `age` int DEFAULT NULL,
  `address` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci,
  `contact_number` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `emergency_contact` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `guardian_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `check_in_date` date DEFAULT NULL,
  `check_out_date` date DEFAULT NULL,
  `months` int DEFAULT '1',
  `amount` decimal(10,2) DEFAULT NULL,
  `payment_status` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT 'Not Paid',
  `payment_method` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT 'cash',
  `is_non_cspc` tinyint(1) DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `room_id` (`room_id`),
  KEY `student_id` (`student_id`),
  CONSTRAINT `occupants_ibfk_1` FOREIGN KEY (`room_id`) REFERENCES `rooms` (`id`) ON DELETE CASCADE,
  CONSTRAINT `occupants_ibfk_2` FOREIGN KEY (`student_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `occupants`
--

LOCK TABLES `occupants` WRITE;
/*!40000 ALTER TABLE `occupants` DISABLE KEYS */;
/*!40000 ALTER TABLE `occupants` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `reviews`
--

DROP TABLE IF EXISTS `reviews`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `reviews` (
  `id` int NOT NULL AUTO_INCREMENT,
  `house_id` int DEFAULT NULL,
  `student_id` int DEFAULT NULL,
  `rating` int DEFAULT NULL,
  `comment` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `house_id` (`house_id`),
  KEY `student_id` (`student_id`),
  CONSTRAINT `reviews_ibfk_1` FOREIGN KEY (`house_id`) REFERENCES `boarding_houses` (`id`) ON DELETE CASCADE,
  CONSTRAINT `reviews_ibfk_2` FOREIGN KEY (`student_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `reviews`
--

LOCK TABLES `reviews` WRITE;
/*!40000 ALTER TABLE `reviews` DISABLE KEYS */;
/*!40000 ALTER TABLE `reviews` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `rooms`
--

DROP TABLE IF EXISTS `rooms`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `rooms` (
  `id` int NOT NULL AUTO_INCREMENT,
  `house_id` int DEFAULT NULL,
  `room_number` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `gender_type` enum('female','male') CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT 'female',
  `capacity` int DEFAULT NULL,
  `price` decimal(10,2) DEFAULT NULL,
  `status` enum('available','occupied') CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT 'available',
  PRIMARY KEY (`id`),
  KEY `house_id` (`house_id`),
  CONSTRAINT `rooms_ibfk_1` FOREIGN KEY (`house_id`) REFERENCES `boarding_houses` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `rooms`
--

LOCK TABLES `rooms` WRITE;
/*!40000 ALTER TABLE `rooms` DISABLE KEYS */;
/*!40000 ALTER TABLE `rooms` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `email` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `password` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `google_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `role` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `phone` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `address` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci,
  `status` enum('pending','active','inactive') CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT 'active',
  `student_id` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `sex` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `course` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `year_section` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `dob` date DEFAULT NULL,
  `age` int DEFAULT NULL,
  `emergency_contact` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `guardian_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `profile_pic` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=26 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (18,'admin@cspc.edu.ph','$2b$10$n2j1SKagRGi5sqQxMuQ8oOViizimxAPrsrh/utbITrEq/E5ymLIiq',NULL,'admin','SASO Admin',NULL,NULL,'active',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-06-08 15:06:51');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;
--
-- Table structure for table `house_photos`
--

DROP TABLE IF EXISTS `house_photos`;
CREATE TABLE `house_photos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `house_id` int NOT NULL,
  `photo_url` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `sort_order` int DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `house_id` (`house_id`),
  CONSTRAINT `house_photos_ibfk_1` FOREIGN KEY (`house_id`) REFERENCES `boarding_houses` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Table structure for table `courses`
-- Reference list backing the student profile course dropdown and admin
-- course-breakdown reporting. `users.course` stays a plain string (unchanged)
-- storing the matching course_code, so all existing reads of u.course keep
-- working without modification.
--

DROP TABLE IF EXISTS `courses`;
CREATE TABLE `courses` (
  `id` int NOT NULL AUTO_INCREMENT,
  `course_code` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `course_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `department` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `course_code` (`course_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Sourced from CSPC's official "Programs Offered" list (Nabua + Buhi campuses,
-- currently-offered undergraduate programs only — "Soon to Offer" and Graduate
-- School programs excluded since no current boarder could legitimately have them).
-- department = CAS/CCS/CEA/CHS/CTHBM/CTDE, drives the color-coded course report.
INSERT INTO `courses` (`course_code`, `course_name`, `department`) VALUES
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

-- Placeholder for an existing student record whose stored course text ("BHS")
-- doesn't match any known CSPC program. Kept inactive so it never appears in
-- the student dropdown, but still lets that student's record match a course
-- row for reporting, and stays editable via Admin > Manage Courses once
-- confirmed. Department left NULL since it's genuinely unknown.
INSERT INTO `courses` (`course_code`, `course_name`, `is_active`) VALUES
('BHS', 'Unconfirmed Program - Pending Verification', 0);

-- Real referential integrity: the database itself now refuses any users.course
-- value that isn't a real course_code — whether from a bug, a bypassed dropdown,
-- or a direct edit. ON UPDATE CASCADE means renaming a course in Admin > Manage
-- Courses automatically updates every student who has it. ON DELETE RESTRICT
-- backs up the existing application-level check that blocks deleting a course
-- still in use.
ALTER TABLE `users`
  ADD CONSTRAINT `fk_users_course`
  FOREIGN KEY (`course`) REFERENCES `courses` (`course_code`)
  ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Landing page content (Admin > Landing page): Core Features cards and footer details.
--

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
('footer_copyright', '© 2026 CSPC Boarding House Selection & Management System. All rights reserved.');

/*!40101 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-06-20  4:52:42
