# Wildboy 服务器部署

**常规发布使用固定流程 [RELEASE.md](RELEASE.md)**：开发机一条命令 `sh deploy/release.sh`（质量门禁 → 推 GitHub → SSH 直推服务器 → 部署步骤 → 双端烟雾检查）。

独立的 `api.wildboy.com.cn:443` 入口及生产支付配置见 [公网 HTTPS API](https-api.md)。

## 单独部署 Web 后端

在开发机仓库根目录运行，需要 Java 21、Maven、POSIX shell、SSH 和 curl。Windows 可使用 Git Bash，将 Maven 的 JAVA_HOME 指向 JDK 21。

```sh
export WILDBOY_DEPLOY_HOST=<服务器地址>
sh deploy/deploy-api.sh
```

脚本使用当前工作区的后端源码执行 Maven `clean verify`。通过后将 JAR 上传到独立发布目录，校验 SHA-256，并以只读方式挂载到现有 API 镜像的 `/app/app.jar`。仅重建 API 容器。服务器须已有生产 API 运行时镜像、Compose 项目和数据库。启动或服务器本机冒烟检查失败时，恢复上一套 Compose 配置。

## 拓扑

```
微信小程序 wx.cloud.callContainer (AnyService)
  → :80   wildboy-edge  nginx（仅放行 AnyService 凭证头，防 IP 直连匿名访问）
  → :8080 wildboy-api-1 Spring Boot（docker compose，随 Flyway 自动迁移）
          └ wildboy-db-1 PostgreSQL（compose 卷 wildboy-data）

浏览器（管理员）
  → :8081 wildboy-admin nginx（Vue 静态包 + /api 反代；过渡期临时对公网开放 HTTP）
```

## 服务器 .env（/root/Wildboy/.env，不入库）

在 `.env.example` 基础上额外使用：

| 变量 | 说明 |
| --- | --- |
| `SPRING_PROFILES_ACTIVE` | `dev` = 演示登录+演示数据（当前过渡期）；生产留空（默认 prod） |
| `WILDBOY_ANY_CRED_FILE` | AnyService 源站凭证文件路径；缺省 `/root/wildboy-deploy/anyservice-cred.txt`，内含 `ANYSERVICE_AUTHORIZATION_HEADER` |

## 端口与防火墙（SWAS 控制台 → 防火墙）

- TCP 80：必须放行（AnyService 回源）。
- TCP 8081：临时放行（纯 HTTP 管理后台）；备案+证书就绪后关闭并改回 `127.0.0.1` 监听。

## 回滚

应用代码回滚后，从开发机再运行 `sh deploy/deploy-api.sh`。Flyway 已应用的迁移会保留，旧版应用必须兼容当前库结构。服务器上的 JAR 与 Compose 覆盖文件位于 `/root/wildboy-deploy/`。手动重建 API 容器时，使用当前容器 `com.docker.compose.project.config_files` 标签列出的全部 Compose 文件。
