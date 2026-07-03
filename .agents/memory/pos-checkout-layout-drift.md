---
name: POS checkout layout drift
description: NEXXUS has three independent POS checkout layouts whose createOrder payloads drift; a field added to one is silently missing from the others.
---

There are FOUR separate POS checkout screens, each with its own `createOrder.mutate(Async)` payload:
`pos.tsx` (standard), `pos-hardware.tsx` (hardware mode), `pos-supermarket.tsx` (scan-only mode) on web,
and the Expo mobile `artifacts/nexus-mobile/app/(tabs)/index.tsx` `CheckoutContent`. The mobile checkout
now supports the full payment depth (paymentMethod incl. custom names, cardType for card/split,
splitCardAmount/splitCashAmount, customerId for credit) — keep it in lockstep with the web payloads.

**Rule:** Any new field added to the order-create payload must be added to ALL FOUR checkout sites. Adding it to only one means tenants on the other layouts/platform silently persist NULL/missing for that field.

**Why:** The `stationNumber` (per-shift station/till number) feature was wired into `pos.tsx` only. Hardware/supermarket tenants therefore saved `orders.station_number = NULL` on every sale (0 of ~29k orders ever non-null, including 14 orders whose open cash session DID have a station). The receipt's static "Station: #" line never rendered, so the only per-receipt number users saw was the incrementing pickup/order number — reported as "station number is incrementing."

**How to apply:** When touching the order payload, grep `createOrder.mutate` across `artifacts/nexus-pos/src/pages/pos*.tsx` and patch each. The hardware/supermarket payloads are cast `as any`, so the compiler will NOT catch a missing field — verify by hand. Source the value from `cashSession?.session?.…` (cashSession is in scope in all three; checkout is gated on an open shift).

**Related duplication — inline quick-add product:** the "quick-add product from the POS" flow (create product via `useCreateProduct`, drop straight into cart) is duplicated in `pos.tsx` AND `pos-supermarket.tsx` (the latter also serves retail + supermarket-name-search via the `retailLayout`/`enableNameSearch` props). Any change to quick-add behavior (fields, defaults, permission gate) must be applied to both. The privilege gate is `can("inventory.manage")` and is CLIENT-SIDE ONLY — `POST /products` is tenant-JWT-gated with no server staff-authz — so the manager-PIN override is advisory UX, consistent with the app-wide client-side staff-permission model (see staff-auth-pattern.md); real enforcement is the separate staff-authz task.
