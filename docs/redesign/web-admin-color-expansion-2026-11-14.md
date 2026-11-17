# 网页后台配色扩展（2026-11-14）

> **v2（当前生效）**：v1 上线后用户反馈四个问题——绿色/米色太满太闷、模块彩色发灰显脏、不够精致高级、色彩冲击力不够——经方向确认改为**清爽浅色 SaaS 风**并整体换肤。v2 设计与实现见下文「v2 换肤」章节；v1 章节保留作过程记录。

## v2 换肤（清爽浅色 SaaS 风，2026-11-14 第二轮）

设计策略：chrome（背景/卡片/侧栏/文字）全部换为中性冷灰白，色彩只用在有含义的位置；所有彩色从低饱和自定义色改为高饱和的成色板色相，在白底上呈现干净鲜亮；品牌点缀收敛为单一翡翠绿。

### 色板

| 角色 | 值 | 说明 |
| --- | --- | --- |
| 应用背景 / 卡片 | #f6f7f9 / #ffffff | 中性冷灰，取代米色纸底 |
| 描边 / 发丝线 | #e5e8ec / #eef0f3 | 取代绿灰描边 |
| 标题 / 正文 / 次要 / 弱化 | #111827 / #1f2937 / #374151 / #6b7280 | 中性灰阶 |
| 侧栏 | #101613（墨绿近黑） | 文字 #e5e7eb、弱化 #9ca3af、悬停 #1a241f、选中 #22332b |
| 品牌主按钮 | #047857（悬停 #065f46） | 白字对比 5.48；翡翠绿 #059669 用于焦点环/装饰（≥3:1） |
| 品牌软底 / 品牌文字 | #ecfdf5 / #065f46 | 选中页签、次按钮文字 |

模块色（仅用于页题标记、卡片分类、侧栏分组点色；不再用于表头底）：

| 模块 | strong | onDark（侧栏标签） |
| --- | --- | --- |
| 运营 | #2563eb | #60a5fa |
| 活动 | #c2410c | #fb923c |
| 商城 | #b45309 | #fbbf24 |
| 用户 | #7c3aed | #a78bfa |
| 内容与设置 | #0f766e | #2dd4bf |

语义状态色（文字/底/描边，全部 ≥4.5:1）：success #047857/#ecfdf5/#a7f3d0 · warning #92400e/#fffbeb/#fde68a · danger #b91c1c/#fef2f2/#fecaca · info #1d4ed8/#eff6ff/#bfdbfe · neutral #374151/#f3f4f6/#e5e7eb。表头统一中性 #f9fafb（模块归属改由页题标记与分组点色表达）。

### 落地与验证

- Pen：`design/scripts/pen-web-admin-recolor-v2-2026-11-14.py` 对 38 张画板做上下文感知映射（侧栏 429+462+495、主按钮 32、品牌文字 244、正文/弱化 801、胶囊 61 组、表头 20、描边 320、分组标签 165），结构校验仅颜色变化，v1 色值零残留；备份 `design/backups/设计图文件.pen.bak-recolor-v2-2026-11-14`。脚本自渲染预览 `design/exports/web-admin-recolor-v2-preview-2026-11-14.*`。
- 代码：style.css 令牌与组件全面换肤（约 40 处），ShopView 局部描边修正；状态语义类名与模块归属机制不变（statusTone.ts、data-module/data-group 复用）。
- 门禁：vitest 194/194、`vue-tsc`、生产构建、改动文件 Prettier 通过；浏览器验收 158/158（隔离 API + Vite，报告 `test-results/admin-redesign-browser/1794637438667-ed37a/`），桌面截图抽查活动/运营/商城/用户/消息/订单均符合 v2 规范。
- 生产部署（2026-11-14，经用户确认）：提交 e9ebec2 已推送 GitHub 并以 SSH 直推服务器快进 + deploy.sh 第 2–5 步执行；烟雾检查全过，线上 CSS（index-7u7_e6Vq.css）实测含全部 v2 令牌（#f6f7f9/#047857/#101613/#2563eb/#c2410c/#7c3aed/#ecfdf5/#fef2f2），登录页截图 `test-results/prod-login-v2-1440.png`。回退：服务器 `git reset --hard 122aee7` + 重跑部署步骤。

---

# v1 过程记录（已被 v2 取代）

用户反馈：后台管理界面颜色太单调，希望有更多组合。现有实现与 Pencil 设计稿几乎全部使用森林绿单一色相（38 张 Web 画板内 #193F34 出现 873 次，全部色相仅绿、纸、白三族），本轮在不推翻既有布局与组件结构的前提下，引入「模块色 + 语义色」双层色彩系统，并同步更新 Pencil 画板与 `admin/` 实现。

## 范围与依据

- 范围：网页后台（`admin/`）17 条路由、18 个视图文件、共享样式与外壳组件；`design/设计图文件.pen` 中 38 张 `Web /` 新版画板（[画板索引](../../design/web-admin-manifest.json)）。
- 排除并记录依据：
  - 同一 .pen 文件中的旧版「后台 / …」36 张画板与小程序画板：`docs/redesign/web-admin-2026-11-14.md` 明确其为旧版保留稿，网页后台现行基线是 `Web /` 38 张画板；本轮不改动旧稿，避免混淆验收对象。
  - 小程序（`miniprogram/`）：用户指认的是 wildboy.com.cn 后台界面；小程序配色属于独立验收线（`DESIGN.md` 小程序章节），本轮不动。
  - 探索页基线（首页布局与两张素材）按 `DESIGN.md` 保护要求不变。

## 工具与 Pen 连接状态

- `design/设计图文件.pen` 为 JSON 格式（`version 2.22`，139 个顶层节点），本项目既有脚本（`design/scripts/pen-web-admin*.js`）依赖 Pencil 应用内执行环境；本环境无 Pencil MCP 端点（`Pen.exe` 进程在运行但未监听任何本地端口，`design/pen-session.json` 记录的编辑器文件已不存在）。
- 因此本轮直接以结构保持脚本（`design/scripts/pen-web-admin-recolor-2026-11-14.py`）对 .pen JSON 做逐节点颜色替换：只改 `fill`/`stroke` 颜色字符串与 `variables` 色板登记，不增删节点、不改 id 与布局。脚本与替换前后哈希记录于 design 目录。
- 恢复方式：在 Pencil 桌面应用重新打开 `design/设计图文件.pen` 即可看到新配色；若应用内另有未保存副本，需先关闭不保存再打开。画板级人工微调仍可在应用内继续。

## 现状基线（38 张 Web 画板颜色统计）

| 色值 | 次数 | 用途 |
| --- | --- | --- |
| #193F34 | 873 | 侧栏底、主按钮、表头文字、选中项 |
| #FFFFFF / #F6F4ED | 464 / 62 | 内容面 / 纸底 |
| #CAD9CD / #D9E3D9 / #B9CBBF | 462 / 433 / 203 | 侧栏图标与文字 |
| #203E34 / #596A60 | 428 / 384 | 正文 / 辅助文字 |
| #D7DED5 | 350 | 描边 |
| #E8EEDF | 105 | 表头底、选中页签、正向标签 |
| #345A4C | 33 | 侧栏选中项 |
| #F7EDD6 / #6D4B18 | 13 / 14 | 待办警示标签（唯一非绿色相） |
| #F7E8E2 / #923B31 | 7 / 7 | 危险 |

结论：除 27 处琥珀与 14 处危险红外全部为绿色族，与用户「太单调」的判断一致。

## 新色彩系统

### 品牌锚点（保持不变）

纸底 #F6F4ED、内容面 #FFFFFF、正文 #203E34、辅助 #596A60、主色森林绿 #193F34（侧栏、主按钮、选中交互）、侧栏选中 #345A4C、危险 #923B31/#F7E8E2、描边 #D7DED5。

### 模块色（按侧栏五个分组）

用于：侧栏分组标识、表头底色、页题标记、工作台指标卡图标、模块内提示面。每页一个模块色，与品牌绿、语义色叠加形成组合。

| 模块 | 色名 | strong（文字/图形） | soft（面） | border | onDark（侧栏标签） | strong/soft 对比度 |
| --- | --- | --- | --- | --- | --- | --- |
| 运营 | 湖蓝 | #1D5F8A | #E4EFF7 | #C6DBEA | #9CC9E9 | 5.89 |
| 活动 | 曙光橙 | #A05118 | #FAE9DD | #ECD2BE | #E9AF85 | 4.82 |
| 商城 | 谷物金 | #8A6410 | #F7EDD6 | #E7D6A9 | #E4C87F | 4.61 |
| 用户 | 苔紫 | #6C4E8C | #F0EAF7 | #DCCDEC | #C6ABE3 | 5.74 |
| 内容与设置 | 松石青 | #1F6E68 | #E1F0EE | #C0DFDB | #92C9C2 | 5.13 |

onDark 各值在 #193F34 侧栏底上对比度 5.74–7.14（≥4.5）。

### 语义色（状态胶囊、警示、反馈）

| 语义 | 文字 | 底 | 描边 | 对比度 | 覆盖状态 |
| --- | --- | --- | --- | --- | --- |
| success | #2E6B3F | #E7F2E4 | #C7DDBE | 5.54 | 已发布、已支付、免支付已确认、已发货、已完成、成功 |
| warning | #8A5A10 | #FBF1D9 | #EBD9A8 | 5.26 | 待支付、退款待审核、退款处理中、待发送、等待授权、排队中、处理中 |
| danger | #923B31 | #F7E8E2 | #E3C1B9 | 6.08 | 失败、已拒绝、错误（沿用原值） |
| info | #1D5F8A | #E4EFF7 | #C6DBEA | 5.89 | 已退款、结果未知、配置就绪提示 |
| neutral | #596A60 | #EFF1EB | #D9DFD5 | 5.05 | 草稿、已取消、已关闭、已下架 |

约定：warning 与商城模块色同属金色族、info 与运营模块色同属蓝色族，属有意共享（同一色相族在「状态语义」与「模块归属」两个语境使用，不并排出现冲突）；模块色不用于状态语义，状态色不用于导航归属。

### 应用规则

- 表头底 = 当前页模块 soft，表头文字维持 #596A60；选中页签、选中按钮保持品牌绿系（交互选中 = 品牌色，页面归属 = 模块色）。
- 侧栏保持深绿底；五个分组标签文字改用各自 onDark 色，形成导航层色彩层次。
- 页题左侧 4px 模块色标记（代码实现，画板同步）。
- 状态胶囊一律走语义色，不再沿用绿色 soft 表达「已支付/已发布」。
- 主按钮、危险按钮、表单焦点、登录页品牌分栏维持原样。

## 验收结果（2026-11-14）

| 验收项 | 结果 |
| --- | --- |
| Pen 结构校验 | 38 张画板逐节点替换后，除 fill/stroke 颜色与 variables 外结构逐字节一致；替换计数：61 处状态胶囊（success 21、warning 12、info 3、neutral 19、身份 user 6）、20 处表头（activity 6、ops 3、shop 3、user 5、content 3）、165 处侧栏分组标签（5 色 × 33）、variables 新增 32 个色板键；无未映射标签。脚本 `design/scripts/pen-web-admin-recolor-2026-11-14.py`，改前备份 `design/backups/设计图文件.pen.bak-recolor-2026-11-14`。 |
| 画板预览 | 脚本自渲染预览（非 Pencil 应用输出）`design/exports/web-admin-recolor-preview-2026-11-14.html` 截图核对侧栏五色与表头底色；最终呈现以 Pencil 应用打开该 .pen 为准，本轮环境无 Pencil MCP/编辑器连接，未在应用内复核。 |
| 对比度 | 全部文字/底组合 ≥4.5:1（success 5.54、warning 5.26、danger 6.08、info 5.89、neutral 5.05、五模块 strong/soft 4.61–5.89、onDark/侧栏 5.74–7.14）。 |
| 单元测试 | `npm test`（vitest）194/194 通过，`npm run typecheck` 通过，`npm run build` 通过；改动文件 Prettier 通过（仓库仍有 13 个本轮未触碰文件的历史格式问题）。 |
| 浏览器验证 | `WILDBOY_E2E_TARGET=current WILDBOY_E2E_ACCOUNT=1 WILDBOY_E2E_WRITE=1 node tests/e2e/admin-redesign-browser.cjs`：158/158 通过，浏览器脚本异常 0。隔离 API 127.0.0.1:19082（LocalSmokeServer，复用本机已有实例）+ Vite 127.0.0.1:15176。报告与 133 张截图见 `test-results/admin-redesign-browser/1794630209836-54c47/`（gitignore，本机留存）。 |
| 视觉抽查 | activities-1280（曙光橙表头+页题标记、已发布 success/已取消 neutral）、activity-orders-1280（曙光橙、订单徽标语义化）、operations-1280（湖蓝）、shop-1280（谷物金）、users-1280（苔紫表头；资料/角色徽标 success/neutral/info）、notifications-1280（湖蓝、未配置 warning）、articles-1280（松石青、草稿 neutral）、activities-390（窄屏卡片与胶囊）、login-1440（品牌分栏不变）均符合规范。 |

未验证/遗留：Pencil 应用内最终渲染与画板级微调（恢复方式见上文）；生产域名 wildboy.com.cn 的实际部署不在本轮范围。

## 生产部署记录（2026-11-14 14:00）

经用户确认后部署上线。生产原状：服务器 main（02835ec）是本地谱系的祖先，GitHub origin/main（4f91b7b）为同一会员定价功能的平行冗余实现。整合与发布过程：

1. 将本地完整工作区（含 V13–V23 迁移、服务端与管理端全部演进）固化为提交 ec00f3f；本地门禁：`mvn verify` 228/228、vitest 194/194、浏览器 158/158。
2. Flyway 预检：以生产库 flyway_schema_history 的 23 条 checksum 构造临时库，用部署树迁移文件执行真实 `validate`，23/23 通过（生产库已应用至 V23，本次部署零迁移，纯代码发布）。
3. `git merge -s ours origin/main`（122aee7）统一历史——GitHub 谱系仅多出已按需求下线的候补功能，其余内容均被本地谱系包含；推送 GitHub `4f91b7b..122aee7`。
4. 服务器 GitHub 连接超时（deploy.sh 第 1 步既有的已知风险），改走 SSH 直推：`deploy-staging` 分支推送后在服务器 ff-merge 至 122aee7，按 deploy.sh 第 2–5 步原样执行（凭据变量从凭据文件导出修正了脚本中未定义引用）。
5. 服务器烟雾检查全过：api OK、edge 凭据 200/匿名 403、admin OK。公网复核：https://www.wildboy.com.cn/ 200 且线上 CSS（index-Dqxc3bA1.css）含全部模块色/语义色令牌（--acc-*、--tone-*、--page-accent），https://api.wildboy.com.cn 公开接口 200，登录页截图正常。

回退方式：服务器 `git reset --hard 02835ec` + 重跑 deploy.sh 第 2–5 步（数据库 V23 与 02835ec 代码兼容，迁移文件在服务器谱系缺失不影响已应用状态）；更早回退用 .bak 恢复 Pen 设计。

## 改版覆盖表

| 编号 | 路由 | Pen 画板（id） | 模块色 | 实现文件 | 设计状态 | 实现状态 | 验证证据 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P01 | /login | Web / 管理员登录（PoJPW） | 品牌（不变） | LoginView.vue | 已更新（保持品牌） | 已实现 | login-1440.png；浏览器 158/158 |
| P02 | /operations | Web / 运营工作台（jooRk）、· 列表状态（mS4Tg） | 湖蓝 | OperationsView.vue | 已更新 | 已实现 | operations-1280.png；浏览器 158/158 |
| P03 | /notifications | Web / 消息管理（vMuxZ）、· 恢复通知（Sfyhp） | 湖蓝 | NotificationsView.vue | 已更新 | 已实现 | notifications-1280.png；notification-recovered-synthetic.png |
| P04 | /activities | Web / 活动管理（dxs6Q）、· 窄屏（UFr8b）、· 发布确认（jlF19） | 曙光橙 | ActivitiesView.vue | 已更新 | 已实现 | activities-1280/390.png |
| P05 | /activities/new | Web / 新建活动（CCqVo） | 曙光橙 | EditorView.vue | 已更新 | 已实现 | activities-new-1280.png |
| P06 | /activities/:id/edit | Web / 编辑活动（afpqo）、· 窄屏（YcrPD） | 曙光橙 | EditorView.vue | 已更新 | 已实现 | activities-id-edit-1280.png |
| P07 | /activities/:id/registrations | Web / 报名名单（A7gFGK）、· 查看资料确认（tSb5v） | 曙光橙 | RosterView.vue | 已更新 | 已实现 | activities-id-registrations-1280.png |
| P08 | /templates | Web / 活动模板（VZIjm） | 曙光橙 | TemplatesView.vue | 已更新 | 已实现 | templates-1280.png |
| P09 | /activity-orders | Web / 活动订单 · 全部（xHqTA）、· 待支付详情（XErK6）、· 退款审核（othlP）、· 窄屏（D02kiL） | 曙光橙 | ActivityOrdersView.vue | 已更新 | 已实现 | activity-orders-1280.png；画板预览 xHqTA |
| P10 | /shop | Web / 商城管理（jv8du）、· 装备订单（jLyLI） | 谷物金 | ShopView.vue | 已更新 | 已实现 | shop-1280.png；shop-tab-orders-*.png |
| P11 | /shop/categories | Web / 商品分类（Z4snv） | 谷物金 | ProductCategoriesView.vue | 已更新 | 已实现 | shop-categories-1280.png |
| P12 | /refunds | Web / 退款售后（kc418）、· 申请审核（pKPcb） | 谷物金 | RefundsView.vue | 已更新 | 已实现 | refunds-1280.png |
| P13 | /users | Web / 用户管理（udj84） | 苔紫 | UsersView.vue | 已更新 | 已实现 | users-1280.png；画板预览 udj84 |
| P14 | /memberships | Web / 会员管理 · 等级列表（x9gG8s）、· 业务身份（V6uBE）、· 等级编辑（vruDl）、· 分配（Asyql） | 苔紫 | MembershipsView.vue | 已更新 | 已实现 | memberships-1280.png |
| P15 | /articles | Web / 文章管理 · 列表（hSL6j）、· 草稿编辑（HpfmJ）、· 官方介绍确认（pF4I3） | 松石青 | ArticlesView.vue | 已更新 | 已实现 | articles-1280.png；article-publish-confirm-desktop.png |
| P16 | /legal | Web / 协议管理（Pr4cO） | 松石青 | LegalView.vue | 已更新 | 已实现 | legal-1280.png |
| P17 | /settings | Web / 基础配置 · 四入口（DbJts）、· 弹窗内容（xNcp5）、· 版本冲突（k0nVX）、· 窄屏（yJl1Q） | 松石青 | SettingsView.vue | 已更新 | 已实现 | settings-1280.png |
| P18 | /settings/admin-account | Web / 管理员账号（UHolL）、· 修改（jwaEj） | 松石青 | AdminAccountView.vue | 已更新 | 已实现 | settings-admin-account-1280.png |
| S01 | 全局外壳 | 38 张画板共享侧栏/顶栏 | 分组 onDark 五色 | App.vue、style.css、statusTone.ts | 已更新 | 已实现 | 各截图侧栏五色分组；画板预览 |

共用层（外壳、状态胶囊、表格、弹窗、UiState、表单反馈）按 S01 统一覆盖 P01–P18 全部页面，不以单页数量统计完整性。

## 回退

- 实现回退：撤销本轮 admin/src 提交即可（`git revert` 或按提交回退）；状态色与模块色集中在 style.css 变量、statusTone.ts 与 App.vue 的 data-module/data-group 绑定。
- Pen 回退：用 `design/backups/设计图文件.pen.bak-recolor-2026-11-14` 覆盖 `design/设计图文件.pen`；确认新稿已可用后可删除该备份。

## 验收标准

1. Pen：38 张画板逐张完成模块色/语义色映射，JSON 结构校验通过（节点数、id 集合与改前一致），替换映射表留档。
2. 代码：`admin` 下 vitest 全绿、`vue-tsc --noEmit` 与生产构建通过、改动文件 Prettier 通过。
3. 浏览器：沿用 `tests/e2e/admin-redesign-browser.cjs`（隔离 API 19082 + Vite 15176），布局检查与功能检查全通过，截图覆盖 7 视口 × 18 路由，无页面级横向溢出、无捕获脚本异常。
4. 对比度：新色彩组合按上表全部 ≥4.5（文字）/≥3（图形）。
5. 视觉核对：桌面与 390px 窄屏抽查截图确认五模块色呈现、状态胶囊语义正确、品牌绿仍主导关键操作。
6. 回退：.pen 与 `admin/src` 均在独立提交中，可按提交回退；色值映射脚本可逆（旧→新映射表反向即回退映射）。
