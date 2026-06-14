---
name: API server uses Supabase, not the local DATABASE_URL
description: The api-server connects to SUPABASE_DATABASE_URL; sandbox executeSql targets the local Replit DATABASE_URL. DDL must be applied to BOTH or the API 500s.
---

The running `api-server` connects to the **Supabase** database (log line: `[db] Using Supabase database`), driven by `SUPABASE_DATABASE_URL`.

The code-execution sandbox `executeSql` callback (and the Replit-managed Postgres tools) target the **local** `DATABASE_URL`, which is a *different* database.

**Why:** Creating a table only via sandbox `executeSql` makes it exist in the local DB but NOT in Supabase, so every API query against that table returns HTTP 500 (`Failed query: select ... from "<table>"`) even though typecheck, route registration, and `executeSql` all looked fine.

**How to apply:** When `drizzle push` is blocked and you apply DDL manually for a new table/column, run it against **`SUPABASE_DATABASE_URL`** (the DB the API actually uses), not just the sandbox `executeSql`. Quick way: a small node script using `artifacts/api-server/node_modules/pg` with `{ connectionString: process.env.SUPABASE_DATABASE_URL, ssl: { rejectUnauthorized: false } }`. Verify by hitting the live endpoint with a minted tenant JWT (HS256 over `SESSION_SECRET`), not just by checking the sandbox DB.

## Publish/deploy destructive-migration warnings come from the managed DB, NOT Supabase

Replit's Publish flow diffs the **Replit-managed dev DB (`DATABASE_URL`)** against the **Replit-managed prod DB** and applies the diff to prod. It NEVER inspects Supabase. So a destructive publish warning (e.g. "delete card_number column in customers") means the **managed dev DB is missing something the managed prod DB has** — it has nothing to do with the schema-vs-Supabase state.

**Why:** `drizzle.config.ts` resolves `SUPABASE_DATABASE_URL ?? DATABASE_URL`, so `pnpm --filter @workspace/db run push` only updates **Supabase** and leaves the managed dev DB stale. A schema column added only to Supabase is still absent from the managed dev DB → Publish sees dev lacking it → proposes to DROP it from prod (data-loss banner).

**How to apply:** To make a publish diff non-destructive, the fix must land on the **managed dev DB (`DATABASE_URL`)**, which is exactly what sandbox `executeSql` targets. Apply the same additive DDL there (`ALTER TABLE … ADD COLUMN IF NOT EXISTS`, `CREATE … INDEX IF NOT EXISTS`) so dev has what the schema/prod have, then re-publish — prod keeps the column instead of dropping it. Net effect: schema-driven DDL changes generally need to be applied to BOTH Supabase (so the API works) AND the managed dev DB (so Publish stays non-destructive). Non-data-loss churn (dropping prod-only indexes / `DROP DEFAULT`s that exist in neither dev nor schema) is safe to leave.
