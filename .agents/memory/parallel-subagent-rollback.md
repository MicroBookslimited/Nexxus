---
name: Verify tracked-file edits after a parallel subagent fan-out
description: A workspace snapshot can roll back edits to git-tracked files mid-run while newly created files survive.
---

During a large parallel subagent fan-out, a workspace snapshot/rollback reverted edits to
**git-tracked** files while **newly created (untracked)** files survived. The result looked
like a half-built feature: new modules present, every hook into existing files gone.

**Why:** checkpoint/restore operates on tracked content, so anything an agent appended to an
existing file can disappear without any tool reporting an error. Subagents also reported
their work as complete, because it *was* complete when they wrote it.

**How to apply:** after any multi-agent run — and before typechecking or declaring done —
grep every expected identifier in every touched *existing* file (a one-line loop over
`file:pattern` pairs). Re-apply losses with `sendFollowup` to the same subagent (it still has
its context) rather than starting a fresh one. Keep your own wiring edits scripted and
idempotent so replaying them is cheap.
