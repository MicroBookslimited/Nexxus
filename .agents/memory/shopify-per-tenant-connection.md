---
name: Shopify per-tenant connection
description: How NEXXUS POS integrates Shopify — per-tenant custom-app token, encrypted at rest, contract-first.
---

# Shopify integration model (NEXXUS POS)

Shopify is integrated **per-tenant**, NOT via a Replit app-scoped connector. One
row per tenant in `shopify_connections` (unique on tenant_id).

**Two auth modes** (`authMode` column, default `"token"`):
- `"token"` (legacy) — tenant pastes a static custom-app Admin API token (`shpat_…`).
  Stored encrypted in `accessTokenEncrypted`.
- `"client_credentials"` (the 2026 model — Shopify stopped issuing static `shpat_`
  tokens in the store admin on Jan 1 2026) — tenant pastes a Dev Dashboard app's
  **Client ID** + **Client Secret** (`shpss_…`). The secret is encrypted in
  `clientSecretEncrypted`; `clientId` is stored plaintext (public). The Admin API
  token is obtained on demand via `POST https://{shop}/admin/oauth/access_token`
  with `grant_type=client_credentials` (`exchangeClientCredentials` in
  shopify-client.ts), and the short-lived (~24h) token is **cached** in
  `accessTokenEncrypted` + `accessTokenExpiresAt` and re-exchanged when within a
  5-min buffer of expiry.

**Always resolve a token via `getValidAccessToken(row)`** (shopify.ts) — never
decrypt `accessTokenEncrypted` directly; it branches per `authMode` and handles
the exchange/refresh. Future sync phases must use it too.

**Why:** client-credentials tokens expire, so any code that builds a
`ShopifyAdminClient` must go through the refresh-aware resolver or it will 401
after 24h.

**Token storage:** AES-256-GCM at rest (`artifacts/api-server/src/lib/shopify-crypto.ts`).
Key precedence: `SHOPIFY_TOKEN_ENC_KEY` (64-hex = raw 32-byte key, else scrypt-stretched)
→ fallback `scrypt(SESSION_SECRET)`.

**Why:** the fallback lets the feature work without provisioning a new secret, but
it couples token decryptability to SESSION_SECRET.

**How to apply:** if SESSION_SECRET is ever rotated and SHOPIFY_TOKEN_ENC_KEY is
unset, all stored Shopify tokens become undecryptable and every tenant must
reconnect. Set SHOPIFY_TOKEN_ENC_KEY to decouple them. The token is NEVER returned
to the client — sanitize() strips it; only a `hasToken` boolean is exposed.

**Admin API:** GraphQL only, version is per-connection (`apiVersion`, default
`2025-01`) — never hardcode a version in code. Webhook HMAC verify helper exists
(`verifyWebhookHmac`) for later phases.

**Contract-first:** endpoints live in `openapi.yaml` (`/shopify/connection*`),
frontend uses generated hooks (`useGetShopifyConnection`, `useSaveShopifyConnection`,
`useTestShopifyConnection`, `useUpdateShopifySyncSettings`, `useDisconnectShopify`).
Phase 1 = connection foundation only; product/order/inventory sync deferred to
later phases (mapping/log tables already exist: `shopify_product_mappings`,
`shopify_order_mappings`, `shopify_sync_logs`; `orders.sales_channel` added).
