-- H2: Record the server-verified house status before archival.
-- NULL on existing rows is intentional: unknown history must not grant owner accreditation.
-- Safe to rerun; supports MySQL without ADD COLUMN IF NOT EXISTS.
SET @h2_archive_migration_sql = (
    SELECT IF(COUNT(*) = 0,
        'ALTER TABLE boarding_houses ADD COLUMN status_before_archive VARCHAR(20) NULL DEFAULT NULL',
        'SELECT 1')
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'boarding_houses'
      AND COLUMN_NAME = 'status_before_archive'
);
PREPARE h2_archive_migration FROM @h2_archive_migration_sql;
EXECUTE h2_archive_migration;
DEALLOCATE PREPARE h2_archive_migration;
m