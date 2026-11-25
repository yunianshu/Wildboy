# Wildboy 发布流程（固定流程）

一条命令完成从质量门禁到生产上线的全部步骤：

```sh
export WILDBOY_DEPLOY_HOST=<服务器地址>   # 一次性；建议写入本机环境
sh deploy/release.sh                      # 完整发布
sh deploy/release.sh --skip-tests         # 紧急修正时跳过 admin 门禁
sh deploy/release.sh --dry-run            # 预演（只打印步骤，不执行）
```

前置条件：本机 `main` 分支且工作区干净；SSH 免密可达服务器（首次配置见 [README](README.md)）；服务器 `/root/Wildboy` 部署检出与 `/root/Wildboy/.env` 机密文件就位。

## 发版前递增版本号

后台和小程序各自维护版本号。发布新版后台前递增 `admin/package.json` 的版本；上传新版小程序前递增 `miniprogram/package.json` 的版本。普通更新默认升补丁号；如已约定其他版本号，使用约定值。可在对应目录运行 `npm version patch --no-git-tag-version`，并把 `package.json` 和 `package-lock.json` 一起纳入本次发布提交。

后台构建会显示包版本和短提交号；短提交号用于定位代码。小程序用更新后的包版本重新构建并上传，常规发版直接使用构建版本，确保微信平台与包内显示一致。设为体验版、提审和发布正式版都在微信公众平台的版本管理中操作。

## release.sh 每一步做什么

| 步骤 | 内容 | 失败处理 |
| --- | --- | --- |
| 0 | 确认 main 分支、工作区干净，打印发布目标 | 阻断 |
| 1 | admin 门禁：`vue-tsc` + vitest + 生产构建 | 阻断（`--skip-tests` 可跳过，仅紧急修正） |
| 2 | 开发机执行 Maven `clean verify`，保留通过测试的 JAR | 阻断 |
| 3 | `git push origin main` 推送 GitHub | 阻断 |
| 4 | SSH 直推服务器 `deploy-staging` 分支并 `--ff-only` 快进 main；上传 `deploy/deploy-steps.sh` | 阻断 |
| 5 | 上传并校验 JAR，沿用原 API 镜像重建容器。随后构建管理后台并运行烟雾检查 | API 启动或本机冒烟失败时恢复上一套 Compose 配置。管理后台步骤超时 10 分钟 |
| 6 | 公网烟雾：www.wildboy.com.cn 200、api.wildboy.com.cn 公开接口 200 | 阻断 |

步骤 4 通过 SSH 同步部署文件。只部署后端时，从开发机运行 `sh deploy/deploy-api.sh`。

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

- 管理后台产物挂载在 nginx 容器上，可单独运行服务器侧的 `deploy/deploy-steps.sh` 刷新。
- 数据库由 Flyway 管理：回退代码不会回滚已应用的迁移；涉及删列/删表的新迁移需确认旧代码兼容后再发布。
- 机密文件（`.env`、AnyService 凭据）在服务器上不入库，发布与回退均不影响。

## 检查与证据

- 每次发布的烟雾检查输出保留在服务器 `/root/deploy-run.log`。
- UI 类发布建议在本地先跑 `tests/e2e/admin-redesign-browser.cjs`（隔离 API + Vite，覆盖 7 视口 18 路由），把报告目录记入当次发布说明。
