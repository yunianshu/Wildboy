# 后台首页配色候选

2026-11-17。按用户要求，仅以同一个后台首页制作三版供选择；未将候选色应用到代码或小程序首页。

设计源为 `design/设计图文件.pen`，对比画板 `pcVOv`；已有页面和 rf-* 变量保留，新增 pv-* 变量仅供候选页使用。设计保存后已通过 Pen MCP 重新读取，见 `design-readback.json`。三版布局检查均无越界。

| 方案 | 页面节点 | 主色 | 页面底色 | 预览 |
| --- | --- | --- | --- | --- |
| A 向日葵黄 | A8jxr | #F5D540 | #FCFBF5 | [查看](A8jxr.png) |
| B 珊瑚红 | g8JtA | #F18479 | #FFFAF7 | [查看](g8JtA.png) |
| C 青柠绿 | Tp4bU | #CAE76B | #F8FAF3 | [查看](Tp4bU.png) |

[三版对比](pcVOv.png)。布局、字段与演示内容一致，比较配色；展示数据不写入业务接口。按钮文字对比度分别 9.37、5.67、8.68，辅助文字均大于 4.5，字段边界均大于 3。

网上参考：[Canva Pollen for Purpose](https://www.canva.com/colors/color-palettes/pollen-for-purpose/)、[From the Bunch](https://www.canva.com/colors/color-palettes/from-the-bunch-2/)、[Natural Juice](https://www.canva.com/colors/color-palettes/natural-juice/)。界面色值经过适配，并非逐项复制参考色板。

状态：候选预览，等待用户选择。当前代码仍为上一版；此前构建与业务验证报告不代表候选色已实现。
