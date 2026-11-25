#!/bin/sh
# Run on the development machine. The production host uses its existing API image.
set -eu
cd "$(dirname "$0")/.."
. ./deploy/api-artifact.sh

case "${1:-}" in
  --dry-run)
    echo "Local Maven clean verify, upload the verified JAR, restart production API and check health."
    exit 0 ;;
  '') ;;
  *) echo "Usage: sh deploy/deploy-api.sh [--dry-run]" >&2; exit 2 ;;
esac

api_prepare
api_build
api_deploy
