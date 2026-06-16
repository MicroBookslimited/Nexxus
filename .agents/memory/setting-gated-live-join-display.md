---
name: Live-join order display fields (sellingUnit / size)
description: sellingUnit and size are live product joins returned on every order read regardless of any tenant setting; product size is now shown wherever populated (no longer gated). The zod-strip and reprint-semantics gotchas still apply.
---

Some order/receipt fields (e.g. `sellingUnit`, `size`) are NOT snapshotted on
`order_items`; they are resolved as a LIVE product join in `orders.ts` and
returned on every order read regardless of any tenant setting.

**Current display rule (size):** product `size` is shown WHEREVER it is
populated — POS card, POS cart line, price-check, and EVERY receipt path
(`uomHtml` for HTML templates, `buildWhatsAppText`, `buildRefundReceiptHtml`).
The old `show_product_size` gate was removed from these render sites. The
setting still gates the product *management* page (catalog cards + add/edit
form + create payload in `products.tsx`); that surface was intentionally left
out of the "show whenever populated" change.

**Why:** Two successive user requests moved size toward "just works when
present" — first decoupling size IMPORT from the setting, then size DISPLAY on
POS + receipts. `sellingUnit` was never gated; size now matches it.

**Durable gotchas (still true):**
- The generated OrderItem zod strips unknown keys before `res.json`, so any new
  live-join field must be added to ALL OrderItem zod blocks + OpenAPI +
  api-client-react types or it never reaches the client even when the join
  selects it.
- Live-join (non-snapshot) means receipt REPRINTS show the CURRENT product
  value, not the sold-time value. Intentional, consistent with `sellingUnit`.
- There are MANY receipt render paths (HTML templates via `uomHtml`, WhatsApp
  plain text, refund slips). A field-visibility change must be applied to all of
  them or outputs diverge — `uomHtml` alone does not cover WhatsApp/refund.
