-- Single-file records remain readable through file_path.
ALTER TABLE house_documents ADD COLUMN file_paths JSON NULL;
