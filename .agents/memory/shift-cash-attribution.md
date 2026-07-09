---
name: Shift cash attribution by payment time
description: Cash-session expected-cash must attribute orders by payment time, not creation time; applies to every session/close endpoint.
---

**Rule:** Cash-drawer session queries must window orders on `COALESCE(completedAt, createdAt)` (payment time), never `createdAt` alone, and must apply this consistently across ALL session endpoints (current session, session by id, admin/force close).

**Why:** Pay-later (kitchen/table) orders only get a `paymentMethod` when charged — possibly during a later shift. Windowing on `createdAt` retroactively inflated the creating shift's expected cash, producing false shortages that a physical count contradicted (real client complaint).

**How to apply:** Any new endpoint or report that sums drawer cash per session must (1) use payment-time attribution, (2) exclude voided AND refunded orders' split-cash portions, and (3) remember refund direction ignores `refundMethod` today — cash refunds of card orders are still unmodeled.
