ALTER TABLE app_user
  ADD COLUMN role_version BIGINT NOT NULL DEFAULT 0 CHECK (role_version >= 0),
  ADD COLUMN wechat_verified_at TIMESTAMPTZ,
  ADD CONSTRAINT app_user_wechat_provenance CHECK (
    wechat_verified_at IS NULL OR external_id LIKE 'wechat:%'
  );

-- Deliberately do not infer verification from historical IDs or QA-created prefixes.
-- Existing WeChat accounts become eligible after their next successful provider login.
