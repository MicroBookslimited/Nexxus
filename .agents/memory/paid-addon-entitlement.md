---
name: Paid add-on entitlement & purchase flow
description: How paid add-ons (Work Orders $5/mo) are gated and purchased; pitfalls for future add-ons.
---

Work Orders is the first paid add-on (tenant_addons + subscription_addons tables, PowerTranz 3DS purchase in billing.ts with pending3DS kind "addon").

Rules learned:
- **Setting ≠ entitlement.** `work_orders_enabled` only controls UI. Authoritative check is `hasWorkOrdersEntitlement()` (lib/addon-entitlement.ts): legacy marker setting `work_orders_legacy_access` OR tenant_addons active/cancelled with currentPeriodEnd > now. Generic `PATCH /settings` must reject self-granting the enabled key without entitlement, and the module's routes are gated by router middleware.
- **Routers share the /api mount.** A `router.use(...)` in one route file sees EVERY api request — middleware must filter by `req.path` prefix or it silently gates unrelated endpoints.
- **Double-charge guard must be durable.** In-memory pending checks race; reservation = the tenant_addons row itself set to status "pending" under `SELECT ... FOR UPDATE` before calling the gateway (409 if fresh pending/active; stale >15min taken over). Release to "expired" on every decline/error path. GET /billing/addons filters pending rows out of `mine`.
- **Activation is row-locked, idempotent (same providerRef = no-op) and STACKS periods** on an unexpired row instead of overwriting, so concurrent successes lose no paid time.
- **Grandfathering:** tenants with the module on before it became paid (and no addon row) get a `work_orders_legacy_access` marker via an idempotent startup backfill in the api-server, so it applies in every environment on deploy.
- Expiry is lazy (GET /billing/addons flips setting off) but enforcement doesn't depend on it — the entitlement check compares currentPeriodEnd directly.

**How to apply:** any future paid add-on should reuse this exact pattern (entitlement helper + route middleware + settings-key guard + pending reservation).
