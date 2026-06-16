---
name: Setting-gated live-join display fields
description: When a display field is gated by a tenant setting but resolved as a live product join on order reads, the API returns it unconditionally — gating must happen at every render site.
---

Some order/receipt fields (e.g. `sellingUnit`, `size`) are NOT snapshotted on
`order_items`; they are resolved as a LIVE product join in `orders.ts` and
returned on every order read regardless of any tenant setting.

**Rule:** If such a field is gated behind a tenant setting (e.g. `show_product_size`),
the gate MUST be applied at every render/display site (POS cards, price-check,
all receipt templates incl. refund slips, WhatsApp/plain-text), NOT at the API.
The API always returns the value.

**Why:** The server has no per-field setting filter for live-join fields, and
adding one would diverge from the established `sellingUnit` pattern. Gating at
read time would also break other consumers. Centralizing the gate at render
keeps "setting OFF = no visible change" true without touching the contract.

**How to apply:**
- Thread `settings` into the shared receipt helper (`uomHtml(item, settings)`)
  and into each inline render path; check `settings.show_product_size === "true"`.
- The generated OrderItem zod strips unknown keys before `res.json`, so the new
  field must be added to ALL OrderItem zod blocks + OpenAPI + api-client-react
  types or it never reaches the client even when the join selects it.
- Live-join (non-snapshot) means receipt REPRINTS show the CURRENT product value,
  not the sold-time value. This is intentional and consistent with `sellingUnit`.
