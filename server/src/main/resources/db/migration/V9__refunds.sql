ALTER TABLE shop_order DROP CONSTRAINT shop_order_status_check;
ALTER TABLE shop_order ADD CONSTRAINT shop_order_status_check CHECK(status IN ('PENDING_PAYMENT','PAID','CANCELLED','SHIPPED','REFUNDED'));
CREATE TABLE refund_request (
 id VARCHAR(36) PRIMARY KEY,
 order_id VARCHAR(36) NOT NULL UNIQUE REFERENCES shop_order(id),
 user_id VARCHAR(36) NOT NULL REFERENCES app_user(id),
 out_refund_no VARCHAR(32) NOT NULL UNIQUE,
 amount_cents INTEGER NOT NULL CHECK(amount_cents>0),
 reason VARCHAR(200) NOT NULL,
 status VARCHAR(20) NOT NULL CHECK(status IN ('REQUESTED','REJECTED','PROCESSING','UNKNOWN','SUCCESS','ABNORMAL','CLOSED')),
 decision_note VARCHAR(200) NOT NULL DEFAULT '',
 last_error VARCHAR(200) NOT NULL DEFAULT '',
 gateway_refund_id VARCHAR(64),
 version BIGINT NOT NULL DEFAULT 0,
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX refund_status_idx ON refund_request(status,created_at,id);
