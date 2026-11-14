#!/bin/sh
# 定位 Wildboy 阿里云发布服务器并验证 SSH 免密可达，成功则打印地址。
# 探测顺序：会话环境变量 → Windows 注册表用户/机器级变量 → DoH 解析项目域名
# → known_hosts 交叉验证 → SSH 免密预检。
# 用法: sh find-deploy-host.sh [域名]   （域名默认 api.wildboy.com.cn）
set -eu

DOMAIN="${1:-api.wildboy.com.cn}"
HOST="${WILDBOY_DEPLOY_HOST:-}"

# 1) Windows 注册表里的用户/机器级变量（当前会话可能没继承到）
if [ -z "$HOST" ] && command -v powershell.exe >/dev/null 2>&1; then
  HOST=$(powershell.exe -NoProfile -Command \
    "[Environment]::GetEnvironmentVariable('WILDBOY_DEPLOY_HOST','User'); [Environment]::GetEnvironmentVariable('WILDBOY_DEPLOY_HOST','Machine')" \
    2>/dev/null | tr -d '\r' | grep -m1 . || true)
fi

# 2) DoH 解析域名 A 记录。本机 DNS 可能被代理 fake-IP 接管
#    （返回 198.18.x.x 或 2001:2:: 开头都是指纹，不可信），所以直连 223.5.5.5 的 DoH 接口。
if [ -z "$HOST" ]; then
  HOST=$(curl -s --max-time 10 "https://223.5.5.5/resolve?name=$DOMAIN&type=A" \
    | sed -n 's/.*"data":"\([0-9.]*\)".*/\1/p' | head -1 || true)
fi

# 3) known_hosts 交叉验证（不在里面不代表错，但值得人工确认一眼）
if [ -n "$HOST" ] && [ -f "$HOME/.ssh/known_hosts" ]; then
  if ! grep -q "^$HOST[ ,]" "$HOME/.ssh/known_hosts" 2>/dev/null; then
    echo "WARN: $HOST 不在 known_hosts，请确认这是目标服务器" >&2
  fi
fi

if [ -z "$HOST" ]; then
  echo "ERROR: 未能定位服务器地址（环境变量、注册表、DoH 解析均未命中），请向用户索取" >&2
  exit 1
fi

# 4) SSH 免密预检
if ! ssh -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new \
    root@"$HOST" 'echo SSH-OK' >/dev/null 2>&1; then
  echo "ERROR: root@$HOST SSH 免密不可达（检查密钥或向用户确认地址）" >&2
  exit 1
fi

echo "$HOST"
