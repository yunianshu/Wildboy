-- 商品订单支付网关身份与「曾见网关订单」标记：与活动订单 V23 的纪律一致。
-- payment_merchant_id/payment_app_id  在提交支付意图时记录，缺席确认（ORDER_NOT_EXIST
--   双探针）必须核对它与当前配置一致，防止切换商户号后把别家商户的「查无此单」
--   误判成本单从未建单而释放库存；
-- payment_gateway_seen 预支付成功或查单命中后置位；置位后查无此单永不释放库存。
-- 历史行保持 NULL/FALSE：身份未知的在途订单宁可保留库存交人工核对，不自动放行。
ALTER TABLE shop_order
  ADD COLUMN payment_merchant_id TEXT,
  ADD COLUMN payment_app_id TEXT,
  ADD COLUMN payment_gateway_seen BOOLEAN NOT NULL DEFAULT FALSE;
