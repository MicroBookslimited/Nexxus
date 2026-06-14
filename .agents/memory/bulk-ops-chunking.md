---
name: Bulk product ops must chunk client-side
description: Why bulk archive/restore over large selections must be batched, not one request.
---

GET /api/products has NO limit — with `includeArchived` it returns every
archived row, so a tenant can accumulate thousands (seen: ~7000) and
"select all" then feeds all IDs into one bulk request.

**Rule:** bulk archive/restore (and any future bulk mutation over the
product selection) must split IDs into chunks client-side (currently 300)
and call the mutation per chunk sequentially, like the import flow does.

**Why:** a single `POST /products/bulk-restore` carrying ~7000 IDs
timed out / "did not go through". The server uses one `UPDATE ... WHERE id
IN (...)` + an audit row embedding every ID; the round trip exceeds the
proxy/DB budget at that size.

**How to apply:** reuse the `runBatched` helper + `bulkProgress` Dialog in
`artifacts/nexus-pos/src/pages/products.tsx`. Aggregate affected/failed,
show a progress bar, and early-abort after consecutive failures rather
than hammering. Server endpoints stay simple/idempotent — fix lives on the
client.
