---
name: Stock/quantity columns must be REAL for weight selling
description: Why fractional (by-weight) checkout 500s with Postgres 22P02, and which columns must be real.
---

# Weight selling needs REAL stock/quantity columns

Selling by weight (fractional quantities like 5.5 kg) at checkout fails with
Postgres `22P02 invalid input syntax for type integer: "5.5"` when stock/quantity
columns are `integer` in the DB.

**Why:** the deduction runs `stock_count = stock_count - $1`. With an `integer`
column, Postgres infers the `$1` param as integer and tries to parse the
text-mode value "5.5" as an integer → 22P02. (A whole-number sale works because
the param is a clean integer.) Same failure on inserting a fractional
`order_items.quantity`.

**The drift:** the Drizzle code schema already declares these `real`, but the
DBs (both Supabase prod and local) historically had them as `integer` — they
were never migrated. `variant_*.stock_count`, `order_items.refunded_quantity`,
and `product_batches.quantity_remaining` were already `real`.

**Columns the order-checkout path writes fractionally (must be `real`):**
- `products.stock_count` (global stock deduction — failed first, before order-item insert)
- `order_items.quantity` (per-line quantity)
- `location_inventory.stock_count` (distributed/multi-location tenants only)

**Still `integer` in BOTH code and DB (not touched):** `stock_movements.quantity`
and `store_stock_movements.*`. `stock_movements` is only written on the
distributed-inventory path; a weight + distributed-inventory tenant would still
hit 22P02 there and would need a code-schema change too. `store_products` is a
separate domain (default 9999) and intentionally integer.

**How to apply:** when fractional-quantity writes 500, diff code schema (`real`)
vs actual DB type. Fix with a safe widening (no data loss):
`ALTER TABLE <t> ALTER COLUMN <c> TYPE real USING <c>::real;` applied to BOTH
`SUPABASE_DATABASE_URL` (prod) and `DATABASE_URL` (local). No codegen/code change
needed when the schema already says `real`. Drizzle push is blocked by an
unrelated prompt — apply the ALTER directly via node+pg.
