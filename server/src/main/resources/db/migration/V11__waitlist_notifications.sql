CREATE TABLE activity_waitlist (
 id VARCHAR(36) PRIMARY KEY, activity_id VARCHAR(36) NOT NULL REFERENCES activity(id) ON DELETE CASCADE,
 user_id VARCHAR(36) NOT NULL REFERENCES app_user(id) ON DELETE CASCADE, status VARCHAR(12) NOT NULL CHECK(status IN ('WAITING','OFFERED','CONFIRMED','CANCELLED','EXPIRED')),
 party_size INTEGER NOT NULL CHECK(party_size BETWEEN 1 AND 100), participants_json TEXT NOT NULL,
 privacy_version BIGINT NOT NULL, terms_version BIGINT NOT NULL, offer_expires_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX waitlist_active_user ON activity_waitlist(activity_id,user_id) WHERE status IN ('WAITING','OFFERED');
CREATE INDEX waitlist_queue ON activity_waitlist(activity_id,status,created_at,id);
CREATE TABLE notification_permission (user_id VARCHAR(36) PRIMARY KEY REFERENCES app_user(id) ON DELETE CASCADE, credits INTEGER NOT NULL DEFAULT 0 CHECK(credits BETWEEN 0 AND 3));
CREATE TABLE notification_outbox (
 id VARCHAR(36) PRIMARY KEY, user_id VARCHAR(36) NOT NULL REFERENCES app_user(id) ON DELETE CASCADE, activity_id VARCHAR(36) NOT NULL REFERENCES activity(id) ON DELETE CASCADE,
 kind VARCHAR(30) NOT NULL, dedupe_key VARCHAR(180) NOT NULL UNIQUE,
 title VARCHAR(120) NOT NULL, detail VARCHAR(200) NOT NULL, event_at TIMESTAMPTZ NOT NULL,
 status VARCHAR(20) NOT NULL CHECK(status IN ('PENDING','SENDING','SENT','FAILED','NO_PERMISSION','UNCONFIGURED','UNKNOWN','OBSOLETE')),
 attempts INTEGER NOT NULL DEFAULT 0, last_error VARCHAR(200) NOT NULL DEFAULT '',
 next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX notification_due ON notification_outbox(status,next_attempt_at);
CREATE INDEX notification_user ON notification_outbox(user_id,created_at);
