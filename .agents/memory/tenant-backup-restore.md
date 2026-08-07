---
name: Tenant offline backup & restore
description: How the encrypted tenant backup/restore feature works and its invariants
---

Route: api-server `/api/backup/export` + `/api/backup/restore` (tenant token, any restrictedRole blocked). UI page `/backup` (permission settings.manage).

Rules / invariants:
- Tables are discovered at RUNTIME from information_schema: every table with `tenant_id` (minus the EXCLUDED_TABLES denylist in routes/backup.ts) plus FK-reachable children, topologically ordered. New business tables are picked up automatically — but any new control-plane/secret/wallet table MUST be added to the denylist or it gets exported.
- Restore is wipe-and-replace: it deletes rows for ALL currently-discovered tables (not just tables present in the file), then inserts backup tables, forces tenant_id, bumps serial sequences to global MAX(id).
- A backup may only be restored into the SAME tenantId — serial ids are global across tenants, cross-tenant restore would collide with other tenants' rows.
- Export runs in one REPEATABLE READ READ ONLY transaction for a consistent snapshot.
- File format `.nxbk` = JSON envelope {salt,iv,tag,data} AES-256-GCM, scrypt key from user password, gzip inside; gunzip capped at 1GB (zip-bomb guard). Restore route has its own 200mb express.json limit in app.ts (registered BEFORE the global 15mb parser).

**Why:** avoids hand-maintaining a ~60-table manifest that would silently drift as the schema grows; wiping all current tables keeps "full replacement" semantics even when the backup predates new tables.
**How to apply:** when adding platform/billing/integration-secret tables, add them to EXCLUDED_TABLES; whole-buffer processing means very large tenants may need a streamed architecture later.
