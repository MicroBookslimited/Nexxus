---
name: replit.md reorg (deferred)
description: User-deferred decision to slim down replit.md once the mobile apps are stable.
---

# replit.md reorganization — deferred by user

`replit.md` has grown large (~20 dense per-feature "Architecture decisions / Gotchas" entries). It still loads in full into the agent context at the start of every session, which costs tokens and hurts readability. Not a correctness risk.

**Decision (deferred):** The user wants to address this **later, once the mobile apps (`nexus-pos` web + `nexus-mobile` Expo) are stable** — not now.

**Agreed approach when the time comes (Option A):** Keep `replit.md` lean (stack, where-things-live, user preferences, plus a short one-line-per-feature index). Move the long per-feature deep-dives into a referenced doc (e.g. `docs/architecture.md`) linked from `replit.md`.

**Why:** Only `replit.md` is auto-loaded each session, so the lean version MUST retain a one-line hook per feature pointing to the detail file — otherwise future sessions won't know to go read it. Nothing should be deleted, only relocated.

**Trigger to act:** When the user confirms the mobile apps are stable / explicitly asks to trim or reorganize replit.md.
