# 局域网联调

## 当前重设计验收版本（2026-10-31）

| 用途 | 地址 |
| --- | --- |
| 网页管理端 | `http://192.168.1.189:15174` |
| 小程序 API origin | `http://192.168.1.189:19080` |
| API 健康检查 | `http://192.168.1.189:19080/actuator/health` |

19080 运行包含管理员账号设置与名单状态分页的新后端，15174 的 Vite 将 `/api`、`/assets` 转发到该后端。手机曾无法打开直连 Java 的健康检查；当前 Java 仅监听 `127.0.0.1:19080`，由已获 Windows 入站权限的 Node 代理监听 `192.168.1.189:19080`。Vite 继续监听 `0.0.0.0:15174`，手机原地址不变，不关闭防火墙。后端及代理精确允许 15174 的本机/局域网网页来源，未列来源预检返回 403。

本机通过局域网入口复测健康、活动、四件商品与图片均为 200；业务与账号配置在入口切换前后完全相同，记录 `test-results/lan-phone-2026-10-31/`。2026-10-31 用户随后明确确认手机健康检查显示 UP、小程序数据也已恢复，手机局域网连通性完成实测；这不扩大为全部真机业务或真实支付验收。

本次透明底部标识更新后，已由官方开发者工具成功生成新的手机预览包（2,040,600 bytes），二维码位于 `test-results/lan-phone-2026-10-31/latest-preview.png`。该包明确使用上述 LAN19080，避免手机继续打开旧服务地址的包。预览不替代正式上传或发布；包内的开发演示登录仅用于当前本地联调。

当前使用独立 QA 数据库。测试运行器意外退出后，原 PostgreSQL 文件已完整保留，并冷复制到 `server/target/redesign-qa-data` 恢复；现在由独立 PostgreSQL 和标准 `WildboyApplication` 运行，API 重启不会重建数据库。重启后已核对管理员配置、三个会话、验收活动和四件演示商品均保留。旧 18080 服务和原数据未修改。

该目录属于本次验收的构建缓存，执行 `mvn clean` 前应保留所需 QA 数据；长期调试或正式部署按 [后端说明](backend.md) 使用持久 PostgreSQL。管理员账号配置存入当前数据库，切换到另一个数据库不会自动迁移账号。

网页开发服务重新启动命令：

```powershell
cd D:/AiProject/Wildboy/admin
$env:API_PROXY_TARGET = 'http://127.0.0.1:19080'
npm run dev -- --host 0.0.0.0 --port 15174 --strictPort
```

API 后端启动时使用 `SERVER_ADDRESS=127.0.0.1`、`PORT=19080`，并继续连接原 QA 数据库；后端健康后，在仓库根目录单独保持以下代理运行：

```powershell
cd D:/AiProject/Wildboy
node scripts/serve-lan.cjs --host 192.168.1.189 --api-port 19080 --admin-port 15174 --api-only
```

`--api-only` 不检查或占用网页后台端口，15174 仅用于精确来源配置。退出代理不会停止 Java、Vite 或数据库，也不会删除会话及业务数据。代理现有回归为 11/11，含单 API 启动、请求体/鉴权、CORS、WebSocket 与关闭行为。

小程序每次重新构建后使用当前地址：

```powershell
cd D:/AiProject/Wildboy/miniprogram
$env:WILDBOY_LOCAL_API = 'http://192.168.1.189:19080'
npm run dev:local
```

开发者工具若仍运行旧脚本，先清理本项目的 **compile 编译缓存**，退出并重新打开项目再编译。无需清理 storage、auth 或 session；这些缓存含调试登录状态。验收必须核对运行时 `config.apiOrigin`，不能只看生成文件。

## 历史对照版本（2026-10-30，继续保留）

以下 18080/15173 入口用于保留旧调试数据与前后对照，不包含新后端账号设置接口；新 UI 验收使用上方 19080/15174。

当前电脑的物理以太网地址为 `192.168.1.189`。连接同一路由器的设备使用以下地址：

| 用途 | 地址 |
| --- | --- |
| 网页管理端 | `http://192.168.1.189:15173` |
| 小程序 API origin | `http://192.168.1.189:18080` |
| API 健康检查 | `http://192.168.1.189:18080/actuator/health` |

当前局域网入口已启动；原有 `127.0.0.1:18080` API、`127.0.0.1:15173` Vite 及本地调试数据库继续运行。新增 Node 开发代理只监听指定的局域网地址，不占用回环监听。它转发请求体、鉴权头和 Vite HMR WebSocket，并对浏览器 Origin 使用精确允许列表；生产配置不受影响。

## 再次启动

先按 [后端说明](backend.md) 和 [管理端说明](admin.md) 启动服务，确保上述两个回环地址可用。后端管理端 Origin 需允许 `http://127.0.0.1:15173`。管理端使用当前端口的示例（独立 PowerShell 窗口）：

```powershell
cd D:/AiProject/Wildboy/admin
$env:API_PROXY_TARGET = 'http://127.0.0.1:18080'
npm run dev -- --host 127.0.0.1 --port 15173 --strictPort
```

在仓库根目录启动局域网入口，并保留这个进程：

```powershell
node scripts/serve-lan.cjs --host 192.168.1.189
```

可用 `--api-port`、`--admin-port` 指定其他端口；对应回环服务也必须在同端口运行。Ctrl+C 仅关闭代理自己的监听，不停止 API/Vite 或清空数据库。

小程序重新构建时，在 `miniprogram/` 执行：

```powershell
$env:WILDBOY_LOCAL_API = 'http://192.168.1.189:18080'
npm run dev:local
```

然后在微信开发者工具重新编译。脚本只更新生成的 `dist/config.js`；每次普通 `npm run build` 都会重新生成配置，因此局域网联调应使用上述 `dev:local` 命令。开发版 HTTP/演示登录限制仍有效，体验版、正式版仍要求正式 HTTPS 配置。

## 验证和连接条件

- 当前已在本机通过局域网地址验证管理端 HTML、API health、四件商品、管理登录与 bearer 请求、CORS 预检/拒绝未知 Origin，以及真实 Vite HMR WebSocket，共 7 项。记录在 `test-results/ui-fixes-2026-10-30/lan-report.json`。
- 代理另有 9 项 HTTP、鉴权、CORS、WebSocket、超时及关闭回归：`node --test tests/lan-proxy.test.cjs`。
- 尚未用另一台实体设备验证。设备须与电脑互通，路由器不能启用客户端隔离；如果设备连接超时，检查 Windows 是否允许 Node.js 的当前网络入站。此次未修改防火墙。
- DHCP 地址变化后，重新查询物理网卡 IPv4，替换启动命令和 `WILDBOY_LOCAL_API` 中的地址；不要使用 VPN 或虚拟网卡地址。
- 这是本地开发入口，不用于公网生产部署。
