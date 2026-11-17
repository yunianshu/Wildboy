# B 莓果晴天 · HTML 预览交付记录

预览：`design-demos/dir-2.html`，可通过 `http://127.0.0.1:15483/dir-2.html` 查看。HTML 内嵌全部照片、原始 Logo 与 Noto Sans SC 字体子集，不依赖外部图片或脚本。

## 设计读回

- 通过 Pencil MCP 重新读取 H3X2a 与 HyvJK 的完整 raw、resolved、布局和 18 个 hd-b-* 变量；未通过文件系统读取加密 .pen。
- 记录：`design-readback-B.json`。SHA256：`851ea2445a7beac55edc740e98326131935f01e04a6e5039a9a5e9f27e9022e1`。
- 设计映射：`design-mapping-B.json`。首页对应 H3X2a，发布弹窗对应 LhnkF，导航展开对应 DxRMM，空状态对应 M0fAx；其余组件及 8 张卡片 ID 已记录。
- HTML 最终 SHA256：`3ac3f0dfe94140d76ed7d3e3386d0879f511b28169b21dfb5ba2cb5de9485a5f`。
- 数据从 Pen 活动卡元数据取得，与 sample-data.json 的 8 条标题、分类、地点、时间、价格、名额、待支付、状态、图片逐项断言一致；15 个导航入口从 Pen 菜单读取。

## 实际功能

- 仅按 title 查询，查询按钮及 Enter 提交；分类、状态变更立即筛选；重置及无结果重置。
- 收费订单与免费名单入口分别显示；待支付只显示收费且非零项。价格为两位小数与元/人，免费项显示免费。
- 五类导航保留 15 个真实入口。非当前页、新建、编辑、订单、名单、退出登录均给出明确预览反馈，不请求后台，不伪造保存或发布成功。
- 顶部“设计预览”打开与 Pen 一致的发布确认，未给活动列表新增发布动作。保留原文案；Esc、关闭、取消、确认均恢复焦点到预览触发器，Tab/Shift+Tab 保持在弹窗内。
- 桌面两列四行；手机单列左图右字段，自然滚动。按钮与输入最小 44px，正文至少 14px，标签最低 12px。

## 打磨与验证

已运行技能 polish.py shot 两轮，逐张打开 1440×900 桌面及 390×844 手机分屏图，并另实测 375×812。第一轮修正手机字号、图标尺寸、筛选可访问名称、弹窗焦点循环和菜单锚定。未改 Pen 或生产代码，无需再次保存 Pen。

- 自定义验证 `verify-B.py`：55 项全部通过，零页面错误与控制台错误。报告 `design-demos/B-html/final/validation.json`。
- `design_lint.py check`：1440×900、375×812 均零红灯和零黄灯。结果 `design-demos/B-html/lint-desktop.json` 与 `lint-mobile.json`。
- 技能 `verify.py`：1440×900、375×812 均通过，JavaScript 与 Console 干净。输出 `design-demos/B-html/verify-skill.txt`。
- 实测：8 张卡片、6 个收费订单入口、2 个免费名单入口、2 个非零待支付；title 匹配与地点不匹配、组合筛选、无结果、15 个导航节点、无横向溢出、离线图片加载、44px 控件、弹窗焦点与样例状态不变。

## 截图路径

| 用途 | 路径 |
|---|---|
| 桌面首轮 | design-demos/polish/dir-2/round-1/桌面-01.png |
| 桌面最终 | design-demos/B-html/final/home-1440x900.png |
| 375 首屏最终 | design-demos/B-html/final/home-375x812.png |
| 375 完整页 | design-demos/B-html/final/home-375x812-full.png |
| 桌面发布弹窗 | design-demos/B-html/final/dialog-1440.png |
| 手机发布弹窗 | design-demos/B-html/final/dialog-375.png |
| 无结果 | design-demos/B-html/final/empty-1440.png、empty-375.png |
| 导航展开 | design-demos/B-html/final/menu-1440.png、menu-375.png |

共享 polish-log.md 仅补充 dir-2.html 的两轮条目，保留其他方向记录。
