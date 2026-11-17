# 莓果晴天 · B 方案全端实施（2026-11-17）

用户已确认采用 B「莓果晴天」（`design/proposals/huashu-v3/direction-approved.md`），不再进行方向选择。上一代阳光柑橘已否决，其画板已加 `[历史·柑橘]` 前缀保留。

## 顺序

修改 Pen（扩展 B 体系）→ 结构自检保存 → 实际读回结构化数据 → 生成两端变量 → 实施生产界面 → 构建/运行/逐页验证 → 清理缓存复验。

## 设计依据

- 源文件 `design/设计图文件.pen`（Pen v2.22 JSON，本会话无 Pen MCP，沿用仓库「脚本编辑 + 备份 + 结构校验」约定；备份位于 `design/backups/`）。
- B 组件：主按钮 iLJFv、次按钮 G36zmt、轻按钮 CG8d0、输入/选择 fsh8n、状态 I8Qyzu、空状态 M0fAx、发布确认 LhnkF、分组菜单 DxRMM；新增 B 化通用组件：Web 弹窗、小程序弹窗、移动主按钮、移动输入（见 `design/proposals/huashu-v3/berry-artboard-map.json`）。
- 变量统一 `hd-b-*`（35 项）。核心：主色 `#B93858`、悬停 `#9E2845`、浅粉 `#FDEEF1`、页面底 `#FFFAFB`、卡片白 `#FFFFFF`、正文 `#33242A`、弱文字 `#755E67`、边线 `#E8DCE0`、输入边框 `#A98D97`。
- B 扩展语义色（danger/info/导航/弹窗几何等 17 项）延续暖莓语系：danger `#B03A2E`、danger-bg `#FBEAE6`、info `#6E4A63`、info-bg `#F4EBF2`、焦点圈用主色（白底对比 5.57:1）。这些为 B 体系的显式扩展变量，已写入 Pen 并随读回生成（非凭空实现补充）。
- 读回：`pen-readback.json`（100 画板 raw+resolved+layout，SHA-256 `c336c4ce…`）；映射 `design-map.json`；页面清单 `inventory.json`（51 页，业务事实沿用柑橘代审查）。

## 覆盖

- Web：全部 21 有效路由 + 附属弹窗/窄屏状态；外壳改为 B 顶部横向导航（72px）+ 子导航行（44px），`/activities` 为两列左图右信息卡片（H3X2a），其余页面沿用各自任务布局整体换 B。
- 小程序：除首页外全部页面与状态稿换 B 色彩与组件语言；布局为移动端组织，共享受保护组件（custom-tab-bar、ui-state、content-view、markdown-view）不动。
- 首页 `pages/home/index`：**2026-11-17 用户追加指令——排版不变、颜色换 B**。新增首页换色画板（bM77V/bSWCk）后仅对 4 个 wxss 做颜色值替换（home/app/tab-bar/ui-state 原版，后者仅首页使用）；wxml/ts/结构 json 零改动，git diff 逐行审计证明非颜色差异为 0。新基线 `home-baseline-berry.json`。

## 实施要点

- 双端继续由 `--rf-*` 令牌驱动（历史命名，内容为 B 值）：`scripts/ui-refresh-tokens.py` 从本版读回生成 `admin/src/styles/tokens.css` 与 `miniprogram/src/styles/slate-tokens.wxss`。
- Web 控件统一 44px 高、10px 圆角、弹窗 16px 圆角 24px 内边距；移动主操作/输入 48px。
- 保持接口、字段、校验、权限、路由参数与业务规则；搜索仅标题、分页 size=8、分转元两位小数、免费/收费分流、待支付仅收费且数量>0、状态仅 DRAFT/PUBLISHED/CANCELLED。
- 「设计预览」标记仅存在于原型，不进入生产。

## 验证与边界

- `npm test`、`npm run build`（admin），`npm run build`+`npm test`+`npm run typecheck`（miniprogram），浏览器逐页检查（桌面/窄屏/键盘/弹窗）。
- 微信开发者工具原生验证在本环境不可用时如实标注。
- 缓存清理仅限本次构建/预览产物，不动登录、草稿、用户数据与数据库。
