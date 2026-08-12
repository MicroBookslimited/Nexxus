---
name: Work-order sign-off freeze
description: How the customer sign-off lock is enforced across API, POS and FSM clients
---
Rule: once a work order has `completionSignature` OR `customerSignature`, its content is frozen. Only status moves, collection signatures, `convertedOrderId`, and notes stay mutable. Tool/material RETURNS (`qtyReturned`/status) stay allowed post-sign-off; new dispatches, deletes, runs/remarks edits do not. Signed WOs can never be deleted.

**Why:** the signature is a legal record of what the customer approved; anything they reviewed must not change afterwards.

**How to apply:** enforcement must be ATOMIC — the freeze predicate (`completion_signature IS NULL AND customer_signature IS NULL`) lives in the UPDATE/DELETE WHERE clause (or a `FOR UPDATE` row lock via `lockOpenWorkOrder`, which returns `signedOff`), not just a pre-read check; zero-row update ⇒ 400. Any NEW mutation endpoint touching work-order content must add the same guard. Clients gate with `isLocked = terminal || signedOff` (POS work-order-detail, FSM install/materials screens) but the server is the authority.

Gotchas:
- Server `SERVICE_AREA_IDS` must match shared `SERVICE_AREAS` ids in lib/api-client-react (was `pc` vs `pc_it` — silently rejected the PC & IT form section).
- RN modal buttons must not reuse the action-bar `actionButton` style (`flex: 1`) inside a modal column — labels get clipped; use a non-flex `modalActionBtn`.
- FSM sign modal: review content (summary + InstallFormPreview) scrolls in a bounded ScrollView; name input + SignaturePad + save stay static below it so the pad doesn't move under the pen.
