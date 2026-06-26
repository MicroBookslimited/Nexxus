import { Router, type IRouter, type Request, type Response } from "express";
import jwt from "jsonwebtoken";
import {
  computeTenantUsageList,
  computeTenantDetail,
  buildOverview,
} from "../lib/tenant-usage";
import { db, tenantActivityEventsTable } from "@workspace/db";
import { generateTenantUsageSnapshots } from "../lib/tenant-usage";
import {
  generateTenantAlerts,
  listTenantAlerts,
  updateTenantAlert,
  type AlertStatus,
} from "../lib/tenant-alerts";
import { eq, desc } from "drizzle-orm";

const router: IRouter = Router();

function getJwtSecret(): string {
  const secret = process.env["SESSION_SECRET"];
  if (!secret) {
    throw new Error("SESSION_SECRET is not set — refusing to verify super-admin analytics tokens against a static fallback");
  }
  return secret;
}

/**
 * platform_super_admin gate. The platform super admin authenticates with the
 * superadmin token (JWT `type: "superadmin"`). Missing/invalid token -> 401;
 * a valid token of the wrong type -> 403 ACCESS_DENIED.
 */
function requirePlatformSuperAdmin(req: Request, res: Response): boolean {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  try {
    const payload = jwt.verify(auth.slice(7), getJwtSecret()) as { type?: string };
    if (payload.type !== "superadmin") {
      res.status(403).json({ error: "ACCESS_DENIED", message: "platform_super_admin access required" });
      return false;
    }
    return true;
  } catch {
    res.status(401).json({ error: "Invalid token" });
    return false;
  }
}

/* ─── Overview KPIs ─── */
router.get("/superadmin/analytics/overview", async (req, res): Promise<void> => {
  if (!requirePlatformSuperAdmin(req, res)) return;
  try {
    const rows = await computeTenantUsageList();
    res.json(buildOverview(rows));
  } catch (err) {
    req.log.error({ err }, "analytics overview failed");
    res.status(500).json({ error: "Failed to compute analytics overview" });
  }
});

/* ─── Tenant list (with computed scores) ─── */
router.get("/superadmin/analytics/tenants", async (req, res): Promise<void> => {
  if (!requirePlatformSuperAdmin(req, res)) return;
  try {
    const search = (req.query["search"] as string | undefined)?.trim().toLowerCase();
    const activity = req.query["activity"] as string | undefined; // active|moderate|low|dormant
    const risk = req.query["risk"] as string | undefined; // low|medium|high
    const subStatus = req.query["subscriptionStatus"] as string | undefined;
    const sort = (req.query["sort"] as string | undefined) ?? "activityScore"; // activityScore|resourceRiskScore|salesTotal|createdAt
    const dir = (req.query["dir"] as string | undefined) === "asc" ? "asc" : "desc";

    let rows = await computeTenantUsageList();
    if (search) {
      rows = rows.filter(
        (r) =>
          r.businessName.toLowerCase().includes(search) ||
          r.email.toLowerCase().includes(search) ||
          r.ownerName.toLowerCase().includes(search),
      );
    }
    if (activity) rows = rows.filter((r) => r.activityLabel === activity);
    if (risk) rows = rows.filter((r) => r.riskLabel === risk);
    if (subStatus) rows = rows.filter((r) => r.subscriptionStatus === subStatus);

    const sortKey = (["activityScore", "resourceRiskScore", "salesTotal", "salesCount30d", "createdAt"] as const).includes(
      sort as never,
    )
      ? (sort as "activityScore" | "resourceRiskScore" | "salesTotal" | "salesCount30d" | "createdAt")
      : "activityScore";
    rows.sort((a, b) => {
      const av = sortKey === "createdAt" ? a.createdAt.getTime() : (a[sortKey] as number);
      const bv = sortKey === "createdAt" ? b.createdAt.getTime() : (b[sortKey] as number);
      return dir === "asc" ? av - bv : bv - av;
    });

    res.json({ tenants: rows, count: rows.length });
  } catch (err) {
    req.log.error({ err }, "analytics tenant list failed");
    res.status(500).json({ error: "Failed to load tenant analytics" });
  }
});

/* ─── Tenant detail ─── */
router.get("/superadmin/analytics/tenants/:tenantId", async (req, res): Promise<void> => {
  if (!requirePlatformSuperAdmin(req, res)) return;
  const tenantId = Number(req.params.tenantId);
  if (!Number.isInteger(tenantId)) {
    res.status(400).json({ error: "Invalid tenantId" });
    return;
  }
  try {
    const detail = await computeTenantDetail(tenantId);
    if (!detail) {
      res.status(404).json({ error: "Tenant not found" });
      return;
    }
    res.json(detail);
  } catch (err) {
    req.log.error({ err }, "analytics tenant detail failed");
    res.status(500).json({ error: "Failed to load tenant detail" });
  }
});

/* ─── Tenant activity events timeline ─── */
router.get("/superadmin/analytics/tenants/:tenantId/events", async (req, res): Promise<void> => {
  if (!requirePlatformSuperAdmin(req, res)) return;
  const tenantId = Number(req.params.tenantId);
  if (!Number.isInteger(tenantId)) {
    res.status(400).json({ error: "Invalid tenantId" });
    return;
  }
  try {
    const limit = Math.min(200, Math.max(1, Number(req.query["limit"]) || 100));
    const events = await db
      .select()
      .from(tenantActivityEventsTable)
      .where(eq(tenantActivityEventsTable.tenantId, tenantId))
      .orderBy(desc(tenantActivityEventsTable.createdAt))
      .limit(limit);
    res.json({ events });
  } catch (err) {
    req.log.error({ err }, "analytics tenant events failed");
    res.status(500).json({ error: "Failed to load tenant events" });
  }
});

/* ─── Manual snapshot run ─── */
router.post("/superadmin/analytics/snapshots/run", async (req, res): Promise<void> => {
  if (!requirePlatformSuperAdmin(req, res)) return;
  try {
    const result = await generateTenantUsageSnapshots();
    req.log.info({ result }, "manual usage snapshot run");
    res.json({ success: true, ...result });
  } catch (err) {
    req.log.error({ err }, "snapshot run failed");
    res.status(500).json({ error: "Failed to run snapshots" });
  }
});

/* ─── Alerts Center: list ─── */
router.get("/superadmin/analytics/alerts", async (req, res): Promise<void> => {
  if (!requirePlatformSuperAdmin(req, res)) return;
  try {
    const status = req.query["status"] as string | undefined; // open|resolved|dismissed|all
    const severity = req.query["severity"] as string | undefined; // low|medium|high|critical
    const result = await listTenantAlerts({ status, severity });
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "alerts list failed");
    res.status(500).json({ error: "Failed to load alerts" });
  }
});

/* ─── Alerts Center: (re)generate ─── */
router.post("/superadmin/analytics/alerts/generate", async (req, res): Promise<void> => {
  if (!requirePlatformSuperAdmin(req, res)) return;
  try {
    const result = await generateTenantAlerts();
    req.log.info({ result }, "alert generation run");
    res.json({ success: true, ...result });
  } catch (err) {
    req.log.error({ err }, "alert generation failed");
    res.status(500).json({ error: "Failed to generate alerts" });
  }
});

/* ─── Alerts Center: update status / note ─── */
router.patch("/superadmin/analytics/alerts/:id", async (req, res): Promise<void> => {
  if (!requirePlatformSuperAdmin(req, res)) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid alert id" });
    return;
  }
  const body = (req.body ?? {}) as { status?: string; note?: string | null };
  const allowed = ["open", "resolved", "dismissed"] as const;
  if (body.status !== undefined && !allowed.includes(body.status as AlertStatus)) {
    res.status(400).json({ error: "Invalid status" });
    return;
  }
  try {
    const patch: { status?: AlertStatus; note?: string | null } = {};
    if (body.status !== undefined) patch.status = body.status as AlertStatus;
    if (body.note !== undefined) patch.note = body.note;
    const updated = await updateTenantAlert(id, patch);
    if (!updated) {
      res.status(404).json({ error: "Alert not found" });
      return;
    }
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "alert update failed");
    res.status(500).json({ error: "Failed to update alert" });
  }
});

export default router;
