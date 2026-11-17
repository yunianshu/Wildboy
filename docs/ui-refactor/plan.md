> **当前重构（2026-11-17 阳光柑橘版）**：见 [执行清单](2026-11-17-citrus/plan.md)、[设计映射](2026-11-17-citrus/design-map.json) 和 [验证报告](2026-11-17-citrus/verification.md)。以下内容是历史记录。

# 全端界面重构 · 范围、清单与流程（2026-11-16）

依据：仓库 HEAD `9e4c2d0`（商城恢复 + 微信发货上报管理之后）。
设计源文件：`design/设计图文件.pen`（Pen v2.22 JSON，变量 `$wb-*`，图标 lucide）。

## 1. 技术栈与验证方式

| 端 | 技术栈 | 样式方案 | 运行/验证 |
| --- | --- | --- | --- |
| Web 后台 (admin/) | Vue 3.5 + vue-router(hash) + Vite + TS | `src/style.css` 全局 `--admin-*` 令牌 + scoped 样式 | `npm test`（vitest）、`npm run build`（vue-tsc + vite） |
| 小程序 (miniprogram/) | 微信原生小程序 + TypeScript | 全局 `app.wxss` + 页面 wxss + `styles/motion.wxss`；自定义 TabBar | `npm test`（build + tsc + node --test 524 用例）、`npm run typecheck` |
| 设计 (design/) | Pen 源文件（JSON 节点树） | `$wb-*` 颜色/字体变量；Web 画板用 recolor-v2 色板（与 `--admin-*` 一一对应） | 结构校验脚本 + JSON 回读 |

Pen 工具链现状：本会话未连接 Pen MCP；`.pen` 文件为可读 JSON，仓库既有工作流即「脚本直接编辑 .pen + 先备份 + 结构校验」（历史脚本已随 2026-11-17 design 目录精简移除，见 git 历史）。本次沿用该约定。

## 2. 小程序主页面（保护对象）识别与基线

**识别依据**（不靠文件名）：
- `app.json` `pages` 数组首位 = `pages/home/index`（无 `entryPagePath` 覆盖），即小程序启动落地页；
- 自定义 TabBar `TAB_ITEMS` 首项「探索」指向 `pages/home/index`；
- 内容为品牌 hero + 快捷入口网格 + 活动列表 + 装备区 + 文章轮播的平台首页。
- 设计文件中对应「探索页 / 保留原样参考」`Q78i6`（390×2157，标注保留）。

**保护基线（记录于重构前 HEAD 9e4c2d0）**：
- 专属文件：`pages/home/index.{ts,wxml,wxss,json}`，MD5：
  `7cb2a6a7…`/`142a610c…`/`a5c8b233…`/`5fd37082…`（全文见 `verification.md`）
- 共享依赖：`utils/home.ts`、`utils/home-shortcuts.ts`、`utils/tab-bar.ts`、`utils/tab-swipe.ts`、`utils/page-motion.ts`、`styles/motion.wxss`、`app.wxss`、`custom-tab-bar/`、`components/ui-state/`、`utils/api.ts`。
- 行为锁定测试：`tests/home.test.cjs`（结构/入口/数据流）、`tests/page-motion.test.cjs`（全部页面动效约定）、`tests/tab-bar.test.cjs`（四 Tab + 滑动切换）、`tests/user-redesign.test.cjs`。
- 处置：**保留，仅验证**。本次不改其专属代码；共享文件如需变更，必须跑上述测试并 diff 首页文件哈希。
- 运行截图：本环境无微信开发者工具 CLI 自动化，无法产出真机截图；以「文件哈希 + 结构测试 + 设计参考稿 Q78i6」作为基线证据，截图项在 verification.md 标注为不可用。

## 3. Web 管理后台页面清单（全部重构范围）

路由来源 `admin/src/router.ts`；状态类画板（确认弹窗等）列为附属界面。WaitlistView.vue 无路由（`/waitlist` 仅重定向），标记废弃，不设计不重构。

| 模块 | 页面 | 路由 | 文件 | 设计画板（现行 Web 代） | 状态 |
| --- | --- | --- | --- | --- | --- |
| 登录 | 管理员登录 | /login | LoginView.vue | PoJPW | 已设计/已实现，验证 |
| 运营 | 运营工作台（概览/异常/历史） | /operations | OperationsView.vue | jooRk（+mS4Tg 列表态） | 已设计/已实现；**需补「发货上报待处理」指标卡画板** |
| 活动 | 活动管理列表 | /activities | ActivitiesView.vue | dxs6Q | 已设计/已实现，验证 |
| 活动 | 新建/编辑活动（含图文） | /activities/new, /activities/:id/edit | EditorView.vue | CCqVo、afpqo、jlF19(发布确认) | 已设计/已实现，验证 |
| 活动 | 报名名单（脱敏/揭示） | /activities/:id/registrations | RosterView.vue | A7gFGK、tSb5v（查看资料确认） | 已设计/已实现，验证 |
| 活动 | 活动模板 | /templates | TemplatesView.vue | VZIjm | 已设计/已实现，验证 |
| 活动 | 活动订单/退款 | /activity-orders | ActivityOrdersView.vue | xHqTA、XErK6、othlP、D02kiL | 已设计/已实现，验证 |
| 商城 | 商城管理（商品+订单发货） | /shop | ShopView.vue | jv8du、jLyLI(装备订单/发货) | 已设计/已实现（上任务恢复后体系一致），验证 |
| 商城 | 商品分类 | /shop/categories | ProductCategoriesView.vue | Z4snv | 已设计/已实现，验证 |
| 商城 | 退款售后 | /refunds | RefundsView.vue | kc418、pKPcb | 已设计/已实现，验证 |
| 商城 | **发货上报（新页面）** | /shipping-reports | ShippingReportsView.vue | **缺失 → 本次新增** | 待设计→实现→验证 |
| 用户 | 用户管理 | /users | UsersView.vue | udj84 | 已设计/已实现，验证 |
| 用户 | 会员管理 | /memberships | MembershipsView.vue | x9gG8s、V6uBE、vruDl、Asyql | 已设计/已实现，验证 |
| 内容 | 文章列表 | /articles | ArticlesView.vue | hSL6j | 已设计/已实现，验证 |
| 内容 | 文章编辑（双栏/窄屏/官方介绍确认） | /articles/new, /articles/:id/edit | ArticleEditorView.vue | Rkx83、MYBYC、LzCfb、TNona、P6RC06 | 已设计/已实现，验证 |
| 内容 | 协议管理 | /legal | LegalView.vue | Pr4cO | 已设计/已实现，验证 |
| 内容 | 消息管理（恢复通知） | /notifications | NotificationsView.vue | vMuxZ、Sfyhp | 已设计/已实现，验证 |
| 设置 | 基础配置（四入口/弹窗/冲突恢复） | /settings | SettingsView.vue | DbJts、xNcp5、k0nVX、yJl1Q | 已设计/已实现，验证 |
| 设置 | 管理员账号 | /settings/admin-account | AdminAccountView.vue | UHolL、jwaEj | 已设计/已实现，验证 |
| 废弃 | 候补名单（WaitlistView.vue） | —（/waitlist 重定向 /operations） | — | — | 废弃代码，不纳入 |

附属界面（弹窗/状态）现行代画板：发布确认 jlF19、查看资料确认 tSb5v、退款申请审核 pKPcb、恢复通知 Sfyhp、版本冲突恢复 k0nVX、设为官方介绍确认 P6RC06、窄屏 UFr8b/YcrPD/D02kiL/TNona/yJl1Q 等；第一代「后台 /」确认弹窗稿已随 2026-11-17 设计精简移除（页面级均有现行代覆盖）。

## 4. 小程序页面清单（除首页全部重构范围）

| 模块 | 页面 | 路由 | 设计画板 | 状态 |
| --- | --- | --- | --- | --- |
| 首页 | 探索（主页面） | pages/home/index | Q78i6（保留参考） | **保留，仅验证** |
| 活动 | 活动列表（Tab） | pages/activities/index | zdkYd | 已设计/已实现，验证 |
| 活动 | 活动详情（含已报名态） | pages/detail/index | mzsV1、KGp4I | 已设计/已实现，验证 |
| 活动 | 填写报名 | pages/register/index | v2aly | 已设计/已实现，验证 |
| 活动 | 报名结果 | pages/signup-success/index | ScdDU | 已设计/已实现，验证 |
| 活动 | 我的报名 | pages/registrations/index | bVFjG | 已设计/已实现，验证 |
| 活动 | 活动消息 | pages/notifications/index | fhwJH | 已设计/已实现，验证 |
| 活动 | **我的活动订单（用户）** | pages/activity-orders/index | **整页缺失**（仅退款弹层状态稿 kx38q） | **待设计→重构→验证** |
| 商城 | 商城（Tab） | pages/shop/index | E7QA9、mGkPt(加载刷新) | 已设计/已实现（上任务恢复+手势合并），验证 |
| 商城 | 商品详情 | pages/product/index | YbhOC | 已设计/已实现，验证 |
| 商城 | 确认订单 | pages/checkout/index | KgWt0、vaPck(支付恢复) | 已设计/已实现，验证 |
| 商城 | 我的订单 | pages/orders/index | kD4zv、Xwjvy(取消退款结果) | 已设计/已实现，验证 |
| 商城 | 收货地址 | pages/addresses/index | AIEqe、MJO4e(编辑空态) | 已设计/已实现，验证 |
| 我的 | 我的山野（Tab） | pages/mine/index | asCpo、tZwlR(身份恢复) | 已设计/已实现，验证 |
| 我的 | 联系资料 | pages/profile/index | u9yYo、CX7SL | 已设计/已实现，验证 |
| 我的 | 微信登录 | pages/login/index | r2Vg3F、KGIQF(协议恢复) | 已设计/已实现，验证 |
| 内容 | 文章 | pages/article/index | jy5Vc | 已设计/已实现，验证 |
| 内容 | 隐私政策 | pages/privacy/index | r5wRDb | 已设计/已实现，验证 |
| 管理 | 管理员验证 | pages/admin-login/index | Jt0Pi、r2Js0(入口失败)、ouWUv(未配置) | 已设计/已实现，验证 |
| 管理 | 活动目录 | pages/admin-activities/index | hRh1p | 已设计/已实现，验证 |
| 管理 | 活动编辑（基本/报名/详情） | pages/admin-editor/index | yNHlA、h50occ、wfShm、NFbtm/YIDDP(取消确认/结果) | 已设计/已实现，验证 |
| 管理 | 报名名单 | pages/admin-roster/index | X6euG | 已设计/已实现，验证 |
| 管理 | 协议草稿/历史 | pages/admin-legal/index | E7GexY、oXo8G、vm86H | 已设计/已实现，验证 |
| 管理 | 商品库存 | pages/admin-shop/index | W9vBy | 已设计/已实现，验证 |
| 管理 | 商品编辑（双价/分类/冲突） | pages/admin-product/index | IWwi8、L50wpo、yxYbF/FGTf9 | 已设计/已实现，验证 |
| 管理 | 订单发货 | pages/admin-orders/index | R9RNM、p6tHR/q9SqVI(核对/完成) | 已设计/已实现，验证 |
| 管理 | 图文编辑 | pages/admin-content/index | qF4od | 已设计/已实现，验证 |
| 管理 | 用户管理 | pages/admin-users/index | gbfMY、n2142A | 已设计/已实现，验证 |
| 管理 | **活动订单与退款** | pages/admin-activity-orders/index | **缺失** | **待设计→重构→验证** |
| 管理 | **会员管理** | pages/admin-memberships/index | **缺失** | **待设计→重构→验证** |

状态稿（加载/空/失败/恢复，多页复用）：JLFre、hlmk3、mGkPt、vaPck、kx38q、MJO4e、tZwlR、KGIQF、FKrkZ。

## 5. 双端页面关系与业务流程（要点）

- 活动链：后台 EditorView 发布 → 小程序 home 快捷入口/activities 列表 → detail → register 下单 → activity-orders 支付/取消/退款 → 后台 ActivityOrdersView 审核 → RosterView 名单。
- 商城链：后台 ShopView/ProductCategoriesView 维护商品 → 小程序 shop/product/checkout → orders → 后台 ShopView 发货（录入快递即触发微信发货上报）→ RefundsView 售后。
- 发货上报（新）：ShopView 发货、活动支付回调 → `shipping_report` 落库 → 失败退避重试（ShippingReportRetryJob）→ 后台 ShippingReportsView 查询/补报；小程序端无感知（无页面）。
- 会员：后台 MembershipsView（等级/身份）↔ 小程序 admin-memberships（同能力移动端）→ register/checkout 报价享受会员价。
- 消息：后台 NotificationsView 模板 → 小程序 notifications 展示订阅消息记录。
- 文章/协议：后台 Articles/ArticleEditor、LegalView → 小程序 article、privacy、首次登录确认（login）。
- 登录后继续：小程序 wx.login → 回跳原页面（login?mode=consent 等）；管理入口 mine → admin-login 验证 → 各 admin-* 页。
- 字段口径：金额一律分（展示 ¥x.xx），订单状态枚举双端一致（statusText/statusLabel 映射），时间北京时间。

## 6. 本次设计缺口与处理

1. 新增画板：`Web / 发货上报`（列表）、`Web / 发货上报 · 补报确认`（弹窗态）、`小程序 / 活动订单`（用户列表+退款入口）、`小程序管理 / 活动订单与退款`、`小程序管理 / 会员管理`。
2. 更新画板：`Web / 运营工作台`（jooRk）补「发货上报待处理」指标卡；全部 Web 画板侧栏「商城」组补「发货上报」导航项（与 App.vue 导航一致）。
3. 设计后回读全部新增/修改节点 → `design-map.json`；随后仅对三个小程序页面做视觉重构（现有功能全保留），ShippingReportsView 对照新画板校准，其余页面按「已实现→验证」处理。

## 7. 约束

- 首页专属文件不修改；共享文件改动须回归首页基线（§2）。
- 不新增项目不存在的业务模块；不改变业务枚举/金额规则/提交语义。
- 演示文案仅用于设计与测试，不进入生产数据路径。
