---
name: Order receipt derived fields (staffName) have multiple serialization paths
description: Why a receipt field that isn't a stored order column can silently appear on some receipts but not others
---

# Order derived fields diverge across serialization paths

The `orders` table stores `staffId`, not the cashier's display name. `staffName`
on an Order response is a DERIVED value, resolved by joining `staff`. There are
multiple independent serialization paths that each must populate it:

- `getOrderWithItems()` (single order: create/get/update/charge) does the staff
  join and sets `staffName`.
- The `GET /orders` LIST route builds its own object from `normalizeOrder(order)`
  and does NOT inherit that join — it must do its own (batched, tenant-scoped)
  staff lookup.
- The frontend order-history **reprint** path constructs its own `receiptOrder`
  from the list data, so it only has whatever the LIST route returned.

`zod` strips unknown keys on `.parse()`, so a field missing from the Order schema
is silently dropped even if a handler set it.

**Why:** cashier name was missing from online/reprinted receipts because the field
was never in the schema AND the list route never resolved it — only the live POS
checkout path happened to carry it. Adding it in one place is not enough.

**How to apply:** when adding any receipt/display field that is derived (not a raw
order column), (1) add it to the Order schema in openapi, (2) populate it in BOTH
`getOrderWithItems` and the LIST route (batch the lookup to avoid N+1), and (3)
thread it through every frontend path that builds a `receiptOrder` (live checkout,
offline receipt, and reprint). `stationNumber` IS a stored column, so it rides
`...normalizeOrder(order)` for free — derived fields do not.
