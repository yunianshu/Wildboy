CREATE TABLE legal_document_state (
 kind VARCHAR(10) PRIMARY KEY CHECK (kind IN ('PRIVACY','TERMS')),
 draft_title VARCHAR(120) NOT NULL DEFAULT '', draft_content TEXT NOT NULL DEFAULT '',
 draft_revision BIGINT NOT NULL DEFAULT 0, published_version BIGINT,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO legal_document_state(kind) VALUES ('PRIVACY'),('TERMS');
CREATE TABLE legal_document_version (
 kind VARCHAR(10) NOT NULL REFERENCES legal_document_state(kind), version BIGINT NOT NULL CHECK(version>0),
 title VARCHAR(120) NOT NULL, content TEXT NOT NULL,
 published_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, published_by VARCHAR(36) NOT NULL,
 PRIMARY KEY(kind,version)
);
CREATE TABLE legal_consent (
 id VARCHAR(36) PRIMARY KEY, user_id VARCHAR(36) NOT NULL REFERENCES app_user(id),
 privacy_version BIGINT NOT NULL, terms_version BIGINT NOT NULL,
 privacy_kind VARCHAR(10) NOT NULL DEFAULT 'PRIVACY' CHECK(privacy_kind='PRIVACY'),
 terms_kind VARCHAR(10) NOT NULL DEFAULT 'TERMS' CHECK(terms_kind='TERMS'),
 accepted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 source VARCHAR(20) NOT NULL CHECK(source IN ('LOGIN','REGISTRATION','ACCEPT')),
 FOREIGN KEY(privacy_kind,privacy_version) REFERENCES legal_document_version(kind,version),
 FOREIGN KEY(terms_kind,terms_version) REFERENCES legal_document_version(kind,version),
 UNIQUE(user_id,privacy_version,terms_version)
);
CREATE INDEX legal_consent_user_idx ON legal_consent(user_id,accepted_at DESC);
CREATE FUNCTION reject_legal_history_change() RETURNS TRIGGER AS $$
BEGIN RAISE EXCEPTION 'Legal history is append-only'; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER legal_version_immutable BEFORE UPDATE OR DELETE ON legal_document_version FOR EACH ROW EXECUTE FUNCTION reject_legal_history_change();
CREATE TRIGGER legal_consent_immutable BEFORE UPDATE OR DELETE ON legal_consent FOR EACH ROW EXECUTE FUNCTION reject_legal_history_change();
