---
name: Work order material/cable allocations
description: Dispatch-slip model for work order materials, stock semantics, and FSM admin gating
---

# Work order allocations & FSM admin

- `work_order_allocations` (dispatch-slip model): product-linked allocations deduct global `products.stock_count` on dispatch (row-locked, rejects insufficient stock), returns restore it, delete restores the un-returned balance. Cable rows carry a `runs` jsonb log; `lengthFt` is ALWAYS server-derived from start/end footage — client values are discarded.
- **Why:** stock integrity under concurrency and no client-forged cable usage. Every allocation mutation must run through the exported helpers in the work-orders route (`createAllocation`/`updateAllocation`/`deleteAllocation`) which lock the work order (open-status re-check) AND the product row in one transaction.
- **How to apply:** never write allocation or stock changes outside those helpers; FSM routes import them so semantics stay identical.
- FSM admin mode: staff with role admin/manager/owner (case-insensitive — role values in data are inconsistent: "Admin", "admin", "Manager") get tenant-wide `jobScope()` in FSM routes; accept/decline stays assigned-only. Office endpoints (POST/PATCH /work-orders) reject requests carrying an x-staff-id header whose staff isn't admin — web POS sends no header, FSM always does, so mobile create/status-move is role-gated server-side despite the app-wide spoofable-header pattern.
- Child editors (run log, return qty) key off `allocation.updatedAt` to remount after server refetch — plain useState-from-props goes stale after invalidation.
