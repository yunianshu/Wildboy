ALTER TABLE app_user
  ADD COLUMN real_name VARCHAR(40) NOT NULL DEFAULT '',
  ADD COLUMN phone VARCHAR(11) NOT NULL DEFAULT '',
  ADD COLUMN profile_completed_at TIMESTAMPTZ,
  ADD COLUMN profile_updated_at TIMESTAMPTZ,
  ADD CONSTRAINT app_user_profile_complete CHECK (
    profile_completed_at IS NULL OR
    (char_length(real_name) BETWEEN 2 AND 40 AND phone ~ '^1[3-9][0-9]{9}$')
  );
CREATE INDEX app_user_created_idx ON app_user(created_at DESC, id);
