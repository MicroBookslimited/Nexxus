---
name: api-server new-route reload
description: Newly-added api-server route files are not picked up live until the workflow is restarted.
---

Adding a brand-new route file under `artifacts/api-server/src/routes/` and registering it in `routes/index.ts` does NOT make the endpoint live on its own — the running dev server keeps serving the old route table. Symptom: the new path returns 404 while sibling routes return their normal 401/200.

**Why:** the api-server dev watcher does not reliably re-evaluate the module graph when a *new* file is introduced and imported; only edits to already-loaded files hot-reload.

**How to apply:** after creating + registering a new route, `restart_workflow "artifacts/api-server: API Server"`, then smoke-test (unauth should be 401, not 404) before assuming a routing/path bug. Don't waste a debugging cycle chasing path conventions when the real fix is a restart.
