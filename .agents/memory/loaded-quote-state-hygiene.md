---
name: Loaded-quote state hygiene in POS
description: Why any cart-replacing action in the POS must reset the "loaded quote" id
---

# Loaded-quote state must be cleared by every cart-replacing action

In the POS pages, a quotation loaded into the cart is tracked by a `loadedQuoteId`
state var. On successful checkout, if `loadedQuoteId` is set, the order marks that
quotation `converted` and links `convertedOrderId`.

**Rule:** every action that REPLACES the cart contents must also reset
`loadedQuoteId` (to null), not just `resetCart()`. Otherwise checkout converts a
stale/unrelated quotation.

**Why:** `handleRecallBill` (recall a held bill) replaced the cart but left
`loadedQuoteId` intact, so: load quote → recall held bill → checkout would
incorrectly mark the earlier quote converted and attach the wrong order id.

**How to apply:** when adding any new flow that swaps the cart (recall, load
template, import, etc.) in `pos-hardware.tsx` / `pos.tsx`, call
`setLoadedQuoteId(null)` as part of it. `resetCart()` already does this; ad-hoc
cart replacements do not.
