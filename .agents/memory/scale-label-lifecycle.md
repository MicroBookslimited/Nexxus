---
name: Scale weight-label lifecycle in POS carts
description: Reservation rules for scanned weight-embedded (EAN-13 '2…') scale labels in any POS layout cart.
---

Rule: any POS layout that adds scanned scale labels to the cart must track label ids per cart line and drive the full lifecycle: mark-sold on checkout success (clear the tracker BEFORE resetCart so reset's release path doesn't undo it), release on line remove / cart clear / recall-replace / checkout error.

**Why:** missing any transition either strands labels as reserved (can't be re-scanned) or lets a stale id be marked sold on an unrelated later checkout. Hold/recall is the trap: held orders persist only product/price/qty, so label ownership cannot survive a hold — block holding bills that contain scanned labels instead.

**How to apply:** weight lines use quantity = decimal weight at per-unit price (server multiplies; stock/quantity columns are REAL); they must never merge with count lines and skip +/- steppers. Reference implementations: pos.tsx and pos-supermarket.tsx (weight prompt for soldByWeight products without an embedded-weight barcode).
