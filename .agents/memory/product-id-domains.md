---
name: Separate product-id domains (POS products vs store_products)
description: There are two independent product tables with independent serial id spaces; never cross-repoint history between them.
---

NEXXUS has (at least) TWO independent product tables with INDEPENDENT serial id spaces:
- `productsTable` (`products`) — the POS / catalog domain (orders, purchase bills, stock movements, batches, etc.).
- the `store_products` domain in `lib/db/src/schema/store.ts` — e.g. `storeStockMovementsTable` (`store_stock_movements`) whose `product_id` is a plain `integer` referencing `store_products`, NOT `products`.

**Rule:** when reassigning rows by `product_id` (e.g. a product merge that repoints history onto a survivor), only touch tables that actually reference `products.id`. Do NOT include `store_*` tables — their `product_id` values point into a different id space, so an id like `42` means a totally different product. Repointing them corrupts unrelated store history whenever ids overlap (which is almost always).

**Why:** a duplicate-product merge originally repointed `store_stock_movements.product_id`; because POS and store product ids are independent serials, this silently rewrote unrelated store movements. Caught in code review.

**How to apply:** before adding a table to any "repoint by product_id" loop, confirm its `product_id` FK/reference targets `products` (POS domain) and not `store_products` or any other domain table.
