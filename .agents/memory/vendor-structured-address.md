---
name: Vendor structured address
description: Vendors now have city/state/postalCode columns matching the customer address schema.
---

## DDL applied (both Supabase + local)
```sql
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS state text;       -- parish in Jamaica
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS postal_code text;
```

## Schema
`lib/db/src/schema/purchasing.ts` — `vendorsTable` has `city`, `state`, `postalCode` after `address`.

## Type
`lib/api-client-react/src/purchasing-api.ts` — `Vendor` type updated with `city | state | postalCode` (all `string | null`).

## API
`VendorBody` zod schema in `artifacts/api-server/src/routes/vendors.ts` accepts `city`, `state`, `postalCode`. The PATCH handler uses `VendorBody.partial()` so they are included automatically.

## Display
`vendorAddress(v)` helper in `vendors.tsx` joins `[address, city, state, postalCode].filter(Boolean).join(", ")` for the card MapPin row.

**Why:** Vendors previously had a single free-text `address` column; customers had 4 structured columns. Now consistent.
