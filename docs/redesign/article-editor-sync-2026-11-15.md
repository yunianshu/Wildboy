# 文章编辑器设计同步与验收（2026-11-15）

2026-11-14 v2 换肤验收之后，`054b3f3`（Vditor Markdown 编辑器）、`b5a281a`（文章编辑器改为独立页面式双布局）与 `cb1d8c5`（图片一律上传）三个提交改变了界面，但未同步 Pen 设计文件，其中文章编辑页两条新路由也缺少画板。本轮补齐该差量，并修复同步过程中发现的一个真实窄屏缺陷。

## 改版覆盖表（本轮差量）

| 编号 | 功能 / 页面 | 角色 / 入口 | 实现位置 | Pen 画板 | 验收标准 | 设计 | 实现 | 验证证据 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A1 | 文章编辑 · 工作台布局 | 管理员，文章管理 → 新建 / 编辑文章 | `admin/src/views/ArticleEditorView.vue` | `Rkx83`（新增） | 顶栏（返回、状态、布局切换、保存提示、保存 / 发布）与左右分栏画布一致；草稿态发布按钮随未保存内容禁用 | ✅ | ✅ | 158/158 浏览器验收 + `article-publish-confirm-desktop.png` |
| A2 | 文章编辑 · 文档布局 | 管理员，编辑页顶栏「文档」 | 同上（Teleport 换挂载点） | `MYBYC`（新增，900 高） | 属性行、大标题、摘要、16:9 封面浮动操作、正文与页脚一致；已发布态顶栏为下架 / 官方介绍 | ✅ | ✅ | 同上 + `article-official-confirm-desktop.png` |
| A3 | 新建文章空态 | 管理员，文章管理 → 新建文章 | 同上 `/articles/new` | `LzCfb`（重建，替换旧模态稿 `HpfmJ`） | 标题 / 摘要 / 封面上传 / 关联活动空态与「保存草稿后可写正文」提示 | ✅ | ✅ | 158/158（articleWorkflow 走 `/articles/new`） |
| A4 | 窄屏编辑器 | 管理员，≤720px | 同上 `@media 720px` | `TNona`（新增 390×900） | 单列布局、顶栏换行、无横向溢出 | ✅ | ✅（修复 A7 后） | 158/158 + `editor-390.png` 溢出为 0 |
| A5 | 发布 / 官方介绍确认 | 管理员，编辑页顶栏 | `ConfirmDialog` | `P6RC06`（替换旧 `pF4I3`，底稿换成编辑页） | 确认文案含替换影响；取消不改状态 | ✅ | ✅ | 158/158（发布 / 官方确认各桌面 + 窄屏截图） |
| A6 | 弹窗图片仅上传 | 管理员，基础配置 → 编辑入口 | `admin/src/views/SettingsView.vue` | `xNcp5`（就地更新） | 移除 URL 手填字段，仅保留上传与未配置提示 | ✅ | ✅ | `design/exports/web-admin-article-editor-2026-11-15/xNcp5.png` |
| A7 | 窄屏横向溢出（缺陷） | 管理员，≤720px 编辑页 | `ArticleEditorView.vue` | — | 390px 文档宽度 ≤ 视口 | — | ✅（本轮修复） | 修复前 392/390，修复后 390/390，158/158 |
| A8 | 验收脚本过期 | 自动化 | `tests/e2e/admin-redesign-browser.cjs` | — | articleWorkflow 与页面式编辑器一致，断言强度不降低 | — | ✅（本轮更新） | 更新后 158/158 |
| A9 | 小程序文章详情画板缺失 | 微信用户，探索页文章 / 官方介绍 | `miniprogram/src/pages/article/` | `jy5Vc`（新增） | 基线样式（纸色 / 森林绿）、封面 / 标题 / 摘要 / markdown-view 正文 | ✅ | ✅ | `design/exports/mobile-user/jy5Vc.png`；页面既有测试 519/519 |
| A10 | 小程序画板误染 v2 色（缺陷） | — | `design/设计图文件.pen` 共享 `$wb-*` 变量 | 全部小程序 / 旧版画板 | 小程序画板色板与实现一致（`app.wxss` 纸色 #f6f4ed、森林绿） | ✅（本轮恢复） | — | `r5wRDb` 前后截图；Web 画板 `$wb-*` 引用数为 0，恢复零影响 |

排除项：`hSL6j` 文章列表画板经逐文本比对与 `ArticlesView.vue` 现状一致，无需改动；活动编辑画板（`CCqVo` / `afpqo`）封面区已从「选择封面」按钮改为「活动封面（上传）+ 更多图片（最多 8 张）」上传区并随本轮导出。

## Pen 设计变更

- `design/设计图文件.pen` 新增 4 张 Web 画板（`Rkx83`、`MYBYC`、`LzCfb`、`TNona`）、替换 2 张（`P6RC06`、`LzCfb` 对应删除 `pF4I3`、`HpfmJ`），现共 **41 张 Web 画板覆盖 20 条路由**，索引见 [web-admin-manifest](../../design/web-admin-manifest.json)。
- 新增小程序文章画板 `jy5Vc`，移动用户屏清单 15 → 16（[mobile-user-manifest](../../design/mobile-user-manifest.json)）。
- `xNcp5`、`CCqVo`、`afpqo` 就地改为仅上传图片流。
- 恢复被 2026-11-14 v2 换肤脚本改写的 8 个共享 `$wb-*` 变量为小程序 v1 色板（`wb-bg #F6F4ED`、`wb-primary #193F34` 等）。Web 画板全部使用字面量色值（已核实引用数为 0），不受影响。
- 改动前备份：`design/设计图文件.pen.bak-article-editor-2026-11-15`；导出：`design/exports/web-admin-article-editor-2026-11-15/`（8 张）与 `design/exports/mobile-user/jy5Vc.png`。

## 实现变更

1. `admin/src/views/ArticleEditorView.vue`：窄屏媒体查询中 `.article-topbar` / `.workbench` 的硬编码 `-16px` 负边距改为 `calc(var(--admin-inset) * -1)`。`--admin-inset` 在 ≤720px 时为 14px，原写法导致 390px 视口左右各溢出 2px（`b5a281a` 引入）。同文件按 prettier 规则整理 14 行格式（既有违规，顺带修复使门禁通过）。
2. `tests/e2e/admin-redesign-browser.cjs`：`articleWorkflow` 从已删除的模态编辑器流程改写为页面式流程——`/articles/new` 建稿、真实封面上传、Vditor 防抖脏检下发布禁用、统一保存（先图文后资料）、发布与设为官方介绍确认（桌面 + 390px 溢出断言与截图），断言强度与原流程等同。

## 验证证据（隔离 QA 环境，未触碰生产）

| 门禁 | 命令 | 结果 |
| --- | --- | --- |
| admin 单测 | `npm test`（admin） | 193/193（修复后隔离复跑两轮一致） |
| admin 类型 / 构建 / 格式 | `npm run typecheck`、`npm run build`、`prettier --check` | 通过 |
| 小程序 | `npm test`、`npm run build`（miniprogram） | 519/519，构建通过 |
| 浏览器全量验收 | `node tests/e2e/admin-redesign-browser.cjs`（158 项） | **158/158，133 张截图，0 页面脚本异常**，报告 `test-results/admin-redesign-browser/1794730822656-6adea/report.json` |
| 溢出探针 | 390px 编辑页 `document.scrollWidth` | 修复前 392 → 修复后 390 |

后端本轮无代码改动，未重跑 `mvn verify`（最近全量 230/230 见 `054b3f3` 提交说明）。隔离 QA 数据库为 `LocalSmokeServer` 启动的一次性内嵌 PostgreSQL，写入均为合成数据并在运行末尾清理；下架商品、恢复配置与用户身份由脚本自动完成。

记录一次并行运行抖动：与浏览器验收同时执行的 `npm test` 出现过 1 例失败，隔离复跑两轮均 193/193，判定为资源竞争抖动，非本次改动引入。

### 浏览器验收复跑方法

```powershell
# 终端 1：一次性 QA 后端（内嵌 PostgreSQL，关闭即弃）
cd server
mvn -q test-compile dependency:build-classpath -Dmdep.outputFile=target/qa-cp.txt -Dmdep.includeScope=test
CORS_ORIGINS="http://127.0.0.1:15176,http://localhost:15176" java -cp "target/classes;target/test-classes;$(cat target/qa-cp.txt)" com.wildboy.LocalSmokeServer --server.port=19082 --server.address=127.0.0.1

# 终端 2：管理端 Vite（需 admin/.env.local：VITE_ENABLE_DEV_LOGIN=true，见 docs/admin.md）
cd admin
$env:API_PROXY_TARGET = 'http://127.0.0.1:19082'
npm run dev -- --host 127.0.0.1 --port 15176 --strictPort

# 终端 3：验收脚本
$env:WILDBOY_E2E_TARGET = 'current'
$env:WILDBOY_E2E_ACCOUNT = '1'
$env:WILDBOY_E2E_WRITE = '1'
$env:CHROMIUM_PATH = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
node tests/e2e/admin-redesign-browser.cjs
```

注意：`LocalSmokeServer` 必须带 `CORS_ORIGINS` 放行 15176，否则真实浏览器登录会被 CORS 拦截返回 403（`/auth/**` 免鉴权但 CORS 仍生效）。

## 遗留与回滚

- 遗留：微信真机、真实微信支付扣款 / 退款到账、订阅消息实际送达仍未执行（与 2026-11-14 记录一致，属既定验收边界）。
- 遗留：`tests/e2e/admin-redesign-browser.cjs` 不在 prettier 门禁范围内，HEAD 版本既有格式违规未处理（与仓库现状一致）。
- 回滚：设计文件还原 `design/设计图文件.pen.bak-article-editor-2026-11-15`；代码回退本轮两个文件的 git 改动即可（`ArticleEditorView.vue`、`admin-redesign-browser.cjs`），无数据迁移。
