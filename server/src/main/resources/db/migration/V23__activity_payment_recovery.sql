ALTER TABLE activity_order
  ADD COLUMN payment_attempted_at TIMESTAMPTZ,
  ADD COLUMN payment_merchant_id TEXT,
  ADD COLUMN payment_app_id TEXT,
  ADD COLUMN payment_not_found_at TIMESTAMPTZ,
  ADD COLUMN payment_gateway_seen BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX activity_order_history_user_idx ON activity_order(user_id,created_at,id);
CREATE INDEX activity_order_pending_activity_idx ON activity_order(activity_id) WHERE status='PENDING_PAYMENT';
