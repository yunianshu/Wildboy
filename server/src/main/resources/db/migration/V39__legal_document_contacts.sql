ALTER TABLE legal_document_state ADD COLUMN draft_contact VARCHAR(500) NOT NULL DEFAULT '';
ALTER TABLE legal_document_version ADD COLUMN contact VARCHAR(500) NOT NULL DEFAULT '';
