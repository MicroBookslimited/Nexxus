---
name: Shopify per-tenant connection
description: How NEXXUS POS integrates Shopify — per-tenant OAuth Connect-store flow, per-tenant app credentials, encrypted at rest, contract-first.
---

# Shopify integration model (NEXXUS POS)

Shopify is integrated **per-tenant**, NOT via a Replit app-scoped connector.
A tenant can connect **multiple stores across different Shopify orgs**: one row
per store in `shopify_connections`, unique on **(tenant_id, shop_domain)** (the
old tenant-only unique was dropped).

**Per-tenant app credentials (the key design point):** the Shopify app's API key
(Client ID) + secret are entered **per-tenant in tenant settings**, NOT as global
env vars. They live in `shopify_app_credentials` (tenantId PK, clientId plaintext,
clientSecretEncrypted, apiVersion default 2025-01). `getAppCredentials(tenantId)`
in routes/shopify.ts loads + decrypts them, falling back to `SHOPIFY_API_KEY` /
`SHOPIFY_API_SECRET` env only if no tenant row exists. Endpoints: `GET/PUT
/shopify/app-credentials` — GET returns `{configured, clientId, apiVersion}` and
**never** the secret; PUT requires the secret on first save but allows omitting it
on update (keep-current). Both are tenant-scoped; PUT is behind `requireFullTenant`.

**Why:** each tenant runs their own Shopify custom/partner app, so credentials
must be tenant-isolated, not shared platform-wide.

**Auth modes** (`authMode` column on shopify_connections):
- `"oauth"` (current) — Authorization Code Grant "Connect Shopify store" flow.
  `POST /shopify/oauth/start` (uses tenant appCreds → 400 if absent) builds the
  authorize URL and stores a `state` nonce row (`shopify_oauth_states`: state PK,
  tenant_id, shop_domain, expires_at, used_at). Public `GET /shopify/oauth/callback`
  looks up **state → tenant FIRST**, then loads that tenant's appCreds to verify
  HMAC and exchange the code for a long-lived **OFFLINE** token (no expiry).
  `grantedScopes` records what Shopify actually granted. Connection `apiVersion`
  is set from `appCreds.apiVersion` on BOTH insert and existing-row update (reconnect).
- `"token"` / `"client_credentials"` (legacy) — backward-compat branches retained
  in `getValidAccessToken`.

**HMAC:** callback verifies the request via `verifyOAuthHmac(query, secret)` (sorted
query-string HMAC in shopify-crypto.ts) — distinct from `verifyWebhookHmac`. The
secret used is the **per-tenant** clientSecret (resolved after state→tenant lookup).

**Always resolve a token via `getValidAccessToken(row)`** — never decrypt
`accessTokenEncrypted` directly; it branches per `authMode`.

**Token/secret storage:** AES-256-GCM at rest (shopify-crypto.ts `encryptToken`/
`decryptToken`). Key precedence: `SHOPIFY_TOKEN_ENC_KEY` (64-hex raw 32-byte key,
else scrypt-stretched) → fallback `scrypt(SESSION_SECRET)`. Tokens + client secrets
are NEVER returned to the client (sanitize() strips them; only `hasToken` /
`configured` booleans exposed).

**Why:** the SESSION_SECRET fallback works without provisioning a new secret but
couples decryptability to it — rotating SESSION_SECRET without SHOPIFY_TOKEN_ENC_KEY
set makes all stored tokens/secrets undecryptable and forces every tenant to
re-enter creds + reconnect.

**redirect_uri** = `https://<host>/api/shopify/oauth/callback` (host from
`REPLIT_DOMAINS[0]` in prod, dev domain in dev). Must be registered as an allowed
redirect URL in each tenant's Shopify app.

**OAuth scopes** (`SHOPIFY_OAUTH_SCOPES` in routes/shopify.ts):
read_products,write_products,read_inventory,write_inventory,read_locations,
read_orders,write_orders,read_draft_orders,write_draft_orders,read_customers,
write_customers,read_discounts,write_discounts.

**Validation gotcha:** `AppCredentialsBody` uses `z.string().trim().min(1)` —
trim BEFORE min so whitespace-only Client ID/Secret can't pass and persist as
empty (which would mark `configured` true but break OAuth).

**Contract-first:** endpoints in `openapi.yaml` `/shopify/*`; frontend uses
generated hooks (`useGetShopifyAppCredentials`, `useSaveShopifyAppCredentials`,
`useListShopifyConnections`, `useStartShopifyOAuth`, `useTestShopifyConnection`,
`useUpdateShopifySyncSettings`, `useDisconnectShopify`). Frontend card gates
"Connect store" until app credentials are configured.

**Admin API:** GraphQL only; version per-connection (`apiVersion`) — never hardcode.
Sync mapping/log tables exist (`shopify_product_mappings`, `shopify_order_mappings`,
`shopify_sync_logs`; `orders.sales_channel`); product/order/inventory sync deferred.
