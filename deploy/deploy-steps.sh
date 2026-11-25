#!/bin/sh
# Run the admin and gateway deployment after the API JAR is deployed.
set -eu
APP_DIR=/root/Wildboy
cd "$APP_DIR"

if [ ! -f .env ]; then
  echo "ERROR: $APP_DIR/.env missing (copy .env.example and fill secrets)" >&2
  exit 1
fi

echo "==> 3/5 build admin bundle (node container)"
ADMIN_REVISION=$(git rev-parse --short HEAD)
docker run --rm -v "$APP_DIR/admin:/app" -w /app \
  -e npm_config_registry=https://registry.npmmirror.com \
  -e WILDBOY_ADMIN_REVISION="$ADMIN_REVISION" \
  node:22-alpine sh -c "npm ci --no-audit --no-fund && npm run build"

echo "==> 4/5 render edge config and (re)start edge + admin nginx"
CRED_FILE="${WILDBOY_ANY_CRED_FILE:-/root/wildboy-deploy/anyservice-cred.txt}"
if [ ! -f "$CRED_FILE" ]; then
  echo "ERROR: AnyService credential file not found: $CRED_FILE" >&2
  exit 1
fi
ANY_AUTH=$(grep -E '^ANYSERVICE_AUTHORIZATION_HEADER=' "$CRED_FILE" | head -1 | cut -d= -f2- | tr -d '\r')
case "$ANY_AUTH" in
  "Basic "*) ;;
  *)
    echo "ERROR: ANYSERVICE_AUTHORIZATION_HEADER must start with 'Basic ' (got: ${ANY_AUTH:-empty})" >&2
    exit 1
    ;;
esac
export ANYSERVICE_AUTHORIZATION_HEADER="$ANY_AUTH"

RUNTIME_DIR=/root/wildboy-deploy
mkdir -p "$RUNTIME_DIR/edge" "$RUNTIME_DIR/admin"
sed "s|__ANY_AUTH_HEADER__|${ANYSERVICE_AUTHORIZATION_HEADER}|" \
  deploy/nginx-edge.conf.template > "$RUNTIME_DIR/edge/nginx-edge.conf"
cp deploy/nginx-admin.conf "$RUNTIME_DIR/admin/nginx-admin.conf"

docker rm -f wildboy-edge wildboy-admin >/dev/null 2>&1 || true
docker run -d --name wildboy-edge --restart unless-stopped --network host \
  -v "$RUNTIME_DIR/edge/nginx-edge.conf:/etc/nginx/conf.d/default.conf:ro" \
  nginx:1.27-alpine >/dev/null
docker run -d --name wildboy-admin --restart unless-stopped --network host \
  -v "$APP_DIR/admin/dist:/usr/share/nginx/html:ro" \
  -v "$RUNTIME_DIR/admin/nginx-admin.conf:/etc/nginx/conf.d/default.conf:ro" \
  nginx:1.27-alpine >/dev/null
sleep 2

echo "==> 5/5 smoke checks"
curl -sf http://127.0.0.1:8080/actuator/health >/dev/null && echo "api: OK"
code=$(curl -s -o /dev/null -w '%{http_code}' \
  -H "x-anyservice-authorization: ${ANYSERVICE_AUTHORIZATION_HEADER}" \
  "http://127.0.0.1/api/v1/activities?page=0&size=1")
[ "$code" = "200" ] && echo "edge (with credential): OK" || { echo "edge with credential: $code" >&2; exit 1; }
code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1/api/v1/activities")
[ "$code" = "403" ] && echo "edge (anonymous blocked): OK" || { echo "edge anonymous: $code (want 403)" >&2; exit 1; }
curl -sf http://127.0.0.1:8081/health >/dev/null && echo "admin: OK"

echo "deploy complete"
