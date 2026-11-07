# 重设计实现独立审查

> **历史状态提示：历史候补证据已失效。候补功能及设计稿于 2026-10-31 按用户要求删除；当前范围与验收以 [docs/waitlist-removal-2026-10-31.md](../waitlist-removal-2026-10-31.md) 为准。下文保留当时的实际证据，不代表当前仍提供候补功能。**

日期：2026-10-31。范围：首轮实现的业务行为与边界对照、随后对六项正式 finding 的定向关闭复核，以及文末所列 Web 多尺寸代表样本和原生 15 用户页、9 管理页的实际渲染终审。审查未修改业务代码，未操作微信开发者工具或浏览器，未写业务数据；关闭复核独立运行了下述定向测试，未重跑完整构建/测试。**渲染结论限明确列出的图片和状态，不构成真实商户扣款、退款到账或微信消息送达验收。**

## 检查范围与方法

- 以 `PRODUCT.md`、三个设计 manifest、已审查的 Pen PNG、`docs/redesign/design-review.md` 及真实服务端规则为依据。
- 查看全部 15 个用户页及 9 个管理页的 TS/WXML，重点核对报名、多人资料、候补、协议版本、地址、订单恢复、支付、退款、权限、发布/取消、发货、名单隐私和图文编辑。
- 查看网页后台关键编辑、商品/订单、退款、管理员账号、协议、名单、活动列表、模板、候补、运营及认证代码。通知 `NO_PERMISSION/UNCONFIGURED` 永久禁用问题已由 root 另行发现并交 owner 处理，本轮不重复登记。
- 用 TypeScript AST 与 WXML 事件绑定作只读核对：24 个非探索页中 `missingBoundHandlers=[]`。这只证明静态绑定名称存在，不证明点击后的实际行为。
- 在 Node 内存中转译当前源并替换 API/微信调用，对图文冲突和隐藏协议页完成定向分支复现；未写入 `dist` 或测试文件，未发起真实 HTTP。
- 未重复报告已知的输入框 padding、字体继承、重复标题及 JSON 导航标题；相应最终渲染仍待新的实际截图。

完整测试、构建和已有联调记录见 `docs/redesign/verification.md`。本轮不把其首轮通过数视为以下新增问题已经覆盖。

## 正式 findings 与关闭状态

以下六项均已提前发给 root 并分配 owner。**六项现均已完成定向源码复核与回归，逐项关闭。** 表中保留原始问题说明以便追踪；关闭证据详见后文。本次关闭不扩大此前静态检查范围。

| 编号 | 级别 | 文件 / 分支 | 真实问题与影响 | 必须保持的修复行为 | 本轮结束状态 |
| --- | --- | --- | --- | --- | --- |
| IR-01 | P1 | `miniprogram/src/pages/waitlist/index.ts` 的 `confirm/catch/retry/load`，及对应 WXML 确认卡 | 候补确认收到 `LEGAL_VERSION_CHANGED` 或 `LEGAL_NOT_READY` 时只显示错误，仍保留旧协议、已读与同意；错误按钮“刷新”只重取候补列表，确认卡继续提交旧版本。存在确认卡时 `onShow` 也不重新读取协议。 | 保留组、人数和截止；清空旧读取/同意，重新取得当前协议，提供独立失败重试；旧 reader 回调不得把新的协议标为已读。也可明确关闭卡并重新选择，不能让主恢复按钮继续使用旧版本。 | **已关闭。** 已复核独立 `retryLegal`、清空读取/同意、session/offer/version/revision 守卫；候补测试 12/12 含 4 个新增恢复回归通过。 |
| IR-02 | P1 | `miniprogram/src/pages/admin-content/index.ts` 的 `load/save`；`admin/src/components/RichContentEditor.vue` 的 `save/load` 与加载按钮条件 | 服务端 `ContentService.save` 返回 409 `CONTENT_CONFLICT`，两端首轮实现都只显示错误而保留旧版本。原生 `_loaded=true` 使再次 `load` 不发 GET；Web `loaded=true` 隐藏重新加载按钮。重复保存继续 409，缺少可见冲突恢复。 | 保留本地块和未确认草稿，明确暂停旧版本写入；提供复制保留内容及显式确认放弃本地后强制读取最新版本的路径；取消重载不丢草稿，读取失败仍可重试，不静默覆盖。 | **两端已关闭。** 已复核冲突禁重复 PUT、显式确认重载、失败/取消保留草稿、读取成功后才采用新版本及离页/身份守卫；原生 admin-flow 16/16 与 Web content 6/6 通过。原内存 probe 已证实确认后 GET→PUT v4。新增 Pen `yxY9p/FGTf9` 两张已实看通过，原生静态范围为 22 稿。 |
| IR-03 | P1 | `admin/src/views/EditorView.vue` 的新建活动 `save` | 新建 `POST /admin/activities` 若服务端已提交而响应丢失或返回不确定错误，首轮 catch 仅设错误，`saving=false` 后恢复按钮，`id` 仍空；再次保存会重复 POST。该管理员创建 API 没有幂等键。 | 与商品创建及原生创建一致，不确定结果时保留输入并停止重复 POST，给出返回列表核对入口；明确 4xx 校验拒绝仍允许修改重试；会话变化不能接受旧结果。 | **已关闭。** 已复核 uncertainCreate、mutationStarted、已返回 ID 采用及 actor 守卫；Web editor 定向用例通过，包含不确定创建禁重、400 可改重试、未发请求不误锁。 |
| IR-04 | P1 | `admin/src/views/RosterView.vue` 的 `toggle`；`admin/src/views/ShopView.vue` 的 `toggle` | 首轮名单“查看”直接 POST reveal；订单收件信息直接切换展开，没有用途确认。与 PRODUCT 要求的“默认脱敏、确认查看及离开清理保留”不一致；原生对应分支已有显式确认。 | 展开前明确用途并确认，确认后再次核对用户与请求代际；取消不调用 reveal、不显示完整信息；隐藏可直接执行，离开继续清理。 | **已关闭。** 两处已改为 pendingReveal→用途确认→confirmReveal，保留 actor/generation/实体匹配检查及离开清理；Web roster/shop 的取消、确认和身份变化回归通过。 |
| IR-05 | P1 | `miniprogram/src/pages/admin-legal/index.ts` 的 `onHide/alert/save/load` | 首轮 `onHide` 不使在途保存失效，`alert(false)` 没有可见性守卫。隐藏页保存完成会调用 `load(true)`，在另一个页面设置未保存保护后再次调用 `disableAlertBeforeUnload`，并将隐藏协议页置回 authorized。 | 参考活动编辑的可见性保护：可以按既有规则保留草稿和处理已发出的请求，但隐藏页不得控制当前页的离开保护、显示成功提示或恢复可见授权状态；返回后重新核对并为本页恢复保护。 | **已关闭。** 已复核 `_visible`、onHide epoch 和返回后的 dirty 警告恢复；定向回归及原延迟 PUT probe 均通过，隐藏完成不再 disable 或恢复授权。 |
| IR-06 | P2 | `miniprogram/src/pages/checkout/index.ts` 的 `payExisting`、对应 pending WXML；`miniprogram/src/pages/orders/index.ts` 的 `pay`；`miniprogram/src/utils/shop.ts` 的 `payOrder` | 待核对或 reconciliationRequired 时仍可直接“继续支付”；共用 `payOrder` 先 POST `/pay` 再核对。微信已成功而本地未同步时，该动作先碰 prepay/不可支付错误，不能主动恢复已付结果。取消回调文案仍诱导稍后继续支付，与新 Pen 待核对恢复不一致。后端同订单号及状态检查有防线，本项**不等于重复扣款漏洞**。 | 继续支付前先作一次服务端状态核对；已付等终态直接更新，查询失败/未知时不拉渠道支付，明确可付后再继续。避免复用四轮轮询给每次尝试增加固定等待；保留支付完成后的原有服务端确认。两个支付入口共用守卫，取消文案先引导核对。 | **已关闭。** 共用 payOrder 已作单次 `/verify` 预检；终态直接返回，查询失败、订单错配及 reconciliationRequired 不拉支付；支付完成后的原四轮核对保留，取消文案已纠正。shop 16/16 含新增预检与取消回归通过。 |

## 定向复现证据

IR-02 原生图文：内存构造已加载 v3，本地块未保存；第一次 PUT 返回 `CONTENT_CONFLICT`，随后调用 `load()`，再保存。实际请求序列只有两次 PUT，无 GET；最终仍为 v3、authorized=true，错误仍是“图文已更新，请重新加载”。这证实首轮主恢复路径不能取得新版本。

IR-05 隐藏协议页：延迟草稿 PUT，调用 `onHide()`，模拟另一个页面开启离开保护后完成旧 PUT。记录顺序为 `[another-page-enable, disable]`，隐藏协议页还变为 authorized=true。这证实旧页能够关闭当前页的保护，不只是对代码意图的推测。

### 关闭复核证据

在 2026-10-31 02:01 的定向复核中独立执行：

- 小程序：`node --test tests/admin-flow-source.test.cjs tests/waitlist-notifications.test.cjs tests/shop.test.cjs`，**44/44 通过**（分别 16、12、16）。管理端测试在内存中转译当前源码；候补及支付测试使用此次构建后的 dist。未重建或写入 dist。
- 网页：`npx vitest run tests/content.test.ts tests/editor.test.ts tests/roster.test.ts tests/shop.test.ts`，**4 文件、27/27 通过**。使用测试环境及 mock，未操作真实浏览器或 HTTP 业务数据。
- 重跑原 IR-02 内存 probe：首次 v3 PUT 冲突后，再调用普通 load/save 不再发第二次旧 PUT；显式确认重载后，请求序列为 `PUT(v3) → GET → PUT(v4)`，冲突关闭、版本更新为 v4。
- 重跑原 IR-05 延迟 PUT probe：另页开启保护后旧保存完成，记录仅为 `[another-page-enable]`，隐藏协议页 `authorized=false`；原问题不再复现。
- 已查看原生新增 `yxY9p/FGTf9` 两张实际 PNG：冲突清楚保留本地内容并禁保存，重载前确认替换块与未确认草稿，返回检查保留输入。静态设计通过；其真实微信渲染仍须终审。

本次未重跑 owner 的完整 96 项 Web 测试或 root 的完整小程序套件；这些全量结果继续由 root 汇总。六项 finding 的关闭依据是本次定向源码检查、独立回归与原复现分支的修复后结果。

## 已核对的保留行为与限制

- 活动和候补申请仍使用真实服务端结果；报名成功页重新匹配活动、报名 ID 与 `CONFIRMED`，没有把跳转参数当成功证据。
- 多人表单仍有独立新增草稿、关闭不追加、提交期间保护、条件身份证字段与移除额外参与人入口。
- 结算仍重查已保存地址并在删除/变化时停止提交；订单意图沿用 opaque requestId，恢复旧订单不自动再创建；支付完成仍以服务端核对为准。
- 订单、退款、发货及活动发布/取消仍有服务端授权和状态/版本校验。退款申请和实际退款状态已分开展示；只提供整单退款，没有扩展物流追踪或部分退款。
- 小程序管理员入口默认隐藏，仅能力明确为 true 时显示；实际管理入口继续核对服务端 ADMIN。网页管理员账号设置保留密码身份验证、版本、输入清理与失败恢复。
- 商城仍以页面实例维护 30 秒 TTL 和 single-flight，后台更新保留可点击列表；本轮没有实际计时，不能据源码宣称性能达标。
- 新增通知 Pen `kNLGy/iqDSq` 已逐一实看，条件恢复后重排原通知、确认用户订阅及“不等于送达”的静态表达与现有 API 相符；Web 静态设计范围更新至 37 稿。实际通知恢复实现与测试由 owner 补证。

## Disposition

**六项正式行为 finding 的定向关闭复核：`ship`，全部关闭。** 本轮未发现这些修复仍有未关闭的原问题，可以继续最终渲染与业务联调验收。此结论限这六项行为问题，不是全产品发布或最终视觉验收通过声明。

最终应结合所有 owner 的最新回归结果、15 用户页及管理页实际微信截图、Web 多尺寸截图、报名/候补实际操作和商城同条件计时，再进行渲染与 Pen 的终审。真实微信、扣款/退款到账及外部消息送达的未执行边界继续按 `verification.md` 明示。

## Web 实际渲染终审

本轮以已静态审查通过的 37 张 Web Pen 稿为布局和行为表达依据，读取实际 PNG 对照，不以 `summary.json` 的 passed 字段替代看图。仅通过本地文件审查，没有接管 owner 的浏览器。实际证据来自 `test-results/redesign-admin/` 和独立账号表单证据 `test-results/redesign-account/`。

### 证据有效性与实际查看范围

主批次包含 93 张 PNG：1440×900、1280×800、390×844 各 30 个状态与各 1 张登录页；文件尺寸与分组相符。独立逐张查看其中以下 **36 个文件**，并非宣称逐张审过 93 张：

| 尺寸 | 实际查看的文件（均位于 `test-results/redesign-admin/`） |
| --- | --- |
| 1440×900，12 张 | `operations-1440.png`、`activities-1440.png`、`activity-create-1440.png`、`products-1440.png`、`orders-1440.png`、`account-1440.png`、`activity-content-1440.png`、`product-content-1440.png`、`order-detail-1440.png`、`roster-1440.png`、`notifications-1440.png`、`login-1440.png` |
| 1280×800，8 张 | `operations-1280.png`、`activity-edit-schedule-1280.png`、`activity-edit-details-1280.png`、`product-edit-1280.png`、`product-save-confirm-1280.png`、`legal-1280.png`、`template-copy-1280.png`、`login-1280.png` |
| 390×844，16 张 | `operations-390.png`、`activity-create-390.png`、`activity-edit-schedule-390.png`、`products-390.png`、`orders-390.png`、`account-390.png`、`product-save-confirm-390.png`、`activity-cancel-confirm-390.png`、`order-privacy-confirm-390.png`、`notifications-390.png`、`legal-390.png`、`legal-preview-390.png`、`operations-audit-390.png`、`template-create-390.png`、`refunds-390.png`、`login-390.png` |

另实际查看账号真实表单 `test-results/redesign-account/account-before.png`、`account-after.png` 两张，以及金额修复后重新查看 `products-390.png`、`orders-390.png`，新增查看其表格横移状态 `products-390-amounts.png`、`orders-390-amounts.png`。因此本轮实际查看 **40 个不同 PNG 文件**；其中两个主批文件还作了修复前后复看。

读取了 `summary.json`、`motion.json`、`financial-columns.json` 和账号 `report.json` 作来源与限制核对。主批报告记录只读 QA 数据、无业务写入、无页面错误或页面级横向溢出；账号报告另记录真实表单设置成功、新密码可用、旧凭证与其他管理员会话失效、用户会话保留。这些操作由 owner 执行，本审查者未再次执行或读取密码。截图中的光标蓝色光晕及窗口边缘高亮来自采集工具，不计作站点样式。

### 通过项

- 桌面运营、活动、库存、订单沿用紧凑壳层、清楚的任务标签、表格与顶部主操作，主要数据和分页可在同屏扫描；1280 表单分组仍明确。少量数据造成的下部留白没有把主动作推远。
- 活动基本信息、时间、详情和独立图文编辑的层级可辨；商品基础信息与图文保存边界清楚。没有把不同任务重新堆成一条长页。
- 390 窄屏表单按单列排布；顶部导航与数据表分别容许内部横滑。已看的保存、取消活动、收货资料用途确认及协议预览弹层，标题、正文、取消与确认动作均可见，无裁切或重叠阻止操作。
- 账号页的当前状态、设置输入及提交层级明确；真实设置前后图显示结果反馈，密码字段清空。登录桌面双栏及窄屏单列均可读。
- 已看的空名单、空退款及空消息状态说明当前结果和可用下一步；消息文案保留“生成/重新排队不等于微信送达”的边界，没有假成功表达。

### 本轮发现及关闭

| 编号 | 级别 | 原证据与对象 | 影响及修复要求 | 复核结果 |
| --- | --- | --- | --- | --- |
| VR-01 | P2 | 原 `products-390.png` 售价列约 x310–340/y490–539，`¥199.00` 被拆成三行；原 `orders-390.png` 金额列约 x273–309/y529–559，`¥89.00`、`¥178.00` 从小数中间折行。原文件已由修复复拍覆盖。 | 金额难以可靠扫描；须让金额和数量作为完整值显示，保留长名称换行和表格内部横滑，不能用全局禁止换行撑宽页面。 | **已关闭。** 已实际复看两张更新原位图与两张 `*-390-amounts.png` 横移图：完整金额、库存数量保持单行，横滑后可读，主页面宽度正常。`financial-columns.json` 补充金额列宽 104px、数量列宽 80px 与 nowrap 的采集结果，订单固定布局金额列也为 104px。 |

### 范围限制与结论

- QA 名单、退款、消息截图为空态，不能据此宣称已实际查看有数据的名单隐私展开、退款处理结果或消息条件恢复后的所有行。通知 `ready=true` 恢复与订阅确认已有静态 Pen、源码和行为测试证据；本批实际浏览器环境 `ready=false`，**未把恢复后的实际渲染列作已验收**。
- 商品模板生成、发布、发货、退款及真实渠道结果没有在本轮图片审查中执行；隐私弹层打开后取消，未揭示完整收货信息。真实账号设置是另一批已记录的 QA 操作。
- `motion.json` 记录了约 170ms 的路由/弹层变化及 reduced-motion 关闭动画结果；这是 owner 的计算样式/行为采集证据。本审查者没有从静态 PNG 推断阻尼、手势或真实设备帧率。
- owner 报告最新 Web 96/96、生产构建和格式检查通过，路径见 `financial-columns.json`；本轮未再次运行全量检查。浏览器窄屏为视口模拟，不是物理手机触控验收。

**本轮 Web 代表性实际渲染 disposition=`ship`。** 唯一登记的渲染问题 VR-01 已关闭，所列样本未见尚存实质可操作问题。此结论覆盖上表及账号、金额复拍文件，不扩大为全部 93 张或所有业务状态的逐张通过声明。

### 原生首批预看记录（后续终审见下节）

首批仅预看 `test-results/redesign-native-user/` 的 `activities.png`、`mine.png`、`register.png`、`register-bottom.png`、`login.png`、`privacy.png` 六张，并重新对照 Pen `zdkYd/cyUUW`。当时弹层紧凑高度及危险动作样式仍在 owner 收尾，故未作全部原生通过结论。该阶段记录由以下完整路由终审更新。

## 原生实际渲染终审

本轮按已静态通过的 27 张用户 Pen 稿与 22 张原生管理 Pen 稿，对照开发者工具实际 PNG。审查只读取本地文件，未接管 mini owner 独占的原生 UI，未执行业务写入。最终布局结论以 `final-*` 为准：早期 01:41–01:42 的空态/主图仍留有后来已修的重复标题，旧 `participant-modal.png` 也早于紧凑高度修复，均不据此重复登记现已修复的问题。

### 最终证据与覆盖范围

已读取最终 `test-results/redesign-native-user/latest-screenshot-index.json`，其 24 个主路由与下表图片逐一一致，并明确新图替代旧结算/弹层/首轮管理图。实际逐张查看 `final-user-tour.json` 所列 **20 张用户 PNG**（15 主路由、1 张新增参与人弹层、4 张合成退款状态），并逐张查看以下 **15 张管理 PNG**，覆盖全部 9 个管理路由。另查看 `final-mine-capability-enabled.png` 的能力开启入口。共 **36 张最终批文件**；这是路由和列明状态的覆盖，不是把 Pen 全部 49 个设计变体都声称为已实际渲染。

| 用户路由 | 最终实际 PNG | 对照 Pen 主稿 |
| --- | --- | --- |
| 活动列表 | `final-activities.png` | `zdkYd` |
| 活动详情 | `final-detail.png` | `mzsV1` |
| 填写报名 | `final-register.png`、`final-participant-modal.png` | `v2aly` |
| 报名结果 | `final-signup-success.png` | `ScdDU` |
| 我的报名 | `final-registrations.png` | `bVFjG` |
| 商城 | `final-shop.png` | `Or33t` |
| 商品详情 | `final-product.png` | `UWfJn` |
| 确认订单 | `final-checkout.png` | `KgWt0` |
| 我的订单 | `final-orders.png`；`synthetic-refund-rejected.png`、`synthetic-refund-success.png`、`synthetic-refund-abnormal.png`、`synthetic-refund-closed.png` | `kD4zv`、状态板 `Xwjvy` |
| 收货地址 | `final-addresses.png` | `AIEqe` |
| 我的山野 | `final-mine.png`；另 `final-mine-capability-enabled.png` | `cyUUW` |
| 我的候补 | `final-waitlist.png` | `JjKjJ` |
| 活动消息 | `final-notifications.png` | `fhwJH` |
| 微信登录 | `final-login.png` | `r2Vg3F` |
| 协议阅读 | `final-privacy.png` | `r5wRDb` |

| 管理路由 | 最终实际 PNG | 对照 Pen 主稿/变体 |
| --- | --- | --- |
| 身份验证 | `final-admin-login.png` | `Jt0Pi` |
| 活动管理 | `final-admin-activities.png` | `hRh1p` |
| 活动编辑 | `final-admin-editor-basic.png`、`final-admin-editor-registration.png`、`final-admin-editor-content.png` | `yNHlA`、`h50occ`、`wfShm` |
| 报名名单 | `final-admin-roster.png` | `X6euG` |
| 商品管理 | `final-admin-shop.png` | `W9vBy` |
| 商品编辑 | `final-admin-product.png` | `vKTKR` |
| 订单管理 | `final-admin-orders.png` | `R9RNM`（本次实际为待发货空态） |
| 协议管理 | `final-admin-legal-draft.png`、`final-admin-legal-history.png` | `E7GexY`、`oXo8G` |
| 图文详情 | `final-admin-content.png`、`final-admin-content-real-conflict.png`、`final-admin-content-reload-confirmation.png`、`final-admin-content-reloaded.png` | `qF4od`、`yxY9p`、`FGTf9` |

同时实看了此前流程补充图，用于最终主图未展示的下半屏、可编辑内容及恢复状态：

- 报名：`detail-bottom.png`、`register-bottom.png`、`register-ready.png`、`registrations-confirmed.png`、`detail-registered.png`、`registration-cancel-confirmation.png`，核对长标题、两位参与人、已读/勾选后的主动作、整组取消确认。此前 `participant-modal.png` 已由最终新图替代。
- 候补/通知：`waitlist-waiting.png`、`waitlist-offered.png`、`waitlist-confirmation.png`、`waitlist-confirmed.png`、`notifications-real-offer.png`、`notifications-unconfigured.png`，核对排队/截止/整组确认/已确认及未配置提醒恢复提示。
- 商品与地址：`synthetic-product-quantity-99.png`、`product-real-sold-out.png`、`checkout-invalid-100.png`、`addresses-edit.png`、`addresses-saved.png`，核对 99 件边界、售罄禁用、非法数量返回选择、长地址与编辑/删除入口。
- 结算与订单：`checkout-ready.png`、`synthetic-checkout-legal-error.png`、`synthetic-lost-create-response.png`、`checkout-recovered-real-order.png`、`checkout-payment-blocked.png`、`orders-pending.png`、`order-cancel-confirmation-d8ca222a-b6ea-4e99-94ea-9aa00bbdc098.png`、`orders-cancelled-d8ca222a-b6ea-4e99-94ea-9aa00bbdc098.png`。旧结算图的重复正文标题不再作为当前证据；恢复、错误及原生确认内容仍可追踪至各流程报告。
- 历史空态主图也已查看，当前无数据的管理订单和图文空态以最终图复核；没有要求为截图伪造有数据的支付/发货状态。

### 来源真实性与恢复证据

已读 `capture-report.json`、`registration-flow.json`、`registration-cancel-native.json`、`waitlist-flow.json`、`order-flow.json`、`order-recovery-flow.json`、`admin-final.json`、`admin-final-rest.json`、`final-user-tour.json` 及最终索引。后两个 admin 报告共同追踪全部 9 管理路由，不能只用第一份报告代替后补订单/协议/图文证据。

- 报名与候补流程使用隔离 QA 服务和真实响应：报告记录双人报名为 `CONFIRMED`，之后整组取消，再由候补名额确认取得 `CONFIRMED`；最终报名结果图显示实际的一位候补参与人。原 SDK 原生确认驱动首次未完成，后续通过可见原生确认按钮完成，`registration-cancel-native.json` 独立读回报名为空、名额已释放；没有把首次驱动超时当成功。此处“真实”指真实应用/API 流程与 QA 数据，不是生产出团。
- 待付订单是真实 QA 订单。支付尝试被服务端以缺少真实微信身份拒绝；页面保留待付并给出恢复入口，没有显示假支付成功。丢创建响应场景仅主动丢弃客户端响应，服务端订单真实存在；报告记录找回同一订单、重复创建为 0、恢复不自动拉支付，随后取消成功。
- `synthetic-product-quantity-99.png` 仅预置数量以显示边界；`synthetic-checkout-legal-error.png` 为协议读取故障注入；`synthetic-lost-create-response.png` 是前述丢响应场景。它们没有被当作实际渠道异常结果。
- 四张 `synthetic-refund-*` 只注入展示数据，**未执行真实扣款/退款 API**；截图内也明确写明“合成展示，非真实退款回执”。它们只验证 REJECTED/SUCCESS/ABNORMAL/CLOSED 排版、说明与关闭动作。
- `admin-final-rest.json` 记录真实内容版本冲突：本地 v0 编辑后，QA 服务器先写 v1，原保存产生冲突；PNG 显示本地块仍在且保存禁用。确认重载后取得服务器 v1 并显示较新文字，未把旧块继续写回。补证强化 IR-02 的关闭，不重复作为新问题。
- `admin-final.json` 记录使用网页已配置账号在原生验证为 ADMIN，密码不持久化；能力开启入口图已实看。能力关闭/错误的 fail-closed 行为此前已作源码与测试核对，本批没有重新把旧能力失败图算作最终外观通过。

### 通过项与已知项关闭

- 最终输入框内文字基线正常，无先前上下 padding 把输入挤偏的问题。活动基本信息、商品编辑、管理员登录的采集结果均为 48px 高、上下 padding 为 0；这里只引用实际测量到的代表控件，不推断所有控件都已逐一量测。
- 活动、商品、名单、地址、订单的长名称及编号可换行或完整显示；价格保持完整，底部主动作和安全区没有遮住最后可操作内容。长页通过滚动读取，未见不可达按钮。
- `final-checkout.png` 已去掉正文重复“确认订单”，保留单一原生导航标题；最终报名、订单、地址、候补、消息等也不再重复旧正文标题。原生导航居中标题保留平台容器行为，内容层级、色彩、卡片与操作分组按 Pen 对照，不声称逐像素等同。
- `final-participant-modal.png` 实看已紧凑，两个输入、关闭、取消和确认均在当前屏可见；报告/采集脚本记录正文 208px、关闭触控 44×44。旧高空白弹层已关闭。
- 最终我的页两张主入口与候补行间隔为 16px，图片与 `final-user-tour.json` 的重复测量相符。活动筛选为 44px，报名/登录/协议返回/结算代表主按钮为 48px。
- 协议链接与已读状态、勾选同意、禁用/启用主动作层级可辨。最终协议日期已格式化，不再直接显示原始 ISO 时间串；发布版本与返回后决定同意的说明明确。
- 候补排队不等于报名成功、获名额需在截止前主动整组确认；未配置微信提醒仍可在应用内查看消息。对应真实状态图表达了下一步。
- 管理三标签、底部保存/下一步、名单默认脱敏、商品保存边界、协议草稿/已发布历史、图文四动作及冲突恢复均可读；删除/取消危险动作有区别，真实原生二次确认的内容和按钮未裁切。
- 四个退款展示态保留申请原因与审核/处理说明；拒绝、异常、关闭引导核对/联系，成功保留服务端确认与渠道到账边界，关闭按钮在屏内可见。

### 限制与最终结论

本轮没有新增实质可操作问题，已知重复标题、输入 padding、弹层高空白和危险动作样式在最终图中不再作为待修项。小程序完整回归结果由 owner 记录为 **322/322**（`final-npm-test.log`，约 7669ms）；本审查者未再运行该全量套件。

`shop-performance-after.json` 的新引擎采集记录首次冷 WebView 约 1645ms，两次重复进入约 229/263ms，重复进入无新增商品请求；与此前缓存源码检查一致。本轮只读取该报告，没有独立重新计时，不将其等同于物理设备冷启动或帧率验收。

全部 15 用户路由和 9 管理路由都有实际主图，但并非每个状态都做了真实渠道操作。待发货管理页本次为空态；发货确认、退款渠道结果、消息外部送达、所有网络加载瞬态、键盘弹出后的布局、多种物理机尺寸/系统字体放大、手势与阻尼/帧率不在本次静态图片终审的已验证范围。探索页保持原任务边界，本轮没有重设计或重新验收。

**原生本批有限范围 disposition=`ship`。** 通过的是上表实际 PNG 对 Pen 的层级、排版、输入/触控代表控件、底栏和列明恢复状态；不宣称真实商户支付、退款到账、微信消息送达或全部设计状态均已端到端验收。此前六项正式行为 finding 和 Web 金额 VR-01 继续保持关闭。
