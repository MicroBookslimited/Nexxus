---
name: Install-form equipment stock deduction
description: Durable rules for deducting installed equipment from inventory at work-order completion.
---

# Install-form equipment stock deduction

- Deduction must run INSIDE the completion/collection transaction with a one-shot claim column. **Why:** fire-and-forget post-commit deduction is permanently lost on failure, because completion retries are idempotent and never re-trigger it.
- The install form freezes once work is completed. **Why:** deduction snapshots the form at completion; later edits would desync stock. Enforce the freeze in the UPDATE where-clause (atomic), like the signature freeze.
- Reopen → edit → re-complete intentionally does NOT re-deduct (one-shot claim). Don't "fix" by clearing the claim — that double-deducts; the proper fix is diff-based reconciliation (proposed as its own task).
- Completion-time deduction may drive stock negative (work already done), unlike dispatch-time allocations which reject insufficient stock.

**How to apply:** any future "consume stock when X finishes" feature should copy this claim-inside-txn + form-freeze pattern.
