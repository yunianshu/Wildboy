---
name: wenxu-aliyun-deploy
description: 把 Wildboy 项目一键发布到阿里云生产服务器（release.sh 流水线：质量门禁→推 GitHub→SSH 直推服务器→compose 部署→双端烟雾检查）。当用户说「发布」「上线」「部署」「发版」「deploy」「上生产」「发个版」，或要把本项目发布到服务器时使用——即使没有明说"阿里云"。
---

# 阿里云发布（Wildboy 项目专用）

本技能绑定 Wildboy 仓库：技能文件位于仓库 `.zcode/skills/` 内，随仓库走。
所有命令默认在**仓库根目录**执行——先定位仓库根，避免从子目录跑偏：

```sh
cd "$(git rev-parse --show-toplevel)"
```

## 铁律

1. **发布到生产 = 外部不可逆动作**：用户明确说「发布/上线/直接部署」才执行；只有模糊意图（如「要不要发」）时先确认。
2. **禁止猜测服务器地址**。定位不到就问用户，绝不向猜出来的 IP 发起 SSH。
3. **质量门禁失败不许跳过**：`--skip-tests` 仅限用户明说的紧急修正。
4. 失败时**贴出失败步骤的日志尾部**再停下，不要盲目重试。

## 流程

### 第 1 步：发布前检查

```sh
git rev-parse --abbrev-ref HEAD   # 必须是 main
git status --porcelain            # 必须为空，有未提交改动先和用户确认提交
```

工作区有未提交改动时，列出来问用户「一起发布还是先不动」，不要擅自提交无关文件。

### 第 2 步：定位服务器

运行本技能目录下的 `scripts/find-deploy-host.sh`（ZCode 加载本技能时会给出技能基目录；
脚本依次尝试：环境变量 → Windows 注册表用户级变量 → DoH 解析 → known_hosts 交叉验证 →
SSH 免密预检，全过则打印服务器地址）：

```sh
sh "$SKILL_DIR/scripts/find-deploy-host.sh"
```

- 输出地址 → `export WILDBOY_DEPLOY_HOST=<地址>` 继续。
- 脚本退出码非 0 → 按它打印的原因向用户索取地址。
- 当前已知服务器：`60.205.219.30`（api.wildboy.com.cn）。地址变更时以脚本解析结果为准。

### 第 3 步：执行发布

**必须用后台方式运行**（全程 3–8 分钟，前台跑会超时）：

```sh
export WILDBOY_DEPLOY_HOST=<地址> && sh deploy/release.sh
```

release.sh 的 6 步（0 前置检查 → 1 admin 门禁 typecheck+vitest+build → 2 server/ 有变更时 mvn verify → 3 推 GitHub → 4 SSH 直推服务器快进 main → 5 服务器 compose 重建+烟雾检查 → 6 公网烟雾 www/api 均 200），任一步失败脚本自动退出。

常用变体：`--dry-run` 预演不执行；`--skip-tests` 仅紧急修正。

### 第 4 步：汇报

按 6 步表格汇报结果（步骤 → 状态），附发布版本号（`git rev-parse --short HEAD`）。全部通过后提醒用户到线上手动验收。全绿的输出长这样：

```
==> 0/6 发布目标：b5a281a feat(admin): ...
==> 5/6 服务器执行部署 … api: OK / edge (with credential): OK / admin: OK / deploy complete
==> 6/6 公网烟雾检查 … www.wildboy.com.cn: 200 / api.wildboy.com.cn 公开接口: 200
发布完成：b5a281a 已上线。
```

## 第 5 步（条件）：小程序上传

**触发条件**：本次发布区间内的提交改动了 `miniprogram/`，或**服务端公开接口的响应字段发生变化**。
后一条尤其重要——服务端改了返回格式而小程序不重新上传，线上旧版小程序会因校验新字段失败
（实际事故：响应 `blocks`→`contentNodes` 切换后，旧版小程序文章详情全部报「文章加载失败」，列表却正常）。

先问用户「本次发布是否动了小程序或接口契约」，用户确认后再执行；也可用
`git diff --name-only <上次发布commit>..HEAD -- miniprogram/` 自查。

```sh
cd "$(git rev-parse --show-toplevel)/miniprogram"
npm test                                        # 全量测试（约 520 项）
npm run build                                   # 生产配置构建（脚本会校验 apiOrigin 与开发登录关闭）
node scripts/upload.cjs --check-config          # 上传前配置校验
WILDBOY_VERSION=<语义化版本> WILDBOY_DESC="<本次改动说明>" node scripts/upload.cjs
```

- 上传密钥：`%USERPROFILE%/.wechat-keys/private.wxa62bfca387e6809b.key`（或环境变量 `WILDBOY_UPLOAD_KEY`）。
- `ci.upload` 只是把新版本传成微信平台的**开发版本**，输出 `UPLOAD OK` 仅代表上传成功。

**上传成功后必须告知用户剩余的人工步骤**（无法代操作）：

1. [mp.weixin.qq.com](https://mp.weixin.qq.com) → 版本管理 → 开发版本 → 设为体验版，真机验收
2. 提交审核 → 审核通过后全量发布，线上正式版才更新

## 失败处理

| 失败点 | 动作 |
| --- | --- |
| 步骤 1 门禁失败 | 修代码重新走流程，不许 `--skip-tests` |
| 步骤 3 GitHub 推送失败 | 检查凭证/网络后重试一次，仍失败报告用户 |
| 步骤 5 服务器部署失败 | `ssh root@<host> 'tail -50 /root/deploy-run.log'` 贴日志尾部，诊断后决定重试或回退 |
| 步骤 6 公网烟雾失败 | 先查服务器 `docker ps` 与容器日志，可能是 nginx 重建未完成，等 30 秒复查一次 |
| 小程序 `ci.upload` 失败 | 常见原因：上传密钥缺失/过期（微信平台「开发设置-代码上传密钥」重新下载）、平台开了 IP 白名单但本机出口 IP 未加入；按报错贴给用户 |

## 数据库与回退（发布前必读场景）

- API 容器启动时 Flyway 自动迁移，**只前进不回退**。
- 若本次发布包含 `server/src/main/resources/db/migration/` 的新迁移：先用临时库对生产 `flyway_schema_history` 做 `validate` 预检（做法见 deploy/RELEASE.md），否则校验失败会导致 API 起不来。
- 回退方式：`git revert <bad-commit>` 后重走发布；admin 前端产物在 nginx 卷上，重跑服务器部署步骤即可单独刷新前端。详见仓库 `deploy/RELEASE.md`。
