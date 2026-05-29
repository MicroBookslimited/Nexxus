---
name: Repo is not typecheck-clean
description: api-server and nexus-pos carry pre-existing TS errors unrelated to any single feature; how to judge whether a typecheck failure is yours.
---

`pnpm --filter @workspace/api-server run typecheck` and `pnpm --filter @workspace/nexus-pos run typecheck` both FAIL on `main` with pre-existing errors that are unrelated to whatever feature you're building (e.g. `saas-auth.ts`, `superadmin.ts`, `topup.ts`, an `orders` insert with `orderId`, `tables.tsx`, `MenuPage.tsx`, and `products.ts:~80` referencing `query.data.locationId`, a param that the OpenAPI `listProducts` spec never declared).

**Why:** the codebase predates strict contract-first discipline in spots; Vite/dev runtime works fine because nothing typechecks at runtime. A red full-package typecheck is the normal baseline, not a regression.

**How to apply:** never treat a non-zero typecheck exit as "I broke it." Filter the output to the files you actually touched (`... typecheck 2>&1 | grep -E "fileA|fileB"`). If none of your files appear, you're clean. `pnpm run typecheck:libs` (the composite libs) IS clean and should stay clean.
