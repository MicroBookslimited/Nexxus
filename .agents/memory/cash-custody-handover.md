---
name: Technician cash custody & handover
description: Rules for the end-of-shift cash handover chain (FSM close → handover row → authorised signature) and the auth gate that makes it work for technician tokens.
---

# Technician cash custody

A field technician's counted cash stays **their** liability until an authorised
person signs for it. That signature is a row in `cash_handovers`, one per cash
session (`session_id` is unique).

## Rules

- The handover row is raised **automatically at shift close**, only for staff
  flagged `is_technician` and only when counted cash > 0. Insert with
  `onConflictDoNothing` — a retried/duplicated close must never create a second
  claim on the same money.
- Who may sign: any managerial role (admin/manager/supervisor) **plus** staff
  ticked `staff.can_receive_cash`. The holder can never sign for their own cash.
- Signing is row-locked (`.for("update")`) and pending-only, so two devices
  (technician phone + office POS) can't both accept the same cash.
- `received_amount` may differ from `amount`; that difference is the audit
  trail for a disputed shortage, so never silently overwrite it.

**Why:** cash physically travels from a van to an office safe. Without a
timestamped signed record the technician has no proof they handed it in, and
the business has no proof they didn't.

## Auth gate

Technician tokens fail `requireFullTenant`, so cash-custody and shift-report
endpoints authorise on an **own-shift-or-manager** rule keyed on the
`x-staff-id` header instead. A request with no staff header is treated as the
office dashboard and must still pass `requireFullTenant`.

**How to apply:** any new endpoint the FSM app calls about a shift or its money
needs this gate — reusing the plain tenant guard locks technicians out, and
skipping it lets one technician read another's takings.

## Report rendering

The shift report is rendered in three places (thermal text on the phone, HTML
email, A4 PDF). The PDF embeds a signature only when it is a raster
`data:image/png|jpeg` — the app's signature pad produces an **SVG** data URL,
which pdfkit cannot draw, so the PDF falls back to a typed "signed by" record.
Keep that fallback whenever a new signature surface is added.
