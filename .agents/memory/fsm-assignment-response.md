---
name: FSM assignment response model
description: How technician accept/decline is stored on work orders and its single-response semantics
---

Work orders carry ONE work-order-wide assignment response (`assignment_status` pending/accepted/declined + respondedAt + declineReason), not per-technician state, even though multiple staff can be assigned.

**Why:** Phase 1 of the FSM app was scoped to a simple accept/decline; per-tech responses need a join table.

**How to apply:**
- The respond endpoint row-locks and only transitions from `pending` (idempotent same-state OK; otherwise 409) so a second assigned tech can't overwrite the first tech's answer. Keep that guard on any new response path.
- Reassigning staff (PATCH work-orders with a changed assigned list) resets the response to `pending` and clears respondedAt/declineReason — that's the only way to re-open a response.
- FSM job visibility = staff is primary `assigned_staff_id` OR contained in `assigned_staff_ids` JSONB (`@>`).
- The three columns were added via manual DDL on the Supabase DB (shared by dev+prod), matching Drizzle schema; no separate migration file exists.
- If per-technician responses are ever needed, replace the columns with a per-assignment table and update the POS badges + FSM queue grouping together.
