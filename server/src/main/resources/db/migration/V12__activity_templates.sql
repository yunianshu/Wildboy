CREATE TABLE activity_template (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  payload TEXT NOT NULL,
  rich_blocks TEXT NOT NULL DEFAULT '[]',
  version BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE activity_generation (
  template_id VARCHAR(36) NOT NULL REFERENCES activity_template(id) ON DELETE CASCADE,
  start_at TIMESTAMPTZ NOT NULL,
  activity_id VARCHAR(36) NOT NULL REFERENCES activity(id),
  PRIMARY KEY(template_id,start_at)
);
CREATE TABLE activity_copy_request (
  actor_id VARCHAR(36) NOT NULL REFERENCES app_user(id),
  request_id VARCHAR(80) NOT NULL,
  source_id VARCHAR(36) NOT NULL REFERENCES activity(id),
  start_at TIMESTAMPTZ NOT NULL,
  activity_id VARCHAR(36) NOT NULL REFERENCES activity(id),
  PRIMARY KEY(actor_id,request_id)
);
