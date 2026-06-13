---
name: lib schema/codegen change → rebuild composite libs
description: Why artifact typecheck shows phantom "property does not exist" after a lib/db schema or OpenAPI codegen change, and how to clear it.
---

After changing a `lib/*` package's emitted types — e.g. adding a column to `lib/db/src/schema/*` (changes `$inferSelect`/`$inferInsert`) or regenerating the OpenAPI client (changes the generated `Order`/Zod types) — the leaf artifacts (`artifacts/api-server`, `artifacts/nexus-pos`, …) keep typechecking against the **stale built declarations** until the composite libs are rebuilt.

Symptom: `tsc --noEmit` on the artifact reports `Property 'X' does not exist on type '…'` for the field you just added, even though the source schema/spec clearly has it.

Fix: run `pnpm run typecheck:libs` (i.e. `tsc --build`) from the workspace root first, then re-run the artifact typecheck. Codegen alone (`pnpm --filter @workspace/api-spec run codegen`) regenerates source but does NOT rebuild the lib's emitted `.d.ts`.

**Why:** libs are composite and consumed via their built declarations; leaf packages don't re-derive lib types on every check.
**How to apply:** any task touching `lib/db` schema or the OpenAPI spec → regen (if spec) → `typecheck:libs` → then artifact typecheck. Don't chase a "missing property" error in the artifact before rebuilding libs.
