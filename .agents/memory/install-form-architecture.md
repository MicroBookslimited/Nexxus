---
name: Universal installation form
description: Schema-driven install work-order form shared by web POS and FSM; JSONB storage + atomic section merge.
---

The Universal IT/Low-Voltage installation form is schema-driven: sections/fields/showIf logic live ONLY in `lib/api-client-react/src/work-order-install-form.ts` (SERVICE_AREAS, INSTALL_SECTIONS, visibleInstallSections/installFieldVisible/installSectionProgress). Both renderers (web POS `WorkOrderInstallForm.tsx`, FSM `app/install/[id].tsx`) are generic — to add/change fields, edit the shared definition, never the renderers.

**Storage & merge:** `work_orders.service_areas` (string[] jsonb) + `install_details` ({sectionId:{fieldId:value}} jsonb, DDL applied manually to Supabase). Saves are per-SECTION and merged atomically in SQL via `coalesce(install_details,'{}'::jsonb) || $new::jsonb` — a section save replaces that whole section but never others; do NOT replace this with read-modify-write in app code (concurrent POS/FSM saves would clobber each other).

**Why:** dispatcher (web) and technician (FSM) fill the same form concurrently; section-level SQL merge was the review-mandated fix for lost updates.

**How to apply:** any new endpoint writing install_details must use the same SQL `||` merge and validate with `ServiceAreasSchema`/`InstallDetailsSchema` exported from api-server `routes/work-orders.ts` (area-id enum + 100KB size cap).
