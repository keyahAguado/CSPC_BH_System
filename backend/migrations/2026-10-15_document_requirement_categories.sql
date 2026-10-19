-- Existing custom criteria retain their previous supplementary behavior. Standard permits keep their established categories.
ALTER TABLE checklist_criteria ADD COLUMN requirement_type ENUM('required','supplementary') NOT NULL DEFAULT 'supplementary';
