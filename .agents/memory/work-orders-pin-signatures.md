---
name: Work Orders PIN gate & digital signatures
description: How the work-orders full-screen PIN gate works, and how digital signatures are stored and enforced on completion.
---

## Work Orders full-screen PIN gate

**Rule:** Both `/work-orders` and `/work-orders/:id` run full-screen with the nav header hidden. Staff must enter a PIN before accessing either route.

**Why:** Mirrors the POS screen pattern to prevent unauthorised access to repair/service records.

**How to apply:**
- `layout.tsx` hides the header when `location.startsWith("/work-orders")` (unconditional) — no toggle needed.
- Each page (`work-orders.tsx`, `work-order-detail.tsx`) has `const [locked, setLocked] = useState(() => !sessionStaff)` using `useStaff()` context. When locked, a full-screen `PinPad` overlay is shown (`fixed inset-0 z-50`).
- The `useStaff()` session is shared across both pages, so authenticating on the list page also unlocks the detail page (and vice versa) within the same browser session.
- Do NOT call `usePosChrome()` from work-orders pages — the header is suppressed via the route check in layout.tsx directly.

## Digital signatures for "collected" transition

**Rule:** Moving a work order to `collected` via the UI requires both a customer signature and a staff signature. The API enforces this server-side.

**Why:** Business requirement — work orders must be signed by both parties before deemed complete.

**How to apply:**
- Two new columns: `work_orders.customer_signature text` and `work_orders.staff_signature text` (base64 PNG data URLs).
- API (`PATCH /work-orders/:id`): if `status === "collected"` and no `convertedOrderId` (POS conversion path), the body MUST include both `customerSignature` and `staffSignature` or a 400 is returned.
- **POS conversion path** (`convertedOrderId` present) bypasses the signature requirement — signatures not collected at POS checkout.
- Signature capture component: `artifacts/nexus-pos/src/components/SignatureCanvas.tsx` — canvas-based, exposes `getDataUrl()`, `isEmpty()`, `clear()` via ref + `onChange(hasSignature: boolean)` prop.
- The "collected" button in the Move Status dialog intercepts the click and opens a two-panel signature dialog instead of calling `patchWO` directly.
- Captured signatures appear on the printed job card PDF (`work-order-doc.ts`) as embedded images instead of blank lines.
- Signatures stored as base64 text in Postgres — may be large (~50–100KB each); consider object storage if DB size becomes a concern.
