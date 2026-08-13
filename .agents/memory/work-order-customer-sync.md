---
name: Work-order walk-in → customer sync
description: Why every work order resolves to a real customers row, and the matching rules that stop duplicate customer records.
---

A work order taken for a "walk-in" used to keep the person only in its own
contact_name/phone/email columns, so they never appeared in the POS Customers
module (no loyalty card, no A/R, invisible to marketing). Every work-order
write path now resolves the contact to a real `customers` row and links it.

**Matching order (tenant-scoped, bounded SQL — never load the whole customer list):**
1. phone, compared digits-only (`regexp_replace(..., '[^0-9]', '', 'g')`) so
   `876-555-1234` and `(876) 555 1234` are the same person;
2. email, lower/trimmed;
3. exact name **only** when the job carries neither phone nor email, and only
   when the name match is unique — otherwise a job gets attached to a different
   person who happens to share a name.
Matched records get their blank phone/email filled in, never overwritten.

**Why:** duplicate customer rows are worse than a missing link — they split
history, loyalty points and A/R across two records with no easy merge.

**How to apply:**
- Any new path that creates a work order (or edits its contact) must run the
  same resolve-then-link step; do it INSIDE the work-order transaction, with
  the job row locked on the edit path, or a rejected update still leaves a
  stray customer behind and concurrent edits each create their own.
- `customers` has no uniqueness on phone/email (only the LM card number), so
  matching must stay deterministic (`order by id limit 1`).
- Careful with regex in `sql` template literals: `'\D'` collapses to `'D'`
  because JS drops unknown escapes — use a character class instead.
