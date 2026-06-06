---
name: replit.md deep-dive split (done)
description: replit.md keeps a lean one-line index; full architecture deep-dives live in docs/architecture.md.
---

# replit.md ↔ docs/architecture.md split

`replit.md` was slimmed: the long per-feature "Architecture decisions" deep-dives and the giant
"Web receipt printing" Gotcha were moved **verbatim** into `docs/architecture.md`. `replit.md` now
keeps a one-line summary per feature plus a `[Details](docs/architecture.md#<anchor>)` deep-link.

**Why:** Only `replit.md` is auto-loaded into agent context each session, so it must stay lean while
still pointing to where the detail lives. Nothing was deleted — only relocated.

**How to apply / keep in sync:**
- New architecture decision → add the full write-up as a `### Title` section in `docs/architecture.md`
  AND a one-line `*   **Title** — summary [Details](docs/architecture.md#slug).` bullet in `replit.md`.
- Anchor slug = GitHub style: lowercase, strip chars matching `[^\w\- ]`, spaces→`-`
  (e.g. "Batch / Lot / Expiry Tracking + FIFO/LIFO" → `batch--lot--expiry-tracking--fifolifo`).
- Keep these inline in `replit.md`: Run & Operate, Stack, Where things live, Product,
  User preferences, the short operational Gotchas, Pointers.
