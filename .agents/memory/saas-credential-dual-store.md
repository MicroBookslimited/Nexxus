---
name: SaaS credential dual-store sync
description: tenant login credentials live in two tables; any change must mirror the primary admin row, and old tokens may lack adminUserId.
---

SaaS tenant login credentials (email + passwordHash) are stored in TWO places: `tenants` and `tenant_admin_users`. The login flow checks `tenant_admin_users` by email FIRST, then falls back to the `tenants` row.

**Rule:** any endpoint that changes a tenant's login email or password must update BOTH stores in sync (the primary active admin row AND the tenants row when the actor is primary). If only `tenants` is updated, the stale `tenant_admin_users` row keeps serving the OLD credential on next login and the change silently fails to take effect.

**Why:** older/legacy JWTs may not carry `adminUserId` (it was added later; login auto-migrates by creating a primary admin row but pre-existing 90-day tokens predate it). A handler that only mirrors the admin row when `adminUserId` is present in the token will skip the sync for those tokens. Fix: when the token lacks `adminUserId`, resolve the tenant's primary active admin row (`isPrimary=true, status='active'`) and sync it too.

**How to apply:** in `saas-auth.ts` the `resolveAccount()` helper does this fallback; `credentialHash` is derived as `adminUser?.passwordHash ?? tenant.passwordHash` to match login's check order. Re-issuing a fresh JWT after email/password change (without bumping `sessionsInvalidatedAt`) is intentional so the current session stays alive; this does NOT revoke other active sessions — a deliberate self-service tradeoff.

**Token note:** `verifyTenantToken` requires `type: "tenant"` in the JWT payload — any hand-crafted token for testing must include it or it returns 401 (auth), distinct from 400 (wrong current password).
