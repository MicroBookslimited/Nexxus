---
name: API server uses Supabase, not the local DATABASE_URL
description: The api-server connects to SUPABASE_DATABASE_URL; sandbox executeSql targets the local Replit DATABASE_URL. DDL must be applied to BOTH or the API 500s.
---

The running `api-server` connects to the **Supabase** database (log line: `[db] Using Supabase database`), driven by `SUPABASE_DATABASE_URL`.

The code-execution sandbox `executeSql` callback (and the Replit-managed Postgres tools) target the **local** `DATABASE_URL`, which is a *different* database.

**Why:** Creating a table only via sandbox `executeSql` makes it exist in the local DB but NOT in Supabase, so every API query against that table returns HTTP 500 (`Failed query: select ... from "<table>"`) even though typecheck, route registration, and `executeSql` all looked fine.

**How to apply:** When `drizzle push` is blocked and you apply DDL manually for a new table/column, run it against **`SUPABASE_DATABASE_URL`** (the DB the API actually uses), not just the sandbox `executeSql`. Quick way: a small node script using `artifacts/api-server/node_modules/pg` with `{ connectionString: process.env.SUPABASE_DATABASE_URL, ssl: { rejectUnauthorized: false } }`. Verify by hitting the live endpoint with a minted tenant JWT (HS256 over `SESSION_SECRET`), not just by checking the sandbox DB.
