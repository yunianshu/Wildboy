# C 杏黄留白 · 设计读回与验证记录

预览：http://127.0.0.1:15483/dir-3.html

设计源为已保存的 Pen 两个根 M894N / Nu5Gj。于 2026-11-17 保存版本之后通过 Pencil MCP 读取完整 raw、resolved、变量与布局，未读取加密 .pen 文件本体。

- design-readback-C.json SHA-256：d4c8333aacadf379e4b94cb790da134552f20f01d2b590e001a1b088b9d2ca0d
- 共 389 个解析节点，16 个 hd-c 变量，读回无裁切问题。
- 映射见 design-mapping-C.json；所有字段与 sample-data.json 的 8 行一致。
- 页面沿用本仓库 Vue 3.5.44，运行时、原始品牌图与五张封面均内嵌；单文件约 1.93 MB。
- 字体为本机栈 Noto Sans SC / PingFang SC / Microsoft YaHei。浏览器 CDP 实际报告日期、标题与正文均由 Noto Sans SC 渲染。
- 没有修改生产代码；HTML 阶段未修改 Pen，无须再次保存。

## 首轮实际观察

最伤的三处（写到哪一屏、哪个元素）：
1. 手机第 3 屏分页的“共 8 条”换行，上一页与下一页拆成两行，破坏了扫读。
2. 手机列表隐藏了表头，报名比例缺少“报名名额”标签；部分主体信息与按钮需要提升到 16px。
3. 弹窗键盘实测发现 Tab 循环会离开弹窗，且点击打开时返回检查按钮的焦点边框不稳定。

这一轮改了什么：
手机分页改成三格信息行和两格按钮行；补报名标签并提高手机主体字号；增加显式 Tab/Shift+Tab 约束，Esc 关闭后恢复触发器焦点，取消按钮用 :focus 保持 2px 焦点边框。


## 修正后复查

最伤的三处（写到哪一屏、哪个元素）：
1. 复查桌面 1440×900：八条名单、列对齐、静态 8 条/页和完整字段保持，未发现裁切。
2. 复查手机逐屏与 375×812：分页与报名语义已修复，八条数据可连续阅读，无横向溢出。
3. 复查桌面和手机发布弹窗：宽度 520px/343px，初始焦点、Tab 环与 Esc 返回触发器均通过；焦点边框已固定可见。

这一轮改了什么：
只修正焦点可见性并重新截图与交互验收。polish 的“连续只有文字和框”是统计阈值提示：44px 封面低于其 48px 图形计数阈值，且真实容量线不计入图形。已读 steady-track；本页是连续活动名单，不增加无来源图表或营销段落。每屏均保留实际封面、活动字段和容量比例。


## 检查结果

- polish.py shot：两轮，1440×900 与 390×844 逐屏截图都已实际打开。第一轮 1 张桌面和 3 张手机，第二轮同样逐张复查。
- design_lint.py check：退出 0，没有红灯或模板装饰。其“零圆角”外观信息没有解析 CSS 变量；实际控件使用读回的 4px 圆角。
- verify.py：1440×900 与 375×812 均退出 0、JavaScript 错误 0、Console 干净。
- test-c.py：23 项检查通过；完整结果见 interaction-results-C.json，包含 15 入口、标题查询、分类与状态组合、清空、空状态、刷新、价格、待支付、8 条固定分页、容量线、订单与免费名单、编辑新建退出的诚实反馈、弹窗和手机布局。
- 8 条容量比为 60%、37.5%、0%、40%、100%、18.75%、0%、0%；桌面 160px 轨道的填充宽度为 96、60、0、64、160、30、0、0px。
- 弹窗从独立“设计预览”工具打开，未把发布加入列表业务操作；确认操作不修改数据。Tab/Shift+Tab、Esc 和返回触发器焦点已经实测。
- 375px document/body scrollWidth 均为 375。所有可见控件操作区域高度达到 44px（搜索 input 位于 44px label 内）。
- 后台 API 请求数为 0；所有非本页导航明确返回设计预览反馈。

## 工具过程中的修正

bundled Python 不含 Playwright，使用主代理提供的 C:/Users/59290/AppData/Local/Programs/Python/Python312/python.exe，没有安装依赖。verify.py 首次受 Windows GBK 输出影响，改用 -X utf8 后通过。首个测试定位器将 type=search 误作 textbox，改为 searchbox；真正发现的焦点离开弹窗问题已修复后复测通过。

## 截图路径

- 首轮桌面：../polish/dir-3/round-1/桌面-01.png
- 最终桌面：final/desktop-1440x900.png
- 最终 375 首屏：final/mobile-375x812.png
- 最终 375 全页：final/mobile-375-full.png
- 最终分页：final/mobile-pagination.png
- 桌面弹窗：final/publish-dialog-desktop.png
- 手机弹窗：final/publish-dialog-mobile.png
- 全功能菜单：final/all-functions-desktop.png / final/all-functions-mobile.png
- 空状态：final/empty-state.png
