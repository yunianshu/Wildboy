ALTER TABLE legal_consent DROP CONSTRAINT legal_consent_source_check;
ALTER TABLE legal_consent ADD CONSTRAINT legal_consent_source_check
  CHECK(source IN ('LOGIN','REGISTRATION','ACCEPT','ORDER'));
