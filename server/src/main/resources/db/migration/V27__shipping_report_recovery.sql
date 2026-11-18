-- 租约与完成令牌；不改动成功单，也不清零历史重试次数。
ALTER TABLE shipping_report
  ADD COLUMN attempt_token VARCHAR(36),
  ADD COLUMN lease_until TIMESTAMPTZ,
  ADD CONSTRAINT shipping_report_lease_pair CHECK ((attempt_token IS NULL) = (lease_until IS NULL));

-- 仅恢复旧实现误归类的 SKIPPED，且必须有真实交易、微信身份、已履约且无退款风险。
-- reported_at 非空的歧义记录、次数耗尽记录和未知跳过原因留给人工核对。
-- attempts<8 为 ShippingReportService.MAX_ATTEMPTS 的冻结值：迁移一经发布不再随常量变化。
-- 每分钟最多释放 50 条；开关关闭时新代码不会领取，开启后正常接续。
--
-- 旧库分期升级（membership 相关的 V15/V16/V17/V23 延后补齐）场景下，本迁移首次执行时
-- activity_order 尚不存在；此时只恢复商城单，活动单待 V17 补入后保留原状由人工核对。
-- 表引用在解析期解析，无法用运行时条件短路，故按表是否存在选择完整或仅商城分支。
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = current_schema() AND table_name = 'activity_order') THEN
    EXECUTE $sql$
    WITH recoverable AS (
      SELECT r.id, row_number() OVER (ORDER BY r.created_at,r.id) AS position
      FROM shipping_report r
      WHERE r.status='SKIPPED' AND r.reported_at IS NULL AND r.attempts<8
        AND r.last_error IN ('disabled','not_trade_managed','shipping_payload_unavailable','no_wechat_identity')
        AND (
          (r.source='shop' AND EXISTS (
            SELECT 1 FROM shop_order o JOIN app_user u ON u.id=o.user_id
            WHERE o.id=r.order_id AND o.status='SHIPPED'
              AND NULLIF(BTRIM(o.payment_transaction_id),'') IS NOT NULL
              AND NULLIF(BTRIM(o.shipping_company),'') IS NOT NULL
              AND NULLIF(BTRIM(o.shipping_tracking_no),'') IS NOT NULL
              AND u.external_id LIKE 'wechat:%' AND LENGTH(u.external_id)>7
              AND EXISTS (SELECT 1 FROM shop_order_item i WHERE i.order_id=o.id)
              AND NOT EXISTS (SELECT 1 FROM refund_request f WHERE f.order_id=o.id AND f.status NOT IN ('REJECTED','CLOSED'))
          )) OR
          (r.source='activity' AND EXISTS (
            SELECT 1 FROM activity_order o JOIN app_user u ON u.id=o.user_id
            WHERE o.id=r.order_id AND o.status='PAID' AND NOT o.organizer_cancelled
              AND NULLIF(BTRIM(o.payment_transaction_id),'') IS NOT NULL
              AND u.external_id LIKE 'wechat:%' AND LENGTH(u.external_id)>7
              AND NOT EXISTS (SELECT 1 FROM activity_order_refund f WHERE f.order_id=o.id AND f.status NOT IN ('REJECTED','CLOSED'))
          ))
        )
    )
    UPDATE shipping_report r SET status='PENDING',
      next_retry_at=CURRENT_TIMESTAMP+((c.position-1)/50)*INTERVAL '1 minute',updated_at=CURRENT_TIMESTAMP
    FROM recoverable c WHERE r.id=c.id
    $sql$;
  ELSE
    EXECUTE $sql$
    WITH recoverable AS (
      SELECT r.id, row_number() OVER (ORDER BY r.created_at,r.id) AS position
      FROM shipping_report r
      WHERE r.status='SKIPPED' AND r.reported_at IS NULL AND r.attempts<8
        AND r.last_error IN ('disabled','not_trade_managed','shipping_payload_unavailable','no_wechat_identity')
        AND r.source='shop' AND EXISTS (
          SELECT 1 FROM shop_order o JOIN app_user u ON u.id=o.user_id
          WHERE o.id=r.order_id AND o.status='SHIPPED'
            AND NULLIF(BTRIM(o.payment_transaction_id),'') IS NOT NULL
            AND NULLIF(BTRIM(o.shipping_company),'') IS NOT NULL
            AND NULLIF(BTRIM(o.shipping_tracking_no),'') IS NOT NULL
            AND u.external_id LIKE 'wechat:%' AND LENGTH(u.external_id)>7
            AND EXISTS (SELECT 1 FROM shop_order_item i WHERE i.order_id=o.id)
            AND NOT EXISTS (SELECT 1 FROM refund_request f WHERE f.order_id=o.id AND f.status NOT IN ('REJECTED','CLOSED'))
        )
    )
    UPDATE shipping_report r SET status='PENDING',
      next_retry_at=CURRENT_TIMESTAMP+((c.position-1)/50)*INTERVAL '1 minute',updated_at=CURRENT_TIMESTAMP
    FROM recoverable c WHERE r.id=c.id
    $sql$;
  END IF;
END $$;
