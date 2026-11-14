-- Business membership is deliberately separate from the USER/ADMIN security role.
CREATE TABLE membership_tier (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(40) NOT NULL CHECK(length(trim(name)) > 0),
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK(sort_order BETWEEN 0 AND 10000),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  version BIGINT NOT NULL DEFAULT 0 CHECK(version >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX membership_tier_name_idx ON membership_tier(lower(name));
CREATE TABLE membership_pricing_rule (
  tier_id VARCHAR(36) NOT NULL REFERENCES membership_tier(id),
  scope VARCHAR(10) NOT NULL CHECK(scope IN ('ACTIVITY','SHOP')),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  pricing_mode VARCHAR(10) NOT NULL CHECK(pricing_mode IN ('DISCOUNT','FIXED','REDUCTION')),
  pricing_value INTEGER NOT NULL CHECK(pricing_value BETWEEN 0 AND 100000000),
  participant_pricing VARCHAR(20),
  PRIMARY KEY(tier_id,scope),
  CHECK(participant_pricing IS NULL OR (scope='ACTIVITY' AND participant_pricing IN ('ACCOUNT_ALL','ONE_BENEFIT'))),
  CHECK(scope<>'ACTIVITY' OR NOT enabled OR participant_pricing IS NOT NULL),
  CHECK(pricing_mode <> 'DISCOUNT' OR pricing_value BETWEEN 1 AND 10000)
);
ALTER TABLE app_user ADD COLUMN customer_type VARCHAR(10) NOT NULL DEFAULT 'GUEST' CHECK(customer_type IN ('GUEST','MEMBER','LEADER'));
ALTER TABLE app_user ADD COLUMN membership_tier_id VARCHAR(36) REFERENCES membership_tier(id);
ALTER TABLE app_user ADD COLUMN membership_version BIGINT NOT NULL DEFAULT 0 CHECK(membership_version >= 0);
ALTER TABLE app_user ADD CONSTRAINT membership_assignment_check CHECK((customer_type='MEMBER' AND membership_tier_id IS NOT NULL) OR (customer_type<>'MEMBER' AND membership_tier_id IS NULL));
CREATE INDEX app_user_membership_idx ON app_user(customer_type,created_at,id) WHERE role='USER';
