-- Additive. Booking/occupant links use occupants.reference_no (REF-0064). Without an index, every
-- "does this booking already have an occupant" check scans the table, and a locking read
-- (SELECT ... WHERE reference_no = ? FOR UPDATE) locks every occupant row it scans.
SET @db_name = DATABASE();
SET @ddl = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='occupants' AND INDEX_NAME='occupants_reference_no')=0,
 'ALTER TABLE occupants ADD KEY occupants_reference_no (reference_no)','SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
