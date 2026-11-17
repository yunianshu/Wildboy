-- 微信「电商订单（订单中心）」接入配套字段：
-- shipped_at          发货时间（确认收货提醒与详情展示用）
-- receipt_confirmed_at 用户确认收货时间（微信 weappOrderConfirm 组件回调后经 get_order 复核写入）
-- confirm_reminded_at  确认收货提醒发送时间（发货 72 小时后 notify_confirm_receive，每单一次）
ALTER TABLE shop_order
  ADD COLUMN shipped_at TIMESTAMPTZ,
  ADD COLUMN receipt_confirmed_at TIMESTAMPTZ,
  ADD COLUMN confirm_reminded_at TIMESTAMPTZ;

-- 存量已发货订单回填发货时间（以最后更新时间近似，保证提醒任务有基准）
UPDATE shop_order SET shipped_at = updated_at WHERE status = 'SHIPPED' AND shipped_at IS NULL;
