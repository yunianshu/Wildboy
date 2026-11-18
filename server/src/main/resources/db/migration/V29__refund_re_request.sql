-- 允许被拒绝或微信关闭的退款单重新发起申请：
-- 放开「每订单仅一条退款记录」的全局唯一约束，改为「每订单最多一条进行中的申请」。
-- 终态（REJECTED/CLOSED）不再占用名额，与活动订单退款 is_current 轮替口径一致。
ALTER TABLE refund_request DROP CONSTRAINT refund_request_order_id_key;
CREATE UNIQUE INDEX refund_request_active_order_idx ON refund_request(order_id)
  WHERE status NOT IN ('REJECTED','CLOSED');
