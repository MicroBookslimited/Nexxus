---
name: Partial refund integrity
description: Money/stock-mutating refund endpoints must aggregate duplicate line ids and serialize concurrent refunds
---

# Partial / per-item refund integrity

Any endpoint that refunds *specific quantities* of order lines (reducing
quantity/lineTotal in place and restoring stock) has two non-obvious failure
modes that input validation alone does NOT cover:

1. **Duplicate line ids in one request.** A payload may list the same
   `orderItemId` twice. Validating each entry independently against the
   original line quantity lets the *sum* exceed what was sold → over-refund of
   money AND double stock restore. **Fix:** aggregate requested quantities per
   line id into a map, then validate the aggregate against remaining quantity.

2. **Concurrent refunds on the same order.** Validate-then-write without a lock
   lets two requests both pass the cap and both restore stock. **Fix:** do the
   authoritative read + validate + write inside one `db.transaction`, lock the
   order row with `.for("update")`, and use a conditional update
   (`WHERE id=? AND quantity >= refundQty`) as defence-in-depth (abort 409 if 0
   rows affected).

**Why:** caught in code review for per-item refunds; both are exploitable by
crafted payloads / racing clients and corrupt inventory + revenue.

**How to apply:** applies to `POST /orders/:id/refund-items` and any future
quantity-scoped mutation (e.g. partial supplier returns). The full-refund PATCH
path restores `item.quantity`, so after a partial refund it only restores the
*remaining* units — correct, no double-restore.

**Authz note:** refund endpoints are gated only by `requireFullTenant` (manager
PIN is UI-only and bypassable via direct API). This matches the app-wide
client-supplied-staffId pattern; tightening it is a separate dedicated task, not
done here.
