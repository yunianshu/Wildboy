CREATE TABLE article (
 id VARCHAR(36) PRIMARY KEY,
 title VARCHAR(120) NOT NULL,
 summary VARCHAR(500) NOT NULL DEFAULT '',
 cover_url VARCHAR(2048) NOT NULL DEFAULT '',
 activity_id VARCHAR(36) REFERENCES activity(id),
 blocks TEXT NOT NULL DEFAULT '[]',
 status VARCHAR(12) NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','PUBLISHED')),
 version BIGINT NOT NULL DEFAULT 0,
 published_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX article_feed_idx ON article(status,published_at DESC,id);
-- Singleton pointer gives exactly one canonical introduction without special article types.
CREATE TABLE article_settings (
 id INTEGER PRIMARY KEY CHECK(id=1),
 official_article_id VARCHAR(36) REFERENCES article(id)
);
INSERT INTO article_settings(id) VALUES(1);
