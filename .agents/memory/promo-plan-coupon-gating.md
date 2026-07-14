---
name: Promotional plans are coupon-gated, never self-serve
description: How isPromotional subscription plans are activated and why free-activate rejects them
---

Subscription plans with `isPromotional = true` (e.g. "1 Year Free") can NEVER be self-activated. `POST /billing/free-activate` hard-rejects them with 403; the ONLY tenant path to a promo plan is `POST /billing/redeem-coupon`. The public `/plans` list already filters out isPromotional, so the redeem box is the sole entry point.

**Why:** a free/trial tenant could otherwise repeatedly re-activate a hidden promo plan from the plan picker, getting unlimited free years.

**Coupon model:** `subscription_coupons` (code stored/compared UPPERCASE, planId, billingCycle, maxRedemptions, redemptionCount, expiresAt, isActive) + `subscription_coupon_redemptions` with a UNIQUE index on (couponId, tenantId). Two independent limits enforced together: per-code cap (maxRedemptions; 1=single-use, N=batch) AND one-redemption-per-tenant (the unique index). Redeem is one DB transaction: insert redemption row (catch unique violation → 409 already-redeemed), then atomic conditional `UPDATE ... SET redemptionCount+1 WHERE redemptionCount < maxRedemptions` — 0 rows updated means exhausted, throw to roll back the redemption insert. Period end uses plan.durationDays if set, else billingCycle.

**How to apply:** when adding any new promo-plan activation path, gate it behind a coupon and mirror this transaction shape. Standard (non-promotional) free plans stay self-serve via free-activate.

**DATA GOTCHA (bit us in prod):** the gate is `if (plan.isPromotional)` — it is only as good as the flag on the actual plan ROW. `is_promotional` column defaults to `false`, so any promo plan created before the flag existed (e.g. "1 Year Free (Promo)", slug `promo-1yr-free`) stays UNGUARDED until someone flips the flag. The api reads SUPABASE_DATABASE_URL, so the flag must be set there (sandbox executeSql only hits the local DB). The superadmin Plan editor now exposes an "isPromotional" toggle (PlanFormData + PlanInput both carry it) — when a coupon isn't stopping self-serve activation, FIRST check the plan row's is_promotional, not the gate code.
