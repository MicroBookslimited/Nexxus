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
    hasToken: !!row.accessTokenEncrypted,
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

/* ─── GET /shopify/connection — sanitized status (token redacted) ─── */
router.get("/shopify/connection", async (req, res): Promise<void> => {
  const payload = getTenantPayload(req);
  if (!payload) { res.status(401).json({ error: "Unauthorized" }); return; }
  const row = await getConnection(payload.tenantId);
  res.json(sanitize(row));
});

/* ─── POST /shopify/connection — create or update credentials ─── */
const ConnectBody = z.object({
  shopDomain: z.string().min(1),
  accessToken: z.string().min(1),
  apiVersion: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  // Optional webhook signing secret (the custom app's API secret key).
  webhookSecret: z.string().optional(),
});

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

  const accessTokenEncrypted = encryptToken(parsed.data.accessToken);
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
        accessTokenEncrypted,
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
      accessTokenEncrypted,
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
    details: { shopDomain, apiVersion },
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
  if (!row || !row.accessTokenEncrypted) {
    res.status(400).json({ ok: false, error: "No Shopify credentials saved yet" });
    return;
  }

  const startedAt = new Date();
  let token: string;
  try {
    token = decryptToken(row.accessTokenEncrypted);
  } catch {
    res.status(500).json({ ok: false, error: "Stored token could not be decrypted. Re-enter your Shopify token." });
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
