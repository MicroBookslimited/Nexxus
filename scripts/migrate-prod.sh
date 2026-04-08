#!/usr/bin/env bash
# Production migration script — applies schema changes in safe order.
# Run by the deployment system before starting the API server.
set -e

echo "[migrate] Running database migrations..."
cd "$(dirname "$0")/.."
pnpm --filter @workspace/db run push-force
echo "[migrate] Done."
