---
name: Shopify per-tenant connection
description: How NEXXUS POS integrates Shopify — per-tenant custom-app token, encrypted at rest, contract-first.
---

# Shopify integration model (NEXXUS POS)

Shopify is integrated **per-tenant**, NOT via a Replit app-scoped connector. Each
tenant creates their own Shopify *custom app* and pastes its Admin API access
token (`shpat_…`) into Settings → Integrations → Shopify. One row per tenant in
`shopify_connections` (unique on tenant_id).

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
