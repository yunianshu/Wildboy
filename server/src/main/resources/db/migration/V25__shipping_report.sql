-- 微信「发货信息管理」上报状态落库：每笔商城/活动订单的上报可查询、可补报。
CREATE TABLE shipping_report (
 id VARCHAR(36) PRIMARY KEY, source VARCHAR(10) NOT NULL CHECK(source IN ('shop','activity')),
 order_id VARCHAR(36) NOT NULL, order_no VARCHAR(32) NOT NULL,
 logistics_type INTEGER NOT NULL CHECK(logistics_type IN (1,2,3)),
 status VARCHAR(10) NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','REPORTED','FAILED','SKIPPED')),
 attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts>=0),
 last_errcode INTEGER, last_error VARCHAR(200) NOT NULL DEFAULT '',
 next_retry_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, -- NULL 表示自动重试耗尽，仅剩人工补报
 reported_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(source,order_id)
);
-- 到期重试扫描；next_retry_at 置 NULL 表示重试次数耗尽，仅剩人工补报。
CREATE INDEX shipping_report_retry_idx ON shipping_report(next_retry_at) WHERE status IN ('PENDING','FAILED') AND next_retry_at IS NOT NULL;
CREATE INDEX shipping_report_status_idx ON shipping_report(status,updated_at DESC,id);

-- 发货时录入的物流信息持久化，重试上报需要据此重建 payload。
ALTER TABLE shop_order
  ADD COLUMN shipping_company VARCHAR(40) NOT NULL DEFAULT '',
  ADD COLUMN shipping_tracking_no VARCHAR(64) NOT NULL DEFAULT '';
