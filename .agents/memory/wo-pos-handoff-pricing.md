---
name: Work-order → POS handoff price fidelity
description: How work-order parts/labor map into POS cart lines without under/overcharging.
---

The POS order payload is markdown-only per line (unitPrice = catalog effective price, plus discountAmount). A handed-off document line priced ABOVE catalog cannot be represented as an override.

Mapping used (pos.tsx work-order loader, sessionStorage key `nexxus_pending_work_order`):
- part price < catalog → catalog line + priceOverrideValue (markdown).
- part price > catalog → catalog line at catalog price (stock still deducts) + a separate custom "price adjustment" line for the difference.
- labor / missing product → custom line (isCustom, productId 0).

**Why:** using only overrides silently undercharged upward-priced parts; using a custom line for the whole part skips stock deduction.

**How to apply:** any future doc→POS handoff (quotes, estimates) with per-line prices must use this three-way split. On checkout success, PATCH the source doc (convertedOrderId) and clear loaded-doc state in resetCart (loaded-quote hygiene). Server allows the conversion jump to collected only from ready/in_progress.
