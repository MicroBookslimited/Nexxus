---
name: Optimistic absolute-value PATCH under rapid input
description: Why client-side counters that PATCH absolute values need a sync ref + write-sequence guard when driven by barcode scanners
---

# Optimistic absolute-value PATCH under rapid input

When a UI lets a barcode scanner drive an increment (e.g. each scan = +1 to a
physical stock count) and persistence is an **absolute-value** PATCH
(`physicalCount: n`, not an atomic server-side `+1`), two races break the
"+1 per scan" guarantee:

1. **Stale base read** — the handler computes `next = current + 1` from
   render-time React state. A burst of scans in the same tick all read the same
   pre-update value and send duplicate `next` values, so increments are lost.
2. **Out-of-order responses** — if scan2's PATCH resolves before scan1's, the
   later-applied response writes the older value, regressing the count.

**Fix applied (no backend change):**
- Keep a `useRef` mirror of the counts map, updated **synchronously** at the top
  of the update function, and read the base value from the ref (not state) so
  back-to-back scans accumulate correctly.
- Keep a per-item `writeSeqRef` counter; capture the seq before the PATCH and
  only apply the response if it's still the latest seq for that item.

**Why:** code review flagged that the naive version dropped increments under
realistic rapid scanning. The ref+seq pattern is the minimal client-only fix.

**How to apply:** reach for this whenever an optimistic counter sends absolute
values to the server AND can be triggered faster than a React render cycle
(scanners, hardware buttons, held keys). The cleaner long-term fix is an atomic
server-side increment endpoint.
