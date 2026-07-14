---
name: billing.ts financial endpoints need explicit restricted-role guard
description: Why subscription-mutating billing endpoints must call requireFullTenant, unlike the rest of the app's n() pattern
---

Any billing.ts endpoint that MUTATES a subscription (free-activate, redeem-coupon, and future paid-activation paths) must call `requireFullTenant(req, res)` (exported from saas-auth) before mutating.

**Why:** billing.ts uses a *local* `getTenantFromAuth()` helper that only decodes/validates the token — it does NOT reject `restrictedRole: "technician"` sessions. The rest of the financial surface (orders, cash, topup, purchases, held-orders, quotations, gift-vouchers, ar) imports `n` (the short alias for requireFullTenant) and calls it per write route. billing.ts historically did neither, so a technician-impersonation token could activate/redeem subscriptions — a privilege-boundary bypass caught in code review.

**How to apply:** in billing.ts, add `if (!requireFullTenant(req, res)) return;` as the first line of any subscription-mutating handler. `requireFullTenant` reads/verifies the Bearer token itself, so it composes fine with the existing `getTenantFromAuth(req)` call that follows.
