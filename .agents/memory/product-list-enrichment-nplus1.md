---
name: Product list enrichment must be batched
description: GET /products enriches every row; any per-product DB call there is an N+1 that tanks large catalogs.
---

# GET /products enrichment is per-row — never put a per-product query in it

The `GET /products` list handler (`artifacts/api-server/src/routes/products.ts`)
maps over the WHOLE result set (no server-side pagination/limit) and enriches
each product. Any DB call made *inside that per-product map* becomes an N+1.

**The incident:** capability flags (`hasVariants`/`hasModifiers`/`isComposite`)
were computed with three `COUNT(*)` queries per product. For a tenant with a
~1,200-product category that was ~3,600 round-trips to the (remote Supabase) DB
on one page load — the dominant cause of slow product-list loads. The frontend
already virtualizes rows, so the bottleneck was the backend, not rendering.

**The rule:** resolve everything for the whole result set in a FIXED number of
batched queries (`inArray(productId, allIds)` + `groupBy`) and look it up from
in-memory Maps/Sets in a synchronous map. Same for cross-reference lookups —
build a `Map` keyed by productId, never `array.find()` inside the per-product
loop (that's O(N²) for overrides/stock).

**Why:** this endpoint returns the entire (filtered) catalog, so cost scales
with catalog size; per-row work multiplies by N.

**How to apply:** before adding any new per-product field to the list response,
fetch its source rows in one grouped query keyed by productId and join in
memory. Keep the single-product routes (`POST /products`, `GET /products/:id`,
`PATCH`) using the per-product `withFlags()` helper — N=1 there, batching is
unnecessary. Supporting indexes exist on the FK columns the flag/stock queries
hit: `variant_groups(product_id)`, `modifier_groups(product_id)`,
`composite_product_components(parent_product_id)`, `location_inventory(product_id)`,
plus `products(tenant_id, category)` and `products(tenant_id, archived_at)`.
