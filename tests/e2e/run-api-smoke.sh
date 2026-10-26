#!/usr/bin/env bash
# Starts isolated real PostgreSQL + HTTP API, runs synthetic fixtures, then cleans up.
set -euo pipefail
repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo/server"
MVN="${MVN:-mvn}"
JAVA="${JAVA:-java}"
if [[ -e /tmp/wildboy-smoke-env ]]; then echo 'A previous smoke fixture is active or left a token file; stop that fixture before retrying.' >&2; exit 1; fi
if curl --silent --max-time 2 http://127.0.0.1:8080/actuator/health >/dev/null; then echo 'Port 8080 is occupied; do not run fixtures against an existing server.' >&2; exit 1; fi
work="$(mktemp -d)"
pid=''
cleanup() { if [[ -n "$pid" ]]; then kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true; fi; rm -rf "$work"; }
trap cleanup EXIT
"$MVN" -B test-compile dependency:build-classpath -Dmdep.outputFile="$work/classpath" -Dmdep.includeScope=test
"$JAVA" -cp "target/classes:target/test-classes:$(cat "$work/classpath")" com.wildboy.LocalSmokeServer >"$work/server.log" 2>&1 &
pid=$!
ready=false
for _ in $(seq 1 60); do
 if curl --silent --fail http://127.0.0.1:8080/actuator/health >/dev/null && [[ -f /tmp/wildboy-smoke-env ]]; then ready=true; break; fi
 if ! kill -0 "$pid" 2>/dev/null; then cat "$work/server.log"; exit 1; fi
 sleep 1
done
if [[ "$ready" != true ]]; then cat "$work/server.log"; echo 'API startup timed out' >&2; exit 1; fi
set -a
source /tmp/wildboy-smoke-env
set +a
python3 "$repo/tests/e2e/api_smoke.py"
