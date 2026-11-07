CREATE TABLE product_category (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(40) NOT NULL CHECK (char_length(name) BETWEEN 1 AND 40 AND name=btrim(name)),
  sort_order INTEGER NOT NULL CHECK (sort_order BETWEEN 0 AND 9999),
  version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0)
);
CREATE UNIQUE INDEX product_category_name_unique ON product_category(lower(name));
INSERT INTO product_category(id,name,sort_order) VALUES('uncategorized','未分类',9999);

ALTER TABLE product
  ADD COLUMN category_id VARCHAR(36) NOT NULL DEFAULT 'uncategorized' REFERENCES product_category(id),
  ADD COLUMN original_price_cents INTEGER;
UPDATE product SET original_price_cents=price_cents;
ALTER TABLE product
  ALTER COLUMN original_price_cents SET NOT NULL,
  ADD CONSTRAINT product_original_price_valid CHECK (
    original_price_cents BETWEEN price_cents AND 100000000
  );
CREATE INDEX product_category_sale_idx ON product(category_id,status,created_at,id);
