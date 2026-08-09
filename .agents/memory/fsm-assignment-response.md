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

## Phase 2: field execution & time tracking
- Execution timeline lives in three work_orders timestamps (travel_started_at, arrived_at, work_completed_at); `fieldPhase` (idle/en_route/on_site/done) is DERIVED server-side, never stored.
- Status mapping onto the existing POS enum: arrive moves received→in_progress; complete moves →ready. Complete is REJECTED while status is awaiting_parts/on_hold (office must clear it) so field actions can't erase POS operational state.
- Time tracking = work_order_time_entries (work|break|waiting); paused time non-billable. DB partial unique index enforces at most ONE open (ended_at IS NULL) entry per work order — the pause/resume state machine depends on it; close-open-entries updates ALL open rows defensively.
- Pause/resume require arrivedAt; all transitions row-lock the job + open entry and write a status-history row for the web POS timeline.
- Billable timer display: server returns closed-entry minutes; the mobile client adds live elapsed time of the open work entry.

## Phase 3: proof of work (photos + completion signature)
- Photos live in work_order_photos as inline base64 data URLs (app convention) — RASTER only (jpeg/png/webp); SVG uploads rejected because stored SVG rendered to office users is script injection. Max 12/job, delete own-only and locked after completion.
- Completion signature is drawn on a react-native-svg PanResponder pad and serialized client-side to an SVG data URL (no view-shot dependency); server validates the SVG against a strict denylist (no script/foreignObject/href/on* etc.).
- Signature is one-shot via conditional UPDATE ... WHERE completion_signature IS NULL (history row only when the update applied) — a plain read-then-write raced. Separate columns from the collection-time customerSignature/staffSignature.
- Mobile "sign & complete" must be TWO mutations: save signature, then complete — coupling them makes a completion failure unrecoverable ("already captured" on retry).
- Web POS never wraps uploaded data: URLs in <a href> (navigation to data: is the XSS vector; <img src> is inert).
