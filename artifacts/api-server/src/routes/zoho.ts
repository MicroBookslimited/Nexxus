/**
 * Zoho Books integration — customer (contact) sync.
 *
 * Each tenant authorizes OUR single Zoho API client against THEIR Zoho Books
 * organisation. Tokens live encrypted in `zoho_connections` and never reach the
 * browser. The OAuth callback is public (the browser arrives from Zoho with no
 * NEXXUS token), so the tenant is recovered from a single-use `state` nonce.
 */

import { Router, type IRouter, type Request } from "express";
import crypto from "node:crypto";
import { and, desc, eq, isNull, lt } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  zohoConnectionsTable,
  zohoOauthStatesTable,
  zohoCustomerMappingsTable,
  zohoSyncLogsTable,
} from "@workspace/db";
import { verifyTenantToken, requireFullTenant } from "./saas-auth";
import { logAudit } from "./audit";
import { encryptZohoToken, decryptZohoToken } from "../lib/zoho-crypto";
import {
  ZOHO_REGIONS,
  ZOHO_REGION_LABELS,
  ZohoApiError,
  ZohoBooksClient,
  buildZohoAuthorizeUrl,
  exchangeZohoCode,
  isZohoRegion,
  regionFromCallback,
  revokeZohoRefreshToken,
  type ZohoRegion,
} from "../lib/zoho-client";
import {
  connectionRegion,
  getBooksClient,
  getConnection,
  getZohoAppCredentials,
  isSyncRunning,
  runFullCustomerSync,
} from "../lib/zoho-sync";

const router: IRouter = Router();

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

function getTenantPayload(req: Request) {
  const auth = req.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) return null;
  return verifyTenantToken(auth.slice(7));
}

/** Public base URL of this deployment (same precedence as the Shopify flow). */
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

/** Fixed callback path — must be listed in the Zoho app's redirect URIs. */
function getRedirectUri(): string {
  return `${getPublicBaseUrl()}/api/zoho/oauth/callback`;
}

type ConnectionRow = typeof zohoConnectionsTable.$inferSelect;

/** Shape a connection for the client — never leaks tokens. */
function sanitize(row: ConnectionRow | undefined) {
  if (!row) return null;
  return {
    id: row.id,
    connected: row.isActive,
    hasToken: !!row.refreshTokenEncrypted,
    region: row.region,
    organizationId: row.organizationId,
    organizationName: row.organizationName,
    organizationCurrency: row.organizationCurrency,
    status: row.status,
    isActive: row.isActive,
    syncCustomers: row.syncCustomers,
    syncDirection: row.syncDirection,
    autoSync: row.autoSync,
    grantedScopes: row.grantedScopes,
    lastTestAt: row.lastTestAt,
    lastTestStatus: row.lastTestStatus,
    lastTestMessage: row.lastTestMessage,
    lastSyncAt: row.lastSyncAt,
    lastSyncStatus: row.lastSyncStatus,
    lastSyncMessage: row.lastSyncMessage,
    connectedAt: row.connectedAt,
    syncRunning: isSyncRunning(row.tenantId),
  };
}

function errorStatus(err: unknown): number {
  return err instanceof ZohoApiError ? err.status : 500;
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

/* ─── GET /zoho/connection — current status for the settings card ─── */
router.get("/zoho/connection", async (req, res): Promise<void> => {
  const payload = getTenantPayload(req);
  if (!payload) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const row = await getConnection(payload.tenantId);
  res.json({
    configured: !!getZohoAppCredentials(),
    redirectUri: getRedirectUri(),
    regions: ZOHO_REGIONS.map((r) => ({ value: r, label: ZOHO_REGION_LABELS[r] })),
    connection: sanitize(row),
  });
});

/* ─── POST /zoho/oauth/start — begin the connect flow ─── */
const OAuthStartBody = z.object({
  region: z.string().optional(),
});

router.post("/zoho/oauth/start", async (req, res): Promise<void> => {
  if (!requireFullTenant(req as never, res as never)) return;
  const payload = getTenantPayload(req);
  if (!payload) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const creds = getZohoAppCredentials();
  if (!creds) {
    res.status(400).json({
      error:
        "Zoho is not configured on this server yet. The NEXXUS administrator must add the Zoho Client ID and Secret.",
    });
    return;
  }

  const parsed = OAuthStartBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
    return;
  }
  const region: ZohoRegion = isZohoRegion(parsed.data.region) ? parsed.data.region : "com";

  const redirectUri = getRedirectUri();
  if (!redirectUri.startsWith("https://")) {
    res.status(500).json({ error: "Server base URL is not configured for OAuth callbacks." });
    return;
  }

  // Housekeeping: drop expired nonces.
  await db
    .delete(zohoOauthStatesTable)
    .where(lt(zohoOauthStatesTable.expiresAt, new Date()))
    .catch(() => undefined);

  const state = crypto.randomBytes(32).toString("hex");
  await db.insert(zohoOauthStatesTable).values({
    state,
    tenantId: payload.tenantId,
    region,
    expiresAt: new Date(Date.now() + OAUTH_STATE_TTL_MS),
  });

  const authorizeUrl = buildZohoAuthorizeUrl({
    region,
    clientId: creds.clientId,
    redirectUri,
    state,
  });

  await logAudit({
    tenantId: payload.tenantId,
    action: "zoho.oauth.started",
    entityType: "zoho_connection",
    entityId: region,
    details: { region },
    ipAddress: req.ip,
  });

  res.json({ authorizeUrl });
});

/* ─── GET /zoho/oauth/callback — PUBLIC Zoho redirect target ─── */
router.get("/zoho/oauth/callback", async (req, res): Promise<void> => {
  const baseUrl = getPublicBaseUrl();
  const fail = (message: string) => {
    res.redirect(
      `${baseUrl}/settings?zoho=error&message=${encodeURIComponent(message)}#section-integrations`,
    );
  };

  const query = req.query as Record<string, unknown>;
  const code = typeof query["code"] === "string" ? query["code"] : "";
  const state = typeof query["state"] === "string" ? query["state"] : "";
  const errorParam = typeof query["error"] === "string" ? query["error"] : "";

  if (errorParam) {
    fail(
      errorParam === "access_denied"
        ? "The Zoho authorization was cancelled."
        : `Zoho returned an error (${errorParam}).`,
    );
    return;
  }
  if (!code || !state) {
    fail("Zoho did not return the expected authorization details.");
    return;
  }

  // Zoho does not sign its redirect, so the single-use nonce is the whole CSRF
  // and tenant-binding story: look it up, check it, then claim it atomically.
  const [stateRow] = await db
    .select()
    .from(zohoOauthStatesTable)
    .where(eq(zohoOauthStatesTable.state, state))
    .limit(1);

  if (!stateRow || stateRow.expiresAt.getTime() < Date.now()) {
    fail("This Zoho connection link is invalid or has expired. Please try again.");
    return;
  }

  const claimed = await db
    .update(zohoOauthStatesTable)
    .set({ usedAt: new Date() })
    .where(and(eq(zohoOauthStatesTable.state, state), isNull(zohoOauthStatesTable.usedAt)))
    .returning({ state: zohoOauthStatesTable.state });
  if (claimed.length === 0) {
    fail("This Zoho connection link has already been used. Please try again.");
    return;
  }

  const tenantId = stateRow.tenantId;
  const creds = getZohoAppCredentials();
  if (!creds) {
    fail("Zoho is not configured on this server.");
    return;
  }

  // The merchant may have signed in to a different data centre than the one
  // they picked — Zoho tells us which via `location`/`accounts-server`.
  const callbackRegion =
    regionFromCallback(
      typeof query["location"] === "string" ? query["location"] : undefined,
      typeof query["accounts-server"] === "string" ? query["accounts-server"] : undefined,
    ) ?? (isZohoRegion(stateRow.region) ? stateRow.region : "com");

  let grant: { accessToken: string; refreshToken: string; expiresInSec: number; scope: string };
  try {
    grant = await exchangeZohoCode({
      region: callbackRegion,
      clientId: creds.clientId,
      clientSecret: creds.clientSecret,
      redirectUri: getRedirectUri(),
      code,
    });
  } catch (err) {
    const message = errorMessage(err, "Failed to complete the Zoho connection.");
    await logAudit({
      tenantId,
      action: "zoho.oauth.failed",
      entityType: "zoho_connection",
      entityId: callbackRegion,
      details: { message },
      ipAddress: req.ip,
    });
    fail(message);
    return;
  }

  const now = new Date();
  const accessExpiry = new Date(now.getTime() + grant.expiresInSec * 1000);
  const existing = await getConnection(tenantId);

  if (existing) {
    await db
      .update(zohoConnectionsTable)
      .set({
        region: callbackRegion,
        refreshTokenEncrypted: encryptZohoToken(grant.refreshToken),
        accessTokenEncrypted: encryptZohoToken(grant.accessToken),
        accessTokenExpiresAt: accessExpiry,
        grantedScopes: grant.scope,
        status: "connected",
        isActive: true,
        lastTestStatus: null,
        lastTestMessage: null,
        connectedAt: existing.connectedAt ?? now,
        updatedAt: now,
      })
      .where(eq(zohoConnectionsTable.id, existing.id));
  } else {
    await db.insert(zohoConnectionsTable).values({
      tenantId,
      region: callbackRegion,
      refreshTokenEncrypted: encryptZohoToken(grant.refreshToken),
      accessTokenEncrypted: encryptZohoToken(grant.accessToken),
      accessTokenExpiresAt: accessExpiry,
      grantedScopes: grant.scope,
      status: "connected",
      isActive: true,
      connectedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  }

  // Pre-select the organisation when the tenant has exactly one — the common
  // case, and it saves them a step. Best effort only.
  let orgHint = "";
  try {
    const row = await getConnection(tenantId);
    if (row) {
      const client = new ZohoBooksClient(callbackRegion, grant.accessToken, null);
      const orgs = await client.listOrganizations();
      const chosen = orgs.length === 1 ? orgs[0] : orgs.find((o) => o.is_default_org);
      if (chosen) {
        await db
          .update(zohoConnectionsTable)
          .set({
            organizationId: chosen.organization_id,
            organizationName: chosen.name ?? null,
            organizationCurrency: chosen.currency_code ?? null,
            updatedAt: new Date(),
          })
          .where(eq(zohoConnectionsTable.id, row.id));
        orgHint = chosen.name ?? "";
      }
    }
  } catch {
    // Leave the organisation unset; the settings card will ask for it.
  }

  await db
    .delete(zohoOauthStatesTable)
    .where(eq(zohoOauthStatesTable.state, state))
    .catch(() => undefined);

  await logAudit({
    tenantId,
    action: "zoho.oauth.connected",
    entityType: "zoho_connection",
    entityId: callbackRegion,
    details: { region: callbackRegion, scopes: grant.scope },
    ipAddress: req.ip,
  });

  const params = new URLSearchParams({ zoho: "connected" });
  if (orgHint) params.set("org", orgHint);
  res.redirect(`${baseUrl}/settings?${params.toString()}#section-integrations`);
});

/* ─── GET /zoho/organizations — orgs the tenant can pick from ─── */
router.get("/zoho/organizations", async (req, res): Promise<void> => {
  const payload = getTenantPayload(req);
  if (!payload) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const conn = await getConnection(payload.tenantId);
  if (!conn?.isActive) {
    res.status(400).json({ error: "Zoho Books is not connected." });
    return;
  }
  try {
    // Organisation listing is account-wide: no organization_id on the call.
    const token = await (await import("../lib/zoho-sync")).getValidAccessToken(conn);
    const client = new ZohoBooksClient(connectionRegion(conn), token, null);
    const orgs = await client.listOrganizations();
    res.json(
      orgs.map((o) => ({
        organizationId: o.organization_id,
        name: o.name ?? "",
        currencyCode: o.currency_code ?? "",
        isDefault: !!o.is_default_org,
      })),
    );
  } catch (err) {
    res.status(errorStatus(err)).json({ error: errorMessage(err, "Could not load Zoho organisations.") });
  }
});

/* ─── PATCH /zoho/connection — organisation + sync preferences ─── */
const UpdateBody = z.object({
  organizationId: z.string().min(1).optional(),
  syncCustomers: z.boolean().optional(),
  syncDirection: z.enum(["zoho_to_nexus", "nexus_to_zoho", "two_way"]).optional(),
  autoSync: z.boolean().optional(),
});

router.patch("/zoho/connection", async (req, res): Promise<void> => {
  if (!requireFullTenant(req as never, res as never)) return;
  const payload = getTenantPayload(req);
  if (!payload) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const parsed = UpdateBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
    return;
  }
  const conn = await getConnection(payload.tenantId);
  if (!conn) {
    res.status(404).json({ error: "Zoho Books is not connected." });
    return;
  }

  const updates: Partial<typeof zohoConnectionsTable.$inferInsert> = { updatedAt: new Date() };

  if (parsed.data.organizationId && parsed.data.organizationId !== conn.organizationId) {
    // Validate the id against the tenant's own Zoho account so one tenant can
    // never point their connection at an organisation they can't access.
    try {
      const token = await (await import("../lib/zoho-sync")).getValidAccessToken(conn);
      const client = new ZohoBooksClient(connectionRegion(conn), token, null);
      const orgs = await client.listOrganizations();
      const chosen = orgs.find((o) => o.organization_id === parsed.data.organizationId);
      if (!chosen) {
        res.status(400).json({ error: "That organisation is not available on this Zoho account." });
        return;
      }
      updates.organizationId = chosen.organization_id;
      updates.organizationName = chosen.name ?? null;
      updates.organizationCurrency = chosen.currency_code ?? null;
    } catch (err) {
      res
        .status(errorStatus(err))
        .json({ error: errorMessage(err, "Could not verify the Zoho organisation.") });
      return;
    }
  }

  if (parsed.data.syncCustomers !== undefined) updates.syncCustomers = parsed.data.syncCustomers;
  if (parsed.data.syncDirection !== undefined) updates.syncDirection = parsed.data.syncDirection;
  if (parsed.data.autoSync !== undefined) updates.autoSync = parsed.data.autoSync;

  await db.update(zohoConnectionsTable).set(updates).where(eq(zohoConnectionsTable.id, conn.id));

  await logAudit({
    tenantId: payload.tenantId,
    action: "zoho.settings.updated",
    entityType: "zoho_connection",
    entityId: String(conn.id),
    details: parsed.data,
    ipAddress: req.ip,
  });

  const row = await getConnection(payload.tenantId);
  res.json(sanitize(row));
});

/* ─── POST /zoho/test — live check of the stored credentials ─── */
router.post("/zoho/test", async (req, res): Promise<void> => {
  if (!requireFullTenant(req as never, res as never)) return;
  const payload = getTenantPayload(req);
  if (!payload) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const conn = await getConnection(payload.tenantId);
  if (!conn) {
    res.status(404).json({ error: "Zoho Books is not connected." });
    return;
  }

  const now = new Date();
  try {
    const client = await getBooksClient(conn);
    const orgs = await client.listOrganizations();
    const org = conn.organizationId
      ? orgs.find((o) => o.organization_id === conn.organizationId)
      : undefined;
    const message = conn.organizationId
      ? org
        ? `Connected to ${org.name ?? conn.organizationName ?? "Zoho Books"}.`
        : "Connected, but the selected organisation is no longer available."
      : `Connected. ${orgs.length} organisation${orgs.length === 1 ? "" : "s"} available — choose one.`;
    const ok = !conn.organizationId || !!org;

    await db
      .update(zohoConnectionsTable)
      .set({
        lastTestAt: now,
        lastTestStatus: ok ? "success" : "error",
        lastTestMessage: message,
        status: ok ? "connected" : "failed",
        isActive: ok,
        updatedAt: now,
      })
      .where(eq(zohoConnectionsTable.id, conn.id));

    await db.insert(zohoSyncLogsTable).values({
      tenantId: payload.tenantId,
      syncType: "connection",
      status: ok ? "success" : "error",
      message,
      completedAt: now,
    });

    res.json({ ok, message });
  } catch (err) {
    const message = errorMessage(err, "Could not reach Zoho Books.");
    await db
      .update(zohoConnectionsTable)
      .set({
        lastTestAt: now,
        lastTestStatus: "error",
        lastTestMessage: message,
        status: "failed",
        isActive: false,
        updatedAt: now,
      })
      .where(eq(zohoConnectionsTable.id, conn.id));
    await db
      .insert(zohoSyncLogsTable)
      .values({
        tenantId: payload.tenantId,
        syncType: "connection",
        status: "error",
        message: message.slice(0, 500),
        completedAt: now,
      })
      .catch(() => undefined);
    res.status(errorStatus(err)).json({ ok: false, message });
  }
});

/* ─── POST /zoho/sync/customers — manual full sync ─── */
router.post("/zoho/sync/customers", async (req, res): Promise<void> => {
  if (!requireFullTenant(req as never, res as never)) return;
  const payload = getTenantPayload(req);
  if (!payload) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const conn = await getConnection(payload.tenantId);
  if (!conn?.isActive) {
    res.status(400).json({ error: "Zoho Books is not connected." });
    return;
  }
  if (!conn.syncCustomers) {
    res.status(400).json({ error: "Customer sync is switched off for this connection." });
    return;
  }
  if (isSyncRunning(payload.tenantId)) {
    res.status(409).json({ error: "A Zoho sync is already running." });
    return;
  }

  try {
    const summary = await runFullCustomerSync(conn);
    await logAudit({
      tenantId: payload.tenantId,
      action: "zoho.customers.synced",
      entityType: "zoho_connection",
      entityId: String(conn.id),
      details: { ...summary },
      ipAddress: req.ip,
    });
    res.json(summary);
  } catch (err) {
    res.status(errorStatus(err)).json({ error: errorMessage(err, "Zoho customer sync failed.") });
  }
});

/* ─── GET /zoho/sync/logs — recent activity for the settings card ─── */
router.get("/zoho/sync/logs", async (req, res): Promise<void> => {
  const payload = getTenantPayload(req);
  if (!payload) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const rows = await db
    .select()
    .from(zohoSyncLogsTable)
    .where(eq(zohoSyncLogsTable.tenantId, payload.tenantId))
    .orderBy(desc(zohoSyncLogsTable.id))
    .limit(20);
  res.json(
    rows.map((r) => ({
      id: r.id,
      syncType: r.syncType,
      direction: r.direction,
      status: r.status,
      itemsProcessed: r.itemsProcessed,
      itemsCreated: r.itemsCreated,
      itemsUpdated: r.itemsUpdated,
      itemsFailed: r.itemsFailed,
      message: r.message,
      createdAt: r.createdAt,
    })),
  );
});

/* ─── DELETE /zoho/connection — disconnect ─── */
router.delete("/zoho/connection", async (req, res): Promise<void> => {
  if (!requireFullTenant(req as never, res as never)) return;
  const payload = getTenantPayload(req);
  if (!payload) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const conn = await getConnection(payload.tenantId);
  if (!conn) {
    res.status(404).json({ error: "Zoho Books is not connected." });
    return;
  }

  // Best-effort revoke at Zoho so the tenant sees NEXXUS disappear from their
  // connected apps, then forget the credentials locally either way.
  if (conn.refreshTokenEncrypted) {
    try {
      await revokeZohoRefreshToken(connectionRegion(conn), decryptZohoToken(conn.refreshTokenEncrypted));
    } catch {
      // ignore — local disconnect must still succeed
    }
  }

  await db
    .update(zohoConnectionsTable)
    .set({
      refreshTokenEncrypted: null,
      accessTokenEncrypted: null,
      accessTokenExpiresAt: null,
      grantedScopes: null,
      status: "disconnected",
      isActive: false,
      updatedAt: new Date(),
    })
    .where(eq(zohoConnectionsTable.id, conn.id));

  // Mappings are kept: reconnecting later then picks up where it left off.
  await logAudit({
    tenantId: payload.tenantId,
    action: "zoho.disconnected",
    entityType: "zoho_connection",
    entityId: String(conn.id),
    details: {},
    ipAddress: req.ip,
  });

  res.json({ ok: true });
});

/* ─── DELETE /zoho/mappings — forget the customer links ─── */
router.delete("/zoho/mappings", async (req, res): Promise<void> => {
  if (!requireFullTenant(req as never, res as never)) return;
  const payload = getTenantPayload(req);
  if (!payload) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const deleted = await db
    .delete(zohoCustomerMappingsTable)
    .where(eq(zohoCustomerMappingsTable.tenantId, payload.tenantId))
    .returning({ id: zohoCustomerMappingsTable.id });
  res.json({ removed: deleted.length });
});

export default router;
