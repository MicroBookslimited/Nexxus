---
name: PO/Bill net-cost storage & conversion tax mode
description: Why converting a Purchase Order to a Purchase Bill must force exclusive tax mode
---

Purchase Order (and Purchase Bill) line `unitCost` is persisted **net** — tax is
stripped out at write time even when the document's `taxMode` is `inclusive`
(the server back-computes net from the entered gross and stores that).

**Rule:** When converting a PO to a Bill, seed the bill form with `taxMode:
"exclusive"`, NOT the PO's own `taxMode`.

**Why:** If you copy an inclusive PO's `taxMode` verbatim while seeding the
already-net `unitCost`, the bill re-interprets that net figure as gross and
strips tax a second time, underpricing every line and the totals. Exclusive mode
treats the net cost as net and adds tax on top, reproducing the PO totals exactly.

**How to apply:** Any new "convert X to a tax-bearing document" flow that copies
stored line costs must check whether those costs are net or gross and pick the
destination tax mode accordingly. Default for these tables: stored = net →
destination = exclusive.
