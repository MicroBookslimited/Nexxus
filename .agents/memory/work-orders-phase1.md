---
name: Work Orders Phase 1 architecture
description: What was built in Phase 1 of the Work Orders module, what was deferred, and key gotchas.
---

## What was built

**DB (applied via ALTER TABLE / CREATE TABLE, never drizzle push):**
- Expanded `work_orders`: brand, model, serialNumber, imei, assetTag, colour, conditionReceived, accessoriesReceived, serviceType, serviceChannel, priority, appointmentDate, storageLocation, contactEmail, depositRequired, depositPaid, internalNotes
- `work_order_notes` — per-message notes with isInternal flag
- `work_order_status_history` — every status transition logged
- `work_order_appointments` — scheduled events (assessment, repair, pickup, etc.)
- `subscription_addons` — seeded with `work_orders` slug at $5/mo
- `tenant_addons` — tracks which tenants have purchased each add-on

**API (`artifacts/api-server/src/routes/work-orders.ts`):**
- 7 statuses: received → in_progress | awaiting_parts | on_hold → ready → collected | cancelled
- Notes CRUD: GET/POST /work-orders/:id/notes, DELETE /work-orders/:id/notes/:noteId
- Status history: GET /work-orders/:id/history
- Appointments CRUD: GET/POST/PATCH/DELETE /work-orders/:id/appointments
- Stats: GET /work-orders-stats (byStatus counts + activeCount + revenueThisMonth)
- Delete restricted to received/cancelled only

**API Client (`lib/api-client-react/src/work-orders-api.ts`):**
- Full set of hooks for all new endpoints
- Expanded WorkOrder type with all new fields

**UI (`artifacts/nexus-pos/src/pages/`):**
- `work-orders.tsx` — list view with stat cards + kanban board toggle
- `work-order-detail.tsx` — full-page detail route `/work-orders/:id` with 6 tabs: Overview, Parts & Labour, Notes, Appointments, History, Job Card
- `components/work-orders/CreateWorkOrderDialog.tsx` — rich intake form with asset fields

**Job card (`artifacts/nexus-pos/src/lib/work-order-doc.ts`):**
- Generates standalone HTML with JsBarcode (CDN) Code128 barcode
- Printable to A4 or thermal via browser print

## What was NOT built (deferred)

- **Self-serve add-on purchase** — `subscription_addons` and `tenant_addons` tables are in place; API billing routes and settings UI upgrade prompt still need to be wired. The payment flow should mirror `billing.ts`'s PowerTranz 3DS flow with `kind: "addon"`.
- **Customer portal** — public status page (e.g. `/work-order/WO-26-0001?token=...`) with HMAC-signed URL so customers can check their job status without logging in.

## Key gotchas

- Items JSONB type includes `"fee"` as a valid type alongside `"part"` and `"labor"` — old schema only had part/labor.
- Status transitions are enforced server-side; `convertedOrderId` can bypass to `collected` from ready/in_progress/awaiting_parts.
- Job card uses CDN JsBarcode — ensure the tab has internet access to load the script.
- The `PENDING_WORK_ORDER_KEY` constant is exported from `work-orders.tsx` for POS cart integration.

**Why:**
The add-on billing was deferred because PowerTranz 3DS flow is complex and needs careful testing; the DB/API/UI foundation is solid enough to ship the module without it (just gate via the existing work_orders_enabled setting toggle in Settings).
