---
name: drizzle push applies ALL schema drift
description: Why `db push` can prompt to truncate an unrelated table, and the safe alternative for a single additive column.
---

`pnpm --filter @workspace/db run push` diffs the ENTIRE local Drizzle schema against the live DB and tries to apply every difference at once — not just the column you added. This repo carries pre-existing drift (e.g. a `tenants_slug_unique` constraint in code that isn't in the DB), so push can stop on an interactive prompt offering to **truncate the tenants table** to add that constraint. Never accept truncation.

**Rule:** for a simple additive column, skip `db push` and apply it directly + idempotently with SQL:
`psql "$DATABASE_URL" -c "ALTER TABLE <t> ADD COLUMN IF NOT EXISTS <col> <type>;"`

**Why:** push is all-or-nothing over the full diff; unrelated drift turns a one-column change into a risky multi-statement migration with destructive prompts. A targeted ALTER touches only what you intend.

**How to apply:** when you add ONE nullable column to an existing table, ALTER it directly and verify via `information_schema.columns`. Keep the Drizzle schema file in sync (so codegen/types are right) but don't rely on `push` to land it. Reserve `push` for when you intend to reconcile all drift and can answer its prompts safely.
