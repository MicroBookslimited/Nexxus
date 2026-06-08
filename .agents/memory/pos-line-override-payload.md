---
name: POS per-line override/discount → server payload
description: How catalog-line price overrides + line discounts must be encoded for orders.ts, and why UI+payload must derive from shared clamped helpers.
---

# Per-line price override & line discount on POS → checkout payload

For a NON-custom (catalog) order line, the server (`orders.ts` create-order path) is the
sole authority on unit price: it recomputes `tierUnitPrice = applyVolumePricing(product.price, qty, tiers)`
and persists `lineTotal = max(0, tierUnitPrice*qty - discountAmount)`. The client cannot send a
unit price for catalog lines — **`discountAmount` is the only lever**. (Custom lines are different:
they carry an arbitrary `customPrice` server-side, so markups ARE representable there.)

## Rules (apply to any POS layout: pos.tsx, pos-hardware.tsx, …)
- A catalog-line price override is **markdown-only**. Fold it into `discountAmount`, referenced to
  the **tier-aware** unit price, NOT base `product.price`:
  `discountAmount = (tierUnitPrice - effectiveUnitPrice)*qty + effectiveLineDiscount`.
  Referencing base price undercharges whenever a volume tier is active.
- Derive UI totals AND the checkout payload from the **same clamped helpers** so they can never
  diverge after a qty change crosses a tier boundary:
  - effective unit price = override clamped to current tier price (catalog) / raw override (custom).
  - effective line discount = stored itemDiscount clamped to `effectiveUnitPrice*qty`.
  Then server `lineTotal == effectiveUnitPrice*qty - effectiveLineDiscount == displayed UI total`.
- Stored override/discount captured at apply-time can go stale when quantity later changes; the
  clamped derived helpers are what make it correct, not re-clamping on every qty edit.

**Why:** code review repeatedly flagged UI-vs-server line-total divergence: (1) base-price vs
tier-price baseline, (2) discount clamp basis, (3) markup above tier unrepresentable, (4) stale
values after qty crosses a tier. The shared-derived-helper approach closes the whole class.

**How to apply:** when adding line discount / price override to a new POS surface, mirror
`getTierUnitPrice` / `getLinePrice` (clamped) / `getLineDiscount` in pos-hardware.tsx and build both
the totals and the payload from them.
