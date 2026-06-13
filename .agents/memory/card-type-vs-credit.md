---
name: Card payment type vs on-account credit
description: cardType (debit/credit) must stay distinct from the on-account "credit" paymentMethod across POS + receipts
---

# Card payment type vs on-account credit

`orders.cardType` ("debit" | "credit") describes a card tender and is set ONLY when
`paymentMethod === "card"` or for the card portion of a `"split"`. It must NEVER be
set or shown for `paymentMethod === "credit"`, which is an on-account / store-credit
sale (gated on a selected customer) — a completely different concept.

**Why:** the words overlap ("credit card" vs "credit sale"). Even a reviewer mis-read
this and called it a conflation. The two have separate UX, validation, and receipt
labels; mixing them charges/labels sales wrong.

**How to apply:**
- Every POS layout clears cardType when cash/credit is chosen; only card/split prompt for it.
- Receipt templates in `receipt.ts` label the card kind only on `paymentMethod === "card"`
  (or the split card row), never on `"credit"`.
- Pre-existing quirk (out of scope, do not "fix" casually): the large convenience-receipt
  template's `isCard` still treats `"credit"` as a card for the generic "CARD" label.
  That predates the cardType feature and does not pull in cardType — leave it unless asked.
