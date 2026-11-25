#!/bin/sh
# Shared by the local API-only and full release entry points.
api_prepare() {
  : "${WILDBOY_DEPLOY_HOST:?Set WILDBOY_DEPLOY_HOST to the production SSH host}"
  case "$WILDBOY_DEPLOY_HOST" in
    -*|*[!A-Za-z0-9.-]*) echo "Invalid deployment host" >&2; return 2 ;;
  esac
  API_HOST="root@$WILDBOY_DEPLOY_HOST"
  API_SSH_OPTS="-o BatchMode=yes -o ConnectTimeout=10 -o ServerAliveInterval=15"
  API_LOCAL_DIR=$(mktemp -d)
  trap 'rm -f "$API_LOCAL_DIR/app.jar"; rmdir "$API_LOCAL_DIR"' EXIT
}

api_build() {
  echo "==> Build and test the API locally"
  api_maven=mvn
  if ! command -v mvn >/dev/null 2>&1 && command -v mvn.cmd >/dev/null 2>&1; then
    api_maven=mvn.cmd
  fi
  (cd server && "$api_maven" --batch-mode --no-transfer-progress clean verify)
  cp server/target/wildboy-server-0.1.0.jar "$API_LOCAL_DIR/app.jar"
}

api_deploy() {
  api_sha=$(sha256sum "$API_LOCAL_DIR/app.jar" | cut -d' ' -f1)
  api_stage=$(ssh $API_SSH_OPTS "$API_HOST" 'mkdir -p /root/wildboy-deploy && mktemp -d /root/wildboy-deploy/api-jar.XXXXXXXX')
  case "$api_stage" in
    /root/wildboy-deploy/api-jar.*) ;;
    *) echo "Unexpected remote staging directory" >&2; return 1 ;;
  esac
  case "${api_stage#/root/wildboy-deploy/api-jar.}" in
    ''|*[!A-Za-z0-9]*) echo "Invalid staging directory suffix" >&2; return 1 ;;
  esac
  scp -q $API_SSH_OPTS "$API_LOCAL_DIR/app.jar" "$API_HOST:$api_stage/app.jar"
  ssh $API_SSH_OPTS "$API_HOST" "sh -s -- '$api_stage' '$api_sha'" < deploy/switch-api-jar.sh
  curl -fsS --max-time 15 'https://api.wildboy.com.cn/api/v1/activities?page=0&size=1' >/dev/null
  echo "Production public API: OK"
}
