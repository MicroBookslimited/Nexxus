import { Router, type IRouter, type Request } from "express";
import crypto from "node:crypto";
import { and, asc, eq, isNull, lt } from "drizzle-orm";
import {
  db,
  shopifyConnectionsTable,
  shopifyAppCredentialsTable,
  shopifyOauthStatesTable,
  shopifySyncLogsTable,
  locationsTable,
} from "@workspace/db";
import { z } from "zod";
import { verifyTenantToken, requireFullTenant } from "./saas-auth";
import { logAudit } from "./audit";
import { encryptToken, decryptToken, verifyOAuthHmac } from "../lib/shopify-crypto";
import {
  ShopifyAdminClient,
  ShopifyApiError,
  normalizeShopDomain,
  isValidShopDomain,
  exchangeClientCredentials,
  buildAuthorizeUrl,
  exchangeAuthorizationCode,
} from "../lib/shopify-client";

const router: IRouter = Router();

/**
 * Admin API scopes requested when a merchant authorizes the app via OAuth. Kept
 * here (single source of truth) so the authorize URL and any docs stay in sync.
 */
export const SHOPIFY_OAUTH_SCOPES = [
  "read_products",
  "write_products",
  "read_inventory",
  "write_inventory",
  "read_locations",
  "read_orders",
  "write_orders",
  "read_draft_orders",
  "write_draft_orders",
  "read_customers",
  "write_customers",
  "read_discounts",
  "write_discounts",
].join(",");

const DEFAULT_API_VERSION = "2025-01";

// OAuth `state` nonce lifetime — the merchant must complete the consent screen
// within this window or the connect attempt is rejected.
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

function getTenantPayload(req: Request) {
  const auth = req.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) return null;
  return verifyTenantToken(auth.slice(7));
}

/**
 * Public base URL of this deployment (used to build the OAuth redirect_uri and
 * the post-callback redirect back to the web app). Mirrors the precedence used
 * in index.ts: APP_BASE_URL → first REPLIT_DOMAINS entry → REPLIT_DEV_DOMAIN.
 */
function getPublicBaseUrl(): string {
  return (
    process.env["APP_BASE_URL"] ??
    (process.env["REPLIT_DOMAINS"]
      ? `https://${process.env["REPLIT_DOMAINS"].split(",")[0]!.trim()}`
      : process.env["REPLIT_DEV_DOMAIN"]
        ? `https://${process.env["REPLIT_DEV_DOMAIN"]}`
        : "")
  ).replace(/\/+$/, "");
}

/** The single, fixed OAuth callback path (must be whitelisted in the Shopify app). */
function getRedirectUri(): string {
  return `${getPublicBaseUrl()}/api/shopify/oauth/callback`;
}

/**
 * Resolve the Shopify APP credentials (Client ID + Secret) used to drive the
 * OAuth flow. Credentials are platform-managed via environment variables only
 * (SHOPIFY_API_KEY / SHOPIFY_API_SECRET) — never stored per-tenant.
 * Returns null when env vars are not configured.
 */
async function getAppCredentials(
  _tenantId: number,
): Promise<{ clientId: string; clientSecret: string; apiVersion: string } | null> {
  const envId = process.env["SHOPIFY_API_KEY"];
  const envSecret = process.env["SHOPIFY_API_SECRET"];
  if (envId && envSecret) {
    return { clientId: envId, clientSecret: envSecret, apiVersion: DEFAULT_API_VERSION };
  }
  return null;
}

type ConnectionRow = typeof shopifyConnectionsTable.$inferSelect;

/** Strip secrets and shape a single connection for the client. */
function sanitize(row: ConnectionRow) {
  return {
    id: row.id,
    connected: row.isActive,
    hasToken:
      !!row.accessTokenEncrypted ||
      (row.authMode === "client_credentials" && !!row.clientId && !!row.clientSecretEncrypted),
    authMode: row.authMode,
    clientId: row.clientId,
    shopDomain: row.shopDomain,
    apiVersion: row.apiVersion,
    shopName: row.shopName,
    status: row.status,
    isActive: row.isActive,
    grantedScopes: row.grantedScopes,
    syncProducts: row.syncProducts,
    syncInventory: row.syncInventory,
    syncOrders: row.syncOrders,
    syncCustomers: row.syncCustomers,
    syncDirection: row.syncDirection,
    defaultLocationId: row.defaultLocationId,
    lastTestAt: row.lastTestAt,
    lastTestStatus: row.lastTestStatus,
    lastTestMessage: row.lastTestMessage,
    lastSyncAt: row.lastSyncAt,
    lastSyncStatus: row.lastSyncStatus,
    lastSyncMessage: row.lastSyncMessage,
    connectedAt: row.connectedAt,
  };
}

async function listConnections(tenantId: number): Promise<ConnectionRow[]> {
  return db
    .select()
    .from(shopifyConnectionsTable)
    .where(eq(shopifyConnectionsTable.tenantId, tenantId))
    .orderBy(asc(shopifyConnectionsTable.id));
}

async function getConnectionById(
  tenantId: number,
  id: number,
): Promise<ConnectionRow | undefined> {
  const [row] = await db
    .select()
    .from(shopifyConnectionsTable)
    .where(and(eq(shopifyConnectionsTable.id, id), eq(shopifyConnectionsTable.tenantId, tenantId)))
    .limit(1);
  return row;
}

// Re-exchange the client-credentials token this many ms before it expires so a
// request never goes out with a token that lapses mid-flight.
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

/**
 * Resolve a usable Admin API access token for a connection, regardless of auth
 * mode:
 *   - "oauth" / "token": decrypt the stored long-lived token.
 *   - "client_credentials": return the cached exchanged token while still valid,
 *     otherwise exchange Client ID + Secret for a fresh one and cache it.
 * Throws ShopifyApiError on missing/invalid credentials.
 */
export async function getValidAccessToken(row: ConnectionRow): Promise<string> {
  if (row.authMode === "client_credentials") {
    const cachedValid =
      row.accessTokenEncrypted &&
      row.accessTokenExpiresAt &&
      row.accessTokenExpiresAt.getTime() - TOKEN_REFRESH_BUFFER_MS > Date.now();
    if (cachedValid) {
      return decryptToken(row.accessTokenEncrypted!);
    }
    if (!row.clientId || !row.clientSecretEncrypted) {
      throw new ShopifyApiError(
        "No Shopify Client ID / Secret saved. Re-enter your credentials.",
        400,
      );
    }
    const clientSecret = decryptToken(row.clientSecretEncrypted);
    const grant = await exchangeClientCredentials(row.shopDomain, row.clientId, clientSecret);
    const expiresAt = new Date(Date.now() + grant.expiresInSec * 1000);
    await db
      .update(shopifyConnectionsTable)
      .set({
        accessTokenEncrypted: encryptToken(grant.accessToken),
        accessTokenExpiresAt: expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(shopifyConnectionsTable.id, row.id));
    return grant.accessToken;
  }

  // OAuth (long-lived offline token) and legacy static-token modes both just
  // decrypt the stored token.
  if (!row.accessTokenEncrypted) {
    throw new ShopifyApiError("No Shopify access token saved.", 400);
  }
  return decryptToken(row.accessTokenEncrypted);
}

/** Run the live connection test for a row, persisting the result. Returns the test outcome. */
async function runConnectionTest(
  tenantId: number,
  row: ConnectionRow,
): Promise<
  | { ok: true; shop: Awaited<ReturnType<ShopifyAdminClient["testConnection"]>> }
  | { ok: false; error: string }
> {
  const startedAt = new Date();
  let token: string;
  try {
    token = await getValidAccessToken(row);
  } catch (err) {
    const message =
      err instanceof ShopifyApiError
        ? err.message
        : "Stored Shopify credentials could not be used. Reconnect the store.";
    const now = new Date();
    await db
      .update(shopifyConnectionsTable)
      .set({
        status: "failed",
        isActive: false,
        lastTestAt: now,
        lastTestStatus: "failed",
        lastTestMessage: message,
        updatedAt: now,
      })
      .where(eq(shopifyConnectionsTable.id, row.id));
    return { ok: false, error: message };
  }

  const client = new ShopifyAdminClient({
    shopDomain: row.shopDomain,
    accessToken: token,
    apiVersion: row.apiVersion,
  });

  try {
    const shop = await client.testConnection();
    const now = new Date();
    await db
      .update(shopifyConnectionsTable)
      .set({
        status: "connected",
        isActive: true,
        shopName: shop.name,
        lastTestAt: now,
        lastTestStatus: "success",
        lastTestMessage: `Connected to ${shop.name}`,
        connectedAt: row.connectedAt ?? now,
        updatedAt: now,
      })
      .where(eq(shopifyConnectionsTable.id, row.id));

    await db.insert(shopifySyncLogsTable).values({
      tenantId,
      syncType: "connection",
      status: "success",
      message: `Connection test succeeded (${shop.name})`,
      details: { shopName: shop.name, myshopifyDomain: shop.myshopifyDomain },
      startedAt,
      completedAt: now,
    });

    return { ok: true, shop };
  } catch (err) {
    const message = err instanceof ShopifyApiError ? err.message : "Connection test failed";
    const now = new Date();
    await db
      .update(shopifyConnectionsTable)
      .set({
        status: "failed",
        isActive: false,
        lastTestAt: now,
        lastTestStatus: "failed",
        lastTestMessage: message,
        updatedAt: now,
      })
      .where(eq(shopifyConnectionsTable.id, row.id));

    await db.insert(shopifySyncLogsTable).values({
      tenantId,
      syncType: "connection",
      status: "error",
      message,
      startedAt,
      completedAt: now,
    });

    return { ok: false, error: message };
  }
}

/* ─── GET /shopify/connections — list all of the tenant's stores ─── */
router.get("/shopify/connections", async (req, res): Promise<void> => {
  const payload = getTenantPayload(req);
  if (!payload) { res.status(401).json({ error: "Unauthorized" }); return; }
  const rows = await listConnections(payload.tenantId);
  res.json(rows.map(sanitize));
});

/* ─── GET /shopify/app-credentials — reports whether platform env-var credentials are set ─── */
router.get("/shopify/app-credentials", async (req, res): Promise<void> => {
  const payload = getTenantPayload(req);
  if (!payload) { res.status(401).json({ error: "Unauthorized" }); return; }
  const configured = !!(process.env["SHOPIFY_API_KEY"] && process.env["SHOPIFY_API_SECRET"]);
  res.json({ configured, clientId: null, apiVersion: DEFAULT_API_VERSION });
});

/* ─── PUT /shopify/app-credentials — deprecated; credentials are platform-managed via env vars ─── */
router.put("/shopify/app-credentials", async (_req, res): Promise<void> => {
  res.status(410).json({
    error: "Shopify app credentials are managed via environment variables (SHOPIFY_API_KEY / SHOPIFY_API_SECRET) and cannot be set per-tenant.",
  });
});

/* ─── POST /shopify/oauth/start — begin the Connect Shopify store flow ─── */
const OAuthStartBody = z.object({
  shopDomain: z.string().min(1),
});

router.post("/shopify/oauth/start", async (req, res): Promise<void> => {
  if (!requireFullTenant(req as never, res as never)) return;
  const payload = getTenantPayload(req);
  if (!payload) { res.status(401).json({ error: "Unauthorized" }); return; }

  const appCreds = await getAppCredentials(payload.tenantId);
  if (!appCreds) {
    res.status(400).json({
      error:
        "Enter your Shopify app's API key (Client ID) and secret in settings before connecting a store.",
    });
    return;
  }
  const clientId = appCreds.clientId;

  const parsed = OAuthStartBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
    return;
  }

  const shopDomain = normalizeShopDomain(parsed.data.shopDomain);
  if (!isValidShopDomain(shopDomain)) {
    res.status(400).json({ error: "Enter a valid Shopify store domain, e.g. my-store.myshopify.com" });
    return;
  }

  const redirectUri = getRedirectUri();
  if (!redirectUri.startsWith("https://")) {
    res.status(500).json({ error: "Server base URL is not configured for OAuth callbacks." });
    return;
  }

  // Best-effort cleanup of expired nonces so the table stays small.
  await db
    .delete(shopifyOauthStatesTable)
    .where(lt(shopifyOauthStatesTable.expiresAt, new Date()))
    .catch(() => undefined);

  const state = crypto.randomBytes(32).toString("hex");
  await db.insert(shopifyOauthStatesTable).values({
    state,
    tenantId: payload.tenantId,
    shopDomain,
    expiresAt: new Date(Date.now() + OAUTH_STATE_TTL_MS),
  });

  const authorizeUrl = buildAuthorizeUrl({
    shopDomain,
    clientId,
    scopes: SHOPIFY_OAUTH_SCOPES,
    redirectUri,
    state,
  });

  await logAudit({
    tenantId: payload.tenantId,
    action: "shopify.oauth.started",
    entityType: "shopify_connection",
    entityId: shopDomain,
    details: { shopDomain },
    ipAddress: req.ip,
  });

  res.json({ authorizeUrl });
});

/* ─── GET /shopify/oauth/callback — PUBLIC Shopify redirect target ─── */
// Unauthenticated: the browser arrives here from Shopify with no tenant token.
// The tenant is recovered from the single-use `state` nonce; authenticity is
// proven by the HMAC signed with our Client Secret.
router.get("/shopify/oauth/callback", async (req, res): Promise<void> => {
  const baseUrl = getPublicBaseUrl();
  const fail = (message: string) => {
    const url = `${baseUrl}/settings?shopify=error&message=${encodeURIComponent(message)}#section-integrations`;
    res.redirect(url);
  };

  const query = req.query as Record<string, unknown>;
  const code = typeof query["code"] === "string" ? query["code"] : "";
  const shopParam = typeof query["shop"] === "string" ? query["shop"] : "";
  const state = typeof query["state"] === "string" ? query["state"] : "";

  if (!code || !shopParam || !state) {
    fail("Shopify did not return the expected authorization parameters.");
    return;
  }

  const shopDomain = normalizeShopDomain(shopParam);
  if (!isValidShopDomain(shopDomain)) {
    fail("Shopify returned an invalid store domain.");
    return;
  }

  // 1) CSRF + tenant binding: look up the single-use state nonce. The opaque
  // nonce maps the callback back to the tenant that initiated the connect, which
  // is what tells us WHICH app credentials (and thus which Client Secret) to use.
  const [stateRow] = await db
    .select()
    .from(shopifyOauthStatesTable)
    .where(eq(shopifyOauthStatesTable.state, state))
    .limit(1);

  if (
    !stateRow ||
    stateRow.expiresAt.getTime() < Date.now() ||
    stateRow.shopDomain !== shopDomain
  ) {
    fail("This Shopify connection link is invalid or has expired. Please try again.");
    return;
  }

  // 2) Load the initiating tenant's app credentials, then verify authenticity:
  // HMAC over the query string signed with that tenant's Client Secret.
  const appCreds = await getAppCredentials(stateRow.tenantId);
  if (!appCreds) {
    fail("Shopify app credentials are not configured. Re-enter them in settings.");
    return;
  }
  const clientId = appCreds.clientId;
  const clientSecret = appCreds.clientSecret;

  if (!verifyOAuthHmac(query, clientSecret)) {
    fail("Could not verify the Shopify response signature.");
    return;
  }

  // Atomically claim the nonce (single-use): the UPDATE only matches while
  // usedAt IS NULL, so a concurrent/replayed callback gets zero rows and aborts.
  const claimed = await db
    .update(shopifyOauthStatesTable)
    .set({ usedAt: new Date() })
    .where(and(eq(shopifyOauthStatesTable.state, state), isNull(shopifyOauthStatesTable.usedAt)))
    .returning({ state: shopifyOauthStatesTable.state });
  if (claimed.length === 0) {
    fail("This Shopify connection link has already been used. Please try again.");
    return;
  }

  const tenantId = stateRow.tenantId;

  // 3) Exchange the code for a long-lived offline access token.
  let grant: { accessToken: string; scope: string };
  try {
    grant = await exchangeAuthorizationCode(shopDomain, clientId, clientSecret, code);
  } catch (err) {
    const message =
      err instanceof ShopifyApiError ? err.message : "Failed to complete the Shopify connection.";
    await logAudit({
      tenantId,
      action: "shopify.oauth.failed",
      entityType: "shopify_connection",
      entityId: shopDomain,
      details: { message },
      ipAddress: req.ip,
    });
    fail(message);
    return;
  }

  // 4) Upsert the connection for (tenant, shop).
  const now = new Date();
  const existing = await db
    .select()
    .from(shopifyConnectionsTable)
    .where(
      and(
        eq(shopifyConnectionsTable.tenantId, tenantId),
        eq(shopifyConnectionsTable.shopDomain, shopDomain),
      ),
    )
    .limit(1);

  if (existing[0]) {
    await db
      .update(shopifyConnectionsTable)
      .set({
        authMode: "oauth",
        accessTokenEncrypted: encryptToken(grant.accessToken),
        accessTokenExpiresAt: null,
        grantedScopes: grant.scope || SHOPIFY_OAUTH_SCOPES,
        apiVersion: appCreds.apiVersion || DEFAULT_API_VERSION,
        clientId: null,
        clientSecretEncrypted: null,
        status: "connected",
        isActive: true,
        lastTestStatus: null,
        lastTestMessage: null,
        connectedAt: existing[0].connectedAt ?? now,
        updatedAt: now,
      })
      .where(eq(shopifyConnectionsTable.id, existing[0].id));
  } else {
    await db.insert(shopifyConnectionsTable).values({
      tenantId,
      shopDomain,
      authMode: "oauth",
      accessTokenEncrypted: encryptToken(grant.accessToken),
      grantedScopes: grant.scope || SHOPIFY_OAUTH_SCOPES,
      apiVersion: appCreds.apiVersion || DEFAULT_API_VERSION,
      status: "connected",
      isActive: true,
      connectedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  }

  // 5) Best-effort live test to capture the shop name (don't fail the connect on it).
  const [row] = await db
    .select()
    .from(shopifyConnectionsTable)
    .where(
      and(
        eq(shopifyConnectionsTable.tenantId, tenantId),
        eq(shopifyConnectionsTable.shopDomain, shopDomain),
      ),
    )
    .limit(1);
  if (row) {
    await runConnectionTest(tenantId, row).catch(() => undefined);
  }

  // Drop the consumed nonce.
  await db
    .delete(shopifyOauthStatesTable)
    .where(eq(shopifyOauthStatesTable.state, state))
    .catch(() => undefined);

  await logAudit({
    tenantId,
    action: "shopify.oauth.connected",
    entityType: "shopify_connection",
    entityId: shopDomain,
    details: { shopDomain, scopes: grant.scope || SHOPIFY_OAUTH_SCOPES },
    ipAddress: req.ip,
  });

  res.redirect(
    `${baseUrl}/settings?shopify=connected&shop=${encodeURIComponent(shopDomain)}#section-integrations`,
  );
});

/* ─── POST /shopify/connections/:id/test — verify a store's token live ─── */
router.post("/shopify/connections/:id/test", async (req, res): Promise<void> => {
  if (!requireFullTenant(req as never, res as never)) return;
  const payload = getTenantPayload(req);
  if (!payload) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = Number(req.params["id"]);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid connection id" }); return; }

  const row = await getConnectionById(payload.tenantId, id);
  if (!row) { res.status(404).json({ ok: false, error: "Connection not found" }); return; }

  const result = await runConnectionTest(payload.tenantId, row);

  await logAudit({
    tenantId: payload.tenantId,
    action: "shopify.connection.tested",
    entityType: "shopify_connection",
    entityId: row.shopDomain,
    details: result.ok ? { result: "success", shopName: result.shop.name } : { result: "failed", message: result.error },
    ipAddress: req.ip,
  });

  const connection = sanitize((await getConnectionById(payload.tenantId, id))!);
  if (result.ok) {
    res.json({ ok: true, shop: result.shop, connection });
  } else {
    res.status(400).json({ ok: false, error: result.error, connection });
  }
});

/* ─── PATCH /shopify/connections/:id/sync-settings — toggles/direction/location ─── */
const SyncSettingsBody = z.object({
  syncProducts: z.boolean().optional(),
  syncInventory: z.boolean().optional(),
  syncOrders: z.boolean().optional(),
  syncCustomers: z.boolean().optional(),
  syncDirection: z.enum(["shopify_to_nexus", "nexus_to_shopify", "two_way"]).optional(),
  defaultLocationId: z.number().int().nullable().optional(),
});

router.patch("/shopify/connections/:id/sync-settings", async (req, res): Promise<void> => {
  if (!requireFullTenant(req as never, res as never)) return;
  const payload = getTenantPayload(req);
  if (!payload) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = Number(req.params["id"]);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid connection id" }); return; }

  const parsed = SyncSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
    return;
  }

  const row = await getConnectionById(payload.tenantId, id);
  if (!row) { res.status(404).json({ error: "No Shopify connection to update" }); return; }

  // Validate that a chosen default location belongs to this tenant.
  if (parsed.data.defaultLocationId != null) {
    const [loc] = await db
      .select({ id: locationsTable.id })
      .from(locationsTable)
      .where(and(eq(locationsTable.id, parsed.data.defaultLocationId), eq(locationsTable.tenantId, payload.tenantId)))
      .limit(1);
    if (!loc) {
      res.status(400).json({ error: "Default location not found for this tenant" });
      return;
    }
  }

  await db
    .update(shopifyConnectionsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(shopifyConnectionsTable.id, row.id));

  await logAudit({
    tenantId: payload.tenantId,
    action: "shopify.sync_settings.updated",
    entityType: "shopify_connection",
    entityId: row.shopDomain,
    details: parsed.data,
    ipAddress: req.ip,
  });

  res.json(sanitize((await getConnectionById(payload.tenantId, id))!));
});

/* ─── POST /shopify/connections/:id/disconnect — remove a store ─── */
router.post("/shopify/connections/:id/disconnect", async (req, res): Promise<void> => {
  if (!requireFullTenant(req as never, res as never)) return;
  const payload = getTenantPayload(req);
  if (!payload) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = Number(req.params["id"]);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid connection id" }); return; }

  const row = await getConnectionById(payload.tenantId, id);
  if (!row) { res.status(404).json({ error: "No Shopify connection to disconnect" }); return; }

  // Multi-store: removing the row fully revokes our local access and drops it
  // from the tenant's store list.
  await db.delete(shopifyConnectionsTable).where(eq(shopifyConnectionsTable.id, row.id));

  await logAudit({
    tenantId: payload.tenantId,
    action: "shopify.connection.disconnected",
    entityType: "shopify_connection",
    entityId: row.shopDomain,
    ipAddress: req.ip,
  });

  res.json({ ok: true });
});

export default router;
