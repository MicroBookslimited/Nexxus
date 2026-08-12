---
name: WO follow-up visits & appointment calendar
description: Follow-up visit scheduling/notifications and the calendar feed's access model.
---

- Follow-up visits are `work_order_appointments` rows with `appointment_type='follow_up'`; the visit team lives in the new `staff_ids` jsonb column (added via manual DDL to BOTH Supabase and local; `staff_id` keeps the primary tech for back-compat). Scheduling also syncs `work_orders.appointment_date` so the technician app's Today/Upcoming grouping reflects the next visit — the insert + WO update run in one transaction.
- `GET /work-order-appointments` (calendar feed) REQUIRES a valid `x-staff-id`; office roles (admin/manager/owner/supervisor) see all, everyone else is filtered server-side to visits where they're on the visit team (falling back to appointment staffId, then WO assignedStaffIds). Client-side filtering alone was flagged as broken access control — keep the server filter when touching this route.
- The feed unions legacy WOs that only have `appointment_date` and no appointment rows, using negative synthetic ids (`-workOrderId`); range end is exclusive (`lt`).
- **Why:** appointments have their own team distinct from the WO assignment; and the tenant token alone leaks all customer names/notes to restricted technician tokens.
- **How to apply:** any new appointment consumer must send x-staff-id; any new field on the feed must be added to both the appointment query and the legacy mapping.
