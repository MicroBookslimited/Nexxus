---
name: Zoho list vs detail payload shape
description: Zoho list endpoints omit sub-collections, and Zoho REPLACES arrays on update — building an update payload from a list-shaped record silently deletes the tenant's sub-records.
---

Two Zoho Books behaviours combine into a silent data-destruction bug:

1. **List endpoints omit sub-collections.** `GET /contacts` (behind both `listContacts` and `searchContacts`) returns contacts WITHOUT `contact_persons`. Only the detail endpoint `GET /contacts/:id` includes them. The same pattern should be assumed for other Zoho resources with nested collections (line items, addresses, custom fields) until proven otherwise.
2. **Zoho REPLACES arrays on update; it does not merge them.** Whatever `contact_persons` array a PUT sends becomes the entire list.

So an update payload built from a list-shaped record posts a single person with no `contact_person_id` — Zoho deletes every other contact person on the record and duplicates the primary. Nothing errors; the tenant just loses data in their books.

**Why:** this shipped undetected because the sync's payload builder declared options `{ mode, existing }` while every call site passed a different shape (`{ primaryContactPersonId }`). TypeScript flagged it as `TS2353`, but the errors sat in the repo's known-failing baseline and were read as cosmetic. The declared defaults therefore never applied: `mode` was always `undefined` (so create never sent `customer_sub_type` or `opening_balance_amount`) and `existing` was always null (so the merge logic could not run).

**How to apply:**
- Before building any Zoho UPDATE payload, confirm the source record came from a detail fetch. If it came from a list or search, re-fetch the detail first.
- Do NOT guard this by sniffing for the missing property (`if (record.sub_collection) ...`). An empty array is truthy in JS, so the day a list response returns `[]` the guard passes and data destruction silently resumes. Fetch unconditionally at the call sites that are known to hold list-shaped records.
- Charge the extra detail read to the sync's per-run work budget, or adding a read silently doubles a run's API traffic against Zoho's ~100 calls/min per-org limit.
- Known pre-existing looseness: the run budget paces ~150 units at 120ms, well above 100/min if Zoho counts strictly. No 429s observed; a 429 aborts the run and the next resumes from `summary.remaining`. Tighten the delay only if 429s appear.
