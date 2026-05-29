---
name: Two parallel stock systems (global vs per-location)
description: How NEXXUS tracks stock in two places that drift, and the rule the product dashboard uses to combine them.
---

NEXXUS tracks product stock in TWO places that are NOT kept in sync on the way in:
- `productsTable.stockCount` — a single global "grand total" number.
- `locationInventoryTable.stockCount` — per-location rows (one per location per product).

**Sale** (orders.ts) decrements BOTH: global `stockCount` AND the location row — so a sale keeps them moving together. **Stock-in does not:** purchase bills bump ONLY global `stockCount`; manual per-location entry (`PUT /locations/:id/inventory/:productId`) writes ONLY the location row. So multi-location tenants who distribute stock per branch end up with a global `stockCount` that under-reports (often 0), and the catalog showed "Out of stock".

**Dashboard rule (GET /products, no locationId):** for non-composite products, sum `location_inventory` across all of the tenant's locations; if that sum > 0, display it as the combined total and force `inStock=true` (a prior sale may have flipped the global flag false). If the sum is 0, fall back to the global `stockCount`/`inStock` — so single-location tenants and undistributed stock are unaffected.

**Why:** display-only aggregation avoids a data migration and the double-count trap of a write-path sync (purchase bill bumps global; a per-location edit would then add the same units again). composites are excluded — their stock is derived from components, persisted `stock_count` is always 0.

**How to apply:** never "fix" this by blindly setting global = sum(locations) (wipes purchase-bill stock when location rows are 0) or by adding global + locsum (double counts). If you ever make stock-in update both sides, you must also reconcile existing rows and drop this dashboard override in lockstep.
