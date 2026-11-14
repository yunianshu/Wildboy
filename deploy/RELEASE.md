# Wildboy 发布流程（固定流程）

一条命令完成从质量门禁到生产上线的全部步骤：

```sh
export WILDBOY_DEPLOY_HOST=<服务器地址>   # 一次性；建议写入本机环境
sh deploy/release.sh                      # 完整发布
sh deploy/release.sh --skip-tests         # 紧急修正时跳过 admin 门禁
sh deploy/release.sh --dry-run            # 预演（只打印步骤，不执行）
```

前置条件：本机 `main` 分支且工作区干净；SSH 免密可达服务器（首次配置见 [README](README.md)）；服务器 `/root/Wildboy` 部署检出与 `/root/Wildboy/.env` 机密文件就位。

## release.sh 每一步做什么

| 步骤 | 内容 | 失败处理 |
| --- | --- | --- |
| 0 | 确认 main 分支、工作区干净，打印发布目标 | 阻断 |
| 1 | admin 门禁：`vue-tsc` + vitest + 生产构建 | 阻断（`--skip-tests` 可跳过，仅紧急修正） |
| 2 | 若 `server/` 相对远端有变更：`mvn verify`（约 4 分钟，228 项） | 阻断 |
| 3 | `git push origin main` 推送 GitHub | 阻断 |
| 4 | SSH 直推服务器 `deploy-staging` 分支并 `--ff-only` 快进 main；上传 `deploy/deploy-steps.sh` | 阻断 |
| 5 | 服务器执行 `deploy-steps.sh`（= deploy.sh 第 2–5 步）：compose 重建 db/api → API 健康等待（含 Flyway 自动迁移与校验）→ node 容器构建 admin/dist → 重建 edge/admin nginx → 服务器端烟雾检查（api OK、edge 凭据 200/匿名 403、admin OK） | 失败即输出日志尾部并退出；超时 10 分钟 |
| 6 | 公网烟雾：www.wildboy.com.cn 200、api.wildboy.com.cn 公开接口 200 | 阻断 |

步骤 4 用 SSH 直推而不是让服务器 `git fetch`，因为服务器到 GitHub 的链路不稳定（deploy.sh 第 1 步的既有风险，曾导致部署卡在拉取阶段）。等该链路恢复稳定后，也可以回到服务器上直接跑 `sh deploy/deploy.sh` 的原始方式。

## 迁移与数据库安全

- API 容器启动时 Flyway 自动校验并迁移；生产库当前在 V23。
- **涉及 `server/src/main/resources/db/migration/` 新增迁移的发布**，先做预检：临时库写入生产 `flyway_schema_history` 的 checksum，用新迁移文件跑一次 Flyway `validate`（参考 2026-11-14 的做法），避免校验失败导致 API 起不来。
- 迁移文件一经生产应用不可修改内容（checksum 会失效）；只允许追加新版本号。

## 回退

```sh
# 代码回退到某个提交（例：122aee7）后按同流程发布即可：
git revert <bad-commit>          # 推荐：正向回退
# 或强制回到历史点（需确认无他人提交）：
git reset --hard <good-commit> && git push origin main --force-with-lease
sh deploy/release.sh --skip-tests
```

- admin 前端产物部署在 nginx 卷上，重跑步骤 5 即可单独刷新前端。
- 数据库由 Flyway 管理：回退代码不会回滚已应用的迁移；涉及删列/删表的新迁移需确认旧代码兼容后再发布。
- 机密文件（`.env`、AnyService 凭据）在服务器上不入库，发布与回退均不影响。

## 检查与证据

- 每次发布的烟雾检查输出保留在服务器 `/root/deploy-run.log`。
- UI 类发布建议在本地先跑 `tests/e2e/admin-redesign-browser.cjs`（隔离 API + Vite，覆盖 7 视口 18 路由），把报告目录记入当次发布说明。
