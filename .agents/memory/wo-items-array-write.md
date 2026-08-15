---
name: Work-order billable lines are one array
description: Why every charge/fee edit is a whole-array PATCH, and the guard a client must add before sending one
---

# Editing a work order's charges

A work order's billable lines (parts, labour, fees) are a single JSONB array on
the work-order row, not child rows. There is no per-line id and no add-one-line
endpoint: adding or deleting a charge means PATCHing the entire `items` array,
and the server recomputes subtotal/discount/tax/total from what it receives.

## Consequences that bite

- **No optimistic locking exists server-side.** Two people editing charges on the
  same job each send a full array; the later write silently erases the earlier
  one. A client must fingerprint the array it rendered, re-read the job
  immediately before writing, and refuse the write if the two differ — telling
  the user to look again rather than clobbering.
- **Positional edits are only valid against an unchanged array.** Two lines can
  be byte-identical, so "remove this one" cannot be resolved by content
  matching. Removal by index is correct *only* behind the fingerprint check above.
- **`type` is required (`part` | `labor` | `fee`).** Older rows may hold lines
  with no type; echoing one back verbatim is rejected with a 400. Default a
  missing type to `part` on the way out.

## Who may price a job

Item edits require an admin/manager/owner role. Supervisors can edit a work order
but are held to a field allowlist that excludes items and every financial field,
and technicians are refused outright. The check reads the client-supplied staff
id header, so it is only as strong as that pattern is app-wide — see
`staff-auth-pattern.md`.

After the customer signs off, items are frozen along with the rest of the job
content; only status, signatures, notes and the POS conversion may still change.
Any UI that offers charge editing must mirror that freeze or it will offer a
button that always fails.
