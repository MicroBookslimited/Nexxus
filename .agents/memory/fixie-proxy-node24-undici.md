---
name: Fixie static-IP proxy + Node 24 undici gotcha
description: How outbound calls to IP-whitelisted third-party APIs (e.g. DingConnect) are routed through Fixie, and the Node 24 global-fetch vs installed-undici dispatcher trap.
---

# Routing IP-whitelisted API calls through Fixie

Some third-party APIs (DingConnect topup) enforce an outbound-IP whitelist. Replit autoscale deployments have no stable egress IP, so calls fail once the vendor's whitelist is enabled. Fix = route those calls through the Fixie proxy (static IP) via the `FIXIE_URL` secret + undici `ProxyAgent`.

**Why:** DingConnect rejected the server's rotating outbound IP → "Carriers unavailable". Fixie gives a fixed egress IP the vendor can whitelist.

**How to apply:**
- Build a `ProxyAgent(process.env.FIXIE_URL)` and pass it as `dispatcher`. Cache it as a module-level singleton — do NOT construct a new ProxyAgent per request (socket churn).
- **Critical trap:** Node 24's *global* `fetch` uses a DIFFERENT internal undici build than the installed `undici` package. Passing a `ProxyAgent` from the installed pkg to global fetch throws `TypeError: fetch failed`. You MUST call undici's own `fetch` (import `{ fetch as undiciFetch, ProxyAgent } from "undici"`) when a dispatcher is present. Keep a try/catch fallback to global `fetch` if the proxy is unreachable (fallback hits the non-whitelisted IP and will fail under strict whitelists — that's expected, just observable).
- Fixie rotates between MULTIPLE egress IPs — whitelist ALL of them at the vendor, not just one. Adding the first IP to a vendor whitelist typically ACTIVATES enforcement (empty list = allow-all).
- Verify with a public no-auth net-check endpoint that reports outbound IP + a vendor GetBalance/auth ping; test prod AND dev.
- esbuild bundle (build.mjs) must NOT mark `undici` external — it needs to be bundled for prod.
