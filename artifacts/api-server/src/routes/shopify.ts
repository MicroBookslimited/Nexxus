import { Router, type IRouter, type Request } from "express";
import { and, eq } from "drizzle-orm";
import { db, shopifyConnectionsTable, shopifySyncLogsTable, locationsTable } from "@workspace/db";
import { z } from "zod";
import { verifyTenantToken, requireFullTenant } from "./saas-auth";
import { logAudit } from "./audit";
import { encryptToken, decryptToken } from "../lib/shopify-crypto";
import {
  ShopifyAdminClient,
  ShopifyApiError,
  normalizeShopDomain,
  isValidShopDomain,
  exchangeClientCredentials,
} from "../lib/shopify-client";

const router: IRouter = Router();

function getTenantPayload(req: Request) {
  const auth = req.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) return null;
  return verifyTenantToken(auth.slice(7));
}

type ConnectionRow = typeof shopifyConnectionsTable.$inferSelect;

/** Strip secrets and shape the connection for the client. */
function sanitize(row: ConnectionRow | undefined) {
  if (!row) {
    return { connected: false as const, hasToken: false };
  }
  return {
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

async function getConnection(tenantId: number): Promise<ConnectionRow | undefined> {
  const [row] = await db
    .select()
    .from(shopifyConnectionsTable)
    .where(eq(shopifyConnectionsTable.tenantId, tenantId))
    .limit(1);
  return row;
}

// Re-exchange the client-credentials token this many ms before it expires so a
// request never goes out with a token that lapses mid-flight.
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

/**
 * Resolve a usable Admin API access token for a connection, regardless of auth
 * mode. For "token" mode this decrypts the stored static token. For
 * "client_credentials" mode it returns the cached exchanged token while still
 * valid, otherwise exchanges the Client ID + Secret for a fresh one and caches
 * it (encrypted) with its expiry. Throws ShopifyApiError on missing/invalid
 * credentials.
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

  // Legacy static-token mode.
  if (!row.accessTokenEncrypted) {
    throw new ShopifyApiError("No Shopify access token saved.", 400);
  }
  return decryptToken(row.accessTokenEncrypted);
}

/* ─── GET /shopify/connection — sanitized status (token redacted) ─── */
router.get("/shopify/connection", async (req, res): Promise<void> => {
  const payload = getTenantPayload(req);
  if (!payload) { res.status(401).json({ error: "Unauthorized" }); return; }
  const row = await getConnection(payload.tenantId);
  res.json(sanitize(row));
});

/* ─── POST /shopify/connection — create or update credentials ─── */
const ConnectBody = z
  .object({
    shopDomain: z.string().min(1),
    // Legacy static custom-app token (shpat_…).
    accessToken: z.string().min(1).optional(),
    // 2026 Dev Dashboard app: Client ID + Client Secret (exchanged for a
    // short-lived token via the Client Credentials grant).
    clientId: z.string().min(1).optional(),
    clientSecret: z.string().min(1).optional(),
    apiVersion: z.string().regex(/^\d{4}-\d{2}$/).optional(),
    // Optional webhook signing secret (the custom app's API secret key).
    webhookSecret: z.string().optional(),
  })
  .refine(
    (b) => !!b.accessToken || (!!b.clientId && !!b.clientSecret),
    {
      message:
        "Provide either an Admin API access token, or a Client ID and Client Secret.",
    },
  );

router.post("/shopify/connection", async (req, res): Promise<void> => {
  if (!requireFullTenant(req as never, res as never)) return;
  const payload = getTenantPayload(req);
  if (!payload) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = ConnectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
    return;
  }

  const shopDomain = normalizeShopDomain(parsed.data.shopDomain);
  if (!isValidShopDomain(shopDomain)) {
    res.status(400).json({ error: "Enter a valid Shopify store domain, e.g. my-store.myshopify.com" });
    return;
  }

  const useClientCredentials = !!parsed.data.clientId && !!parsed.data.clientSecret;
  const authMode = useClientCredentials ? "client_credentials" : "token";

  // Credential columns differ per auth mode. In client_credentials mode the
  // access token is derived (exchanged) on demand, so we clear any cached token
  // and its expiry here and store the encrypted Client Secret instead.
  const credentialColumns = useClientCredentials
    ? {
        authMode,
        clientId: parsed.data.clientId!,
        clientSecretEncrypted: encryptToken(parsed.data.clientSecret!),
        accessTokenEncrypted: null,
        accessTokenExpiresAt: null,
      }
    : {
        authMode,
        clientId: null,
        clientSecretEncrypted: null,
        accessTokenEncrypted: encryptToken(parsed.data.accessToken!),
        accessTokenExpiresAt: null,
      };

  const webhookSecretEncrypted = parsed.data.webhookSecret
    ? encryptToken(parsed.data.webhookSecret)
    : undefined;
  const apiVersion = parsed.data.apiVersion ?? "2025-01";
  const now = new Date();

  const existing = await getConnection(payload.tenantId);
  if (existing) {
    await db
      .update(shopifyConnectionsTable)
      .set({
        shopDomain,
        ...credentialColumns,
        ...(webhookSecretEncrypted ? { webhookSecretEncrypted } : {}),
        apiVersion,
        // Saving new credentials resets the verified state until tested.
        status: "disconnected",
        isActive: false,
        shopName: null,
        lastTestStatus: null,
        lastTestMessage: null,
        updatedAt: now,
      })
      .where(eq(shopifyConnectionsTable.id, existing.id));
  } else {
    await db.insert(shopifyConnectionsTable).values({
      tenantId: payload.tenantId,
      shopDomain,
      ...credentialColumns,
      webhookSecretEncrypted,
      apiVersion,
      status: "disconnected",
      isActive: false,
      createdAt: now,
      updatedAt: now,
    });
  }

  await logAudit({
    tenantId: payload.tenantId,
    action: existing ? "shopify.connection.updated" : "shopify.connection.created",
    entityType: "shopify_connection",
    entityId: shopDomain,
    details: { shopDomain, apiVersion, authMode },
    ipAddress: req.ip,
  });

  const row = await getConnection(payload.tenantId);
  res.json(sanitize(row));
});

/* ─── POST /shopify/connection/test — verify credentials live ─── */
router.post("/shopify/connection/test", async (req, res): Promise<void> => {
  if (!requireFullTenant(req as never, res as never)) return;
  const payload = getTenantPayload(req);
  if (!payload) { res.status(401).json({ error: "Unauthorized" }); return; }

  const row = await getConnection(payload.tenantId);
  const hasCredentials =
    row &&
    (row.accessTokenEncrypted ||
      (row.authMode === "client_credentials" && row.clientId && row.clientSecretEncrypted));
  if (!row || !hasCredentials) {
    res.status(400).json({ ok: false, error: "No Shopify credentials saved yet" });
    return;
  }

  const startedAt = new Date();
  let token: string;
  try {
    // Resolves the static token, or exchanges Client ID + Secret for a fresh
    // short-lived token (caching it) in client_credentials mode.
    token = await getValidAccessToken(row);
  } catch (err) {
    const message =
      err instanceof ShopifyApiError
        ? err.message
        : "Stored Shopify credentials could not be used. Re-enter them.";
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
    res.status(400).json({
      ok: false,
      error: message,
      connection: sanitize(await getConnection(payload.tenantId)),
    });
    return;
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
      tenantId: payload.tenantId,
      syncType: "connection",
      status: "success",
      message: `Connection test succeeded (${shop.name})`,
      details: { shopName: shop.name, myshopifyDomain: shop.myshopifyDomain },
      startedAt,
      completedAt: now,
    });

    await logAudit({
      tenantId: payload.tenantId,
      action: "shopify.connection.tested",
      entityType: "shopify_connection",
      entityId: row.shopDomain,
      details: { result: "success", shopName: shop.name },
      ipAddress: req.ip,
    });

    res.json({ ok: true, shop, connection: sanitize(await getConnection(payload.tenantId)) });
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
      tenantId: payload.tenantId,
      syncType: "connection",
      status: "error",
      message,
      startedAt,
      completedAt: now,
    });

    await logAudit({
      tenantId: payload.tenantId,
      action: "shopify.connection.tested",
      entityType: "shopify_connection",
      entityId: row.shopDomain,
      details: { result: "failed", message },
      ipAddress: req.ip,
    });

    res.status(400).json({ ok: false, error: message, connection: sanitize(await getConnection(payload.tenantId)) });
  }
});

/* ─── PATCH /shopify/connection/sync-settings — toggles/direction/location ─── */
const SyncSettingsBody = z.object({
  syncProducts: z.boolean().optional(),
  syncInventory: z.boolean().optional(),
  syncOrders: z.boolean().optional(),
  syncCustomers: z.boolean().optional(),
  syncDirection: z.enum(["shopify_to_nexus", "nexus_to_shopify", "two_way"]).optional(),
  defaultLocationId: z.number().int().nullable().optional(),
});

router.patch("/shopify/connection/sync-settings", async (req, res): Promise<void> => {
  if (!requireFullTenant(req as never, res as never)) return;
  const payload = getTenantPayload(req);
  if (!payload) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = SyncSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
    return;
  }

  const row = await getConnection(payload.tenantId);
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

  res.json(sanitize(await getConnection(payload.tenantId)));
});

/* ─── POST /shopify/connection/disconnect — deactivate connection ─── */
router.post("/shopify/connection/disconnect", async (req, res): Promise<void> => {
  if (!requireFullTenant(req as never, res as never)) return;
  const payload = getTenantPayload(req);
  if (!payload) { res.status(401).json({ error: "Unauthorized" }); return; }

  const row = await getConnection(payload.tenantId);
  if (!row) { res.status(404).json({ error: "No Shopify connection to disconnect" }); return; }

  await db
    .update(shopifyConnectionsTable)
    .set({
      status: "disconnected",
      isActive: false,
      // Clear stored credentials so a disconnect fully revokes local access.
      accessTokenEncrypted: null,
      accessTokenExpiresAt: null,
      clientId: null,
      clientSecretEncrypted: null,
      webhookSecretEncrypted: null,
      shopName: null,
      lastTestStatus: null,
      lastTestMessage: null,
      updatedAt: new Date(),
    })
    .where(eq(shopifyConnectionsTable.id, row.id));

  await logAudit({
    tenantId: payload.tenantId,
    action: "shopify.connection.disconnected",
    entityType: "shopify_connection",
    entityId: row.shopDomain,
    ipAddress: req.ip,
  });

  res.json(sanitize(await getConnection(payload.tenantId)));
});

export default router;
