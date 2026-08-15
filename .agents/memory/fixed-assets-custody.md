---
name: Fixed-asset custody ledger
description: Invariants that keep the asset_assignments ledger, fixed_assets pointers and work-order dispatch lines in agreement.
---

The `asset_assignments` table is the source of truth for who holds a tracked tool.
`fixed_assets.status` / `current_assignment_id` are denormalised pointers written in the
same transaction, and a partial unique index (one `status='active'` row per asset) is the
concurrency backstop. Depreciation is straight-line and computed on read — never stored.

Rules that must hold for every new custody path:

- Claim and release only through the shared custody helpers, inside a transaction that has
  already row-locked the asset.
- A job-linked tool may sit on **one open dispatch line per job**, quantity 1. Reject a
  second line and reject qty > 1.
- Release custody only when **no other dispatch line on that job still has the tool
  outstanding** (exclude the line being settled). Otherwise settling one of several lines
  says "back in the store" while a slip still has it out.
- The office-side "return asset" endpoint must refuse a job-linked spell while its
  allocation is still outstanding — the job's materials list is the single return path.
  Once no line is outstanding, the direct return is allowed again (recovery path).
- Only a tool with status `in_store` can be dispatched. `in_repair` (set automatically when
  a tool comes back damaged), `retired` and `lost` stay put.

**Why:** the ledger is stock-grade — a tool silently marked "in store" while physically in a
van gets double-dispatched, and the dispatch slip stops matching reality.

**How to apply:** any new place that signs a tool out or takes it back (office, FSM handover
signing, allocation delete, future scan-based flows) goes through the same helpers and
honours the outstanding-lines check.

Teams: assigning a `technician_teams` row to a work order **expands its members into
`assigned_staff_ids`**; `work_orders.assigned_team_id` only records which crew was picked.
That keeps every pre-existing FSM visibility, dispatch and messaging rule working unchanged.
Clearing the team must not strip staff already on the job. Team leaders additionally see
their team's jobs via a tenant-scoped EXISTS inside the FSM job scope predicate — apply it
to list, detail and mutation guards together, or a leader sees a job and then gets a 403.
