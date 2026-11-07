# 候补功能移除记录

2026-10-31，按用户“把候补功能删了，设计稿中相关的也删了”实施。小程序、网页后台及后端均删除该功能，满员活动显示“名额已满”，不再提供加入、预留名额、确认、取消队列或后台名单。普通报名、多人参与、报名取消、行前/活动变更/取消通知及商品交易保留。

## 代码和数据

- 小程序删除 `pages/waitlist/index` 的四个源文件及路由；清理我的、报名记录、详情、报名表和通知中的关联入口、参数、类型及文案。普通消息的授权与加载/账号切换保护保留。
- Web 删除名单页面、路由及侧栏入口，旧 `#/waitlist` 自动回到活动管理；活动消息的配置、授权恢复和受限重试仍有效。
- 后端删除 Controller、Service、队列确认、名额预留、取消释放和定时递补。正常报名按实际报名人数与容量判断。普通通知独立由 `NotificationController` 提供，只允许 `PRETRIP`、`ACTIVITY_CHANGED`、`ACTIVITY_CANCELLED`。
- 已应用的 V11 不修改。V14 为旧候补通知设置 `retired_at`，未完成通知转为 `OBSOLETE`；普通列表、发送扫描和重试均排除这些记录。保留历史表、原通知内容及已有报名，不执行删库或业务清库。
- 实网发现缺失路由被 Servlet `/error` 二次分派成 401；`ApiErrors` 直接生成 JSON 404，认证/权限规则保持原约束。

升级前后对 22 张表核对行数和内容摘要，全部匹配；通知摘要仅排除 V14 必须更改的状态、错误说明、更新时间与退役时间。迁移从 V13 成功升至 V14。随后登录验证产生的正常会话记录单列，不混入迁移前后的数据比较。历史验收活动名称中仍可能包含旧功能词，属于保留的业务标题，不是可用入口。

数据库证据：`test-results/waitlist-removal-2026-10-31/database-before.txt`、`database-after.txt`；启动日志 `api.log`。应用通过独立 runtime JAR 启动，避免后续 Maven 打包覆盖运行中的 JAR；PostgreSQL 与 Node 局域网代理持续保留。

## 设计交付

直接修改 Pen 可编辑文档，删除三个顶层画板及其导出图：

| 画板 | 节点 |
| --- | --- |
| 小程序我的候补 | `JjKjJ` |
| 整组确认与截止状态 | `n219aS` |
| 后台候补名单 | `BSuge` |

同时删除其他 35 张后台稿中的侧栏菜单，清理我的、活动列表、详情、满员状态、参与人数不足状态、活动消息、登录说明、取消活动确认及范围索引中的关联内容。我的服务区自然收紧；满员为禁用动作；消息示例改为活动变更与行前提醒。

全画布 86 个顶层节点扫描：关联引用 0，展开组件实例后的布局问题 0。变更稿重新导出，三个废弃 PNG 已删除。当前清单与文件映射为用户主屏 14 + 状态/变体 11、小程序管理稿 22、Web 稿 36，所有导出文件存在。探索页 6 个受保护源文件/素材 SHA256 与基线全部一致。

证据：`test-results/waitlist-removal-2026-10-31/design-audit.json`、`design-source-check.json`；当前三个 manifest 及 `design/exports/`。旧审查与验收文档保留实际历史证据，并在顶部声明本功能已退出当前范围。

## 自动化验证

| 范围 | 实际结果 |
| --- | --- |
| 小程序完整构建与测试 | **345/345**，`test-results/waitlist-removal-2026-10-31/miniprogram-tests.log` |
| 小程序临时编译及受影响回归 | **248/248**，`test-results/remove-waitlist-2026-10-31/targeted-tests.log` |
| Web 完整测试 | **96/96**，生产构建、类型及格式检查通过 |
| 后端完整测试（移除主体） | **136/136**，`test-results/waitlist-removal-server-verify.log`；首次最终打包受 Windows 运行 JAR 占用影响，释放后打包成功，见 `waitlist-removal-package.log` |
| 后端实网 404 修正后相关回归 | **45/45**，含新增 2 项真实 Tomcat HTTP 测试，`test-results/waitlist-removal-http404-tests.log`；最终打包成功，见 `waitlist-removal-http404-package.log` |

后端当前测试库存为 138 项；上述为实际执行批次，不声称最后一次完整重跑了 138 项。最终 JAR 中旧业务 class 数为 0，仅保留必要的历史和退役数据库迁移。真实 HTTP 回归同时验证匿名/无效凭据 401、普通用户访问管理接口 403、有效用户旧路由 404、正常 `/me` 200。

## 运行与界面复验

局域网仍使用 `http://192.168.1.189:19080`，Web 为 `http://192.168.1.189:15174/`。小程序每次构建后重新应用 LAN 配置，源码生产环境配置保持原约束。

真实浏览器已检查旧链接回退及 1440/1280/390 三个宽度：九项现存管理导航、旧菜单消失、消息页刷新后无旧候补提醒、无页面横向溢出。见 `test-results/waitlist-removal-2026-10-31/browser-report.json` 与同目录截图。

微信开发者工具官方 SDK 复验已完成，17 张截图见 `test-results/remove-waitlist-2026-10-31/latest-evidence-index.json`，聚合报告 `native-report.json` 为 `passed=true`。实际页面/组件处理器与原生渲染测量验证：我的服务区仅活动消息和收货地址、上方间距16px且无遗留空行；普通报名可直接主动勾选；普通消息真实空态正常。正常页面21次请求中，旧接口请求、业务写入、HTTP失败、应用异常均为0。

首页实际六个活动、四商品、原透明标识216px、底栏14px与安全区、三个标题和胶囊中心对齐、分类滚动及商城返回缓存均通过复验。满员不可报名及满员已有组的取消按钮使用明确标注的视觉合成；当前USER的两条历史报名均已取消，没有新造报名或执行取消来替代真实前提。处理器行为由隔离回归覆盖。报告保留验收脚本selector/分页参数/渲染等待的修正过程，首轮脚本中止不当作应用异常或单次完整成功；最终续跑与补充渲染分别通过。

最终实网检查 `test-results/waitlist-removal-2026-10-31/http-after.json` 为通过：五类旧候补接口及原通知重试均返回404，普通用户及管理账号有效，普通消息列表正常且旧消息不再展示，LAN健康检查UP。最终API PID4932，使用 `server/target/runtime/wildboy-server-waitlist-removed-http404-20261031.jar`，启动证据 `api-final.log`。Node代理、Web及原数据库保留运行。

手机预览已重新生成：`test-results/waitlist-removal-2026-10-31/preview-no-waitlist.png`，包大小1,934,826字节；`preview-info.json`为官方CLI结果。这是本地调试预览，没有发布正式版。SDK临时观测hook已还原、连接已断开，保持原有效USER及探索页选中状态。
