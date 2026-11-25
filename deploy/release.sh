#!/bin/sh
# Wildboy 一键发布（在开发机、仓库根目录运行）。
#
# 前置条件：
#   - 本机 main 分支、工作区干净（未提交改动一律不发布）
#   - SSH 免密可达服务器：export WILDBOY_DEPLOY_HOST=<server>（建议写入本机环境）
#   - 服务器 /root/Wildboy 为部署检出（.env 等机密不入库，不受影响）
#
# 用法：
#   sh deploy/release.sh                 # 完整发布（含质量门禁）
#   sh deploy/release.sh --skip-tests    # 跳过 admin 门禁（仅紧急修正用）
#   sh deploy/release.sh --dry-run       # 只打印将执行的步骤
#
# 流程与回退详见 deploy/RELEASE.md。
set -eu

REPO=$(cd "$(dirname "$0")/.." && pwd)
cd "$REPO"
. ./deploy/api-artifact.sh

SKIP_TESTS=0
DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --skip-tests) SKIP_TESTS=1 ;;
    --dry-run) DRY_RUN=1 ;;
    *) echo "未知参数: $arg" >&2; exit 1 ;;
  esac
done

DEPLOY_HOST="${WILDBOY_DEPLOY_HOST:-}"
if [ -z "$DEPLOY_HOST" ]; then
  echo "ERROR: 未设置 WILDBOY_DEPLOY_HOST（例如 export WILDBOY_DEPLOY_HOST=<服务器地址>）" >&2
  exit 1
fi
SSH_OPTS="-o BatchMode=yes -o ConnectTimeout=10"
SERVER_REPO="ssh://root@$DEPLOY_HOST/root/Wildboy"

branch=$(git rev-parse --abbrev-ref HEAD)
[ "$branch" = "main" ] || { echo "ERROR: 必须在 main 分支发布（当前 $branch）" >&2; exit 1; }
if [ -n "$(git status --porcelain)" ]; then
  echo "ERROR: 工作区有未提交改动，先提交或暂存再发布：" >&2
  git status --short | head -10 >&2
  exit 1
fi

head_short=$(git rev-parse --short HEAD)
echo "==> 0/6 发布目标：$head_short $(git log --oneline -1 | cut -d' ' -f2-)"
if [ "$DRY_RUN" = "1" ]; then
  echo "==> 1/6 [dry-run] admin 质量门禁（typecheck + vitest + build）"
  echo "==> 2/6 [dry-run] 本地 Maven clean verify 并准备 JAR"
  echo "==> 3/6 [dry-run] git push origin main"
  echo "==> 4/6 [dry-run] git push $SERVER_REPO main:refs/heads/deploy-staging"
  echo "           ssh: cd /root/Wildboy && git merge --ff-only deploy-staging && git branch -D deploy-staging"
  echo "           scp deploy/deploy-steps.sh -> /root/deploy-steps.sh"
  echo "==> 5/6 [dry-run] 上传 JAR、重建 API 容器并检查健康"
  echo "           服务器 nohup sh /root/deploy-steps.sh，轮询日志至 deploy complete"
  echo "==> 6/6 [dry-run] 公网烟雾检查 www.wildboy.com.cn + api.wildboy.com.cn"
  exit 0
fi

echo "==> 1/6 admin 质量门禁（typecheck + vitest + build）"
if [ "$SKIP_TESTS" = "1" ]; then
  echo "    已跳过（--skip-tests）"
else
  (cd admin && npm run typecheck >/dev/null)
  if ! (cd admin && npm test >/tmp/wildboy-vitest.log 2>&1); then
    tail -40 /tmp/wildboy-vitest.log >&2
    exit 1
  fi
  grep -E "Test Files|Tests " /tmp/wildboy-vitest.log | tail -2
  (cd admin && npm run build >/dev/null)
fi

api_prepare
api_build

echo "==> 3/6 推送 GitHub"
git push origin main

echo "==> 4/6 推送服务器并快进 main（绕开服务器到 GitHub 的不稳定链路）"
git push "$SERVER_REPO" main:refs/heads/deploy-staging
ssh $SSH_OPTS "root@$DEPLOY_HOST" '
  cd /root/Wildboy &&
  git merge --ff-only deploy-staging >/dev/null &&
  git branch -D deploy-staging >/dev/null &&
  echo "    服务器 main = $(git rev-parse --short HEAD)"'
scp -q $SSH_OPTS deploy/deploy-steps.sh "root@$DEPLOY_HOST:/root/deploy-steps.sh"

echo "==> 5/6 部署已验证的 JAR"
api_deploy

echo "==> 构建 admin、重建 nginx 并检查服务"
ssh $SSH_OPTS "root@$DEPLOY_HOST" \
  'nohup sh /root/deploy-steps.sh > /root/deploy-run.log 2>&1 & echo started'
deploy_done=0
for _ in $(seq 1 120); do
  sleep 5
  log_tail=$(ssh $SSH_OPTS "root@$DEPLOY_HOST" 'tail -1 /root/deploy-run.log' 2>/dev/null || true)
  case "$log_tail" in
    "deploy complete") deploy_done=1; break ;;
    *"ERROR"*|*"error:"*|*"failed"*)
      echo "部署失败，日志尾部：" >&2
      ssh $SSH_OPTS "root@$DEPLOY_HOST" 'tail -30 /root/deploy-run.log' >&2
      exit 1
      ;;
  esac
done
if [ "$deploy_done" != "1" ]; then
  echo "ERROR: 部署超时（10 分钟）未完成，请检查服务器 /root/deploy-run.log" >&2
  exit 1
fi
ssh $SSH_OPTS "root@$DEPLOY_HOST" 'grep -E "OK|complete" /root/deploy-run.log | tail -6'

echo "==> 6/6 公网烟雾检查"
admin_code=$(curl -s -o /dev/null -w '%{http_code}' https://www.wildboy.com.cn/)
[ "$admin_code" = "200" ] && echo "    www.wildboy.com.cn: 200" || { echo "ERROR: www.wildboy.com.cn -> $admin_code" >&2; exit 1; }
api_code=$(curl -s -o /dev/null -w '%{http_code}' "https://api.wildboy.com.cn/api/v1/activities?page=0&size=1")
[ "$api_code" = "200" ] && echo "    api.wildboy.com.cn 公开接口: 200" || { echo "ERROR: api.wildboy.com.cn -> $api_code" >&2; exit 1; }

echo "发布完成：$head_short 已上线。回退方法见 deploy/RELEASE.md。"
