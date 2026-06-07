---
name: Two unit tables (catalog vs per-product)
description: product_units (shared tenant catalog of presets) is distinct from product_purchase_units (per-product saved units); never conflate them.
---

There are two unrelated "unit" tables in NEXXUS POS:

- `product_purchase_units` — per-product saved units (unitName, conversionFactor, isPurchase, isSale). This is the **source of truth** for what units a given product sells/buys in, saved via `/products/:id/purchase-units` (helpers in `@/lib/saas-api`). This drives POS multi-unit sales.
- `product_units` — a shared, tenant-scoped **catalog of reusable presets** (name + baseUnit + conversionFactor, e.g. CS24=24). Purely a convenience list backing the Units tab under Products and the datalist dropdown in the Pricing & Units editor. Endpoints: `/product-units` (GET/POST), `/product-units/:id` (PATCH/DELETE).

**Why:** The catalog was added on top of the existing per-product flow with the explicit constraint that the per-product table/flow stay untouched. The catalog only *prefills* the per-product editor and auto-remembers newly typed names; deleting a catalog preset does NOT affect products already using that unit.

**How to apply:** When asked about "units", determine whether the request is about a specific product's units (per-product `product_purchase_units`) or the reusable presets list (`product_units`). Do not migrate/repoint one into the other. Catalog dedupe is enforced both in app code (case-insensitive) and a DB unique index `product_units_tenant_lower_name_uniq` on `(tenant_id, lower(name))` — created manually on BOTH local and Supabase DBs.
