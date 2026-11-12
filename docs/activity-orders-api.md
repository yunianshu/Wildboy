# 活动独立订单 API

收费活动使用独立订单，不复用商品库存或商城退款。以下接口统一位于 `/api/v1`。需登录；`/admin/**` 仍要求 ADMIN，领队身份不授予此权限。金额为人民币整数分。

## 明确选择多人优惠范围

活动会员优惠规则默认关闭。启用时管理员必须显式选择 `ACCOUNT_ALL`（同单参与人全部按账号会员价格）或 `ONE_BENEFIT`（每单最多一个优惠名额，不认定下单账号本人参加）。无启用规则或非会员按原价。活动和商品规则独立。客户端不能传入价格明细，服务端在用户→会员等级→活动锁序内重新计算并保存快照。

## 设置草稿价格

`POST /admin/activities/{id}/price`：`{ "priceCents": 10000, "version": 0 }`。

只允许无报名、无候补的草稿，价格范围 0–100000000 分。返回最新 Activity。现有活动创建/编辑 DTO 仍要求 `priceCents: 0`，该字段不会覆盖已有收费价格，独立价格接口维护版本。前端需使用新订单入口和报价确认，不能调用旧免费报名入口。

## 订单

- `POST /activities/{id}/orders`：`{ "requestKey": "稳定的8至80字符请求标识", "registration": { "participants": [...], "privacyVersion": 1, "termsVersion": 1 }, "expectedTotalCents": 10000 }`。金额与最新报价不一致返回409 `ACTIVITY_PRICE_CHANGED`。
- `GET /activities/{id}/quote?participants=2`：返回 `{participants,originalTotalCents,totalCents,currency,participantPricing,quote:{lines,policyVersion}}`；活动模式为空表示原价。
- `GET /activity-orders/by-request/{key}`：找回本人幂等订单。
- `GET /activity-orders/{id}`：本人订单。
- `GET /activity-orders/{id}/participants`：本人参与者快照，身份证掩码。
- `GET /admin/activity-orders/{id}/participants`：管理员参与者快照，身份证掩码。
- `GET /me/activity-orders?page=0&size=20&activityId=...`：本人订单列表，activityId 可选且不会扩大本人访问范围。
- `GET /admin/activity-orders?page=0&size=20&activityId=...`：运营订单列表，activityId 可选，可从活动名册跳转查看收费参与人。
- `POST /activity-orders/{id}/pay`：为正价未付订单返回微信支付参数。付款意图先独立提交，再调用微信；超时不清除意图。真实微信账号和支付配置必需。
- `POST /activity-orders/{id}/verify`：主动查询付款状态。客户端不能提交“支付成功”。
- `POST /activity-orders/{id}/cancel`：关闭未付订单。可能已发送微信时先查单、关单；不确定即保留名额。若查到已付，返回 PAID，不释放。
- `POST /admin/activity-orders/close-expired`：每批最多 50 笔到期订单，返回 `closed` 和 `pendingReview`。后台默认每60秒自动扫描，失败订单5分钟后重试，按下次处理时间排序避免坏单饿死后续订单；失败名额继续保留。
- `POST /admin/activity-orders/{id}/verify` 和 `/cancel`：运营查付款、关单。

订单返回不可变活动标题、人数、原总额、实付总额、币种、Quote 明细、价格策略版本、支付截止、状态及版本。订单参与者另存快照，取消重报不会覆盖旧记录。相同用户与 requestKey 返回原订单；规范化参与人及协议版本的 SHA-256 指纹必须一致，不同内容返回409 `IDEMPOTENCY_CONFLICT`。重复旧请求保留原价，不能跨活动重复使用同一标识。

名额在 PENDING_PAYMENT、PAID、CONFIRMED_FREE、REFUND_PENDING 期间保留；只有确认关单或退款成功才能释放。零元会员报价直接 CONFIRMED_FREE、不调用微信，通过 cancel 归还名额并改 CLOSED，不创建假付款或退款。订单 PAID / CONFIRMED_FREE 表示报名确认，独立订单不会写入旧免费 registration 表。

## 退款

- `POST /admin/activity-orders/{id}/refund`：`{ "reason": "组织者取消原因" }`。管理员可为未来活动的已付款订单发起全额退款申请，无需参与者先申请；仅生成 REQUESTED，仍需既有审核批准及真实微信成功确认才释放名额。使用订单历史实付金额，审计记录操作者为管理员；重复请求返回当前申请。
- `POST /activity-orders/{id}/refund`：`{ "reason": "取消原因" }`。活动开始前申请全额退款，不支持部分成员退款。
- `GET /activity-orders/{id}/refund`：本人退款状态，尚无申请时返回空对象。
- `GET /admin/activity-orders/{id}/refund`：运营读取退款申请。
- `POST /admin/activity-orders/{id}/refund/approve`：`{ "version": 0 }`。
- `POST /admin/activity-orders/{id}/refund/reject`：`{ "version": 0, "note": "拒绝原因" }`。
- `POST /admin/activity-orders/{id}/refund/verify`：查询 PROCESSING、UNKNOWN、ABNORMAL 的微信结果。
- `POST /admin/activity-orders/{id}/refund/retry`：`{ "version": 1 }`，PROCESSING/UNKNOWN 使用同一退款号幂等重试。

退款对象目前为数据库字段名（如 `out_refund_no`、`amount_cents`、`version`）。处理中的重复申请返回原申请；拒绝或微信确认CLOSED后订单恢复PAID，用户可重新申请，新退款号并保留旧记录。ABNORMAL仅查单核对，需人工联系微信处理，不自动重复退款。微信成功通知才将订单改为 REFUNDED 并释放名额，绝不增加商品库存。

## 微信回调

- `/payments/wechat/activity-notify`
- `/payments/wechat/activity-refund-notify`

回调 URL 使用已配置付款通知 URL 的同目录及上述末尾名称。无需登录但必须通过真实微信验签，验证商户/应用/金额/订单/交易一致性，重复通知幂等。

## 保留边界

收费活动不开放候补；旧报名接口明确要求改用订单。整场取消若存在未结清订单会被拒绝，需先关单/退款后重试，不能一键清空名额。尚不支持部分退款；ABNORMAL结果需先核对微信处理状态，不自动换号重开。生产微信商户配置、回调公网可达和真实支付验收仍需部署环境验证。

## 活动通知兼容

行前和活动变更提醒收件人包含旧免费报名 CONFIRMED，以及收费订单 PAID、CONFIRMED_FREE、REFUND_PENDING，同一账号去重。未付款、关闭、退款完成的订单不作为有效报名。消息实际发送前再次检查报名状态，已取消/退款的旧消息会过时；真实微信订阅权限和网关配置要求保持不变。

管理员关单与退款重试审计记录实际管理员。管理员发起关单/退款会在订单保留组织方取消标记；整场活动取消时，即使这些订单已关闭/退款完成，仍向其账号发送取消通知。自愿已取消订单不会被管理员重复关单重新归类，也不因此接收整场取消通知。
