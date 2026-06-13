---
name: POS checkout layout drift
description: NEXXUS has three independent POS checkout layouts whose createOrder payloads drift; a field added to one is silently missing from the others.
---

There are THREE separate POS checkout screens, each with its own `createOrder.mutate` payload:
`pos.tsx` (standard), `pos-hardware.tsx` (hardware mode), `pos-supermarket.tsx` (scan-only mode).

**Rule:** Any new field added to the order-create payload must be added to ALL THREE layouts (and the Expo `index.tsx` checkout if relevant). Adding it to only one means tenants on the other layouts silently persist NULL/missing for that field.

**Why:** The `stationNumber` (per-shift station/till number) feature was wired into `pos.tsx` only. Hardware/supermarket tenants therefore saved `orders.station_number = NULL` on every sale (0 of ~29k orders ever non-null, including 14 orders whose open cash session DID have a station). The receipt's static "Station: #" line never rendered, so the only per-receipt number users saw was the incrementing pickup/order number — reported as "station number is incrementing."

**How to apply:** When touching the order payload, grep `createOrder.mutate` across `artifacts/nexus-pos/src/pages/pos*.tsx` and patch each. The hardware/supermarket payloads are cast `as any`, so the compiler will NOT catch a missing field — verify by hand. Source the value from `cashSession?.session?.…` (cashSession is in scope in all three; checkout is gated on an open shift).
