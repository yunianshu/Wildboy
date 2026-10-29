CREATE TABLE shipping_address (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  recipient_name VARCHAR(40) NOT NULL CHECK(char_length(recipient_name) BETWEEN 2 AND 40),
  phone VARCHAR(11) NOT NULL CHECK(phone ~ '^1[3-9][0-9]{9}$'),
  address VARCHAR(300) NOT NULL CHECK(char_length(address) BETWEEN 5 AND 300),
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX shipping_address_owner_idx ON shipping_address(user_id, created_at, id);
CREATE UNIQUE INDEX shipping_address_default_idx ON shipping_address(user_id) WHERE is_default;
