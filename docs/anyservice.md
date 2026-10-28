# 未备案域名接入小程序：CloudBase AnyService

`wildboy.com.cn` 已解析到本机（`60.205.219.30`），但尚未完成 ICP 备案。微信小程序的 `wx.request` 只允许调用已完成备案的 HTTPS 域名，因此在备案完成前，用户端改用腾讯云开发 **AnyService** 通道。

AnyService 不替代备案，只是让小程序在备案期间也能连上真实后端：小程序侧经 `wx.cloud.callContainer` 调用，不需要配置「服务器域名」，也不需要域名与证书。

## 请求链路

```
小程序 wx.cloud.callContainer
  → 云开发 AnyService 边缘（TLS、无备案域名）
  → 源站 http://60.205.219.30:80（需在安全组放行 80）
  → 宿主机 nginx `wildboy-edge`：仅放行带 AnyService 源站凭证的请求
  → 127.0.0.1:8080 Spring Boot
```

- 源站不是匿名开放的：`wildboy-edge` 未收到 `x-anyservice-authorization` 或值不匹配时直接 `403`，其余路径 `404`。
- `wildboy-edge` 把 AnyService 提供的 `X-Forwarded-For` 原样传给后端，后端以 `SERVER_FORWARD_HEADERS_STRATEGY=native` 信任来自回环代理的该头部，登录限流仍按真实客户端 IP 分桶（实测同一 IP 第 21 次登录返回 429，换 IP 仍为 401）。
- 源站凭证保存在 `/root/wildboy-deploy/anyservice-cred.txt`（600 权限，仓库外）。

## 需要在腾讯云/微信侧完成（需账号登录，自动化无法代做）

1. 在[云开发控制台](https://tcb.cloud.tencent.com/dev)创建环境（**仅上海地域**支持 AnyService）。
2. 把该环境与小程序 `wx213637d718ac5d52` 关联（云开发 → 环境 → 关联小程序）。
3. 新建 AnyService 服务：
   - 服务名称/标识：如 `wildboy-api`（标识只能用英文、数字、下划线）；
   - 源站类型：通过公网访问源站；
   - 源站协议：`http`；
   - 源站连接信息：`60.205.219.30:80`；
   - 源站访问凭证（Basic）：账号 `anyservice`，密码见 `/root/wildboy-deploy/anyservice-cred.txt`。
4. 阿里云安全组放行入方向 TCP 80（建议只放行腾讯云 AnyService 出口网段，无法确定时至少先放行后观察日志）。
5. 记录**环境 ID**与**服务标识**，填入小程序配置。

## 小程序侧配置

编辑 `miniprogram/src/config.ts`：

```ts
export const config = {
  apiOrigin: "https://api.example.invalid", // AnyService 模式下不使用
  apiMode: "anyservice",
  anyServiceEnvId: "你的环境ID",
  anyServiceName: "wildboy-api",
  devLogin: false,
};
```

然后：

```sh
cd miniprogram
npm run build
# 微信开发者工具导入 miniprogram 目录
```

`app.ts` 已在 `apiMode === "anyservice"` 且填了环境 ID 时调用一次 `wx.cloud.init`；`utils/api.ts` 用固定请求头 `X-WX-SERVICE: tcbanyservice` + `X-AnyService-Name: <服务标识>` 发送 `path = /api/v1...`，`Authorization: Bearer` 与状态码、错误码处理与 `wx.request` 模式完全一致。本地 `npm run dev:local` 会强制回 `request` 模式。

## 仍然受限的部分

| 项目 | 影响 |
| --- | --- |
| `<image>` 相对图片 `/assets/*` | 图片组件不走 AnyService，无公网域名时无法加载。六张内置素材正常；后台自定义封面/图集请填 HTTPS 图片地址 |
| 管理后台（Vue） | 浏览器访问，不经 AnyService。当前只监听 `127.0.0.1:8081`，需通过 SSH 隧道访问（`ssh -L 8081:127.0.0.1:8081`），或后续配置域名/证书 |
| 微信支付回调 `notify_url` | 微信服务器需要一个公网 HTTPS 地址，AnyService 不提供入站地址，备案+证书前无法接收支付通知，因此商城只能保持在待支付、不能确认入账 |
| 音频/视频/下载域名 | 同上，只有 `wx.cloud` 通道内的请求可用 |
| 小程序发布 | AnyService 免域名备案，但小程序本身仍需完成**小程序备案**与微信认证，且 AnyService 调用要求基础库支持 `wx.cloud.callContainer` |
| 合规 | 备案完成后建议切回 `apiMode: "request"` + 已备案 HTTPS 域名，AnyService 作为过渡方案（按云开发套餐计费，额度以控制台为准） |

## 验证

- 本机：`curl -H 'x-anyservice-authorization: Basic <凭证>' http://127.0.0.1/api/v1/activities` 返回 200；不带头部返回 403；`http://127.0.0.1/` 返回 404。
- 公网：安全组放行后，用公网 IP + 头部同样应返回 200，不带头部返回 403。
- 小程序：AnyService 服务创建后，在开发者工具调用任意公开接口（如首页）应返回真实数据；未配置环境 ID/服务标识时明确提示“服务尚未配置”，不会伪造数据。

## 运维

- 边缘容器：`docker run` 启动，`--restart unless-stopped`，配置 `-v /root/wildboy-deploy/edge/nginx-edge.conf:/etc/nginx/conf.d/default.conf:ro`，`--network host`，监听 80。
- 后台容器：`wildboy-admin`，配置 `/root/wildboy-deploy/admin/nginx-admin.conf`，监听 `127.0.0.1:8081`。
- 两者都不在 `docker-compose.yml` 内；`docker compose down` 不会停止它们。重建宿主机时需按上面的挂载参数重新启动。
- 轮换源站凭证：改 `/root/wildboy-deploy/anyservice-cred.txt`、`nginx-edge.conf` 中的 base64 值，`docker restart wildboy-edge`，再在控制台同步更新 AnyService 服务配置。
