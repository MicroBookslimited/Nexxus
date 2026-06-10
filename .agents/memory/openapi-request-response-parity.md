---
name: OpenAPI request/response field parity
description: Fields that round-trip through the API must be in BOTH the request body schema AND the resource/response schema, or codegen strips them on one leg.
---

# OpenAPI request/response field parity

When a field travels client → server → DB → back to client, it must be declared
in **both** the request schema (e.g. `CreateXBody`) **and** the resource/response
schema (e.g. `Order`) in `lib/api-spec/openapi.yaml`. Codegen (orval → api-zod +
api-client-react) produces validators/types from each schema independently.

**Why:** A field present only in the request is stripped by server-side
`Schema.safeParse(req.body)` (Zod drops unknown keys) → stored null. A field
present only in the response (or in neither) is dropped/untyped on the way back,
so the frontend reads `undefined` even though the DB has the value. Both legs
must be fixed; fixing only one looks "half working" (data stored but not
displayed, or displayed-from-fallback but never stored).

**How to apply:** For any new persisted, client-visible field on a resource,
grep the field name in `openapi.yaml` and confirm it appears in the request body
schema, the resource/response schema, and (if applicable) any list-response item
schema. Then run `pnpm --filter @workspace/api-spec run codegen` and
`pnpm run typecheck:libs`, and **restart the api-server** (it imports
`@workspace/api-zod` from `src` but the running process caches the old module).
Concrete instance: `cashTendered` on orders was missing from `CreateOrderBody`
(stored null for all layouts) and separately from the `Order` response schema
(never reached the POS popup/receipt). Both had to be added.
