CREATE TABLE wechat_message_jump_path (
  app_id varchar(64) PRIMARY KEY,
  path varchar(256) NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
