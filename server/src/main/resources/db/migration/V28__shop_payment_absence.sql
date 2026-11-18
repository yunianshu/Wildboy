-- 商品订单支付缺席确认，与活动订单 V23 的双探针纪律一致。
-- closeOrder 失败且查单 ORDER_NOT_EXIST 时记录首次探测时间；
-- 订单过期 60 秒后再次独立探测（间隔至少 60 秒）仍查无此单，才认定微信从未建单，
-- 届时才允许取消并回补库存，防止「预支付请求仍在途」的竞态误放库存。
-- 不回填历史数据：旧行保持 NULL，首次探测时按需写入。
ALTER TABLE shop_order ADD COLUMN payment_not_found_at TIMESTAMPTZ;
