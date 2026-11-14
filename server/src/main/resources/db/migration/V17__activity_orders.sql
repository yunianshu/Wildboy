CREATE TABLE activity_order (
 id VARCHAR(36) PRIMARY KEY, order_no VARCHAR(32) NOT NULL UNIQUE,
 activity_id VARCHAR(36) NOT NULL REFERENCES activity(id), activity_title VARCHAR(120) NOT NULL,
 user_id VARCHAR(36) NOT NULL REFERENCES app_user(id), request_key VARCHAR(80) NOT NULL, request_fingerprint CHAR(64) NOT NULL,
 status VARCHAR(20) NOT NULL CHECK(status IN ('PENDING_PAYMENT','PAID','CONFIRMED_FREE','CLOSED','REFUND_PENDING','REFUNDED')),
 party_size INTEGER NOT NULL CHECK(party_size BETWEEN 1 AND 10000),
 original_total_cents INTEGER NOT NULL CHECK(original_total_cents BETWEEN 0 AND 100000000),
 total_cents INTEGER NOT NULL CHECK(total_cents>=0 AND total_cents<=original_total_cents),
 currency CHAR(3) NOT NULL DEFAULT 'CNY' CHECK(currency='CNY'), quote_json TEXT NOT NULL,
 organizer_cancelled BOOLEAN NOT NULL DEFAULT FALSE,
 payment_transaction_id VARCHAR(64) UNIQUE, payment_attempted BOOLEAN NOT NULL DEFAULT FALSE,
 expires_at TIMESTAMPTZ NOT NULL, next_reconcile_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, version BIGINT NOT NULL DEFAULT 0,
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(user_id,request_key)
);
CREATE UNIQUE INDEX activity_order_active_idx ON activity_order(activity_id,user_id) WHERE status IN ('PENDING_PAYMENT','PAID','CONFIRMED_FREE','REFUND_PENDING');
CREATE INDEX activity_order_expiry_idx ON activity_order(status,expires_at);
CREATE TABLE activity_order_participant (
 id VARCHAR(36) PRIMARY KEY, order_id VARCHAR(36) NOT NULL REFERENCES activity_order(id) ON DELETE CASCADE,
 participant_name VARCHAR(80) NOT NULL, id_number TEXT NOT NULL, phone VARCHAR(30) NOT NULL,
 position INTEGER NOT NULL CHECK(position>=0), UNIQUE(order_id,position)
);
CREATE TABLE activity_order_refund (
 id VARCHAR(36) PRIMARY KEY, order_id VARCHAR(36) NOT NULL REFERENCES activity_order(id) ON DELETE CASCADE,
 is_current BOOLEAN NOT NULL DEFAULT TRUE,
 out_refund_no VARCHAR(32) NOT NULL UNIQUE, amount_cents INTEGER NOT NULL CHECK(amount_cents>0),
 reason VARCHAR(200) NOT NULL,
 status VARCHAR(12) NOT NULL CHECK(status IN ('REQUESTED','PROCESSING','UNKNOWN','SUCCESS','REJECTED','ABNORMAL','CLOSED')),
 gateway_refund_id VARCHAR(64) UNIQUE, decision_note VARCHAR(200) NOT NULL DEFAULT '',
 version BIGINT NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX activity_refund_current_idx ON activity_order_refund(order_id) WHERE is_current=TRUE;
-- Discover the original generated constraint name instead of relying on PostgreSQL naming heuristics.
DO $$ DECLARE c RECORD; BEGIN
 FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='activity'::regclass AND contype='c'
 AND pg_get_constraintdef(oid) LIKE '%price_cents%' LOOP
 EXECUTE format('ALTER TABLE activity DROP CONSTRAINT %I',c.conname);
 END LOOP;
END $$;
ALTER TABLE activity ADD CONSTRAINT activity_nonnegative_price CHECK(price_cents BETWEEN 0 AND 100000000);
