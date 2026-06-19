---
name: Plan limit / entitlement enforcement boundaries
description: Where to enforce subscription plan quotas (e.g. maxProducts) so no payment/activation path bypasses them.
---

Plan/entitlement quota checks (e.g. `maxProducts`) must guard EVERY path that
charges a card or activates/changes a subscription — not just the first one a
user hits. NEXXUS has many such paths: PayPal create-order + capture-order,
PowerTranz initiate (incl. frictionless direct-approval) + 3ds-callback,
bank-transfer submit, and the superadmin bank-transfer approval that activates
on approval.

**Why:** a tenant with ~7,000 products was able to pay for and subscribe to a
low-limit plan because the billing flow never compared product count to the
plan's `maxProducts`. Fixing only one entry point leaves the others open, and
async flows add timing windows (submit-then-approve, or initiate-then-3DS-
callback) where the tenant can exceed the limit between the early check and the
actual activation.

**How to apply:**
- Centralize the check (`utils/plan-limits.ts`: `getActiveProductCount` counts
  NON-archived products; `planProductLimitError` → 409 `PLAN_PRODUCT_LIMIT`).
- Put the check immediately BEFORE each charge/activation, not in one shared
  `activateSubscription()`. Reason: in the PowerTranz 3DS flow,
  `activateSubscription` runs AFTER the gateway capture (`/api/spi/payment`), so
  a check there would charge the card then refuse the plan. The 3ds-callback
  recheck must run before `/api/spi/payment` (abandoning the spiToken = no
  charge).
- Re-check at the FINAL activation moment for async flows (3DS callback, admin
  approval), not only at initiation.
- Direct superadmin manual plan assignment / manual-payments are intentional
  admin overrides and are deliberately NOT gated.
- Count semantics: archived (soft-deleted) products do not consume quota.
- Add-time enforcement (block product creation at `maxProducts`): an early
  pre-insert check is UX-only. The ACTUAL guarantee must be an in-transaction
  recount under a per-tenant `pg_advisory_xact_lock(tenantId, <namespaced-key>)`
  before the insert, throwing a sentinel → 403, or two concurrent creates both
  slip past. Pick a lock key that can't equal another per-tenant lock's 2nd arg
  (quotations use `(tenantId, year)`, so avoid year-like ints).
- Read-side: any UI banner/prompt backed by a plan-limit query must invalidate
  that query key on EVERY count-changing op (create, single/bulk
  archive/restore, permanent delete, imports), not just create, or the banner
  goes stale after downgrades/cleanups.
