---
name: FSM work-order editing & assignment notifications
description: Supervisor edit allowlist on WO PATCH; technician/customer notification email triggers.
---

Rule: `PATCH /work-orders/:id` accepts x-staff-id from admin/manager/owner fully; **supervisors pass the gate but are restricted to a job-detail field allowlist** (no status, money/items/deposits, signatures, conversion, install data) enforced server-side in the route.
**Why:** the client role gate is not a security boundary; the generic PATCH covers every office field.
**How to apply:** any new PATCH field must be consciously added (or not) to the supervisor allowlist.

Notification triggers (fire-and-forget, after response):
- Technician assignment email goes only to **newly-added** staff ids (create: all; PATCH: diff vs existing), to `staffTable.email`; skips staff without email.
- Customer confirmation is re-sent on PATCH only when customerId actually changed or contactEmail was set where none existed; on customer change the recipient resolves from the NEW customer record (pass contactEmail null) unless the PATCH explicitly set contactEmail — stale contactEmail would mail the old contact.
- Known gap: no transactional claim — two concurrent PATCHes adding the same tech could double-email (accepted risk).

Mobile: edit screen + edit link must gate on BOTH completionSignature and customerSignature plus collected/cancelled status (server freeze treats either signature as sign-off).
