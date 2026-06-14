---
name: Deployment build runs all artifacts concurrently — keep per-artifact startup timeouts generous
description: Why the Expo mobile publish failed with "Metro timeout" and why it took the web build down with it
---

A publish rebuilds **every** production artifact on the **same build machine at the
same time** (api-server + nexus-pos vite + nexus-mobile expo). Under that contention
the web `vite build` alone can take 7+ minutes, starving the other builds of CPU.

**The trap:** `artifacts/nexus-mobile/scripts/build.js` starts Metro and polls its
`/status` health endpoint with a fixed startup budget. The original 60s budget was
fine in isolation but too short under publish-time contention — Metro was simply slow
to come up, the script printed `Metro timeout` and exited 1.

**Collateral damage:** when one artifact's build exits non-zero, the orchestrator
SIGTERMs the sibling builds still running. That is why the same failed publish showed
`@workspace/nexus-pos ... vite build: Command failed with signal "SIGTERM"`
*immediately after* it had already logged `✓ built in 7m34s`. The web build was NOT
broken — it was killed because the mobile build failed.

**Rule:** any per-artifact "wait for X to be ready" timeout in a build script must be
sized for the worst-case **concurrent** publish, not the standalone dev case. Raised
the Metro startup budget to ~240s. If publishes still time out overall, the real lever
is removing the heavy Expo build from the publish (a deployment-config change with the
tradeoff that the mobile app stops being served/updated from this deployment).

**Don't chase red herrings in nexus-pos vite output:** `Error when using sourcemap for
reporting an error`, `Generated an empty chunk: "react-vendor"`, and the >1500kB chunk
size warning are all benign — they never fail the build.
