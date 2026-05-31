---
name: Mobile→web auth handoff
description: How the Expo app hands its tenant token to the web app for in-app web checkout, and why it uses the URL fragment.
---

# Mobile → web in-app checkout auth handoff

When the Expo app (`nexus-mobile`) opens an authenticated web page (e.g. the
subscription/renewal checkout) in an in-app browser, it passes the tenant JWT in
the URL **fragment** (`#token=…`), NOT a query param (`?token=…`). The web boot
code (`nexus-pos/src/main.tsx`) reads it from `window.location.hash` before
render, writes it to localStorage (so `ProtectedRoute` authenticates), then clears
the hash via `history.replaceState`.

**Why:** URL fragments are never sent to the server/proxy, so the bearer token
can't leak into request logs or Referer headers. A query param would appear in
proxy/server access logs — a credential-leak pattern. This avoids needing a
server-side one-time-code exchange endpoint (which would touch the shared API).

**How to apply:** Any future mobile→web authenticated deep-link handoff must use
the fragment, and the web side must read from `location.hash`. If a stronger
guarantee is ever needed, replace with a short-lived one-time exchange code
redeemed via POST (requires a new server endpoint).
