# 隐私政策、用户协议与同意版本 API

协议为纯文本；管理员编辑草稿不会改变线上已发布文本。两类 `PRIVACY` 和 `TERMS` 独立递增版本。生产没有自动发布模板，运营方应审核并发布自己的正式文本；开发 profile 的示例明确仅用于联调。

## 数据结构
- Document: `{kind,version,title,content,publishedAt}`，version 正整数，时间 ISO-8601。
- Draft: `{title,content,revision}`，初始空字符串、revision 0，永不 null。
- AdminDocument: `{kind,draft,published:Document|null}`。
- Current: `{ready,privacy:Document|null,terms:Document|null}`。
- ConsentState: `{ready,current:{privacyVersion:number|null,termsVersion:number|null},accepted:{privacyVersion,termsVersion,acceptedAt}|null,requiresConsent}`。

## 公开与用户接口
- `GET /api/v1/legal/current`，仅已发布内容；两项均已发布 ready=true。
- `GET /api/v1/legal/{kind}/versions/{version}`，已发布历史；不存在404。
- `GET /api/v1/me/consents`，当前账号最新已记录同意，认证必需。
- `POST /api/v1/me/consents`，body `{privacyVersion,termsVersion}`，返回 ConsentState。
- `POST /api/v1/auth/wechat` body `{code,privacyVersion,termsVersion}`。用户必须主动阅读并勾选，版本必填正整数。
- 开发 `POST /api/v1/auth/dev-login` 的 USER 同样提交两版本；ADMIN 不需要协议即可进入管理配置，生产该接口仍关闭。
- `POST /api/v1/activities/{id}/registrations` body `{participants:[{participantName,idNumber,phone}],privacyVersion,termsVersion}`；至少一位参与人。

`503 LEGAL_NOT_READY`：两协议尚未发布，不允许微信用户登录/新报名。`409 LEGAL_VERSION_CHANGED`：版本非当前，重新取协议、展示内容并清除勾选，用户重新确认后再提交。不能静默填最新版本。普通浏览、查看历史和取消报名不强制最新同意，管理员登录与维护不受未发布状态阻断。

登录先检查版本，再请求微信；交换成功后在事务中再次检查版本、创建用户、追加同意并创建会话。微信失败或版本变更不得留下同意/会话记录。报名同意与名额变更同一事务，发布与报名通过数据库锁串行化，防止发布竞态。重复同一账号/同一版本组合不产生重复同意，旧记录不可覆盖。只记录账号、两版本、时间和动作来源，不保存 IP/设备指纹。

## 管理接口（ADMIN）
- `GET /api/v1/admin/legal/{kind}` -> AdminDocument。
- `PUT /api/v1/admin/legal/{kind}/draft` body `{title,content,revision}` -> AdminDocument。title 1–120 字符，content 去空白后至少10、最多50000字符，拒绝 HTML 标签；revision 乐观锁。
- `POST /api/v1/admin/legal/{kind}/publish` body `{revision}` -> Document。发布后草稿 revision 也递增，请重新 GET 编辑状态。
- `GET /api/v1/admin/legal/{kind}/versions` -> Document[]，按版本降序。
- 草稿冲突409 `STALE_VERSION`，内容与当前发布相同409 `NO_LEGAL_CHANGES`，无完整草稿400 `EMPTY_LEGAL_DOCUMENT`。

历史版本和同意表由数据库触发器禁止 UPDATE/DELETE，无应用删除接口。此实现不是完整的资料保留/删除合规方案，正式运营仍需审核保留政策和依法处理用户权利请求。

## 微信平台边界

本功能管理 Wildboy 自己的业务协议，不会替代微信公众平台“用户隐私保护指引”的配置、隐私接口声明或微信平台授权流程。上线前须按实际信息处理范围在微信平台完成对应配置和开发者工具/真机验证。
官方参考：https://developers.weixin.qq.com/miniprogram/dev/framework/user-privacy/ 与 https://developers.weixin.qq.com/miniprogram/dev/api/open-api/privacy/wx.getPrivacySetting.html 。
