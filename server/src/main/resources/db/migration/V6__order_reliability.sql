ALTER TABLE shop_order ADD COLUMN request_id VARCHAR(80);
ALTER TABLE shop_order ADD COLUMN request_fingerprint CHAR(64);
ALTER TABLE shop_order ADD COLUMN expires_at TIMESTAMPTZ;
UPDATE shop_order SET expires_at=created_at + INTERVAL '30 minutes';
ALTER TABLE shop_order ALTER COLUMN expires_at SET NOT NULL;
ALTER TABLE shop_order ALTER COLUMN expires_at SET DEFAULT (CURRENT_TIMESTAMP + INTERVAL '30 minutes');
CREATE UNIQUE INDEX shop_order_request_idx ON shop_order(user_id, request_id) WHERE request_id IS NOT NULL;
CREATE INDEX shop_order_expiry_idx ON shop_order(expires_at) WHERE status='PENDING_PAYMENT';

ALTER TABLE shop_order ADD COLUMN expiry_retry_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE shop_order ADD COLUMN reconciliation_required BOOLEAN NOT NULL DEFAULT FALSE;
