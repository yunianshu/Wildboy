ALTER TABLE app_user ADD COLUMN avatar_url varchar(200);
ALTER TABLE app_user ADD COLUMN display_profile_updated_at timestamptz;
-- Existing explicitly named accounts must not be prompted as newly created profiles.
UPDATE app_user SET display_profile_updated_at = CURRENT_TIMESTAMP
WHERE nickname IS NOT NULL AND btrim(nickname) <> '' AND nickname <> '微信用户';