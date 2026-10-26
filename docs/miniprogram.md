# Wildboy 微信小程序

## 技术与目录

原生 TypeScript + WXML + WXSS。无 WebView、无 H5 替代页面，`npm run build` 生成微信开发者工具可读取的 CommonJS JavaScript 与原生模板。官方类型来自 [wechat-miniprogram/api-typings](https://github.com/wechat-miniprogram/api-typings)。

首页实际遵循第三张参考图的结构，不包含参考图中的无关业务内容：沉浸式轮播 → **2×2 大图分类** → 装备小店一览 → 双列活动列表触底分页。分类名称按原需求保留「本周活动 / 国内游行 / 假期活动 / 休闲活动」。装备是灵感展示，不代表实际 SKU 或库存，不支持交易。轮播图、分类和装备使用项目生成的原创示意图片，出处见 `asset-provenance.md`。

## 启动

```sh
cd miniprogram
npm ci
npm run typecheck
npm test
npm run build
```

在微信开发者工具导入 `miniprogram/`，配置已指向 `dist/`。`touristappid` 仅用于导入检查，必须通过本地 `project.private.config.json` 设置你自己的合法小程序 AppID 才能验证真实微信登录、体验版、真机与发布。不要把 AppSecret 放进客户端或仓库。

在 `src/config.ts` 设置自己的 HTTPS API **origin**（不含 `/api/v1`）。默认 `https://api.example.invalid` 会明确报服务尚未配置，不会返回伪造的成功数据。

本地联调可使用后端 dev profile，并临时设置 `devLogin: true` 与本地 HTTP origin。只有微信运行环境 `envVersion === 'develop'` 才允许 HTTP 与 `/auth/dev-login`；体验版和正式版即便误带这个标记，也仍走真实微信登录且拒绝 HTTP。微信工具的本地调试域名校验需要操作者在开发工具里按需设置；仓库默认 `urlCheck: true`，不降低正式校验。Dev 登录仅使用后端明确配置的演示用户，不会把本地假数据当服务器记录。

每次修改源码后重新 `npm run build`；dist 为生成物，不手动编辑或提交。

## 已实现闭环

- 首页轮播、四类筛选、装备展示、活动卡片、触底分页、下拉刷新。
- 活动详情展示时间、地点、集合点、容量、截止时间、正文与分享。
- 用户主动报名时调用 `wx.login`，只将一次性 code 交给服务端兑换；AppSecret/会话密钥不进入前端。
- 姓名、手机号和信息使用同意 → 服务端占名额 → 成功页；取消/错误不宣称成功。
- 我的报名含确认与取消历史；详情精确读取本人当前报名，不用分页列表猜测状态。
- 取消报名二次确认；服务端最终判断截止、并发名额和重复报名。
- 登录中去重、报名提交锁、分页合并去重、请求 epoch 抑制过期响应；返回/重进详情同步真实状态。
- 空数据、加载、请求失败、重试、截止、满员、取消活动与付费暂未开放状态。
- 活动时间显式转换为 Asia/Shanghai（UTC+08），不依赖手机所在时区。
- 当前手机号校验针对中国大陆手机号；国际手机号未作为本期需求开放。

## 隐私和正式上线前置条件

登录账号与报名资料属于真实用户数据。生产上线前，运营方必须填写真实主体、数据保留期限、删除/联系渠道，并在微信公众平台配置与实际后端一致的《小程序用户隐私保护指引》。当前说明页面明确提示此项，不能把未填主体的说明当作已完成合规。

微信平台还需配置小程序 AppID、服务端 AppSecret（仅服务端秘密配置）、合法 HTTPS request 域名，以及活动远程图片对应下载/图片访问域名。部署和绑定域名由运营方另行授权。图片默认六张内置素材可离线读取；其他 `/assets/*` URL 被解析为后端 origin 下的资源，只有 HTTPS 远程链接被接受。未接入定位、自动读取手机号、支付、通知订阅或通讯录等权限。

## 验证与限制

可在云端执行：严格 TypeScript 编译、静态资源构建、Node 测试（领域边界、登录去重、环境限制、错误处理、日期时区、分页和请求竞争、六页原生结构）。

不可据此宣称微信运行时验收：还需要微信开发者工具原生 WXML/WXSS 编译、真实 AppID 的 `wx.login` 服务端兑换、真机适配、长列表滚动、分享、键盘与隐私弹窗验证。本实现不将浏览器预览或 mocked `wx` 测试当作小程序真机测试。没有发起真实微信账号登录或支付。

官方参考：
- [小程序登录](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/login.html)
- [wx.login](https://developers.weixin.qq.com/miniprogram/dev/api/open-api/login/wx.login.html)
- [项目配置](https://developers.weixin.qq.com/miniprogram/dev/devtools/projectconfig.html)
- [小程序隐私保护指引](https://developers.weixin.qq.com/miniprogram/dev/framework/user-privacy/)
