CREATE TABLE media_asset (
  id VARCHAR(36) PRIMARY KEY,
  filename VARCHAR(120) NOT NULL UNIQUE,
  url VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  category VARCHAR(20) NOT NULL DEFAULT 'UNCATEGORIZED'
    CHECK (category IN ('ACTIVITY', 'SHOP', 'ARTICLE', 'HOME', 'UNCATEGORIZED')),
  width INTEGER NOT NULL DEFAULT 0 CHECK (width >= 0),
  height INTEGER NOT NULL DEFAULT 0 CHECK (height >= 0),
  size_bytes BIGINT NOT NULL DEFAULT 0 CHECK (size_bytes >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_media_asset_category_created ON media_asset (category, created_at DESC);
CREATE INDEX idx_media_asset_created ON media_asset (created_at DESC);
