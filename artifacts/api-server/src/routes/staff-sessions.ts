import { Router, type IRouter, type Request } from "express";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db, staffSessionsTable, staffTable, locationsTable, type StaffSession } from "@workspace/db";
import { z } from "zod";
import { verifyTenantToken } from "./saas-auth";
import { logAudit } from "./audit";

const router: IRouter = Router();

function getTenantId(req: Request): number | null {
  const auth = req.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) return null;
  const p = verifyTenantToken(auth.slice(7));
  return p ? p.tenantId : null;
}

function getStaffIdHeader(req: Request): number | null {
  const raw = req.headers["x-staff-id"];
  if (!raw) return null;
  const parsed = parseInt(Array.isArray(raw) ? raw[0] : raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

const MANAGER_ROLES = new Set(["admin", "manager", "supervisor", "owner"]);

/**
 * Look up the requesting staff (by x-staff-id header) and return whether
 * they hold a managerial role. Used to gate cross-staff visibility on
 * list endpoints. Returns { staff, isManager } or null when no/invalid header.
 */
async function resolveRequestingStaff(req: Request, tenantId: number) {
  const id = getStaffIdHeader(req);
  if (!id) return null;
  const [s] = await db
    .select()
    .from(staffTable)
    .where(and(eq(staffTable.id, id), eq(staffTable.tenantId, tenantId)))
    .limit(1);
  if (!s) return null;
  return { staff: s, isManager: MANAGER_ROLES.has((s.role ?? "").toLowerCase()) };
}

function getIp(req: Request): string {
  return (
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    ""
  );
}

const ClockInBody = z.object({
  staffId: z.number().int().positive(),
  locationId: z.number().int().positive().optional(),
  notes: z.string().max(500).optional(),
});

const ClockOutBody = z.object({
  staffId: z.number().int().positive().optional(),
  notes: z.string().max(500).optional(),
});

const ListQuery = z.object({
  staffId: z.coerce.number().int().positive().optional(),
  locationId: z.coerce.number().int().positive().optional(),
  status: z.enum(["active", "closed"]).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.coerce.number().int().positive().max(500).optional(),
});

/* GET /api/staff/sessions/current — current open shift for a staff member */
router.get("/staff/sessions/current", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const staffId = getStaffIdHeader(req);
  if (!staffId) { res.status(400).json({ error: "x-staff-id header required" }); return; }

  const [session] = await db
    .select()
    .from(staffSessionsTable)
    .where(and(
      eq(staffSessionsTable.tenantId, tenantId),
      eq(staffSessionsTable.staffId, staffId),
      eq(staffSessionsTable.status, "active"),
    ))
    .orderBy(desc(staffSessionsTable.clockInTime))
    .limit(1);

  if (!session) { res.status(404).json({ error: "No active shift" }); return; }
  res.json(session);
});

/* GET /api/staff/sessions — list shifts (filterable)
 * Non-managers may only see their own shifts. Managers (admin/manager/
 * supervisor/owner) may filter freely. */
router.get("/staff/sessions", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = ListQuery.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const q = parsed.data;

  const requester = await resolveRequestingStaff(req, tenantId);
  let effectiveStaffFilter: number | undefined = q.staffId;

  // Force non-managers (or unauthenticated-staff requests) to their own shifts.
  if (!requester) {
    res.status(400).json({ error: "x-staff-id header required" });
    return;
  }
  if (!requester.isManager) {
    if (q.staffId && q.staffId !== requester.staff.id) {
      res.status(403).json({ error: "Forbidden — non-managers can only view their own shifts" });
      return;
    }
    effectiveStaffFilter = requester.staff.id;
  }

  const conditions = [eq(staffSessionsTable.tenantId, tenantId)];
  if (effectiveStaffFilter) conditions.push(eq(staffSessionsTable.staffId, effectiveStaffFilter));
  if (q.locationId) conditions.push(eq(staffSessionsTable.locationId, q.locationId));
  if (q.status)     conditions.push(eq(staffSessionsTable.status, q.status));
  if (q.from)       conditions.push(gte(staffSessionsTable.clockInTime, new Date(q.from)));
  if (q.to)         conditions.push(lte(staffSessionsTable.clockInTime, new Date(q.to)));

  const rows = await db
    .select()
    .from(staffSessionsTable)
    .where(and(...conditions))
    .orderBy(desc(staffSessionsTable.clockInTime))
    .limit(q.limit ?? 100);

  // Include duration (seconds) for closed shifts so the client doesn't recompute.
  const enriched = rows.map((r: StaffSession) => ({
    ...r,
    durationSeconds: r.clockOutTime
      ? Math.max(0, Math.floor((new Date(r.clockOutTime).getTime() - new Date(r.clockInTime).getTime()) / 1000))
      : null,
  }));
  res.json(enriched);
});

/* POST /api/staff/clock-in — open a new shift */
router.post("/staff/clock-in", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = ClockInBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const { staffId, locationId, notes } = parsed.data;

  // Validate staff belongs to this tenant
  const [staff] = await db
    .select()
    .from(staffTable)
    .where(and(eq(staffTable.id, staffId), eq(staffTable.tenantId, tenantId)))
    .limit(1);
  if (!staff) { res.status(404).json({ error: "Staff not found" }); return; }
  if (!staff.isActive) { res.status(403).json({ error: "Staff is inactive" }); return; }

  // Reject if already clocked in
  const [existing] = await db
    .select()
    .from(staffSessionsTable)
    .where(and(
      eq(staffSessionsTable.tenantId, tenantId),
      eq(staffSessionsTable.staffId, staffId),
      eq(staffSessionsTable.status, "active"),
    ))
    .limit(1);
  if (existing) {
    res.status(409).json({ error: "Already clocked in", session: existing });
    return;
  }

  // Resolve location name if provided
  let locationName: string | null = null;
  if (locationId) {
    const [loc] = await db
      .select()
      .from(locationsTable)
      .where(and(eq(locationsTable.id, locationId), eq(locationsTable.tenantId, tenantId)))
      .limit(1);
    if (!loc) { res.status(404).json({ error: "Location not found" }); return; }
    locationName = loc.name;
  }

  let session;
  try {
    [session] = await db
      .insert(staffSessionsTable)
      .values({
        tenantId,
        staffId,
        staffName: staff.name,
        locationId: locationId ?? null,
        locationName,
        notes: notes ?? null,
      })
      .returning();
  } catch (err: unknown) {
    // Race winner already created an active row — partial unique index trips.
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("staff_sessions_one_active_per_staff")) {
      res.status(409).json({ error: "Already clocked in" });
      return;
    }
    throw err;
  }

  await logAudit({
    tenantId,
    staffId,
    staffName: staff.name,
    action: "staff.clock_in",
    entityType: "staff_session",
    entityId: session.id,
    details: { locationId: locationId ?? null, locationName },
    ipAddress: getIp(req),
  });

  res.status(201).json(session);
});

/* POST /api/staff/clock-out — close current shift */
router.post("/staff/clock-out", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = ClockOutBody.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  const staffId = parsed.data.staffId ?? getStaffIdHeader(req);
  if (!staffId) { res.status(400).json({ error: "staffId or x-staff-id header required" }); return; }

  // Verify the staff belongs to this tenant before mutating their shift.
  const [staffRow] = await db
    .select()
    .from(staffTable)
    .where(and(eq(staffTable.id, staffId), eq(staffTable.tenantId, tenantId)))
    .limit(1);
  if (!staffRow) { res.status(404).json({ error: "Staff not found" }); return; }

  const [active] = await db
    .select()
    .from(staffSessionsTable)
    .where(and(
      eq(staffSessionsTable.tenantId, tenantId),
      eq(staffSessionsTable.staffId, staffId),
      eq(staffSessionsTable.status, "active"),
    ))
    .orderBy(desc(staffSessionsTable.clockInTime))
    .limit(1);

  if (!active) { res.status(404).json({ error: "No active shift" }); return; }

  const now = new Date();
  const mergedNotes = parsed.data.notes
    ? (active.notes ? `${active.notes}\n${parsed.data.notes}` : parsed.data.notes)
    : active.notes;

  const [closed] = await db
    .update(staffSessionsTable)
    .set({
      status: "closed",
      clockOutTime: now,
      notes: mergedNotes,
      updatedAt: now,
    })
    .where(eq(staffSessionsTable.id, active.id))
    .returning();

  const durationSeconds = Math.max(
    0,
    Math.floor((now.getTime() - new Date(active.clockInTime).getTime()) / 1000),
  );

  await logAudit({
    tenantId,
    staffId,
    staffName: active.staffName,
    action: "staff.clock_out",
    entityType: "staff_session",
    entityId: active.id,
    details: { durationSeconds, locationId: active.locationId },
    ipAddress: getIp(req),
  });

  res.json({ ...closed, durationSeconds });
});

/* GET /api/staff/sessions/active — all active shifts (manager view) */
router.get("/staff/sessions/active", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const requester = await resolveRequestingStaff(req, tenantId);
  if (!requester) { res.status(400).json({ error: "x-staff-id header required" }); return; }
  if (!requester.isManager) {
    res.status(403).json({ error: "Forbidden — manager role required" });
    return;
  }

  const rows = await db
    .select()
    .from(staffSessionsTable)
    .where(and(
      eq(staffSessionsTable.tenantId, tenantId),
      eq(staffSessionsTable.status, "active"),
    ))
    .orderBy(desc(staffSessionsTable.clockInTime));

  const now = Date.now();
  const enriched = rows.map((r: StaffSession) => ({
    ...r,
    elapsedSeconds: Math.max(0, Math.floor((now - new Date(r.clockInTime).getTime()) / 1000)),
  }));
  res.json(enriched);
});

export default router;
