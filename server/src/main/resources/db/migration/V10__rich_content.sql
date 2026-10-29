CREATE TABLE rich_content (
  entity_type VARCHAR(10) NOT NULL CHECK (entity_type IN ('activity','product')),
  entity_id VARCHAR(36) NOT NULL,
  blocks TEXT NOT NULL DEFAULT '[]',
  version BIGINT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(entity_type,entity_id)
);
