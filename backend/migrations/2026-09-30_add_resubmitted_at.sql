-- Track document resubmission time without changing existing records.
-- Safe to rerun on MySQL 8.0; existing timestamps are preserved.
SET @resubmitted_at_migration_sql = (
    SELECT IF(COUNT(*) = 0,
        'ALTER TABLE boarding_houses ADD COLUMN resubmitted_at DATETIME NULL DEFAULT NULL',
        'SELECT 1')
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'boarding_houses'
      AND COLUMN_NAME = 'resubmitted_at'
);
PREPARE resubmitted_at_migration FROM @resubmitted_at_migration_sql;
EXECUTE resubmitted_at_migration;
DEALLOCATE PREPARE resubmitted_at_migration;
