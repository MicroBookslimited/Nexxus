---
name: Materials & tools return custody
description: Why FSM material returns require a countersignature, and the rules that keep the chain intact.
---

# Materials & tools return custody

A technician can never take items off their own custody record. Returning
materials/tools is a two-party handover, exactly like the cash handover:
the technician declares what is coming back (a `pending` row — **nothing moves
in inventory**), then a manager/supervisor/authorised receiver picks their name,
enters their PIN and signs. Only that signature writes `qtyReturned` and
restores product stock.

**Why:** the declaration alone is a claim, not evidence. If a tool later goes
missing, the signed row is what proves the office took delivery. A self-service
return leaves nobody accountable for the gap.

**How to apply:**
- Any new path that can reduce an allocation's outstanding quantity must either
  require the countersignature or be restricted to office staff. The FSM
  `PATCH /fsm/jobs/:id/allocations/:allocId` route allows `qtyReturned` **only**
  for FSM admins; the office (non-FSM) work-orders PATCH stays open because it
  is already an office-side action. Hiding a control in the app is not a
  restriction — enforce it server-side.
- The signature is mandatory at the API level, not just in the UI, and is
  validated before the transaction opens.
- Signing clamps every accepted quantity to what is *still* outstanding at
  lock time, so a concurrent office-side return cannot double-restore stock.
  Lock allocation rows in deterministic id order, then the product rows.
- One open return per work order is enforced by a partial unique index
  (`... WHERE status = 'pending'`); the declare endpoint turns the resulting
  PG `23505` into a 409. Drizzle wraps driver errors, so match on the **error
  code** on the error or its `cause`, never on the message text.
- Receiver eligibility reuses the cash rule set: role admin/manager/supervisor/
  owner, or the explicit `can_receive_cash` opt-in.

## Job card signals (same feature)

Exceptions on the FSM job list are **derived at read time**, never stored:
assignment declined, on hold, awaiting parts, overdue, and "tools not returned"
(work completed with returnables still out and no pending return). Money
collectible is `total − depositPaid − sum(work_order_payments)`, clamped at 0.

**Why:** a stored exception flag drifts the moment any of its inputs changes,
and every one of these inputs already lives in the database.

**How to apply:** compute them in one batched pass (grouped/`inArray` queries
keyed by work-order id) for the whole page of jobs — the list route maps over
every row, so a per-job query would be an N+1 on the app's main screen.
