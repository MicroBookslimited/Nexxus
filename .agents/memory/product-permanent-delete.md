---
name: Product permanent (hard) delete gate
description: When and how an archived product may be hard-deleted, and why the history gate looks the way it does.
---

# Product permanent (hard) delete

A product may be **permanently** deleted only when it is **archived** AND has zero
rows in any of these 9 activity tables: `order_items`, `purchases` (legacy),
`purchase_bill_items`, `purchase_order_items`, `supplier_return_items`,
`stock_adjustments`, `stock_transfers`, `production_batch_items`,
`stock_count_items`. Everything else linked to a product (location_inventory,
product_locations, product_batches, variant_groups, variant_combinations,
recipes, modifier_groups, composite_product_components, stock_movements) is ON
DELETE CASCADE and disappears with it — it never blocks deletion.

**Why the manual gate:** `order_items` and `stock_count_items` have NO FK to
products, so a CASCADE/RESTRICT can't protect them — they must be checked in
code. The other 7 tables would also orphan/error, so all 9 are checked together
(`productsWithHistory`).

**How to apply:** the eligibility flag (`deletable` on GET /products, only when
includeArchived) and the DELETE /products/:id/permanent route share the same
helper. The route requires a `staffId` query param + `authoriseInventoryCaller`
(non-technician Owner/Admin or `inventory.manage`), and re-checks eligibility
inside a `db.transaction` with `SELECT ... FOR UPDATE` on the product row before
deleting + audit (`product.permanent_delete`).

**Bulk variant:** `POST /products/bulk-permanent-delete` ({ids, staffId}) applies
the exact same rules to many ids in one transaction (archived candidates locked
FOR UPDATE, shared productsWithHistory check, delete eligible subset), silently
skipping ineligible/with-history ids and returning {deleted, skipped}. The UI
only sends the `deletable` subset of the selection and chunks it client-side.

**Residual race (accepted):** the FOR-UPDATE lock on the product row does not
lock the history tables, so a strict TOCTOU window exists in theory. It's
accepted because a product must be archived first, and archived products are
hidden from POS/catalog/menu — the app's own write paths can't create new
sales/purchase history for them. Fully closing it (app-wide SERIALIZABLE or
advisory locks taken by every history writer, or new FKs/triggers) is a
cross-cutting change, out of scope for the feature itself.
