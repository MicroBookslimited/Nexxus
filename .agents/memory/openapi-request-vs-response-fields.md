---
name: OpenAPI request vs response field parity
description: Adding a field to a response schema alone does not make it round-trip; the request schema must declare it too or generated Zod strips it.
---

When persisting a new field on an order/order-item (or any resource) end-to-end, you must declare it in BOTH places in `lib/api-spec/openapi.yaml`:

- the **response** schema (e.g. `OrderItem`), so the client/receipt sees it on GET, and
- the **request** schema (e.g. `CreateOrderBody.items[]`), so it survives POST.

**Why:** the generated Zod schema (`lib/api-zod`) defaults to stripping unknown keys. If the request body schema omits the field, `CreateOrderBody.safeParse(req.body)` drops it before the route handler runs — even when the POS already sends it, the server insert already reads `item.<field>`, and the DB column already exists. The write silently no-ops for all new rows; only pre-existing rows show the value.

**How to apply:** after editing either schema, run `pnpm --filter @workspace/api-spec run codegen` and confirm the field appears in the generated request type (`CreateOrderBody...ItemsItem`) AND the request Zod schema, not just the response type. A render/round-trip test that only checks GET output will pass while new writes still lose the field.
