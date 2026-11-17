# 双端重构验证报告 · 2026-11-17

本轮已落实 Web 21 个有效路由、小程序 29 个非首页路由及对应现有附属界面的新设计、结构化回读与代码重构。小程序首页保留。以下“通过”指明确列出的本地隔离环境检查，不代表真机或生产支付、消息、物流服务的最终验收。

## 完成范围与设计依据

| 范围 | 设计 | 回读 | 实现 | 本地运行验证 |
| --- | --- | --- | --- | --- |
| Web 21 路由 | 完成 | 完成 | 完成 | 21 路由 × 7 尺寸；另含商城订单视图 |
| 小程序 29 非首页路由 | 完成 | 完成 | 完成 | 微信开发者工具原生逐页渲染、数据检查及截图 |
| 小程序首页 pages/home/index | 保留参考 | 已读取参考 | 专属与保护依赖不变 | 哈希、截图、真实配置与跳转专项 |

逐页功能、路由、角色、接口来源、附属界面、阶段状态及证据见 [plan.md](plan.md)、[inventory.json](inventory.json)、[design-map.json](design-map.json)。实际原始与汇总运行证据见 [runtime-evidence.json](runtime-evidence.json)。未恢复候补、备份页面或未注册功能。

可编辑源文件：[设计图文件.pen](../../../design/设计图文件.pen)。通过 Pen MCP 编辑和重新读取，不直接解析或改写 .pen 文件。最终回读有 104 个根节点、8,331 个解析节点，工具返回的布局问题为 0。读取开启 resolveVariables / resolveInstances，最终颜色、尺寸、层级与实例展开样式保存在 [pen-readback.json](pen-readback.json)。

最终结构化回读 SHA-256：

    8938877c50728acb1f59fa72bcc9bc4062a1b2b87681a4ee564cf3e042aa16bb

这是 MCP 结构化快照的摘要，不冒充 .pen 二进制摘要。工具无法 Update 旧 metadata.route 的问题已记录：文章画板使用真实 context/name 标记正确路由，映射优先读取 context。响应式、焦点、原生安全区等实现约束在 plan.md / DESIGN.md 单独说明，不伪称为工具返回的交互属性。

| 关键设计索引 | 节点 |
| --- | --- |
| 蓝灰规范、状态、按钮变体 | iSDAE |
| Web 登录 / 活动首页 / 商品与订单 | PoJPW / dxs6Q / jv8du |
| Web 活动编辑 / 文章编辑 / 首页配置 | afpqo / Rkx83 / DbJts |
| Web 会员 / 发货上报 | x9gG8s / sPQxB |
| 小程序活动 / 商城 / 我的 | zdkYd / E7QA9 / asCpo |
| 小程序商品 / 结算 / 管理商品编辑 | YbhOC / KgWt0 / IWwi8 |
| 小程序文章 / 活动订单 / 管理活动订单 | jy5Vc / 3yIfJ / sreFA |
| 受保护首页参考 | Q78i6 |

## 实现与行为影响

Web 使用 Pen 的 rf-* 变量生成 tokens.css，以 slate.css 统一白色侧栏、蓝灰操作、表格、表单、弹层和响应式尺寸；清理 style.css 末尾已被替代的森林绿/模块色覆盖。DateTimeField、两种内容编辑器及 ArticleEditor/Legal/ShippingReports/Shop 的局部颜色同步。21 页通过共享样式生效，并非为产生修改记录而改动每个 Vue 文件。

发货弹窗接入现有 FormModal，补齐对话框名称、焦点限制、Escape 与焦点返回；原字段、busy 关闭保护、冲突条件、确认和发货请求保持。未改变后台路由、接口、金额、权限或提交语义。

小程序 29 页分别引入局部主题，更新页面配置、必要布局和图标引用；新增 ui-state-slate、content-view-slate、markdown-view-slate 及 icons-slate 副本。活动/商城/我的标题、列表卡片、登录、详情、商品编辑等按对应设计调整。既有小程序 TypeScript、首页、原共享组件、原图标、全局 app 样式和 TabBar 均保持不变；新增三个组件副本的 TypeScript 内容与原组件一致。测试中发现的浅橙普通卡片、绿色原生 switch、浅色箭头和正文颜色残留已修正，最终截图使用白卡与蓝灰语义。

生产未植入演示数据；运行中的 QA 标记来自隔离 LocalSmokeServer 数据库。源配置的生产域名与开发开关未改；仅被忽略的 dist 配置连接测试 API。

## 构建与自动回归

| 检查 | 实际结果 | 证据 |
| --- | --- | --- |
| Web vue-tsc + Vite 构建 | 通过 | test-results/ui-refresh-2026-11-17/web-build-final.log |
| Web Vitest | 22 文件、199/199 通过 | web-tests-final.log |
| 发货弹窗相关回归 | Shop / FormModal 13 项通过 | 已在本轮执行；完整浏览器业务进一步验证确认与取消 |
| 小程序构建、TypeScript | 通过 | mini-build-final.log |
| 小程序既有回归 | 524/524 通过 | mini-tests-final.log |
| 本轮修改的 Web 文件 Prettier | 通过 | web-changed-format.log |
| 全仓 Web format:check | 未通过：22 个未修改文件的既有格式问题 | 未为本次视觉任务批量重排无关文件 |
| Git 文本差异空白检查 | 通过（.pen 二进制排除） | 本轮 git diff --check |

Web 包仍有单块大于 500 kB 的构建提示（现有编辑器依赖），构建成功。本轮未以调整阈值隐藏该提示。

两个旧小程序结构断言随实际新设计更新：活动分类控件从旧 rpx 高度改为至少 44px，图标资产校验允许独立 icons-slate 路径；事件、真实资源存在性和业务断言保留。首次 Web 全量测试曾出现 FileReader 时序失败，相关 14 项及完整 199 项复跑通过，未改业务测试以绕过失败。

## 浏览器与双端业务

测试前端 localhost:15176，后端 localhost:19082，使用 LocalSmokeServer 的临时 PostgreSQL；未使用生产库或用户原 5173 服务。浏览器检查尺寸为 1440×900、1280×800、1024×768、721×820、720×820、390×844、320×700。

21 个路由加商城订单视图合计 154 个页面/尺寸组合通过，页面横向溢出均不超过 1px。逐项报告和截图路径已合并入 runtime-evidence.json；全路由报告 1794888983311-cbfc8 中的文章标题定位失败，经测试选择器匹配现有独立文章编辑器后，由 1794889134489-bd357 的 14 个文章组合通过结果替换。没有把旧失败报告直接标记成全通过。

最终业务报告 1794889227661-b34c5 为 25/25：

- 真实密码登录、演示只读、未授权与退出后的活动订单深链。
- 新建/编辑/发布收费活动，查询、名单、多人参与人及隐私确认。
- 创建商品分类、双价商品，确认/撤回商业字段保存，免支付订单发货确认/取消，收货信息揭示及离页清除。
- 双业务会员优惠及用户身份分配、用户资料与报名历史。
- 活动模板生成两个真实草稿。
- Markdown 文章保存、发布/下架、官方介绍确认。
- 首页入口配置保存后公开 API 同步、协议草稿/预览/历史。
- 运营范围/审计筛选、通知加载失败恢复。通知重排条件、退款记录冲突使用明确标记的合成响应，不能当作外部服务送达或真实退款成功。

测试生成数据只在隔离库，结束时下架/取消所属测试记录并恢复入口配置和用户身份；没有进行真实支付、发送微信消息或发送文件。

## 微信原生验证

使用微信开发者工具 Stable 2.02.2608060、基础库 3.15.2，iPhone 12/13 (Pro) 模拟器，显示缩放 93%。原生截屏 363×785；不把浏览器移动布局当作小程序运行证据。

- 30 个注册页面全部原生进入、等待真实数据/合法空态、检查错误和截图；未捕获页面运行异常。最终逐页证据为 native-pages-report.json。
- 用户关键流程 5 项：主动同意后登录；联系资料保存并返回报名回填；真实报名确认与参与人；保存地址返回结算；真实创建待支付订单且不误报已支付。
- 管理员关键流程 6 项：隔离数据边界、密码验证、原价留空回填现价、分类版本切换、两种名单状态与真实 CSV 内容。CSV 微信发送和导出确认由测试拦截，未实际联系任何人。
- 首页与文章专项 5 项：读取真实后台配置、首页文章 id 进入并显示已发布 Markdown、原首页弹窗开关、WEEKLY 分类参数、商城/活动详情及返回首页。文章同时保留官方介绍未发布的合法空态截图。

开发者工具曾保留旧 WXML/CSS 缓存，普通编译未刷新；关闭并重新打开项目后核对实际控件颜色与结构，重新采集了 30 页。最后 Markdown 正文颜色微调后再次原生核对文章及首页专项。工具启动白屏/自动化端口未就绪的失败不归为页面通过证据。

## 首页独立保护证明

[home-baseline.json](home-baseline.json) 的 81 项 SHA-256 全部一致：包括首页四个文件、app、原 TabBar、原 ui-state、相关工具、原图标及资源。没有通过改全局主题间接换首页颜色。

修改前原生截图为 [首页基线](../../../design/assets/home-native-before-2026-11-17.png)，修改后见 [首页截图](evidence/native-home.png)。同一原生尺寸下，排除三处照片解码/重采样区域、系统状态栏及模拟器 1px 边缘后，剩余像素差异为 0。完整未遮罩图片有 13,309 个差异像素，不能声称整张截图逐像素相同；排除坐标与结果保存在 runtime-evidence.json。图片源文件本身的哈希保持一致。

首页布局、文字、间距、分类位置、TabBar 与固定区域经截图复核保持原样；首页入口/弹窗/返回和后台维护能力又通过真实 API 与原生交互验证。没有将首页内容写死。

## 视觉证据与差异

已查看全部 Web 桌面页与 30 个原生页面的截图汇总，核对颜色、层级、卡片、表单及固定区。对移动 Web 的窄屏与边界尺寸执行逐页可见性及横向溢出检查；附属确认弹层在关键业务测试中有桌面/移动截图。

代表性最终截图：

- [Web 活动首页](evidence/web-activities.png)、[Web 登录](evidence/web-login.png)、[Web 文章编辑](evidence/web-article-editor.png)。
- [小程序活动](evidence/native-activities.png)、[商城](evidence/native-shop.png)、[我的](evidence/native-mine.png)、[管理商品](evidence/native-admin-product.png)、[已发布文章](evidence/native-article-populated.png)。
- [原生全页汇总一](evidence/native-contact-1.jpg)、[二](evidence/native-contact-2.jpg)、[三](evidence/native-contact-3.jpg)、[首页弹窗](evidence/home-popup-protected.png)。

允许并记录的平台差异：微信原生导航/胶囊/日期选择器、安全区、93% 模拟器显示缩放；系统字体与 Pen Noto Sans SC 的字形回退；真实长内容让页面延展；真实商品、价格、日期与 Pen 演示数据不同。全程保留原 TabBar 的首页基线颜色，避免首页与其他 Tab 的共享变化。

## 未覆盖的验收边界

界面范围内没有未落地页面或跳过设计读取的路由。以下验证仍未完成，不能标记为通过：

1. 实体 iOS/Android 真机、真实输入法与不同屏幕/DPR 的逐页视觉和键盘验收。
2. 生产微信支付、退款回调、真实订阅消息送达、微信文件发送、真实物流上报及异常重试闭环。已验证界面状态、原有回归和隔离后端流程；没有把合成响应等同于这些结果。
3. 所有页面所有异常状态的逐一原生截图。已有自动回归覆盖权限、校验、幂等、冲突等分支，浏览器和原生关键路径覆盖代表性状态，并不声称穷举所有数据组合。

## 重现入口

构建与回归：

    npm --prefix admin test
    npm --prefix admin run build
    npm --prefix miniprogram test

浏览器脚本为 tests/e2e/admin-redesign-browser.cjs，WILDBOY_E2E_TARGET=current 连接本轮隔离服务，WILDBOY_E2E_WRITE=1 执行合成数据写入。官方开发者工具连接助手为 tests/e2e/wechat-session.cjs；本轮原生脚本为 tests/e2e/ui-refresh-native-pages.cjs 和 tests/e2e/ui-refresh-home-article.cjs。逐页脚本读取同一次隔离数据库的用户/管理员回归 fixture 报告；数据库重建后必须重新生成 fixtures，不能沿用失效 id。

原生用户/管理员业务用例复用了既有回归脚本，在 _temp/ui-refresh-native-user.cjs 与 _temp/ui-refresh-native-admin.cjs 调整到本轮隔离端口并适配已完善的联系人状态。最终结果已持久保存于 runtime-evidence.json，不依赖临时脚本继续存在。

scripts/ui-refresh-map.py 从 MCP 快照建立映射，scripts/ui-refresh-tokens.py 从实际变量生成令牌，scripts/ui-refresh-evidence.py 在校验报告与首页哈希后更新逐页状态和汇总。scripts/ui-refresh-audit.py 用于最初基线，不应在后续修改后覆盖历史保护快照。
