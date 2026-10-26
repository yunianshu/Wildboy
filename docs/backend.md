# Wildboy 后端

## 技术选择
- Java 21 LTS + Spring Boot 3.5.16（成熟兼容线，不声称最新大版本），Spring MVC / Security / JDBC。
- PostgreSQL + Flyway 数据迁移。报名容量使用 PostgreSQL 行锁和事务，不是内存计数。
- Maven 3.9.x。API `/api/v1`，端口 8080，JSON 直接返回。时间 ISO-8601 带偏移，数据库 TIMESTAMPTZ，前端按 Asia/Shanghai 展示。
- 原生小程序调用 `wx.login` 后仅将临时 code 发到服务端；服务端固定官方域名 `https://api.weixin.qq.com/sns/jscode2session` 交换身份。OpenID/session_key 不发前端，AppSecret 不入库、不入日志、不进前端。

官方参考：[Spring Boot 3.5 系统要求](https://docs.spring.io/spring-boot/3.5/system-requirements.html)、[微信 code2Session](https://developers.weixin.qq.com/miniprogram/dev/OpenApiDoc/user-login/code2Session.html)。微信文档抓取受限，正式接入还须通过官方控制台和真实小程序联调；当前未作真实微信认证成功承诺。

## 启动
```
export DATABASE_URL=jdbc:postgresql://localhost:5432/wildboy
export DATABASE_USER=wildboy
export DATABASE_PASSWORD='your-local-secret'
export ADMIN_USERNAME='your-admin'
export ADMIN_PASSWORD_HASH='your-bcrypt-hash'
export WECHAT_APP_ID='your-appid'
export WECHAT_APP_SECRET='your-appsecret'
# 管理后台允许的精确 Origin，逗号分隔，不使用通配符。
export CORS_ORIGINS=http://localhost:5173
mvn verify
mvn spring-boot:run
```
配置名可见 `server/.env.example`。不要将真实 `.env` 或凭据提交到 GitHub。生产不启用 dev profile。通过 HTTPS 反向代理发布，并限制 API 请求体、连接和登录请求频率。

### 管理员密码
`ADMIN_PASSWORD_HASH` 是 BCrypt hash，建议 cost 12；不是明文密码。可在受信任本地环境通过 Spring Security `BCryptPasswordEncoder(12).encode(password)` 生成，将 hash 放在部署环境变量。密码不要作为命令行参数或写进 shell 历史。已有 Python bcrypt 环境可执行以下交互式脚本，仅输出 hash：
```
python3 -c 'import bcrypt,getpass; print(bcrypt.hashpw(getpass.getpass("Admin password: ").encode(),bcrypt.gensalt(rounds=12)).decode())'
```
账号、hash 任一缺失，管理登录返回 503，不启用默认管理员密码。

### 本地演示
`SPRING_PROFILES_ACTIVE=dev` 才允许 `POST /auth/dev-login {"role":"ADMIN"}` 或 USER，并在空库生成明确标注“演示”的四类活动。即使单独将 dev-login-enabled=true，默认/生产 profile 仍拒绝；与 prod 同时开启也拒绝。演示登录不应开放公网。正式环境不自动造活动、用户或装备库存。

## 业务约束
1. 草稿、已发布、已取消；公开列表仅已发布，公开详情允许已发布/已取消。后台能见草稿。
2. title<=120，summary<=300，description<=20000，location/meetingPoint<=200，gallery<=12，capacity 1–10000。
3. 图片只允许 HTTPS 或 `/assets/` 路径，前端展示普通文本，不能当 HTML 执行。没有服务端 URL 抓取或开放上传。
4. endAt>startAt，registrationDeadline<=startAt；发布时开始/截止均须在未来。已开始活动不能通过改日期重新激活。
5. 仅免费报名，priceCents 必须 0，currency CNY；支付明确关闭，不伪造支付订单、已支付、退款状态。装备小店仅展示示意，不是真实可售 SKU。
6. 每用户每活动一条报名记录。相同请求重复提交返回原报名（200）；新报名或取消后重报返回201。容量、用户唯一性、状态、人数更新均同一事务；并发不会超卖。
7. 用户仅能读自己的报名或取消自己的报名；管理员能读活动名单。公开活动对象不含参与者姓名、手机号。
8. 用户自助取消仅在报名截止前且活动未开始可用；活动取消后所有确认报名同步转取消，人数归零，历史记录保留。无硬删除接口。
9. 编辑/发布/取消必须携带 version。活动报名变化也增加 version，因此管理员遇409应刷新再编辑，不自动覆盖。
10. GET `/activities/{id}/registrations/me` 返回当前用户有效报名或 JSON null；取消历史在 `/me/registrations` 可见。

## 安全边界
- 256-bit 随机 bearer token；数据库仅保存 SHA-256 hash。管理员8小时、用户7天到期。请求不得把 token 写日志。
- 仅通过服务端微信交换建立 USER 身份，不能由客户端 openid/role 提升。管理员使用独立 BCrypt 登录。
- Stateless bearer 模式不用 Cookie 认证，因此关闭 CSRF；精确 Origin CORS，不允许 credentials 通配符。
- 每实际远端 IP 每分钟最多20次登录 POST，忽略不可信转发头；单实例内存限流是基础保护，多实例及公网应加网关级集中限流。失败返回统一错误；微信 URL 中的 secret 不在异常响应/日志打印。
- 数据库连接使用最小权限账户，报名手机号属于私密资料，部署需设置备份加密、留存/删除政策；当前不采集身份证、健康信息、未成年人资料。
- 审计表仅记录 actor/entity/action/time，不保存报名手机号、密码或上游敏感响应。

## 验证
`mvn verify` 使用 Zonky Embedded PostgreSQL 实际运行 PostgreSQL，不是 H2，也不要求 Docker。Linux 非 root 运行；首次从 Maven Central 下载官方依赖中的 PostgreSQL 二进制。覆盖 HTTP权限、生产关闭dev-login、数据库Flyway、重复报名/取消重报、20人并发争3名额、同用户并发、乐观锁、报名截止、活动取消联动、支付拒绝、令牌hash/过期、真实密码校验等。

`LocalSmokeServer` 是 test-only QA入口，不打进正式jar，用于启动真实 PostgreSQL + 8080 HTTP dev服务让独立端到端测试接入。生产Jar启动验收仍应使用生产环境参数和独立数据库。

当前范围不包括微信支付、实际商户开通、微信公众号订阅消息、装备购物车、活动通知推送、用户资料删除后台。活动有变更时目前需用户在小程序查看，不假称已通知到所有报名者。

### 本轮实际验证记录（2026-10-26）
- Java 21.0.13 / Maven 3.9.11，`mvn verify` 成功，13 个 PostgreSQL 14.19 集成测试全通过，0 跳过。
- 独立 HTTP 端到端验收 29 项通过，包括完整发布/编辑/报名/取消、权限、容量、分页与资产响应。
- 实际启动最终 Spring Boot 可执行 JAR（不是只启动测试类）：新 PostgreSQL + Flyway 成功，Tomcat8081、health UP、公开活动/首页接口、支付关闭检查通过，进程已正常关闭。
- 本机不支持 Unix-domain socket，所以嵌入式数据库测试使用其官方配置关闭 Unix socket、通过127.0.0.1 TCP连接；Mockito 使用官方 subclass mock-maker避免动态 JVM attach，未修改或跳过验收断言。
- 尚未真实微信 AppID/code 登录、微信开发者工具预览、真机报名或正式服务器部署。数据库测试版本与生产镜像版本可能不同，发布前须在目标 PostgreSQL 版本做一次部署验收。

## 小程序管理员与全局筛选

小程序管理端与网页管理端复用 `POST /api/v1/auth/admin`。返回的会话必须通过 `GET /api/v1/me` 校验，只有服务端角色 `ADMIN` 能使用 `/api/v1/admin/**`；客户端页面隐藏、请求 body 或自定义 header 均不能授权。普通微信登录仍为 `USER`，不会因打开管理页面自动升级。账号密码由部署管理员配置；小程序不得保存管理员密码，切换/退出身份必须清理前一身份的数据和会话。当前退出仅清理客户端会话，已签发 token 仍受服务端到期时间控制，不声称已服务端撤销。

- `GET /api/v1/admin/activities?status=DRAFT|PUBLISHED|CANCELLED`：可选全局状态筛选，可与 `category`、`page`、`size` 组合。不传 `status` 返回全部状态。无效状态返回 400。
- `GET /api/v1/me/registrations?status=CONFIRMED|CANCELLED`：仅当前用户，按全库匹配记录筛选后分页。不传返回全部状态；无效状态返回 400。
- 两者 `total`、`hasMore` 均依据数据库中的完整筛选结果计算，不是前端当前页过滤。
- 管理员名单只对管理员可见，活动取消后保留取消报名历史；公开活动接口不返回参与人姓名或电话。

本次移动管理增量已运行 `mvn verify`：19 项真实 PostgreSQL 集成测试，0 失败/错误/跳过。新增覆盖普通用户对全部管理路由的拒绝、伪造 role/header、过期管理员会话、真实管理员 HTTP 登录与创建/编辑/发布/取消/名单流程，以及两类全局状态筛选的分页与用户隔离。最终可执行 JAR 已连接独立 PostgreSQL 启动，健康、公开首页/活动、支付关闭和匿名管理访问 401 冒烟通过。这不代表真实微信登录、真机或生产部署已验证。
