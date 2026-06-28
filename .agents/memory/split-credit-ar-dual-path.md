---
name: Split-payment on-account (credit leg) must post A/R on BOTH order paths
description: A split payment can leave a leftover that goes on the customer's account; the receivable insert + customer-required guard must exist in create AND charge handlers.
---

A "split" payment collects card + cash; whatever is left of the total becomes an
on-account credit leg (`orders.split_credit_amount`). The customer owes that, so
the server must insert an `accounts_receivable` row for just the credit portion.

**Rule:** the credit-leg A/R insert and the "customer required when credit > 0"
guard must live in BOTH order completion paths — `POST /orders` (create) and
`POST /orders/:id/charge` (complete a held/dine-in order). The held-order charge
flow can finalize a split payment too, so omitting it there silently loses the
receivable.

**Why:** the original feature only added the A/R insert to the create path; a
split-with-credit order completed via the charge endpoint recorded the amount on
the order but never created the receivable, so the customer was never billed.

**How to apply:** when adding any side effect that depends on the final payment
method (A/R, loyalty, accounting JE), mirror it in create AND charge — they are
independent handlers in `artifacts/api-server/src/routes/orders.ts`.

**Related gotcha:** `ChargeOrderBody` zod (api-zod generated) historically omits
`cardType`, so the charge path can't record debit/credit on the split card leg
(pre-existing; `parsed.data.cardType` is a long-standing type error there).
