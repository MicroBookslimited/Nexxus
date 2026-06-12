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

**Columns the order-checkout path writes fractionally (must be `real`) — ALL now migrated:**
- `products.stock_count` (global stock deduction — failed first, before order-item insert)
- `order_items.quantity` (per-line quantity)
- `location_inventory.stock_count` (distributed/multi-location tenants only)
- `stock_movements.quantity` AND `stock_movements.balance_after` (written on EVERY
  sale, not just the distributed path — the insert at the main checkout path logs a
  movement with `quantity: -item.quantity` + `balanceAfter: stock_count`). These were
  the LAST drifted columns; a full DB scan of every numeric checkout column confirmed
  nothing else integer remains.

**Earlier wrong assumption (corrected):** a prior note claimed `stock_movements.quantity`
was `integer` in BOTH code and DB and only written on the distributed path. WRONG on both
counts — the code schema (`stock-movements.ts`) already declared `quantity`+`balance_after`
as `real`, and the insert fires on every sale. The `integer("quantity")` I'd seen was the
unrelated `stock_transfers` table in `locations.ts`. It was the same code(real)↔DB(integer)
drift, fixed by DB ALTER only.

**Not touched (intentional):** `store_stock_movements.*` / `store_products.*` — separate
domain (default tenant 9999), genuinely integer in code too.

**To find the full drift set in one shot:** query `information_schema.columns` for
integer/smallint/bigint columns whose name matches
`quantity|qty|stock|balance|amount|count|used|remaining|required` across the checkout
tables, then cross-check against the Drizzle schema's `real(...)` columns. Avoids
whack-a-mole one column at a time.

**How to apply:** when fractional-quantity writes 500, diff code schema (`real`)
vs actual DB type. Fix with a safe widening (no data loss):
`ALTER TABLE <t> ALTER COLUMN <c> TYPE real USING <c>::real;` applied to BOTH
`SUPABASE_DATABASE_URL` (prod) and `DATABASE_URL` (local). No codegen/code change
needed when the schema already says `real`. Drizzle push is blocked by an
unrelated prompt — apply the ALTER directly via node+pg.
