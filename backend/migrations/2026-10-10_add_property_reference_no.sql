-- Adds the property registration reference number used by the property-first
-- owner registration flow (owner registers a property -> SASO approves -> SASO
-- sends the reference number, email and password to the owner).
-- Not needed on a brand-new database: backend/config/init.sql already includes it,
-- and the backend also adds it automatically on startup (config/db.js).
--
-- Usage (adjust container/credentials to match your setup):
--   docker exec -i <mysql_container_name> mysql -u root -p<password> cspc_boarding_db < backend/migrations/2026-10-10_add_property_reference_no.sql

ALTER TABLE `boarding_houses`
  ADD COLUMN `reference_no` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  ADD UNIQUE KEY `reference_no` (`reference_no`);
