---
name: Super-admin analytics single-tenant reuse
description: How the tenant-detail path reuses the batched usage-list compute without scanning every tenant
---

The super-admin analytics usage compute (`computeTenantUsageList`) does ALL per-tenant
aggregates as batched group-by queries (no N+1). The tenant-detail view reuses the same
function but MUST pass the optional `tenantId` filter so every aggregate query is scoped
to one tenant — otherwise each detail request recomputes global aggregates for all tenants.

**Why:** the detail function `find()`s its row out of the list result. Calling the list
with no filter works but is O(all tenants) per detail view; passing the filter keeps it O(1 tenant).

**How to apply:** the filter helper is `tf(col) = tenantId != null ? eq(col, tenantId) : undefined`
combined into each query's `where` via `and(...)` (drizzle ignores `undefined`). When adding a
NEW aggregate query to the list compute, wire `tf(<table>.tenantId)` into its where clause too,
or the detail path silently scans that table for all tenants.

**Auth:** the analytics routes verify the superadmin JWT (`type: "superadmin"`) against
SESSION_SECRET with NO static fallback (fail-fast if env missing) — unlike the older
superadmin.ts / superadmin-email.ts which still fall back to a guessable "nexus-pos-secret".

**KPI semantics:** `activeToday` = `daysSinceActivity === 0` (same calendar-day bucket from
Math.floor(ms/DAY)); do not use `<= 1` (that includes yesterday).
