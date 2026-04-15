import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, staffTable, staffLocationsTable, locationsTable, rolesTable } from "@workspace/db";
import { z } from "zod";
import { verifyTenantToken } from "./saas-auth";
import { seedDefaultRoles } from "./roles";

const router: IRouter = Router();

function getTenantId(req: { headers: { authorization?: string } }): number | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  const p = verifyTenantToken(auth.slice(7));
  return p ? p.tenantId : null;
}

function getTenantPayload(req: { headers: { authorization?: string } }) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  return verifyTenantToken(auth.slice(7));
}

const CreateStaffBody = z.object({
  name: z.string().min(1),
  pin: z.string().min(4).max(8),
  role: z.string().min(1).default("cashier"),
});

const UpdateStaffBody = z.object({
  name: z.string().min(1).optional(),
  pin: z.string().min(4).max(8).optional(),
  role: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});

function sanitizeStaff(s: typeof staffTable.$inferSelect) {
  return {
    id: s.id,
    name: s.name,
    role: s.role,
    isActive: s.isActive,
    createdAt: s.createdAt,
  };
}

router.get("/staff", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const staff = await db.select().from(staffTable)
    .where(eq(staffTable.tenantId, tenantId))
    .orderBy(staffTable.name);
  res.json(staff.map(sanitizeStaff));
});

router.post("/staff", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = CreateStaffBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  // Seed default roles on first staff creation (new tenant won't have roles yet)
  await seedDefaultRoles(tenantId);

  const existing = await db.select({ id: staffTable.id })
    .from(staffTable)
    .where(and(eq(staffTable.tenantId, tenantId), eq(staffTable.pin, parsed.data.pin), eq(staffTable.isActive, true)));

  if (existing.length > 0) {
    res.status(409).json({ error: "A staff member with this PIN already exists" });
    return;
  }

  const [member] = await db.insert(staffTable).values({
    tenantId,
    name: parsed.data.name,
    pin: parsed.data.pin,
    role: parsed.data.role,
    isActive: true,
  }).returning();

  res.status(201).json(sanitizeStaff(member));
});

router.patch("/staff/:id", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid staff id" }); return; }

  const parsed = UpdateStaffBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request body" }); return; }

  if (parsed.data.pin) {
    const conflict = await db.select({ id: staffTable.id })
      .from(staffTable)
      .where(and(eq(staffTable.tenantId, tenantId), eq(staffTable.pin, parsed.data.pin), eq(staffTable.isActive, true)));
    if (conflict.some(c => c.id !== id)) {
      res.status(409).json({ error: "Another staff member already uses this PIN" });
      return;
    }
  }

  const updates: Partial<typeof staffTable.$inferInsert> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.pin !== undefined) updates.pin = parsed.data.pin;
  if (parsed.data.role !== undefined) updates.role = parsed.data.role;
  if (parsed.data.isActive !== undefined) updates.isActive = parsed.data.isActive;

  const [member] = await db
    .update(staffTable)
    .set(updates)
    .where(and(eq(staffTable.id, id), eq(staffTable.tenantId, tenantId)))
    .returning();

  if (!member) { res.status(404).json({ error: "Staff member not found" }); return; }

  res.json(sanitizeStaff(member));
});

router.delete("/staff/:id", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid staff id" }); return; }

  await db.update(staffTable)
    .set({ isActive: false })
    .where(and(eq(staffTable.id, id), eq(staffTable.tenantId, tenantId)));
  res.status(204).send();
});

router.post("/staff/verify-pin", async (req, res): Promise<void> => {
  const { staffId, pin } = req.body as { staffId?: number; pin?: string };
  if (!staffId || !pin) { res.status(400).json({ error: "staffId and pin are required" }); return; }

  const tenantId = getTenantId(req);

  const conditions = [eq(staffTable.id, staffId)];
  if (tenantId) conditions.push(eq(staffTable.tenantId, tenantId));

  const [member] = await db.select().from(staffTable).where(and(...conditions));

  if (!member || !member.isActive) { res.status(404).json({ error: "Staff member not found" }); return; }
  if (member.pin !== pin) { res.status(401).json({ error: "Invalid PIN" }); return; }

  res.json(sanitizeStaff(member));
});

router.post("/staff/authenticate", async (req, res): Promise<void> => {
  const parsed = z.object({
    pin: z.string().min(4).max(8),
    requiredRoles: z.array(z.string()).optional(),
  }).safeParse(req.body);

  if (!parsed.success) { res.status(400).json({ error: "pin is required" }); return; }

  const { pin, requiredRoles } = parsed.data;

  const tenantId = getTenantId(req);

  const conditions = [eq(staffTable.isActive, true)];
  if (tenantId) conditions.push(eq(staffTable.tenantId, tenantId));

  const members = await db.select().from(staffTable).where(and(...conditions));

  const match = members.find((m) => m.pin === pin);

  if (!match) { res.status(401).json({ error: "Invalid PIN" }); return; }

  if (requiredRoles && requiredRoles.length > 0 &&
      !requiredRoles.map(r => r.toLowerCase()).includes((match.role ?? "").toLowerCase())) {
    res.status(403).json({ error: "Insufficient role", role: match.role });
    return;
  }

  let permissions: string[] = [];
  if (tenantId) {
    // Ensure default roles exist — they may not yet if the tenant has never
    // visited the Roles page (e.g. immediately after onboarding).
    await seedDefaultRoles(tenantId);

    const roleRows = await db.select({ permissions: rolesTable.permissions })
      .from(rolesTable)
      .where(and(
        eq(rolesTable.tenantId, tenantId),
        sql`LOWER(${rolesTable.name}) = LOWER(${match.role})`
      ));
    if (roleRows.length > 0) {
      permissions = roleRows[0]!.permissions as string[];
    }
  }

  res.json({ ...sanitizeStaff(match), permissions });
});

/* ─── Superadmin impersonation PIN bypass ─── */
router.post("/staff/impersonation-bypass", async (req, res): Promise<void> => {
  const payload = getTenantPayload(req);
  if (!payload) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!payload.impersonation) { res.status(403).json({ error: "Not an impersonation session" }); return; }

  const { tenantId } = payload;

  const ROLE_PRIORITY = ["owner", "admin", "manager", "supervisor", "cashier"];

  const members = await db
    .select()
    .from(staffTable)
    .where(and(eq(staffTable.tenantId, tenantId), eq(staffTable.isActive, true)));

  if (members.length === 0) { res.status(404).json({ error: "No active staff found for this tenant" }); return; }

  const sorted = [...members].sort((a, b) => {
    const ai = ROLE_PRIORITY.indexOf((a.role ?? "cashier").toLowerCase());
    const bi = ROLE_PRIORITY.indexOf((b.role ?? "cashier").toLowerCase());
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  const staff = sorted[0]!;

  await seedDefaultRoles(tenantId);

  const roleRows = await db
    .select({ permissions: rolesTable.permissions })
    .from(rolesTable)
    .where(and(
      eq(rolesTable.tenantId, tenantId),
      sql`LOWER(${rolesTable.name}) = LOWER(${staff.role})`
    ));

  const permissions: string[] = roleRows.length > 0 ? (roleRows[0]!.permissions as string[]) : [];

  res.json({ ...sanitizeStaff(staff), permissions });
});

router.get("/staff/:id/locations", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid staff id" }); return; }

  const rows = await db
    .select({
      id: staffLocationsTable.id,
      locationId: staffLocationsTable.locationId,
      isPrimary: staffLocationsTable.isPrimary,
      locationName: locationsTable.name,
    })
    .from(staffLocationsTable)
    .leftJoin(locationsTable, eq(locationsTable.id, staffLocationsTable.locationId))
    .where(eq(staffLocationsTable.staffId, id));
  res.json(rows);
});

router.put("/staff/:id/locations", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid staff id" }); return; }

  const { locationIds, primaryLocationId } = req.body as { locationIds: number[]; primaryLocationId?: number };

  await db.delete(staffLocationsTable).where(eq(staffLocationsTable.staffId, id));
  if (locationIds?.length) {
    await db.insert(staffLocationsTable).values(
      locationIds.map(lid => ({ staffId: id, locationId: lid, isPrimary: lid === primaryLocationId }))
    );
  }
  res.json({ success: true });
});

export default router;
