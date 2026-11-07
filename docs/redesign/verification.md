# 重设计实现与联调记录

> **历史状态提示：历史候补证据已失效。候补功能及设计稿于 2026-10-31 按用户要求删除；当前范围与验收以 [docs/waitlist-removal-2026-10-31.md](../waitlist-removal-2026-10-31.md) 为准。下文保留当时的实际证据，不代表当前仍提供候补功能。**

状态：本轮重设计实现、本地业务联调和有限范围的独立画面对照已完成。手机局域网连通及数据加载已获用户实测确认；真实微信身份、完整真机业务流程及资金交易尚未执行，具体边界见末节与 `business-verification.md`。

用户后续修订已统一整合：底部采用原平台图去绿底/森林绿换色版本、四入口 Tab 文字 14px；登录、报名、结算及候补确认不再强制打开两份协议阅读，默认不勾选、当前版本与主动同意仍保留；探索主活动区最多六个已发布活动、商品仍四件；三个 Tab 标题与胶囊同一行，活动分类选中自动横滑定位。最新小程序全量 **351/351** 通过（包含 11 项 Tab 导航、6 项顶栏几何、7 项分类滚动行为回归及可选阅读用例），日志 `test-results/tabbar-original-logo-2026-10-31/npm-test.log`。此前的 322/338 项和强制已读画面均作为历史批次保留，最终画面以这次原生复验为准。

这批原生复验已完成：三标题中心差 0px、分类滚动 0→46→0、14px/50px 底栏与安全区、六活动原 ID、可选阅读、详情页隐藏底栏与返回商城缓存均通过。12 张实际截图、驱动方式及限制见 `test-results/tabbar-original-logo-2026-10-31/latest-evidence-index.json`；官方新预览包成功（1,952,433 bytes）。详细汇总见 `docs/ui-followups-2026-10-31.md`。

用户随后明确支付验收只要求“本地完整流程及支付接口测试”。按此范围，真实商户交易不列作本轮阻塞；已补齐此前以服务层测试为主的预支付成功与支付回调控制器契约，新增 22 项、完整后端 138/138 通过。补充结果单列于 `payment-verification.md`，不把模拟网关结果当真实扣款。

后续用户授权的透明底部标识已完成：森林绿 RGBA PNG、216×72px 居中画布，原生截图无绿底或大块留白，最新小程序 322/322；证据 `test-results/footer-logo-2026-10-31/`。手机局域网超时另经 Java 回环＋Node LAN 入口调整，本机接口、图片与数据保留已复测，11 项代理回归通过；官方 CLI 已生成含最新标识和 LAN19080 的手机预览码。2026-10-31 用户明确反馈“显示 UP，小程序数据也恢复”，手机连通与加载问题已关闭，见 `docs/lan-debug.md`。

## 设计与实现范围

探索页作为保留项，`design/explore-baseline.json` 的 6 个文件在首轮整合后全部匹配。其余 15 个小程序用户页、9 个原生管理页、全部网页管理路由和管理员账号设置页均已有新实现。设计源、节点和页面映射分别见三个 manifest；Pen 静态审查见 `design-review.md`。

| 范围 | 设计清单 | 实现入口 |
| --- | --- | --- |
| 小程序用户端 15 页、12 组状态/变体 | `design/mobile-user-manifest.json` | `miniprogram/src/pages/`，局部 `styles/user-flow.wxss` |
| 原生管理端 9 页、22 张主稿/状态 | `design/mobile-admin-manifest.json` | `miniprogram/src/pages/admin-*`，局部 `styles/admin-flow.wxss` |
| 网页后台 37 张主稿/状态 | `design/admin-manifest.json` | `admin/src/views/`、`admin/src/style.css` |

## 已有权威证据

- 全后端最新 `mvn verify`：138/138，通过日志 `test-results/payment-http-contract-server-verify.log`。包含原 116 项及新增 22 项支付接口契约，管理员账号、会话、名单和其他业务规则一并回归；原重设计 116/116 日志 `test-results/redesign-smoke-verify.log` 保留历史证据。
- 小程序最终全量 `npm test`：322/322，通过日志 `test-results/redesign-native-user/final-npm-test.log`。已包含报名人弹层紧凑高度、危险色 token 和结算重复标题修订；构建后显式恢复 LAN19080。
- 网页后台最终：96/96、生产构建和格式检查通过。实际浏览器在 1440×900、1280×800、390×844 各检查 30 组状态，另有 3 张登录图；没有横向溢出或捕获的页面异常。证据 `test-results/redesign-admin/summary.json`，独立画面对照审查另见实施审查记录。
- 网页动效：路由与弹层 170ms、弹层轻微回弹、按钮按压与回弹、系统减少动态效果时停用动画，实际计算样式验证通过；编辑器切换任务页签保留草稿。证据 `test-results/redesign-admin/motion.json`。
- 独立画面复查发现的窄屏金额折行已修复：金额与数量单行显示并给最小列宽，订单固定布局的金额列明确为 104px；长表仍在自身容器横滑。390px 的商品和订单图及横移图已独立复看通过；1280/1440 的对应列表也已补拍。96/96、生产构建与格式检查再次通过，计算样式证据 `test-results/redesign-admin/financial-columns.json`。
- 原生最终：15 个用户页、9 个管理页均已有最新实际微信开发者工具截图，并独立逐页对照。主要操作按钮 48px 高、12px 圆角、14px 字号，筛选和关闭触区 44px；输入框上下 padding 为 0，报名人两字段弹层正文为 208px，结算重复标题已去除。最新索引 `test-results/redesign-native-user/latest-screenshot-index.json` 明确替代首轮旧图；`final-user-tour.json`、`admin-final.json`、`admin-final-rest.json` 记录对应范围。
- “我的候补”原间距问题：旧编译包约 0px；重新构建并由开发者工具编译后为 16px。`test-results/waitlist-gap-2026-10-31/report.json` 保留前后实际测量；新布局原生复验再次测得 16px。

## 管理账号真实表单闭环

隔离 QA 的网页 15174 使用真实密码身份进入账号设置，保存前公共能力为 `false`，保存后为 `true`。三个密码框均清空；新密码登录 200、旧环境凭据 401、其他管理员会话 401，普通用户会话仍为 200。公共接口仅含布尔值。

证据：`test-results/redesign-account/account-before.png`、`account-after.png`、`report.json`。测试凭据只存当前用户临时目录，不写入本仓库。新编译包的原生入口与真实密码登录也已核对：能力 true 后入口可见，返回 ADMIN，成功后不保留密码；见 `test-results/redesign-native-user/admin-final.json`。

## 商品真实 HTTP 闭环

独立 USER2 的专用 SKU、订单和地址完成 65 次真实 HTTP、114 项有效断言：商品编辑/上下架与公共可见性、服务端库存及金额、下单幂等、重复/并发请求、待付款取消与只回库一次、图文读写、地址维护。专用 SKU 最后已下架、库存完全恢复，两笔订单已取消。

旧 18080 的第 4 件【演示】轻量野营折叠椅按原业务字段复制到新 QA：16900 分、库存 12。新首页和公共目录为 4 件实际演示商品，没有填充伪造条目；旧服务及原演示库存未修改。

证据：`test-results/redesign-shop-http-2026-10-31/README.md`、`report.json`、`requests.json`。

## 活动真实网页表单闭环

通过实际网页表单创建专用验收草稿（201），保存标题与名额修改（200），确认发布（200），由公共列表和详情读到同一活动后，再经网页二次确认取消（200）。草稿公共详情为 404；发布后列表和详情可读；取消后公共列表排除，原详情保留 CANCELLED 状态，编辑表单禁用。最终活动为 CANCELLED、版本 3、报名人数 0；没有修改其他活动。

证据：`test-results/redesign-web-activity/report.json`、三个阶段 JSON 与实际创建/修改/发布确认/取消确认/结果 PNG。日期字段通过页面 DOM input 事件填入，其余使用实际表单填写和点击；没有绕过页面直接调用活动写接口。

## 原生报名、候补与订单

双人报名已在实际界面提交并由服务端确认 CONFIRMED，随后点击真实原生取消确认，独立查询为 null 且整组名额释放。SDK 的原生确认辅助方法在本 IDE 无效，后改为可见原生按钮点击，没有模拟确认回调；因果与后置验证见 `registration-flow.json`、`registration-cancel-native.json`。

候补实际完成 WAITING→OFFERED→逐份阅读当前协议并主动勾选→CONFIRMED，服务端确认 1 人报名。名额由独立占位用户的真实 HTTP 取消释放，这个 fixture 步骤与用户原生操作分开记录；见 `waitlist-flow.json`。

商品实际界面完成数量/售罄边界、地址新增与选择、协议阅读、真实待付款下单、状态核对和取消回库。一笔真实创建响应被明确注入为客户端丢失，重开结算按 requestId 找回同一订单，没有重复 POST 或恢复后自动支付。两笔 QA 订单最终 CANCELLED、库存恢复 120，两件专用商品最后下架；见 `order-flow.json`、`order-recovery-flow.json`、`final-cleanup.json`。

图文编辑用专用活动的真实并发写入触发 409，已验证保留本地内容、显式重载确认、强制 GET 取得较新版本，最后恢复原内容。退款的拒绝、成功、异常及关闭画面是明确标注的合成展示，没有发起退款；相关图和实际/合成索引均单列，不能当真实资金回执。

## 实施审查补充与剩余复验

已修复并增加行为回归：分页与写入互相替换请求代际导致操作卡住、确认弹层的旧版本被在途分页替换、新建保存结果未知时重复 POST、隐藏页关闭其他页的未保存保护、首屏失败后直接跳到下一页。取消和发货结果只显示服务端确认的正确状态，权限失效和离页会清理结果与私密资料。

通知恢复已补齐：`NO_PERMISSION/UNCONFIGURED` 通过现有配置查询判断前置条件是否恢复，再开放原通知重试接口；测试涵盖失败、分页和条件恢复。刷新本身不会发送通知，也没有宣称真实微信消息已送达。

独立实施审查发现的 5 项 P1 与 1 项 P2 已修复并复测：候补协议变更重载、图文版本冲突恢复、创建结果未知时重复提交、隐私资料查看确认、隐藏页干扰未保存保护，以及支付前先核对状态。行为与测试证据见 `implementation-review.md`。

商城同开发者工具条件：冷首次 1645ms（原 1703ms），重复进入 229/263ms（原 217/231ms）；主要首次开销仍在开发者工具创建 WebView，不能认定有显著速度提升。30 秒内三次进入的目录请求从 3 次减少到 1 次；两次返回均立即保留 4 件可点击商品。证据 `test-results/redesign-native-user/shop-performance-after.json`，本轮唯一商品目录请求 12ms。

独立终审已完成：Web 代表性实际渲染、全部 15 用户页与 9 原生管理页的本批画面均为 `ship`，登记的行为与渲染问题全部关闭。准确看图范围及未覆盖状态见 `implementation-review.md`。只读画面不替代业务写入，合成状态不替代真实渠道结果。

探索页保护文件最终 6/6 hash 匹配；首页仍为原四个演示活动和四件真实演示商品。`final-cleanup.json`、`final-explore-preserved.json` 保留核销记录，调试会话交还为有效 QA USER。

## 环境与未执行的外部交易

主 QA：网页 `http://192.168.1.189:15174`，API `http://192.168.1.189:19080`；旧 15173/18080 保留对照数据。测试运行器退出后已从原数据文件恢复到 `server/target/redesign-qa-data`，改由独立 PostgreSQL 与标准后端运行；管理员配置、三个会话和四件演示商品均经恢复检查保留，证据 `test-results/redesign-recovery-check.json`。详情见 `docs/lan-debug.md`。

QA 没有真实微信用户身份和完整商户配置，`home.paymentEnabled=false`。支付实测返回 `409 WECHAT_IDENTITY_REQUIRED`；没有绕过身份前置条件验证后置 503，也没有伪造已支付、真实发货、扣款或退款完成。相关状态规则由后端集成测试覆盖；微信真机、真实扣款/退款及外部消息送达尚未执行。
