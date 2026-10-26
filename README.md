# Wildboy · 走进山野

户外活动发布与报名微信小程序。首页为沉浸式轮播、2×2 分类图卡、装备展示横栏、双列活动列表。后台可创建、编辑、发布和取消活动，用户通过微信登录报名、查看和取消报名。

> 本期免费报名，微信支付未启用。装备仅展示，不支持下单。演示活动和原创 AI 图片不代表真实出团或真实在售商品。

## 项目结构

| 目录 | 技术 | 用途 |
| --- | --- | --- |
| `miniprogram/` | 原生微信小程序 + TypeScript | 用户浏览、报名、报名记录 |
| `admin/` | Vue 3 + TypeScript + Vite | 活动运营后台 |
| `server/` | Java 21 + Spring Boot + PostgreSQL | 登录、活动、报名与权限 |
| `docs/` | Markdown | 范围、API、运行和验收 |
| `tests/e2e/` | Python | 独立 HTTP 验收 |

## 开发启动

运行前分别阅读 [后端](docs/backend.md)、[小程序](docs/miniprogram.md) 和 [管理后台](docs/admin.md) 文档。前端依赖均有锁文件；后端数据库通过 Flyway 自动迁移。

- Java 21 JDK、Maven、Node.js 22 LTS、PostgreSQL。
- 后端使用 `DATABASE_URL`（JDBC URL）、`DATABASE_USER`、`DATABASE_PASSWORD`。
- 管理员使用 `ADMIN_USERNAME`、`ADMIN_PASSWORD_HASH`（BCrypt），不提供生产默认密码。
- 微信登录使用服务端 `WECHAT_APP_ID`、`WECHAT_APP_SECRET`。不要将 AppSecret 放进小程序。
- 本地显式 `dev` profile 允许演示数据和开发登录；生产不能使用该 profile，缺少微信配置会明确失败而非假登录。

```sh
cd server
mvn verify
mvn spring-boot:run

# 另一个终端
cd admin
npm ci
npm run dev

# 小程序编译，然后在微信开发者工具导入 miniprogram 目录
cd miniprogram
npm ci
npm run build
```

默认 API 端口 8080，后台开发服务器 5173。小程序 AppID、API HTTPS 地址、合法域名需按文档配置；本项目不自动购买服务器、注册小程序或发布到微信。

## 部署框架

根目录 `docker-compose.yml` 提供 PostgreSQL 和 API 的部署配置。复制 `.env.example` 到本地 `.env`，填写自己的随机数据库密码、管理员 BCrypt 哈希和微信配置后再启动。API 仅绑定回环地址，应在前面部署 HTTPS 反向代理。数据库端口不公开映射。

```sh
docker compose up -d --build
```

Docker 配置存在不代表已在本环境完成 Docker 实测，以 [验收记录](docs/acceptance.md) 为准。管理后台静态构建应通过同源 HTTPS 服务，`/api` 和 `/assets` 反代后端。启用备份、TLS、最小权限、日志脱敏后再投入实际运营。

## 核心保障

- 服务端微信 code 交换，角色权限由服务端决定。
- 公开接口不返回报名姓名、联系电话等私有信息。
- 报名的名额、重复提交与取消由数据库事务控制。
- 活动版本冲突明确拒绝，不静默覆盖他人修改。
- 当前服务端拒绝非零收费活动；不展示假支付成功。

## 文档

- [产品范围与技术取舍](docs/product-scope.md)
- [API 约定](docs/api-contract.md)
- [后端运行与安全](docs/backend.md)
- [小程序运行](docs/miniprogram.md)
- [管理后台运行](docs/admin.md)
- [独立验收记录](docs/acceptance.md)

验证结果必须区分：自动化测试、真实 PostgreSQL/API 冒烟、浏览器验证，以及尚未执行的微信开发者工具与真机测试。生成配图不能证明现实活动存在。
