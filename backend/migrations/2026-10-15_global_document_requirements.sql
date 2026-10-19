-- Existing scoped requirements and uploaded documents are preserved.
ALTER TABLE checklist_criteria ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1;
