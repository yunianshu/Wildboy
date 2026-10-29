# Wildboy 服务器部署

一台 Linux 服务器（当前：阿里云轻量应用服务器）上的完整部署单元。所有步骤固化为
`deploy/deploy.sh`，在服务器的仓库检出里执行：

```sh
ssh root<at><server>
cd /root/Wildboy
sh deploy/deploy.sh
```

## 拓扑

```
微信小程序 wx.cloud.callContainer (AnyService)
  → :80   wildboy-edge  nginx（仅放行 AnyService 凭证头，防 IP 直连匿名访问）
  → :8080 wildboy-api-1 Spring Boot（docker compose，随 Flyway 自动迁移）
          └ wildboy-db-1 PostgreSQL（compose 卷 wildboy-data）

浏览器（管理员）
  → :8081 wildboy-admin nginx（Vue 静态包 + /api 反代；过渡期临时对公网开放 HTTP）
```

## 部署脚本做什么

1. `git fetch` + `git reset --hard origin/main` —— 检出目录是纯部署物，本地改动一律丢弃
   （`.env`、凭证文件不入库，不受影响）。
2. `docker compose up -d --build db api` —— 重建 API 镜像（多阶段构建内含测试）并滚动启动，
   数据库结构由 Flyway 迁移自动升级。
3. 用 docker 化 Node 构建 `admin/dist`（服务器无需安装 Node）。
4. 渲染 `nginx-edge.conf`（注入 AnyService 凭证）并重建 `wildboy-edge`、`wildboy-admin`
   两个 nginx 容器（host 网络、`--restart unless-stopped`）。
5. 冒烟检查：API 健康、edge 带凭证 200 / 匿名 403、后台健康。

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

`cd /root/Wildboy && git checkout <旧版本> && sh deploy/deploy.sh`。数据库迁移
（Flyway）只前进不回退；重大回滚前先备份 `wildboy-data` 卷。
