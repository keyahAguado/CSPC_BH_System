-- Adds `supplementary_status` to an EXISTING database that predates the
-- critical-vs-supplementary document tiering. Not needed on a brand-new
-- database — backend/config/init.sql already includes this column.
--
-- Why: auto-archiving previously fired on ANY of the 8 accreditation
-- documents expiring, including ones the stakeholder confirmed are not
-- actually required for legal operation (Cedula, DTI Registration,
-- Certificate of Building Inspection, Zoning Certificate). Only the 4
-- critical documents (Business Permit, Barangay Business Clearance,
-- Sanitary Permit, Fire Safety Inspection Certificate) should be able to
-- archive a listing. Expiry of a supplementary document now just flags
-- `supplementary_status` and notifies the owner — it never archives the
-- listing or hides it from students.
--
-- Safe to run more than once: ADD COLUMN IF NOT EXISTS is a no-op if the
-- column already exists.

ALTER TABLE `boarding_houses`
  ADD COLUMN IF NOT EXISTS `supplementary_status`
  enum('active','warning','expired') CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci
  DEFAULT 'active'
  AFTER `compliance_status`;
