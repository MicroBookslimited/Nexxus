---
name: Cash shift staff scoping
description: Current-cash-session lookups support per-cashier scoping via x-staff-id; every consumer of the shift state must agree on scope.
---

The current-cash-session endpoint returns the tenant's latest open shift by default, but scopes to one cashier when an `x-staff-id` header is sent (multiple cashiers can hold simultaneous open shifts).

**Rule:** any UI that gates behavior on "has an open shift" for a specific cashier must send `x-staff-id` (and include the staff id in the React Query key). Any screen that lets a cashier OPEN a shift must use the same scope — otherwise another cashier's open shift hides the open-shift form and dead-ends the gated flow.

**Why:** the mobile register gate (staff sign-in + own open shift required) initially unlocked on *any* cashier's shift, and the Cash tab's unscoped query could block a second cashier from ever opening their own shift.

**How to apply:** pass `request: { headers: { "x-staff-id": String(staff.id) } }` to the generated hook, key the query by staff id, and keep gate + open-shift screens on identical scoping. Unscoped fallback is fine only for manager-style review/close when no cashier is signed in.
