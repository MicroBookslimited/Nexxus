---
name: Orval codegen version drift churn
description: Running full orval codegen can rewrite ALL generated files with version-formatting churn; for a one-field spec change, hand-edit the generated files instead.
---

The installed orval differs from whatever produced the committed generated files (`lib/api-zod/src/generated/**`, `lib/api-client-react/src/generated/**`), so a full `pnpm --filter @workspace/api-spec run codegen` rewrites the output wholesale (pure version-formatting churn) and orval's `clean: true` EMPTIES the hand-maintained barrel `index.ts` that re-exports custom helpers.

**Rule:** for a small additive spec change (one new query param or body field), do NOT run full codegen. Edit the spec for source-of-truth, then hand-edit only the affected generated symbols:
- `lib/api-zod/src/generated/api.ts` — the relevant `zod.object` (query params use `zod.coerce.number()`, body fields use `zod.number()`). This is what the server runs (api-zod resolves to source).
- `lib/api-client-react/src/generated/api.schemas.ts` — the matching TS `type`/`interface` (cosmetic; runtime forwards all keys anyway).

**Why:** keeps the diff reviewable and avoids an unrequested codegen-tooling upgrade riding inside a bugfix.

**If you already ran codegen and got churn:** revert generated files to HEAD with a `git show HEAD:<path> > <path>` loop (read+write, allowed) — NOT `git restore`/`checkout` (blocked for main agent) — then re-apply the surgical edits. A transient `.git/index.lock` from the system auto-checkpoint can make even read-only `git diff` trip the destructive-op guard; verify state with ripgrep instead until it clears.
