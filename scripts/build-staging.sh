#!/usr/bin/env bash
# Cross-platform implementation lives in build-staging.mjs. Keep this wrapper
# for Git Bash and existing documentation while making Windows/CI behavior the
# same everywhere.
set -euo pipefail
cd "$(dirname "$0")/.."
exec npm run build:staging
