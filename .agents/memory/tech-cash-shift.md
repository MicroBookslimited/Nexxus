---
name: Technician cash shifts & onsite WO payments
description: Field technicians share the POS cash-session system; work_order_payments ledger rules and drawer attribution.
---

Technicians use the SAME cash_sessions system as POS cashiers (FSM shift screen). Onsite money lives in `work_order_payments` (cash|card|transfer); recording a payment REQUIRES the collector's own open cash session, locked FOR UPDATE inside the payment txn so close can't race it, and increments workOrders.depositPaid (running amount-paid) capped at the outstanding balance under a WO row lock.

**Drawer attribution:** computeWoTenderIn is STRICTLY staff-scoped — staffless (office tenant-wide) sessions must return 0 for WO tender or they show false overages. woCashIn feeds expectedCash in all four cash.ts calc sites; woCardIn/woTransferIn are returned by /current so the FSM close declares actualCard/actualOther instead of hardcoding 0.

**Double-charge guard:** WO→POS "Charge in POS" handoff passes depositPaid and POS applies it as an extra FIXED DISCOUNT (server rejects negative custom-price lines, so a credit line is impossible). Slight tax-base reduction accepted; never remove this credit or converted orders bill the full total again on top of onsite payments.

**Session ownership:** cash payout/close endpoints allow a non-managerial x-staff-id only on their OWN session; absent header (web dashboard) or managerial roles unrestricted.

**Authz:** non-managerial staff may only record payments on WOs they're assigned to.
