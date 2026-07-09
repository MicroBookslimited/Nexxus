---
name: Void must release tables
description: Voiding/cancelling a table-linked order must reconcile dining-table status.
---

**Rule:** Every code path that voids or cancels an order linked to a dining table must release the table (status "available", clear currentOrderId) — but only when no other still-active unpaid order references the same table.

**Why:** The charge path frees the table, but the generic status-update path did not, leaving tables stuck occupied/billed with no active order after a cancel (surfaced when adding cancel-unpaid-order).

**How to apply:** When adding any new order-terminating action (void, cancel, transfer, merge), check for `tableId` and mirror the charge endpoint's table-release logic with a remaining-active-orders guard.
