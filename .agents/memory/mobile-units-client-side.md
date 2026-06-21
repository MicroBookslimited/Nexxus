---
name: Multi-unit selling is client-side only
description: Why POS unit selling (Case/Dozen) sends no unit fields to the order API and how mobile mirrors web.
---

Multi-unit selling (ringing a product up as "Case of 24", "Dozen", etc.) is a
**purely client-side** concern on both web and mobile POS. The order API does NOT
carry or persist unit metadata.

**Why:**
- `CreateOrderBodyItemsItem` (generated request type) has no unit fields, so zod
  would strip any `unitId/unitLabel/unitFactor` sent on an order item.
- `orders.ts` order creation never reads unit fields; it resolves price purely
  from `productId + quantity (+ variant/modifier choices)`.
- `order_items` has no unit columns. Only `quotations.items` (jsonb) /
  `QuotationItem` carries `unitLabel/unitFactor/unitId` — quotations are a
  separate feature, do not confuse them with orders.
- The cart stores `quantity` in BASE units (a Case of 24 = quantity 24 at base
  price), so `base price × base quantity` already produces the correct charge.

**How to apply:**
- When mirroring web unit behaviour, only touch the cart/display/receipt: keep
  `quantity` in base units, step the +/- control by `unitFactor`, key distinct
  units as separate cart lines, and label the row/receipt. Do NOT add unit
  fields to the checkout payload "for completeness" — it's dead data.
- Volume/tier pricing composes correctly with units because tiers apply on the
  base quantity, which is what the cart already holds.
- A unit picker that fetches per-product sale units on tap must guard against
  out-of-order responses (latest-tap-wins) so a stale lookup can't open the
  picker for a product the cashier moved past.
