---
name: Staff authz uses client-supplied staffId
description: How staff-gated privileged endpoints authorize callers, and the known limitation that gating is not bound to the token.
---

# Staff authz pattern (client-supplied staffId)

Privileged staff-gated endpoints (e.g. price-manager `authoriseCaller`, products
merge/find-duplicates `authoriseInventoryCaller`) authorize by:
1. verifying the tenant JWT (per-tenant, from email login — NOT per-staff),
2. rejecting `restrictedRole === "technician"`,
3. looking up a **client-supplied** `staffId` (query param or body) scoped to the
   token's tenant,
4. allowing Owner/Admin or a role whose `permissions` include the needed perm.

**Why this matters:** there is no server-side binding between the authenticated
token and the `staffId`. Any holder of a valid tenant token can pass another
staff member's id (e.g. an Owner's) to pass the role/permission check. This is a
pre-existing, app-wide design characteristic — the tenant token carries no staff
identity; staff identity lives in client-side `StaffContext`.

**How to apply:** when adding a staff-gated privileged endpoint, follow this same
pattern for consistency (do NOT invent a one-off stronger model for a single
endpoint). Truly fixing the spoofing risk requires putting staff identity into a
signed session/token and ignoring client-supplied staffId — an app-wide auth-model
change affecting every staff-gated endpoint. Treat that as its own dedicated task,
not a drive-by change.

**Shift-financials gate (EOD reports):** `allowShiftFinancials` (cash.ts, reused by email.ts) blocks technician-restricted tokens and, when an `x-staff-id` header IS present, requires it to map to a manager-role staff row in the tenant (absent header = dashboard token, allowed). `/email/eod-report` additionally allowlists recipients to tenant admin-user emails + tenant email. Web sends no staff header on these reads (unchanged); mobile EOD screen sends its staff id. Full fix (server-verified staff identity in the token) is still the app-wide open item.
