---
name: Dispatch slip email on job acceptance
description: Why the parts & materials email fires on FSM acceptance, and the two-renderer split for the dispatch slip document.
---

# Dispatch slip email

The parts & materials email (dispatch slip PDF attached) fires when a technician
**accepts** a job in the FSM app, to every assigned technician with an email on
file.

**Why acceptance and not each dispatch:** materials are added one line at a
time, so emailing per allocation floods the technician. Acceptance is a single,
already-guarded transition — it is pending-only and returns early when the job
is already in that state, so no send-once claim column is needed. A
reassignment resets the status to pending, which correctly re-arms the email for
the new technician.

**Known gap:** materials dispatched *after* acceptance are not re-sent. There is
no resend trigger; the office's printable slip in NEXXUS POS Web is the fallback.

**Two renderers, one document.** The slip exists twice on purpose:
- Web (`nexus-pos`) builds self-contained HTML for `window.open` + print.
- api-server renders a landscape A4 PDF with PDFKit for the email attachment.

Keep both in sync when the form changes. The PDF carries **no pricing** — a
materials slip must not expose cost/sell figures to the field.

**PDFKit trap:** drawing a per-page footer below the page's bottom margin makes
PDFKit auto-append blank pages (one per footer write). Zero
`doc.page.margins.bottom` around the footer draw and restore it afterwards.
