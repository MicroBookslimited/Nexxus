import { Router, type IRouter, type Request } from "express";
import { and, desc, eq, gte, lte, ilike, or, sql } from "drizzle-orm";
import { db, auditLogsTable } from "@workspace/db";
import { verifyTenantToken } from "./saas-auth";
import { z } from "zod";

const router: IRouter = Router();

/* ─── Auth helper ─── */
function getTenantPayload(req: Request) {
  const auth = req.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) return null;
  return verifyTenantToken(auth.slice(7));
}

/* ─── logAudit helper — call from any route ─── */
export async function logAudit(opts: {
  tenantId: number;
  staffId?: number | null;
  staffName?: string | null;
  action: string;
  entityType?: string;
  entityId?: string | number | null;
  details?: Record<string, unknown>;
  ipAddress?: string;
}): Promise<void> {
  try {
    await db.insert(auditLogsTable).values({
      tenantId: opts.tenantId,
      staffId: opts.staffId ?? null,
      staffName: opts.staffName ?? null,
      action: opts.action,
      entityType: opts.entityType ?? null,
      entityId: opts.entityId != null ? String(opts.entityId) : null,
      details: opts.details ?? null,
      ipAddress: opts.ipAddress ?? null,
    });
  } catch (err) {
    console.error("[audit] Failed to write audit log:", err);
  }
}

/* ─── GET /audit-logs — tenant admin-only view ─── */
router.get("/audit-logs", async (req, res): Promise<void> => {
  const payload = getTenantPayload(req);
  if (!payload) { res.status(401).json({ error: "Unauthorized" }); return; }

  const qSchema = z.object({
    action: z.string().optional(),
    staffId: z.coerce.number().optional(),
    entityType: z.string().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    q: z.string().optional(),
    limit: z.coerce.number().min(1).max(500).default(100),
    offset: z.coerce.number().min(0).default(0),
  });

  const parsed = qSchema.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: "Invalid query" }); return; }

  const { action, staffId, entityType, from, to, q, limit, offset } = parsed.data;

  const conditions = [eq(auditLogsTable.tenantId, payload.tenantId)];

  if (action) conditions.push(eq(auditLogsTable.action, action));
  if (staffId) conditions.push(eq(auditLogsTable.staffId, staffId));
  if (entityType) conditions.push(eq(auditLogsTable.entityType, entityType));
  if (from) conditions.push(gte(auditLogsTable.createdAt, new Date(from)));
  if (to) {
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);
    conditions.push(lte(auditLogsTable.createdAt, toDate));
  }
  if (q) {
    conditions.push(
      or(
        ilike(auditLogsTable.action, `%${q}%`),
        ilike(auditLogsTable.staffName, `%${q}%`),
        ilike(auditLogsTable.entityType, `%${q}%`),
      )!
    );
  }

  const [rows, countRows] = await Promise.all([
    db
      .select()
      .from(auditLogsTable)
      .where(and(...conditions))
      .orderBy(desc(auditLogsTable.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(auditLogsTable)
      .where(and(...conditions)),
  ]);

  res.json({ logs: rows, total: countRows[0]?.count ?? 0 });
});

export default router;
