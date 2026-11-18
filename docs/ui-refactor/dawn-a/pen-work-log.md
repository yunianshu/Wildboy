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
