---
name: Tenant-scoped snapshot joins
description: Embedding related-entity data (e.g. customer PII) onto a tenant resource via join must be tenant-scoped on BOTH the join and the write-time foreign id.
---

When a read endpoint embeds another entity's fields (e.g. customer name/phone/email/address) onto a tenant-scoped resource via a `leftJoin`, two things are required or you leak cross-tenant PII:

1. **Scope the join itself by tenant**, not just the outer `where`:
   `leftJoin(customers, and(eq(q.customerId, customers.id), eq(customers.tenantId, tenantId)))`.
   The outer `where` filters the primary table; without the tenant predicate inside the join condition, a row that references a *foreign* tenant's customer id will still match and embed that customer's data.

2. **Validate the foreign id at write time.** If a create/update body accepts `customerId` (or any FK), confirm it belongs to the caller's tenant before insert; otherwise a forged id gets persisted and later embedded/leaked on read.

**Why:** A code review caught exactly this in the quotations route — an unscoped customer join plus an unvalidated `customerId` on create let one tenant embed another tenant's customer PII. The original (pre-snapshot) code was safe only because it never read the customer; adding the embed introduced the leak.

**How to apply:** Any time you add an embed/denormalized snapshot of a related table to a multi-tenant endpoint, scope the join by tenant AND validate the FK on the write path.
