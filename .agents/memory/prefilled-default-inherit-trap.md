---
name: Pre-filled default + bulk save converts inherits to overrides
description: UI trap where a field pre-filled with a tenant/global default silently turns "inherit" rows into explicit overrides on a bulk Save.
---

When an editor has a per-row "override or inherit" field where null = inherit a
parent/default value, and you pre-fill that field's input with the default to
suggest a value, a plain "Save all" will persist the suggested default as an
explicit override for EVERY row — including rows the user never touched.

**Why:** the user expects untouched rows to keep inheriting (null). Persisting
the pre-filled default converts them to overrides, which then diverge from the
parent on any later parent change (e.g. a product cost change recalculates the
now-explicit override instead of leaving the row to track the product price).

**How to apply:** track a per-row "dirty" flag set only inside the field's
onChange handlers. On bulk save, send the edited draft values only for dirty
rows; for untouched rows send the original (possibly null) values so inheritance
is preserved. Applies to the NEXXUS per-location markup/price editor
(product_locations.markup_override / price_override) and any similar
override-vs-inherit grid.
