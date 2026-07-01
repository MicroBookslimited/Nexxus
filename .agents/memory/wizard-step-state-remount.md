---
name: Multi-screen wizard step state must be lifted
description: When a parent swaps between sibling screens (flow/review/success), a child wizard that owns its own step index loses position on remount.
---

Multi-step wizards rendered as one of several sibling screens (e.g. a parent that
conditionally renders `flow` / `review` / `success`) must keep the wizard's step
index (and any "resolved" branch flags) in the **parent**, not in the wizard's own
`useState`.

**Why:** conditionally rendering the wizard unmounts it whenever the parent shows a
different screen. An "Edit" button that returns from Review → flow remounts the wizard
at step 1, discarding the user's position — even though the draft data survives
(because the draft was already lifted). The bug is silent: types pass, data is intact,
only navigation feels broken.

**How to apply:** lift both the step counter and any mid-flow branch booleans to the
parent and pass them down as `step` / `setStep` props. Reset them in the parent's
"start a fresh flow" handler alongside the draft reset.
