#!/bin/sh
# Runs on the production host via SSH.
set -eu
stage=$1
expected_sha=$2
cd /root/Wildboy
exec 9>/root/wildboy-deploy/api-deploy.lock
flock -n 9 || { echo "ERROR: another API deployment is running" >&2; exit 1; }

printf '%s  %s\n' "$expected_sha" "$stage/app.jar" | sha256sum -c -
chmod 644 "$stage/app.jar"

previous_container=$(docker compose -p wildboy ps -a -q api)
[ -n "$previous_container" ] || { echo "ERROR: existing production API container required" >&2; exit 1; }
previous_files=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project.config_files"}}' "$previous_container")
previous_image=$(docker inspect --format '{{.Image}}' "$previous_container")
[ "$(docker image inspect --format '{{.Id}}' wildboy-api)" = "$previous_image" ] || {
  echo "ERROR: local wildboy-api image differs from the running API image" >&2
  exit 1
}

compose_with() (
  compose_files=$1
  shift
  # Compose records its configuration file list as comma-separated absolute paths.
  set -f
  original_ifs=$IFS
  IFS=,
  reversed_files=
  for compose_file in $compose_files; do
    reversed_files="$compose_file${reversed_files:+,$reversed_files}"
  done
  for compose_file in $reversed_files; do
    set -- -f "$compose_file" "$@"
  done
  IFS=$original_ifs
  docker compose -p wildboy "$@"
)

# Preserve production overlays, while replacing the JAR overlay from the last deploy.
base_files=
original_ifs=$IFS
IFS=,
set -f
for compose_file in $previous_files; do
  case "$compose_file" in
    /root/wildboy-deploy/api-jar.*/compose.jar.yml|/root/wildboy-deploy/jar-*/compose.jar.yml) ;;
    /*) base_files="${base_files:+$base_files,}$compose_file" ;;
    *) echo "ERROR: unexpected production Compose configuration" >&2; exit 1 ;;
  esac
done
IFS=$original_ifs
[ -n "$base_files" ] || { echo "ERROR: production Compose files not found" >&2; exit 1; }

cat > "$stage/compose.jar.yml" <<EOF
services:
  api:
    volumes:
      - type: bind
        source: $stage/app.jar
        target: /app/app.jar
        read_only: true
        bind:
          create_host_path: false
EOF
next_files="$base_files,$stage/compose.jar.yml"
compose_with "$next_files" config --quiet

restart_api() {
  compose_with "$1" up -d --no-build --no-deps --pull never --force-recreate api
}

wait_for_api() {
  for attempt in $(seq 1 60); do
    if curl -fsS --max-time 2 http://127.0.0.1:8080/actuator/health 2>/dev/null | grep -q '"status"[[:space:]]*:[[:space:]]*"UP"'; then
      return 0
    fi
    sleep 2
  done
  return 1
}

if restart_api "$next_files" && wait_for_api &&
  [ "$(docker inspect --format '{{.Image}}' wildboy-api-1)" = "$previous_image" ] &&
  [ "$(docker exec wildboy-api-1 sha256sum /app/app.jar | cut -d' ' -f1)" = "$expected_sha" ] &&
  curl -fsS --max-time 5 'http://127.0.0.1:8080/api/v1/activities?page=0&size=1' >/dev/null; then
  echo "Production API healthy with JAR $expected_sha"
else
  echo "ERROR: API deployment failed, restoring the previous Compose configuration" >&2
  if restart_api "$previous_files" && wait_for_api; then
    echo "Previous API is healthy" >&2
  else
    echo "ERROR: previous API failed its health check" >&2
  fi
  exit 1
fi
