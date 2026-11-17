# 微信电商订单（订单中心）接入说明

微信对交易类小程序（运动户外属第二批强制名单）要求接入「发货信息管理」与「订单中心」能力，未按规范接入会被限制支付功能。本文记录 Wildboy 的接入现状、上线前人工步骤与代码能力。

## 现状

| 能力 | 状态 | 位置 |
| --- | --- | --- |
| 微信支付 V3（JSAPI/关单/查单/退款/回调验签） | ✅ 已接入 | `server/.../WechatPayService.java` |
| 发货信息管理（upload_shipping_info / is_trade_managed / 物流编码表） | ✅ 已接入，失败退避重试 + 后台补报 | `WechatShippingService`、`ShippingReportService`、后台 `/shipping-reports` |
| 订单中心：订单数据同步 | ✅ 自动（微信支付交易自动同步，无需逐单上报；旧版 upload API 已下线） | — |
| 订单中心：订单详情跳转路径 | ✅ 本次接入 | `WechatOrderCenterService.updateOrderDetailPath`，后台「基础配置 → 微信电商订单」一键配置 |
| 订单中心：小程序订单详情落地页 | ✅ 本次新增 | `pages/order-detail/index`（支持 `no=${商品订单号}&channel=1` 深链；装备/活动订单统一解析） |
| 确认收货闭环 | ✅ 本次接入 | weappOrderConfirm 组件 + 服务端 get_order 复核（`POST /api/v1/order-center/orders/{id}/confirm-receipt`）+ 发货 72h 后 `notify_confirm_receive` 自动提醒（`OrderConfirmReminderJob`，每单一次） |
| 微信消息推送（trade_manage_* 事件） | ⏸ 暂缓（用户确认，不影响支付与结算） | — |

## 上线前人工步骤（代码之外，必做）

1. **商户号关联**：微信支付商户平台提交商户号与小程序 AppID 的关联申请。
2. **交易结算管理确认**：小程序后台「支付与交易 → 微信支付」完成交易结算管理确认（对关联的所有商户号完成订单管理授权或解绑）。后台状态卡会显示完成度（`is_trade_management_confirmation_completed`）。
3. **签署订单中心授权协议**：小程序后台「支付与交易 → 订单管理」签署；未签署时配置路径会返回 10060034。
4. **配置订单详情路径**：后台「基础配置 → 微信电商订单 → 配置订单路径」，使用默认值
   `pages/order-detail/index?no=${商品订单号}`（必须包含占位符，微信跳转时替换为商户订单号）。
5. **类目与资质**：确认小程序类目覆盖实物电商（运动户外），具备对应资质。
6. **IP 白名单**：服务器出口 IP 需在小程序后台「开发管理 → IP 白名单」中，否则 access_token 获取失败（40164）。

## 运行开关

- `WILDBOY_SHIPPING_ENABLED`（默认 false）：发货上报与订单中心外呼的总开关，与 `wildboy.shipping.enabled` 对应；生产开启，本地/测试关闭（关闭时确认收货跳过微信复核直接落库，便于联调）。
- `.env.example` 已列出该变量；`docker-compose.yml` 与 `deploy/compose.production-api.yml` 透传。

## 行为要点

- 订单数据展示在微信「我 → 服务 → 购物消费 → 小程序购物订单」，由支付交易自动同步（JSAPI 下单的 `description` 作为商品描述、`out_trade_no` 用于跳转）。
- 结算：实物订单用户确认收货后结算，未确认则发货后 T+10 自动确认；虚拟商品（活动报名）T+2。
- 确认收货组件回调不可信：服务端必须以 `get_order` 的 `order_state ≥ 3` 复核后才写 `shop_order.receipt_confirmed_at`。
- 退款不需要也不允许更新发货管理状态（`order_state=5` 由微信依据退款结果自动维护；对已退款单上传发货会报 10060004）。
- 48 小时发货规范由既有流程满足：后台发货录入即触发 `upload_shipping_info`；活动订单支付成功即虚拟发货。

## 相关端点

- 用户：`GET /api/v1/order-center/resolve?no=`（按订单号解析本人订单）；`POST /api/v1/order-center/orders/{id}/confirm-receipt`
- 管理：`GET /api/v1/admin/wechat-order-center/status`；`PUT /api/v1/admin/wechat-order-center/order-detail-path`
- 数据库：V26 迁移为 `shop_order` 增加 `shipped_at`、`receipt_confirmed_at`、`confirm_reminded_at`。
