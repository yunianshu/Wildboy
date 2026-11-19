# 已作废的中间路线记录

用户后续明确要求“不要参考 B 方案，从项目功能角度设计”。以下仅为历史工作记录，不代表最终交付。沿用 B 结构的中间节点已从工作文档移除；最终以 functional-design-brief.md、功能蓝图与最终验证记录为准。

# A Pen redesign work log (2026-11-18)

## Source protection

- The pre-redesign file was copied to `design/backups/设计图文件.pen.20261118-before-dawn-a.bak`.
- Original and backup SHA-256: `943510d348734db986fe961dedc404db8d24ab3f399cea830fd0fa916c97feb7`.
- The original B version also remains in Git history.

## Editing method

All design mutations use the installed official Pencil MCP server and its documented `execute` API. The current document was confirmed before editing. No shell serialization was used to modify the `.pen` file.

- Recreated the A activity table from the archived A structured readback as editable nodes.
- Rebuilt 35 desktop shells from horizontal B navigation to the 196px A sidebar while preserving business fields and states.
- Applied A theme variables and semantic state colors throughout the editable document.
- Retained compatibility aliases for old component instance overrides; their values are A, not B. This avoids breaking existing reusable references.
- Explicitly reviewed desktop, categories, operations, login, mobile activities and membership screenshots.
- Narrow Web pages, the component reference and the mini-program home design are undergoing separate layout corrections against current implementation.

The final readback, coverage summary, screenshots, save verification and commit are recorded after completion, not inferred from this work log.

# Mini admin board removal (2026-11-18)

## Change

The mini program dropped its in-app admin UI (management moves to the Web admin). Using the official Pencil MCP `execute` API only:

- Deleted 20 mini-program boards: 12 admin page boards (`pages/admin-*`), 7 admin-only state boards, and the legacy `暂无管理权限` (auth-required) state board. The content-version-conflict state board only applied to admin pages and was removed with them.
- Cleaned the `pages/login` board (removed 管理员入口 header and 管理员登录 action) and the `pages/mine` board (removed the 管理入口 · 仅管理员可见 section with its 7 rows).
- Deleted the 19 corresponding preview PNGs and synced `functional-preview-index.md` (74 → 54 boards), `functional-pen-index.json` (web 22 / mini 19 / mini-state 6 / web-state 6 / system 1), `functional-mini-blueprints.json` (19 pages / 7 state boards), `functional-mini-inventory.json`, `functional-mini-renderer-test.json` and `functional-verification.md`.
- Pre-change backup: `design/backups/设计图文件.pen.20261118-before-remove-mini-admin.bak` (74 boards / 4,250 nodes). Post-save verified on disk: 58 top-level nodes (54 boards + 4 section headers) / 3,462 nodes; button text centered across all 156 actions.
- Screenshots of `pages/login` and `pages/mine` re-checked after cleanup: admin entries gone, layout intact.
