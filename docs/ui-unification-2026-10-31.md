# 小程序界面统一规范与验收记录（2026-10-31）

> **历史状态提示：历史候补证据已失效。候补功能及设计稿于 2026-10-31 按用户要求删除；当前范围与验收以 [docs/waitlist-removal-2026-10-31.md](waitlist-removal-2026-10-31.md) 为准。下文保留当时的实际证据，不代表当前仍提供候补功能。**

本轮整理覆盖微信原生小程序的用户页、管理页、按钮、间距、图标、公共状态与动效。设计依据见 [DESIGN.md](../DESIGN.md)，公共值由 `miniprogram/src/app.wxss`、`styles/motion.wxss` 和 `components/ui-state/` 维护。

## 统一规范

| 项目 | 约定 |
| --- | --- |
| 主按钮 | 最小高 48px，12px 圆角，14px / 600 字，水平内边距 16px；`#193f34` 底、`#fffdf4` 字 |
| 次按钮 | 与主按钮共用尺寸；`#e8ecdf` 底、`#193f34` 字 |
| 文字 / 图标动作 | 最小触控区域 44px；图标按钮为 44px 方形，文字动作透明森林绿 |
| 宽度 | 表单按钮满容器；并排动作等宽；筛选按内容宽。长标签可换行增高，同组动作对齐；订单动作采用两列 |
| 禁用态 | 保留原生 `disabled`，用同一条件绑定 `primary-disabled` / `button-disabled` 显式样式类，避免原生默认样式覆盖 |
| 颜色 | 米色页面 `#f6f4ed`、内容底 `#fffdf7`、辅助字 `#59664f`；危险操作采用 `#f7e8e2` / `#8b3028` |
| 间距 | 4、8、12、16、24、32px；页面两侧与卡片内边距 16px，区块间距 24px，字段间距 16px，标签间距 8px，操作间距 12px |
| 卡片与输入 | 卡片 12px 圆角；单行输入最小高 48px、12px 圆角 |

原生 checkbox 保留，触控区域至少 44px；协议链接独立打开正文，不通过点击链接自动勾选。功能说明、日期、订单号、库存等小字采用可读字号与高对比的辅助色。

首页保留四活动、四商品的展示布局、通栏装备横幅与底部平台品牌图。正文页边距为 16px，通栏区使用对应负边距；保留既定内容与原图结构，不恢复独立装备标题行或斜箭头。

## 图标与公共状态

`miniprogram/src/assets/icons/` 共 **20 个 SVG**：

`empty`、`error`、`chevron-right`、`back`、`close`、`plus`、`minus`、`share`、`activity`、`order`、`logout`、`settings`、`user`、`refresh`、`check`、`location`、`bag`、`mountain`、`plus-light`、`chevron-right-light`。

图标统一 24×24 viewBox、2px 描边和圆端 / 圆角连接，默认森林绿；两种 `light` 变体用于深色背景。常规图标显示为 24px，辅助箭头可用 16px，状态图标为 48px。交互图标保留文字或可访问名称，装饰图标不重复朗读。

截至 2026-10-31 00:17（Asia/Shanghai），按源码中 `<ui-state>` 开始标签实际统计为 **74 处，覆盖 24 个页面**。组件统一加载、空数据、整页错误及紧凑列表提示，保留场景文案与恢复按钮。整页加载、错误、空数据应互斥；已有内容的局部更新保留当前视图。

## 动效与降级

- 加载圈：800ms 线性旋转；常规 24px，紧凑模式 16px。提交按钮继续使用原生 loading。
- 页面：原生 `onShow` 时触发 170ms、透明度 `.92 → 1` 的轻淡入；根节点不缩放，固定底栏保留原定位。
- 弹层 / 按压：缩放 `.98 → 1`，180ms 阻尼曲线 `cubic-bezier(0.22, 0.9, 0.25, 1.1)`；按压的颜色与透明度反馈为 120ms。
- 路由：继续使用微信原生前进、返回、Tab 切换与滚动行为。
- 减少动态效果：宿主支持 `prefers-reduced-motion: reduce` 时关闭页面、弹层、按压及加载圈动画。没有可靠的微信 JS 偏好字段时不推断用户设置；默认内容保持可见，动画异常不阻断业务。

## 验收记录

| 项目 | 当前记录 |
| --- | --- |
| 小程序构建与自动化测试 | **244 / 244 通过**，含 TypeScript 与原生资源构建；[日志](../test-results/ui-unification-2026-10-30/miniprogram-tests.log) |
| 独立用户流程 | **45 / 45 通过**；[日志](../test-results/ui-unification-2026-10-30/workflow-tests.log)，不作为真机验收 |
| 探索页原生完整截图 | 已生成并交付，[PNG 363×2007](../test-results/ui-unification-2026-10-30/explore-full.png) |
| 规范重点原生复验 | **15 条观测通过、0 个捕获异常**；[报告](../test-results/ui-unification-2026-10-30/native-report.json) |
| 原十项问题的再次复核 | **16 条观测完成、0 个捕获异常**；[原修复验收与补验说明](ui-fixes-2026-10-30.md) |
| 实体设备 | **未执行**，iOS / Android 真机仍待验证 |

微信原生 v2 默认按钮宽约 184px，已通过显式 `ui-button-block` 覆盖并实际测量：登录、管理登录和商品管理的表单按钮为 **358×48px、12px 圆角、14px 字**；订单筛选为 **60×44px**，保持按内容宽。见 [登录按钮](../test-results/ui-unification-2026-10-30/login-buttons-icons.png)、[管理表单](../test-results/ui-unification-2026-10-30/admin-product-spacing.png)。

共享加载圈实际为 24px、800ms / linear；Tab 重复切换时交替动画名、时长 170ms，根节点 transform 为 none；弹层实际 180ms。见 [空态](../test-results/ui-unification-2026-10-30/shared-empty-state.png)、[加载](../test-results/ui-unification-2026-10-30/shared-loading-state.png)、[错误重试](../test-results/ui-unification-2026-10-30/shared-error-state.png)、[报名弹层](../test-results/ui-unification-2026-10-30/dialog-damped-entry.png)。槽内重试按钮恢复了实际商品数据。

最后补齐原生按钮横向默认 margin 的优先级，弹层关闭控件实测 **44×44px、距右边 16px、横向 margin 为 0**，见 [最终 CSS 复验](../test-results/ui-unification-2026-10-30/final-css.log)。此处样式调整后的四项触控与对比检查也通过。

消息、候补、订单的首屏失败以合成页面状态注入；原生观测均只显示一个 error 组件，没有错误和空态同时出现或重复错误。空商品列表和加载状态同样只用于客户端观测，不改变服务端库存、账号或业务记录。测试结束恢复原 USER 会话，未提交订单、支付、发布协议或保存业务表单。减少动态效果分支有代码回归覆盖，未伪称已在实体设备验证该系统偏好。

截图与报告位于本地忽略目录 `test-results/`，不随 Git 源码分发。局域网入口、复现命令及连接条件见 [局域网联调](lan-debug.md)；另一台实体设备的网络与界面表现尚未实测。
