---
name: OpenAPI request vs response field parity
description: Any client-supplied field (body OR query param) must be declared in the spec or generated Zod strips it before the handler runs, silently disabling server logic that reads it.
---

When persisting a new field on an order/order-item (or any resource) end-to-end, you must declare it in BOTH places in `lib/api-spec/openapi.yaml`:

- the **response** schema (e.g. `OrderItem`), so the client/receipt sees it on GET, and
- the **request** schema (e.g. `CreateOrderBody.items[]`), so it survives POST.

**Query params are the same trap.** A handler that reads `query.data.locationId` does nothing unless `locationId` is a declared query parameter on that operation in the spec — `ListProductsQueryParams.safeParse(req.query)` strips undeclared keys. This is exactly how per-location pricing silently failed on BOTH paths: `GET /products` (display) had no `locationId` query param, and `CreateOrderBody` (checkout) had no `locationId` field, so the server's override + location-stock logic was dead code even though every POS layout already sent `locationId`.

**Why:** the generated Zod schema (`lib/api-zod`) defaults to stripping unknown keys. If the request schema omits the field, `safeParse` drops it before the route handler runs — even when the client already sends it, the handler already reads it, and the DB column already exists. The feature silently no-ops.

**Where the server reads it:** `api-server`'s `package.json` resolves `@workspace/api-zod` via `exports → ./src/index.ts`, so tsx runs the zod schemas from SOURCE (no dist build needed). Editing `lib/api-zod/src/generated/api.ts` + restarting the api-server workflow is enough for the runtime fix; the react-client type is cosmetic because `getListProductsUrl`/mutation bodies forward all keys via `Object.entries` regardless of TS type.

**How to apply:** after editing either schema, run `pnpm --filter @workspace/api-spec run codegen` and confirm the field appears in the generated request type (`CreateOrderBody...ItemsItem`) AND the request Zod schema, not just the response type. A render/round-trip test that only checks GET output will pass while new writes still lose the field.
