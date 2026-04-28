#!/usr/bin/env bash
# Production migration script — applies schema changes in safe order.
# Run by the deployment system before starting the API server.
set -e

echo "[migrate] Running database migrations..."
cd "$(dirname "$0")/.."
pnpm --filter @workspace/db run push-force

# `drizzle-kit push --force` has a long-standing quirk where it can drop the
# DEFAULT clause from NOT NULL timestamp columns even when the schema declares
# `.defaultNow()`. The api-server's INSERTs rely on the column-side default
# (Drizzle emits the literal `default` keyword for `.defaultNow()` columns),
# so a missing DEFAULT causes EVERY save into those tables to 500 with
# "null value in column ... violates not-null constraint". Re-apply the
# defaults idempotently after every push so the prod DB is self-healing.
echo "[migrate] Re-asserting NOT NULL timestamp defaults..."
node lib/db/add-missing-timestamp-defaults.mjs

echo "[migrate] Done."
