---
name: Repo is not typecheck-clean
description: api-server and nexus-pos carry pre-existing TS errors unrelated to any single feature; how to judge whether a typecheck failure is yours.
---

`pnpm --filter @workspace/api-server run typecheck` and `pnpm --filter @workspace/nexus-pos run typecheck` both FAIL on `main` with pre-existing errors that are unrelated to whatever feature you're building (e.g. `saas-auth.ts`, `superadmin.ts`, `topup.ts`, an `orders` insert with `orderId`, `tables.tsx`, `MenuPage.tsx`, and `products.ts:~80` referencing `query.data.locationId`, a param that the OpenAPI `listProducts` spec never declared).

**Why:** the codebase predates strict contract-first discipline in spots; Vite/dev runtime works fine because nothing typechecks at runtime. A red full-package typecheck is the normal baseline, not a regression.

**How to apply:** never treat a non-zero typecheck exit as "I broke it." Filter the output to the files you actually touched (`... typecheck 2>&1 | grep -E "fileA|fileB"`). If none of your files appear, you're clean. `pnpm run typecheck:libs` (the composite libs) IS clean and should stay clean.

**But the baseline is not all cosmetic — read before dismissing.** "Pre-existing" means *not caused by your change*, NOT *harmless*. Confirmed cases in this baseline:

- A `TS2304: Cannot find name` in the baseline was a genuine missing import that would throw `ReferenceError` at runtime the moment its code path executed — a latent hard crash sitting in the "known errors" pile.
- A cluster of `TS2353: Object literal may only specify known properties` marked real behavioral bugs: callers passing an options object whose keys the callee never reads. The declared option defaults silently never applied, and merge logic the function was written to perform could not run. Type-level noise on the surface, wrong data written to a third-party system underneath.

So when you're about to work in a file that carries baseline errors, spend the two minutes to actually read them. `TS2304` (undefined name) and `TS2353` (unknown property on an options/config object) are especially high-signal: the first is a latent crash, the second usually means a caller and callee disagree about a contract and one side is being silently ignored. Fix a trivially-safe one inline; file a task for anything needing a design decision.
