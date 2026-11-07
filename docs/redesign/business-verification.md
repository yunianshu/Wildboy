# 业务闭环证据与待验收边界

> **历史状态提示：历史候补证据已失效。候补功能及设计稿于 2026-10-31 按用户要求删除；当前范围与验收以 [docs/waitlist-removal-2026-10-31.md](../waitlist-removal-2026-10-31.md) 为准。下文保留当时的实际证据，不代表当前仍提供候补功能。**

日期：2026-10-31。状态：后端规则、真实网页活动生命周期、商品 HTTP、原生报名/取消/候补/未付款订单恢复，以及最终 24 个原生主路由巡检和 QA 清理均已有完成证据。本文件用于按这些实际范围核销，不代表所有管理写入、真实微信、资金交易或实体设备已验收。此次整理只读源码和既有报告，未重跑后端、操作运行服务/数据库或读取凭据内容。

用户补充确认商品支付本轮只需“完成本地完整流程及支付接口测试”。真实商户扣款、退款到账和实体设备不作为本轮完成前提；补充的 MockMvc 支付接口与临时 RSA/AES 验签链路测试单列于 `payment-verification.md`，不与实际网络请求或真实资金交易混算。

该补充已完成：新增支付接口契约 **22/22**，完整后端 **138/138、0 失败/错误/跳过**，日志 `test-results/payment-http-contract-server-verify.log`。下表的原 116 项及商品实际 HTTP 仍按各自原始证据保留，不与新接口用例重复相加。

## 证据口径

| 证据 | 已证实什么 | 不能据此声称什么 |
| --- | --- | --- |
| [后端 mvn verify 日志](/D:/AiProject/Wildboy/test-results/redesign-smoke-verify.log) | **116/116，0 失败、0 错误、0 跳过**。包含 PostgreSQL 事务/并发集成、MockMvc 鉴权与控制器测试，以及纯解析、签名、runner 路径测试。 | 不是 116 次真实网络交易，也不是 116 次真实支付。MockMvc 的 `fullHttp…` 测试名不等于实际监听端口的 HTTP 验收。 |
| [商品真实 HTTP 报告](/D:/AiProject/Wildboy/test-results/redesign-shop-http-2026-10-31/report.json)、[请求记录](/D:/AiProject/Wildboy/test-results/redesign-shop-http-2026-10-31/requests.json) | **65 次实际 HTTP、114 项有效断言**；其中新 19080 为 63 次，旧 18080 仅 2 次只读 GET。专用商品/地址/订单完成维护、下单与未付款取消。 | 不覆盖本轮活动创建/发布/取消的真实网页或原生点击；未发生扣款、已付款发货或成功退款。 |
| [真实网页活动生命周期](/D:/AiProject/Wildboy/test-results/redesign-web-activity/report.json) | `passed=true`；实际网页表单 POST 201 草稿→PUT 200 修改→显式确认发布 POST 200→显式确认取消 POST 200；配合公开详情/列表检查、3 份阶段 JSON 和 6 张 PNG。 | 仅根专用活动变更；不延伸为所有管理任务均实际写入，不宣称微信通知送达或支付。 |
| [最终原生截图索引](/D:/AiProject/Wildboy/test-results/redesign-native-user/latest-screenshot-index.json)、[最终用户巡检](/D:/AiProject/Wildboy/test-results/redesign-native-user/final-user-tour.json) | 最终 15 用户主路由、参与人弹层、9 管理主路由已有明确索引；用户巡检 `passed=true`、无捕获异常，常规页面来源为真实本地 API。索引明确取代早期样式批次截图。 | 另有 4 张退款 REJECTED/SUCCESS/ABNORMAL/CLOSED 画面，均明确是 render-only 合成状态、无退款 API 写入；不作为实际退款证明。 |
| [原生报名操作记录](/D:/AiProject/Wildboy/test-results/redesign-native-user/registration-flow.json) | 已有一笔 **2 人、服务端 CONFIRMED** 的实际原生报名证据，截图标记 `synthetic=false`。 | 这份报名报告本身不覆盖取消/候补，分别使用后两份专项；服务端协议变化的所有异常分支不因此视为原生实测。 |
| [原生报名取消完成记录](/D:/AiProject/Wildboy/test-results/redesign-native-user/registration-cancel-native.json) | `passed=true`：在可见开发者工具模拟器内点击真实“确认取消”，随后独立 HTTP **200/null**，活动已报名人数 **0**，整组名额释放。 | 首次 SDK 辅助确认没有触发，记录明确保留该限制；成功因果来自随后可见 CUA 操作及服务端后置核对，没有 mock 原生确认结果。 |
| [原生候补操作记录](/D:/AiProject/Wildboy/test-results/redesign-native-user/waitlist-flow.json) | 最新 `passed=true`：实际页面加入 WAITING→读取 OFFERED→阅读当前协议并确认→服务端 CONFIRMED（1 人）；无捕获异常、无客户端合成状态。 | 可用名额由独立占位用户的真实 HTTP DELETE 204 释放，是明确的 fixture 步骤；不把它当作该用户在原生完成取消。未验证所有到期/协议变化分支。 |
| [原生商品/地址/结算阶段](/D:/AiProject/Wildboy/test-results/redesign-native-user/order-flow.json)、[订单恢复与取消完成记录](/D:/AiProject/Wildboy/test-results/redesign-native-user/order-recovery-flow.json) | 恢复专项 `passed=true`：两笔真实 QA 待付款订单在原生确认取消并查到 CANCELLED；一笔实际 POST 201 的创建返回被客户端故意丢弃，再按 requestId GET 200 恢复原单，`duplicateCreates=0`、`autoPaymentOnRecovery=false`。 | 数量 99 准备、协议读取故障、创建响应丢失分别标记为客户端合成测试；不是实际网络中断或资金交易。先前阶段报告没有整批 passed，不单独冒充完整通过。 |
| [早期管理原生记录](/D:/AiProject/Wildboy/test-results/redesign-native-admin/report.json)、[早期补充记录](/D:/AiProject/Wildboy/test-results/redesign-native-admin/report-rest.json) | 保留早期测量与能力错误合成状态的历史证据。 | 已由最新截图索引中的 `final-*` 管理图取代，不再当作最终样式批次。 |
| [最终原生管理首批](/D:/AiProject/Wildboy/test-results/redesign-native-user/admin-final.json)、[最终原生管理补批](/D:/AiProject/Wildboy/test-results/redesign-native-user/admin-final-rest.json) | 两批补齐 9 管理主路由；managed ADMIN 真实原生密码登录、能力 true 且密码未保存；补批 `passed=true`，图文真实版本冲突保留本地输入，经显式确认强制读取服务器 v1。 | 原生管理巡检、登录与真实图文冲突恢复可核销；不扩称所有管理按钮都已真实写入，也不证明已付款发货、退款或外部消息送达。 |
| [最终 QA 清理](/D:/AiProject/Wildboy/test-results/redesign-native-user/final-cleanup.json) | `passed=true`：两个原生验收 SKU 均已下架，普通报名为 null，保留一笔真实候补确认；两笔原生 QA 订单 CANCELLED；公共目录和首页 equipment 为相同四件演示商品。 | 保留验收订单/报名/审计样例，不称为删除所有 QA 记录或生产清库。 |
| [网页多尺寸记录](/D:/AiProject/Wildboy/test-results/redesign-admin/summary.json) | 1440、1280、390 宽度的实际浏览器只读检查、96 项 Web 自动化、构建和格式检查。 | 报告明确未执行保存/发布/发货/退款/重试等业务写入，不能当作这些真实浏览器闭环。 |
| [账号实际表单记录](/D:/AiProject/Wildboy/test-results/redesign-account/report.json) | 在隔离 QA 网页实际配置账号；公开能力 false→true、新密码登录成功、旧 bootstrap 与其他管理员会话失效、普通用户会话保留。 | 不据此推断真实微信身份或原生最后一轮密码登录已验证。 |

小程序最终批次为 [322/322 自动化通过](/D:/AiProject/Wildboy/test-results/redesign-native-user/final-npm-test.log)，与最新截图索引引用的日志一致；自动化仍不替代实际操作。所有数量独立列示，不相加作为“交易总数”。

## 业务核销矩阵

“集成已覆盖”指上述 116 项中的对应规则；“商品 HTTP”专指 65 次请求的专项，网页和原生另按各自实际操作报告列述，不混算数量。

| 环节 | 已实现及后端证据 | 本轮实际网络 / 界面证据 | 当前核销边界 |
| --- | --- | --- | --- |
| 活动草稿创建、修改、发布、取消 | [BackendIntegrationTest](/D:/AiProject/Wildboy/server/src/test/java/com/wildboy/BackendIntegrationTest.java:579) 的管理生命周期覆盖 POST→PUT→旧版本 409→发布→报名→取消；另测容量下限、开始后不可编辑、取消原子性、非管理员拒绝。 | 真实网页专项已通过：创建草稿、改标题与容量 4→5、确认发布、公共可见、确认取消；最终 CANCELLED v3，公开列表排除但详情仍 200 保留取消状态。 | **网页真实活动生命周期可核销，已不是待实测项。** 原生管理同类写入按独立记录判断，不由网页专项代替。 |
| 多人报名、名额、重复申请 | [BackendIntegrationTest](/D:/AiProject/Wildboy/server/src/test/java/com/wildboy/BackendIntegrationTest.java:237) 覆盖报名/取消/再报名、同用户并发幂等、20 人竞争不超额、多人名额整组占用与释放、条件证件资料校验。 | 原生 `registration-flow.json` 已确认 2 人报名与服务端 CONFIRMED。 | 多人成功已有原生证据；不能把同用户幂等、并发和所有失败分支都宣称已在原生实测。 |
| 当前协议与同意记录 | [BackendIntegrationTest](/D:/AiProject/Wildboy/server/src/test/java/com/wildboy/BackendIntegrationTest.java:786) 覆盖草稿/发布权限、不可改历史、同意追加、未发布拒绝、登录换取身份时的版本竞争；旧报名协议阻止新提交但不阻止取消。 | 商品 HTTP 下单读取当前版本；原生候补/订单实际读取协议版本页并确认，订单恢复专项含真实 GET 记录。协议读取错误为明确客户端故障注入。 | 当前版本阅读确认主路径可核销；真实微信登录及服务端协议更新竞争后的完整原生交互尚不能扩称全部通过。 |
| 候补加入、FIFO、保留、确认、到期与取消 | [WaitlistNotificationIntegrationTest](/D:/AiProject/Wildboy/server/src/test/java/com/wildboy/WaitlistNotificationIntegrationTest.java:31) 覆盖整组 FIFO、不越过人数较大的队首、offer 到期、并发确认只生成一笔报名、确认幂等、活动取消关闭候补及容量/实名规则不能困住队列。 | 最新 `waitlist-flow.json` 已确认原生 WAITING→OFFERED→CONFIRMED 和服务端 1 人报名；释放占位是另一个用户的真实 HTTP fixture 操作。 | 原生加入和当前协议确认主路径可单独核销；取消、过期、多人队首公平性及协议更新异常仍主要是集成/行为测试证据，不扩称全部原生实测。 |
| 报名取消、名单与隐私 | [BackendIntegrationTest](/D:/AiProject/Wildboy/server/src/test/java/com/wildboy/BackendIntegrationTest.java:738) 覆盖名单状态先筛选再分页、取消历史保留、活动隔离；另有加密存储、默认脱敏、显式 reveal 审计及过期身份拒绝。 | 更新后的 `registration-cancel-native.json` 已通过：真实可见 CUA 确认取消→独立 HTTP 200/null→registeredCount=0；`final-cleanup.json` 再次确认普通报名为 null。 | **原生整组取消与名额释放主路径可核销。** 名单所有隐私核验和权限分支仍按各自集成/操作证据判断，不从取消成功扩张。 |
| 商品维护、上下架、库存与详情 | [BackendIntegrationTest](/D:/AiProject/Wildboy/server/src/test/java/com/wildboy/BackendIntegrationTest.java:979) 覆盖服务端金额和防超卖；[ContentMediaIntegrationTest](/D:/AiProject/Wildboy/server/src/test/java/com/wildboy/ContentMediaIntegrationTest.java) 覆盖内容/媒体校验、权限和版本。 | HTTP 已验证专用 SKU 创建、价格/说明/库存修改、上下架、公共详情 404、旧版本 409、普通用户 403；文字/图片 URL/说明/表格逐字段读写一致。原生管理补批还实际验证图文 409 保留本地输入、显式确认后强制重载服务器 v1。 | 本地 API 和原生图文冲突恢复可核销；不能把图片 URL 内容读写等同于本轮实际上传了二进制图片。 |
| 收货地址、下单与 requestId 恢复 | [AddressIntegrationTest](/D:/AiProject/Wildboy/server/src/test/java/com/wildboy/AddressIntegrationTest.java) 与 [OrderReliabilityTest](/D:/AiProject/Wildboy/server/src/test/java/com/wildboy/OrderReliabilityTest.java:60) 覆盖地址隔离、默认地址、事务回滚、重复/并发幂等、订单归属及待付数量限制。 | HTTP 地址 CRUD、幂等和隔离通过；原生阶段有真实地址保存/选择画面，恢复专项实际 POST 201 仅一次，再按相同 requestId GET 200 找回同单，没有重复创建或恢复后自动支付。 | **本地 API 与原生实际订单恢复主路径可核销。** 创建响应丢失为客户端注入，不能称为已做真实网络丢包或真实微信支付。 |
| 支付前/支付后核对与回调安全 | [OrderReliabilityTest](/D:/AiProject/Wildboy/server/src/test/java/com/wildboy/OrderReliabilityTest.java:174) 覆盖遗漏回调主动查单、金额/订单/付款人/币种校验、查询与回调并发幂等；[WechatPayNotificationTest](/D:/AiProject/Wildboy/server/src/test/java/com/wildboy/WechatPayNotificationTest.java) 用测试密钥验证 RSA/AES-GCM、篡改、重放和无效配置。 | HTTP 的 `/home.paymentEnabled=false`，`/pay` 实返 409 `WECHAT_IDENTITY_REQUIRED`；原生“继续支付”记录先 `/verify` 200 再 `/pay` 409，订单保持未付，受保护的 `wx.requestPayment` 调用计数为 0。 | 本地身份拒绝、未付款核对和前端先核对再支付可核销。尚未越过真实微信身份去执行商户配置 503、预支付、真实扣款、真实回调或到账核对。 |
| 待付款取消、到期与库存释放 | [OrderReliabilityTest](/D:/AiProject/Wildboy/server/src/test/java/com/wildboy/OrderReliabilityTest.java:84) 覆盖预支付/取消互斥、先关闭渠道再回库、超时保留 intent、未知结果不释放、过期重试与支付回调竞争。 | HTTP 库存 8→6→5→7→8、重复取消不重复释放；原生恢复专项对两笔实际未付订单作显式确认取消，真实 POST 200 后 GET 断言 CANCELLED，并检查专用商品库存恢复 120。 | **无渠道 intent 的 API 和原生取消均已实测。** 渠道已创建订单后的关闭/到期/回调竞争仅有隔离集成证据。 |
| 已付款发货 | [BackendIntegrationTest](/D:/AiProject/Wildboy/server/src/test/java/com/wildboy/BackendIntegrationTest.java:1044) 验证核实支付后 SHIPPED；[RefundIntegrationTest](/D:/AiProject/Wildboy/server/src/test/java/com/wildboy/RefundIntegrationTest.java:44) 验证退款阻止发货、拒绝退款后可发货；接口继续检查版本和订单状态。 | HTTP 对真实未付款 QA 订单发货返回 409 `ORDER_NOT_SHIPPABLE`。原生结果状态的自动化只接纳同 ID、真实返回的 SHIPPED，不靠点击伪造状态。 | **未实际执行已付款发货**；不能把单测 fixture 的 PAID 或未付款拦截当作真实发货完成。 |
| 退款申请、审核、查单与成功回库存 | [RefundIntegrationTest](/D:/AiProject/Wildboy/server/src/test/java/com/wildboy/RefundIntegrationTest.java:35) 覆盖归属与幂等、审核/拒绝、未配置仍可处理申请、PROCESSING/UNKNOWN 不是成功、重试沿用退款号、金额不符回滚及成功只回库存一次；[RefundNotificationTest](/D:/AiProject/Wildboy/server/src/test/java/com/wildboy/RefundNotificationTest.java) 覆盖通知验签/解密边界。 | HTTP 仅验证未付款订单申请返回 409 `REFUND_NOT_ELIGIBLE`，未制造已付单、退款或到账记录。 | 退款功能已实现，**不是“未实现退款”**；但成功退款、真实商户查单/回调及到账尚未实测。 |
| 管理账号与原生登录能力 | [AdminAccountIntegrationTest](/D:/AiProject/Wildboy/server/src/test/java/com/wildboy/AdminAccountIntegrationTest.java) 覆盖 bcrypt12、当前密码、ADMIN 权限、demo 不可改、bootstrap→持久化、旧会话撤销、版本并发、事务回滚和无秘密响应。 | 网页真实账号表单报告通过；公开能力只含 `adminLoginEnabled`，保存后开启。最终管理两批已补齐 9 路由，`admin-final.json` 确认 managed ADMIN 实际原生登录且未保存密码。 | **后台配置、原生入口能力和真实管理员密码登录可核销。** 不扩称所有管理业务均已提交；早期未配置截图不作为登录成功证据。 |
| 站内通知与微信订阅消息 | [WaitlistNotificationIntegrationTest](/D:/AiProject/Wildboy/server/src/test/java/com/wildboy/WaitlistNotificationIntegrationTest.java:35) 覆盖 UNCONFIGURED、NO_PERMISSION、SENT、UNKNOWN、去重、失效消息不发送及重试边界。 | 通知配置为 false；原生候补记录已有站内 offer 和订阅未配置提示画面，另有恢复行为测试，没有真实微信送达证据。 | 通知队列/恢复机制已实现；mock 网关的 SENT 不代表微信已送达，刷新也不代表发送。 |

## 网页活动与原生订单的新增实测事实

真实网页专用活动 ID：`f3aaf4b7-baca-4fd6-bc1b-b682b4f23b67`。操作由实际网页表单与确认控件触发，报告明确没有直接调用活动写接口绕过界面：

1. 创建草稿 POST **201**；随后修改标题、容量 **4→5**，PUT **200**。[修改后草稿](/D:/AiProject/Wildboy/test-results/redesign-web-activity/modified-draft.json) 为 DRAFT、v1，公共详情 **404**。
2. 显式确认发布 POST **200**。[发布后](/D:/AiProject/Wildboy/test-results/redesign-web-activity/published.json) 为 PUBLISHED、v2，公共详情 **200**、公共列表命中。
3. 显式确认取消 POST **200**。[取消后](/D:/AiProject/Wildboy/test-results/redesign-web-activity/cancelled.json) 为 CANCELLED、v3、registeredCount=0；公共列表排除，详情仍 **200** 保留取消状态。

同目录的 `create-ready`、`modified-draft`、`publish-confirm`、`published`、`cancel-confirm`、`cancelled` 六张 PNG 对应这些实际阶段。只修改该专用活动，未宣称通知已送达、发生付款或操作既有活动。

[原生订单恢复专项](/D:/AiProject/Wildboy/test-results/redesign-native-user/order-recovery-flow.json) 与其 [执行脚本](/D:/AiProject/Wildboy/test-results/redesign-native-user/order-recovery-flow.cjs) 共同明确：

- 既有实际 QA 未付订单 `37a6a3ab-3947-48fc-9bab-a8f290897562`，以及响应丢失案例的真实订单 `d8ca222a-b6ea-4e99-94ea-9aa00bbdc098`，均通过原生“取消订单”及确认步骤完成，POST 200 后读取断言 **CANCELLED**；专用库存恢复到该批基线 **120**。
- 恢复案例先真实 POST `/orders` **201**，再仅在客户端丢弃已返回的创建结果；回到结算按 requestId 查得同单 **200**，没有第二次创建，也没有恢复时自动支付。它是已声明的客户端故障注入，不称为真实网络丢包。
- 用户实际点“继续支付”后，网络顺序为 `/verify` **200**→`/pay` **409**；原因是 QA 身份不是实际微信 openid。渠道调用有保护桩且计数为 **0**，没有据此制造 PAID、SHIPPED 或退款成功。

## 商品 HTTP 的可追踪最终状态

- 专用 SKU `9e25c4ee-5fcc-42ce-9bfb-8fa71ac498e3`：最终 **OFF_SHELF、库存 8**，不混入首页。
- 专用订单 `4e24502f-cd7f-4d9f-8633-e44eeea17f78`、`00e2c5ad-e8d9-4650-8840-e69efb2ba26e`：最终均 **CANCELLED**，`paymentInitiated=false`、`paymentTransactionId=null`、`paidAt=null`，审计保留。
- 第 4 件 **【演示】轻量野营折叠椅**：旧只读来源 `3f7f735b-9004-4083-ad84-e894e6d341f8`；新 ID `1a293ecc-8bfe-4978-8278-91f20789c761`。业务字段逐项复制，售价 **16900 分、库存 12**，没有新增假定价格或复制 ID/version。
- 首次审计探针误用 `size=100` 被正确 400 `INVALID_PAGE` 拒绝；修正 `size=20` 后只读续验通过。该参数错误保留在原始报告，明确标为已取代，不隐藏为业务成功。[说明与脚本](/D:/AiProject/Wildboy/test-results/redesign-shop-http-2026-10-31/README.md)
- 后续 [QA 恢复检查](/D:/AiProject/Wildboy/test-results/redesign-recovery-check.json) 证明三个身份状态、持久账号和四件演示商品保留；它不是生产数据库恢复演练，也没有替代上述订单验收记录。
- 最新 [最终清理记录](/D:/AiProject/Wildboy/test-results/redesign-native-user/final-cleanup.json) 再次通过：原生专用 SKU 下架，普通报名 null，保留一笔 CONFIRMED 候补报名，两笔原生订单 CANCELLED；公共 catalog 与首页 equipment 均是同一组四个演示 ID。会话交回有效 QA USER，未以退出登录、清缓存或删除全部验收数据充当清理。

## 真正未覆盖与当前未实现范围

**待完成的验收，不等于功能不存在：**

1. 最终 **15 用户主路由、参与人弹层、9 管理主路由巡检、managed ADMIN 真登录、整组报名取消和 QA 清理均已补证，不再列为待收尾项**。尚未逐项实际提交所有原生管理操作；原生管理活动写入不由网页专项替代。候补取消/过期、服务端协议变化竞争及全部隐私权限分支仍按隔离集成/行为测试覆盖，不扩称每条分支都已原生实测。四张退款结果画面仅是明确标注的合成渲染，没有资金或退款写入。
2. 真实微信 `wx.login`→真实 openid、真实订阅授权/消息送达，以及实体设备上的完整流程。开发者工具、dev token、合成能力错误画面均不能替代。
3. 完整商户配置后的预支付、真实支付/回调/查单、付款取消竞争、真实已付款发货与退款到账。`/pay` 本轮先被身份前置条件拦截，后置 `PAYMENT_NOT_CONFIGURED` 503 没有由真实 HTTP 走到；相关测试只验证代码分支。
4. 长时运行、生产数据迁移/备份恢复与生产域名/HTTPS/持久媒体环境不是此次本地业务批次的验收项目。上线仍依赖真实微信/商户参数、通知地址和模板、稳定数据库/媒体存储及身份证加密 key。

**源码确认的产品边界，不应包装成已完成的通用交易能力：**

- 活动仅支持免费报名：[Models.ActivityInput](/D:/AiProject/Wildboy/server/src/main/java/com/wildboy/Models.java:66) 的 `priceCents` 固定为 0；没有收费活动支付/活动退款流程。
- 订单发货是 [ShipInput(version)](/D:/AiProject/Wildboy/server/src/main/java/com/wildboy/ShopModels.java:94) 与 SHIPPED 状态，没有快递公司/单号、物流轨迹、签收/确认收货流程。
- 在线退款仅支持**已付款、未发货、整单**；没有部分金额退款、已发货退货/换货流程。同订单已有退款申请会返回原申请，[RefundService.request](/D:/AiProject/Wildboy/server/src/main/java/com/wildboy/RefundService.java:56) 没有拒绝后新建第二次申请的接口。
- 微信通知可受未配置、无授权或结果不明阻断；站内记录、可重试状态和真实外部送达必须分别验收，不能把“已排队”或 UNKNOWN 当作成功。

## 清单核销建议

**在本地 QA 边界内，以下证据项可核销：**

- 后端 116 项规则测试、小程序最终 322 项自动化，以及最终 24 个原生主路由取图/巡检；各自证据性质不混算。
- 真实网页活动创建→修改→发布→公开发现→取消，及后台账号真实表单配置→原生能力入口→managed ADMIN 密码登录。
- 原生两人报名→可见 CUA 真实确认取消→HTTP null/人数 0；候补 WAITING→OFFERED→当前协议确认→CONFIRMED。
- 商品 65 次真实 HTTP/114 有效断言；原生真实订单的客户端响应丢失恢复、先核对再尝试支付、身份拒绝、确认取消及库存恢复；原生图文真实 409 冲突恢复。
- 最终专用 SKU 下架、订单/审计保留、四件演示商品的公共基线恢复及有效 QA USER 会话交回。

候补占位释放的 HTTP fixture、数量/协议/响应错误的客户端合成步骤、四张 render-only 退款结果分别列明，不伪装成真实网络故障、真实退款或原生全部管理写入。

本地主要业务闭环及上述页面巡检证据已齐；**不核销“所有原生/网页管理业务均已实际写入”“真实微信/真实资金/真实消息送达/真实物流/实体设备已通过”**。Mock 网关、测试密钥或数据库 PAID fixture 只用于隔离状态机测试，不计入现金交易、实际发货或退款到账事实。整体记录见 [verification.md](/D:/AiProject/Wildboy/docs/redesign/verification.md)。
