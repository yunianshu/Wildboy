# 野小子 · B 莓果晴天设计体系

使用 huashu-design v3.3.0 制作。2026-11-17 用户选定 B「莓果晴天」（见 direction-approved.md），同日由交接 AI 扩展到全端并落地生产（v1.0.3 / v0.2.5 已上线）。**2026-11-18 清理**：按用户指令，设计源只保留 B 当前代——删除初代 2 板、柑橘 103 板、A/C 提案 6 板与 169 个历史变量（清理脚本 `cleanup-pen.py`，旧版本在 git 历史与 `design/backups/` 留档）；A/C 演示 HTML 与小样同步删除。

## 查看

- [B 莓果晴天可点击原型](http://127.0.0.1:15483/dir-2.html)：横向导航和图片卡片，适合通过活动封面辨认路线。

服务未运行时，执行 `python design/proposals/huashu-v3/preview-server.py`，或直接打开 `design-demos/dir-2.html`。本地预览响应设置 no-store，不读取生产登录状态，不写后台数据。

## 可编辑设计索引

设计源 `D:/AiProject/Wildboy/design/设计图文件.pen`，仅含 B 体系：

| 内容 | 画板 |
|---|---|
| Web 活动首页（已实现） | H3X2a |
| 组件与弹窗（含 8 个 B 组件定义） | HyvJK |
| 全端 B 画板（Web/小程序/状态稿/首页换色/订单中心） | 共 109 根画板，映射见 `berry-artboard-map.json` 与 `docs/ui-refactor/berry/design-map.json` |
| 变量 | 35 个 `hd-b-*`（令牌链 `scripts/ui-refresh-tokens.py` 依赖） |
| 首页基线占位（保护对象标记） | Q78i6 |

原始三方向对比数据仍在 git 历史（97060bd 及以前）；B 的实际结构读回为 `docs/ui-refactor/berry/pen-readback.json`。

## 范围与后续

小程序首页 81 文件保护摘要见 `docs/ui-refactor/berry/home-baseline-berry.json`（2026-11-17 起首页按用户指令改为保排版换色）。生产实施与双端验证记录：[plan](../../../docs/ui-refactor/berry/plan.md)、[verification](../../../docs/ui-refactor/berry/verification.md)。微信订单中心接入说明：`docs/wechat-order-center.md`。
