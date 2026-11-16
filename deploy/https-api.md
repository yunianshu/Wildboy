# Wildboy 公网 HTTPS API

`https://api.wildboy.com.cn` 通过独立的 `wildboy-https` Compose 项目监听 443，反代至现有 `127.0.0.1:8080`。它与 AnyService 的 80 端口和网页后台的 8081 端口共存。Spring 仍负责 API 权限与微信支付回调验签。该入口仅转发 `/api/v1`、`/api/v1/…` 和 `/assets/…`，屏蔽演示登录。

## 证书与启动

1. 让域名的 A 记录指向部署主机。仅在主机具备公网 IPv6 时添加 AAAA 记录。部署主机需允许公网 TCP 443，API 端口 8080 保持仅本机可达。
2. 用受信任的 CA 签发覆盖 `api.wildboy.com.cn` 的证书，例如通过 ACME DNS-01 验证，继续由现有服务使用 80。将 `fullchain.pem`（域名证书在前，其后是中间证书）和 `privkey.pem` 放在 `/etc/wildboy/tls/api.wildboy.com.cn/`。文件由 root 持有，目录与私钥仅允许部署账户访问。若证书来自其他路径或由符号链接提供，复制实际 PEM 文件到该目录，由续期钩子更新。也可通过 `WILDBOY_API_TLS_DIR` 指定独立目录。
3. 开放入口前，确认现有 API 已用 `prod` 配置重建，且正式管理员可登录。首次从演示环境转生产时，应撤销已有演示会话。关闭演示登录后，先前签发的令牌仍可能有效至原到期。暂不启用微信支付时，可在原项目 `.env` 中设置 `SPRING_PROFILES_ACTIVE=prod`，按原 Compose 配置重建 `api`。启用支付时，按下文使用生产覆盖文件。
4. 从服务器项目根目录执行以下命令。可手动上传此目录中的部署文件，随后直接执行 Compose。旧 `deploy/deploy.sh` 会同步并重置代码检出，且没有加载这两个 Compose 文件。

```sh
docker compose -p wildboy-https -f deploy/compose.https.yml config --quiet
docker compose -p wildboy-https -f deploy/compose.https.yml run --rm --no-deps api-https nginx -t
docker compose -p wildboy-https -f deploy/compose.https.yml up -d
```

证书续期后更新这两个文件，确认 `nginx -t` 通过，再重载。关闭此入口可执行 `docker compose -p wildboy-https -f deploy/compose.https.yml down`。

2026-11-13 在阿里云轻量应用服务器上通过 DNS-01 签发了 API 子域名证书，有效期至 2027-02-11。首次部署使用 `/root/wildboy-deploy/api-https/tls/` 下的证书文件和独立的 `wildboy-api-https` 容器。升级后端前，该容器仅开放首页、当前协议和图片的读取。此次采用手动 DNS 验证，自动续期尚未配置。

```sh
docker compose -p wildboy-https -f deploy/compose.https.yml exec -T api-https nginx -t
docker compose -p wildboy-https -f deploy/compose.https.yml exec -T api-https nginx -s reload
```

## 管理后台 HTTPS 入口

`https://www.wildboy.com.cn/` 将页面和静态资源转发到本机 8081，`/api/v1` 转发到本机 8080。使用单独覆盖 `www.wildboy.com.cn` 的证书。将 `fullchain.pem` 和 `privkey.pem` 放在 `/etc/wildboy/tls/www.wildboy.com.cn/`，或通过 `WILDBOY_ADMIN_TLS_DIR` 指定目录。后续通过 Compose 部署 HTTPS 时，在现有 `-f deploy/compose.https.yml` 后追加 `-f deploy/compose.admin-https.yml`。

当前线上 `wildboy-api-https` 容器将两套域名配置合在 `/root/wildboy-deploy/api-https/nginx-stage.conf`，后台证书部署在其 `tls/www.wildboy.com.cn/` 子目录。续期后更新该处证书，执行 `nginx -t` 再重载 HTTPS 容器。验收管理员登录页、匿名管理 API 的 401 响应和 `api.wildboy.com.cn` 的公开接口。

## 生产 API 与微信支付

需要配置生产支付时，将 `compose.production-api.yml` 与根目录 `docker-compose.yml` 合并使用。保持原 Compose 项目名和工作目录，继续使用现有数据库与媒体卷。先备份 PostgreSQL，并在副本上检查 `flyway_schema_history` 和迁移结果。

- 现有服务器 `.env` 保存数据库凭据、管理员 BCrypt 哈希、身份证加密密钥和微信应用配置。微信支付额外需要 `WECHAT_PAY_MERCHANT_ID`、`WECHAT_PAY_MERCHANT_SERIAL_NUMBER`、`WECHAT_PAY_PUBLIC_KEY_ID` 和 `WECHAT_PAY_API_V3_KEY`。`CORS_ORIGINS` 填入实际网页后台的完整 Origin，含协议与端口。配置文件仅允许部署账户读取，禁止提交或在共享日志中输出。
- 将商户私钥 `apiclient_key.pem` 和微信支付公钥 `wechatpay_public_key.pem` 放入 `/etc/wildboy/wechat-pay/`（可用 `WILDBOY_WECHAT_PAY_KEY_DIR` 指定）。覆盖文件以只读方式挂载为容器内 `/run/secrets/` 下同名文件。商户私钥仅授予 API 镜像中 `wildboy` 用户必要的读取权限，按实际镜像的 UID/GID 设置，可用 `docker compose run --rm --no-deps --entrypoint id api` 核对。HTTPS 私钥和微信支付商户私钥用途独立。
- 覆盖文件固定使用 `prod`。AnyService 和 8081 继续连接同一个 API，正式账号从现有数据库或服务器 bootstrap 配置读取。
- `SPRING_FLYWAY_OUT_OF_ORDER` 默认 `false`。仅当现有数据库已经应用 V18–V22、确认 V15–V17 缺失且其他历史校验和匹配时，在备份与副本验证后为首次升级设置 `SPRING_FLYWAY_OUT_OF_ORDER=true`。升级后删除临时设置，再按默认值部署。保留已应用迁移的内容及校验和，不手工修改迁移历史。详见 [后端迁移说明](../docs/backend.md)。

```sh
docker compose -f docker-compose.yml -f deploy/compose.production-api.yml config --quiet
docker compose -f docker-compose.yml -f deploy/compose.production-api.yml up -d --build api
curl --fail --silent --show-error http://127.0.0.1:8080/actuator/health
```

`WECHAT_PAY_NOTIFY_URL` 指向 `https://api.wildboy.com.cn/api/v1/payments/wechat/notify`。服务端由此派生其余回调地址。

| 回调 | POST 路径 |
| --- | --- |
| 商城支付 | `/api/v1/payments/wechat/notify` |
| 商城退款 | `/api/v1/payments/wechat/refund-notify` |
| 活动支付 | `/api/v1/payments/wechat/activity-notify` |
| 活动退款 | `/api/v1/payments/wechat/activity-refund-notify` |

### 发货信息管理上报

微信要求交易类小程序在发货后向「发货信息管理」上报履约信息（`upload_shipping_info`）。在服务器 `.env` 设置 `WILDBOY_SHIPPING_ENABLED=true` 开启；未开启时订单照常成交，只是不上报。商城实物单在后台发货时上报快递信息，活动订单支付成功后自动上报虚拟履约；上报状态落库于 `shipping_report`，失败按退避自动补报，后台「发货上报」页可查询并手动补报。需在公众平台确认小程序已开通发货信息管理服务。

## 外网验收

从服务器外执行以下命令，使用系统信任链与真实域名解析。

```sh
openssl s_client -connect api.wildboy.com.cn:443 -servername api.wildboy.com.cn \
  -verify_hostname api.wildboy.com.cn -verify_return_error -showcerts </dev/null
curl --fail --silent --show-error 'https://api.wildboy.com.cn/api/v1/activities?page=0&size=1'
```

再请求活动或商品数据返回的实际 `/assets/…` 图片地址，检查 HTTP 200 和图片类型。回调仅以微信支付发送的有效签名通知验证收单和退款；入口的 HTTPS 握手或普通 GET 不能证明交易通知已经送达。若小程序改用直连 API，还需在微信公众平台将该 HTTPS 域名添加到对应请求和上传或下载的合法域名配置，并在真机验证。
