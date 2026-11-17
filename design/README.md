# design/ 目录说明

本目录只维护**一个设计源文件**和少量**仍被文档引用的验收清单**；其余按类型归档。

## 当前生效（根目录）

| 文件/目录 | 用途 |
| --- | --- |
| `设计图文件.pen` | 唯一设计源文件（Pen v2.22 JSON，148 画板）。被 DESIGN.md、docs/redesign/* 引用 |
| `pen-session.json` | 历次 Pen 会话的入口指针（索引节点、组件库、各端起点节点 ID）。编辑器文件已失效，仅留节点索引参考 |
| `web-admin-manifest.json` | Web 后台画板索引（`Web /` 代，41 张，覆盖 20 条路由） |
| `admin-manifest.json` | 旧代「后台 /」画板索引（36 张，DESIGN.md 历史验收依据） |
| `mobile-user-manifest.json` / `mobile-admin-manifest.json` | 小程序用户端 / 管理端画板索引 |
| `explore-baseline.json` | 小程序首页（探索页）保护基线，PRODUCT.md / DESIGN.md 引用 |
| `assets/` | 首页参考截图等素材 |
| `exports/` | 按节点导出的 PNG 与预览页 |

## scripts/ —— 一次性设计编辑脚本（归档）

历次对 `.pen` 做批量增改/换肤的脚本，**运行一次即完成使命**，保留作为操作留痕：
`pen-web-admin*.js/py`（Web 代画板生成与 v1/v2 换肤）、`pen-mobile-admin*.js`（管理端画板）、
`pen-user-catalog-extension.js` + `update-users-catalog-manifests-*.py`（用户目录扩展）、
`pen-ui-refactor-2026-11-16.js`（补 5 画板 + 侧栏导航项）、`read-design-map-2026-11-16.js`（回读生成 design-map）。

注意：旧脚本的相对路径按原根目录位置写死，重跑前需先核对路径；
`pen-ui-refactor-*` 与 `read-design-map-*` 已改为从 `scripts/` 目录解析上级文件，可直接 `node design/scripts/<脚本>` 运行。

## history/ —— 被取代的会话快照（归档）

`explore-baseline-*`（首页基线的历次版本，生效版在根目录）、
`users-catalog-design/export-index-2026-10-31.*`（用户目录专项的设计数据与导出索引）。

## backups/ —— .pen 修改前备份

命名 `设计图文件.pen.bak-<主题>-<日期>`（recolor、article-editor、ui-refactor）。
git 已版本化 `.pen` 本体，此处备份仅为大改前的即时回退点，可按需清理。

## 约定

- 新的设计增改：新脚本放 `scripts/` 并带日期后缀；改 `.pen` 前先复制一份到 `backups/`；保存后做 id 唯一性与结构校验（参照 `pen-ui-refactor-2026-11-16.js` 尾部）。
- 设计→实现的映射维护在 `docs/ui-refactor/design-map.json`（由 read 脚本从已保存文件回读生成）。
