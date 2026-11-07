CREATE TABLE admin_account_configuration (
  id SMALLINT PRIMARY KEY CHECK (id = 1),
  username VARCHAR(64),
  password_hash VARCHAR(100),
  admin_user_id VARCHAR(36) REFERENCES app_user(id),
  version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0),
  configured_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    (username IS NULL AND password_hash IS NULL AND admin_user_id IS NULL AND configured_at IS NULL)
    OR
    (username IS NOT NULL AND password_hash IS NOT NULL AND admin_user_id IS NOT NULL AND configured_at IS NOT NULL)
  )
);

-- The permanent singleton also serializes first-time setup and concurrent login/rotation.
INSERT INTO admin_account_configuration(id) VALUES (1);
