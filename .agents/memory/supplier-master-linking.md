---
name: Supplier master linking on purchase documents
description: How purchase orders/bills link to the vendors master, and when a confirmed bill raises an Accounts Payable entry.
---

## Rule
`vendors` is the single supplier master (managed under Accounts Payable → Suppliers).
Purchase orders and purchase bills carry BOTH a nullable link to that master and the
legacy free-text supplier name. On every write the server copies the linked vendor's
name into the free-text column, so the two can never disagree; a typed-in name is only
kept when no supplier is linked.

**Why:** the free-text column predates the master and is read by receipts, printed
documents, journal-entry descriptions, and older rows that will never be linked.
Dropping it would break history; letting the client set both would let them drift.

**How to apply:** when adding a new purchase-document surface, send the vendor id and
let the server derive the display name — never trust a client-sent supplier name when a
vendor id is present.

## Payables
Confirming a purchase bill posts a GL journal crediting the AP control account AND
(only when the bill is linked to a supplier) inserts one AP subledger entry. That is not
double counting: the GL account is the control total, the subledger is what Accounts
Payable lists and pays against. Keep it that way — do not add a second GL posting from
the subledger insert.

De-duplication is by a partial unique index on (tenant, source bill) plus
`onConflictDoNothing`, so a retried or repeated confirm can never raise the same payable
twice. Any other document type that starts raising payables needs its own such claim.

## Known gap
PO → bill conversion is still a client-side two-step (create bill, then PATCH the PO to
converted). A failed or repeated second step can produce two bills for one PO. There is
no server-side atomic claim linking a bill to a PO.
