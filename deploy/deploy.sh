#!/bin/sh
# Compatibility entry point. Run on the development machine.
set -eu
exec sh "$(dirname "$0")/release.sh" "$@"
