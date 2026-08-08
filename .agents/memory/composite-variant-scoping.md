---
name: Composite components scoped to variant options
description: How variant-scoped bundle components deduct/restore stock, and the order-line snapshot rule
---

# Composite components × variant options

`composite_product_components.variant_option_id` (nullable FK → variant_options, ON DELETE CASCADE) scopes a component to ONE variant option of the PARENT product. NULL = deducted on every sale; set = deducted only when the sale line's `variantChoices[].optionId` includes it. Unique key is (parent, child, option) with `NULLS NOT DISTINCT`.

**Rules:**
- Checkout filters components per line via the chosen option ids; zero applicable components on a composite = hard failure (same as no components configured).
- Cost = unscoped rows + MAX option subtotal per variant group (worst case). Availability = min(unscoped mins, per group the BEST option's min) — best case; client draft cost mirrors this exactly.
- Save validation: every referenced option must belong to one of the parent's own variant groups; dup key is child+scope, not child alone.

**Restore snapshot rule (critical):** `order_items.component_snapshot` (jsonb) stores the per-unit components actually deducted at sale time. ALL refund/void/partial-refund restoration must read the snapshot, never the live recipe — the recipe can be edited (or a scoped option deleted, cascading rows) between sale and refund, which would corrupt stock. Legacy rows without snapshot fall back to current recipe filtered by the line's variantChoices.

**Why:** code review caught inventory corruption when a bundle's recipe changes between sale and refund; verified live that snapshot restore returns exact original stock even after recipe edits.

**How to apply:** any NEW path that deducts composite stock must write the snapshot on the order line; any NEW restoration path must consume it.
