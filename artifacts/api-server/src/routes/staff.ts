import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { staffTable } from "@workspace/db";
import { z } from "zod";

const router: IRouter = Router();

const CreateStaffBody = z.object({
  name: z.string().min(1),
  pin: z.string().min(4).max(8),
  role: z.enum(["admin", "manager", "cashier", "kitchen"]).default("cashier"),
});

const UpdateStaffBody = z.object({
  name: z.string().min(1).optional(),
  pin: z.string().min(4).max(8).optional(),
  role: z.enum(["admin", "manager", "cashier", "kitchen"]).optional(),
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
  const staff = await db.select().from(staffTable).orderBy(staffTable.name);
  res.json(staff.map(sanitizeStaff));
});

router.post("/staff", async (req, res): Promise<void> => {
  const parsed = CreateStaffBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const [member] = await db.insert(staffTable).values({
    name: parsed.data.name,
    pin: parsed.data.pin,
    role: parsed.data.role,
    isActive: true,
  }).returning();

  res.status(201).json(sanitizeStaff(member));
});

router.patch("/staff/:id", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? parseInt(req.params.id[0]) : parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid staff id" });
    return;
  }

  const parsed = UpdateStaffBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const updates: Partial<typeof staffTable.$inferInsert> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.pin !== undefined) updates.pin = parsed.data.pin;
  if (parsed.data.role !== undefined) updates.role = parsed.data.role;
  if (parsed.data.isActive !== undefined) updates.isActive = parsed.data.isActive;

  const [member] = await db
    .update(staffTable)
    .set(updates)
    .where(eq(staffTable.id, id))
    .returning();

  if (!member) {
    res.status(404).json({ error: "Staff member not found" });
    return;
  }

  res.json(sanitizeStaff(member));
});

router.delete("/staff/:id", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? parseInt(req.params.id[0]) : parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid staff id" });
    return;
  }

  await db.update(staffTable).set({ isActive: false }).where(eq(staffTable.id, id));
  res.status(204).send();
});

router.post("/staff/verify-pin", async (req, res): Promise<void> => {
  const { staffId, pin } = req.body as { staffId?: number; pin?: string };

  if (!staffId || !pin) {
    res.status(400).json({ error: "staffId and pin are required" });
    return;
  }

  const [member] = await db
    .select()
    .from(staffTable)
    .where(eq(staffTable.id, staffId));

  if (!member || !member.isActive) {
    res.status(404).json({ error: "Staff member not found" });
    return;
  }

  if (member.pin !== pin) {
    res.status(401).json({ error: "Invalid PIN" });
    return;
  }

  res.json(sanitizeStaff(member));
});

export default router;
