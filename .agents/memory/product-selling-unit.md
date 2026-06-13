---
name: Product selling unit (UOM) on receipts
description: Why order-item sellingUnit is a live join, not a snapshot, and the tenant-scoping rule.
---

# Product selling unit (UOM)

`products.selling_unit` is an OPTIONAL free-text label (each/case/pieces...) separate
from the weight-only `unitOfMeasure` enum. Order-item API responses surface it via a
**live join** (`sellingUnitMap` in orders.ts) keyed on current product value — it is
deliberately NOT snapshotted onto `order_items`.

**Why:** the field is a display label, not a financial fact; historical receipts showing
the current UOM is acceptable and avoids an order_items schema change. If historically
stable receipts are ever required, persist it on order_items at create time.

**How to apply:** any product-attribute join onto order/tenant resources MUST include a
`tenantId` predicate (`and(eq(productsTable.tenantId, tenantId), inArray(...))`) — a
prior review caught a cross-tenant leak from an id-only `IN (...)` lookup. Batch the
lookup once per request (not per order) to avoid N+1.

**Also carried by the same helper:** order-item `isTaxable` (for the supermarket
receipt's per-line T/N marker) is resolved the SAME live-join way — `order_items` has
no `is_taxable` column, so the `sellingUnitMap` helper returns `{sellingUnit, isTaxable}`
from the current product. Same live-vs-snapshot tradeoff applies. Adding a NEW such field
still requires adding it to the OpenAPI OrderItem RESPONSE schema + codegen, or
`GetOrderResponse.parse`/`ListOrdersResponse.parse` strips it before it reaches the client.
