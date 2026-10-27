CREATE TABLE product (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  description TEXT NOT NULL,
  image_url VARCHAR(2048) NOT NULL,
  price_cents INTEGER NOT NULL CHECK(price_cents BETWEEN 1 AND 100000000),
  stock INTEGER NOT NULL CHECK(stock BETWEEN 0 AND 1000000),
  status VARCHAR(12) NOT NULL CHECK(status IN ('ON_SALE','OFF_SHELF')),
  version BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX product_sale_idx ON product(status,created_at,id);
CREATE TABLE shop_order (
  id VARCHAR(36) PRIMARY KEY,
  order_no CHAR(32) NOT NULL UNIQUE,
  user_id VARCHAR(36) NOT NULL REFERENCES app_user(id),
  total_cents INTEGER NOT NULL CHECK(total_cents > 0),
  status VARCHAR(20) NOT NULL CHECK(status IN ('PENDING_PAYMENT','PAID','CANCELLED','SHIPPED')),
  recipient_name VARCHAR(80) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  address VARCHAR(300) NOT NULL,
  payment_transaction_id VARCHAR(64),
  payment_initiated BOOLEAN NOT NULL DEFAULT FALSE,
  paid_at TIMESTAMPTZ,
  version BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX shop_order_user_idx ON shop_order(user_id,created_at DESC,id);
CREATE INDEX shop_order_status_idx ON shop_order(status,created_at DESC,id);
CREATE TABLE shop_order_item (
  id VARCHAR(36) PRIMARY KEY,
  order_id VARCHAR(36) NOT NULL REFERENCES shop_order(id) ON DELETE CASCADE,
  product_id VARCHAR(36) NOT NULL REFERENCES product(id),
  product_name VARCHAR(120) NOT NULL,
  image_url VARCHAR(2048) NOT NULL,
  price_cents INTEGER NOT NULL CHECK(price_cents > 0),
  quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 99),
  UNIQUE(order_id,product_id)
);
