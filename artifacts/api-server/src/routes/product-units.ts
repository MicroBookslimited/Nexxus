import { Router, type IRouter } from "express";
import { and, eq, asc } from "drizzle-orm";
import { db, productUnitsTable } from "@workspace/db";
import { z } from "zod";
import { verifyTenantToken } from "./saas-auth";

const router: IRouter = Router();

function getTenantId(req: { headers: Record<string, string | undefined> }): number | null {
  const auth = req.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) return null;
  const p = verifyTenantToken(auth.slice(7));
  return p ? p.tenantId : null;
}

const CreateBody = z.object({
  name: z.string().trim().min(1).max(40),
  baseUnit: z.string().trim().min(1).max(40).optional(),
  conversionFactor: z.number().positive(),
});

const UpdateBody = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  baseUnit: z.string().trim().min(1).max(40).optional(),
  conversionFactor: z.number().positive().optional(),
});

router.get("/product-units", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const units = await db
    .select()
    .from(productUnitsTable)
    .where(eq(productUnitsTable.tenantId, tenantId))
    .orderBy(asc(productUnitsTable.name));
  res.json(units);
});

router.post("/product-units", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = CreateBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "INVALID_UNIT", message: parsed.error.message }); return; }

  const name = parsed.data.name.trim();
  const baseUnit = (parsed.data.baseUnit ?? "each").trim() || "each";

  // Reject case-insensitive duplicate names within the tenant catalog.
  const existing = await db
    .select()
    .from(productUnitsTable)
    .where(eq(productUnitsTable.tenantId, tenantId));
  if (existing.some((u) => u.name.toLowerCase() === name.toLowerCase())) {
    res.status(409).json({ error: "UNIT_EXISTS", message: `A unit named "${name}" already exists` });
    return;
  }

  try {
    const [created] = await db
      .insert(productUnitsTable)
      .values({ tenantId, name, baseUnit, conversionFactor: parsed.data.conversionFactor, createdAt: new Date() })
      .returning();
    res.json(created);
  } catch (e) {
    // Unique index (tenant_id, lower(name)) — covers the create race.
    if ((e as { code?: string })?.code === "23505") {
      res.status(409).json({ error: "UNIT_EXISTS", message: `A unit named "${name}" already exists` });
      return;
    }
    throw e;
  }
});

router.patch("/product-units/:id", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = UpdateBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "INVALID_UNIT", message: parsed.error.message }); return; }

  const [current] = await db
    .select()
    .from(productUnitsTable)
    .where(and(eq(productUnitsTable.id, id), eq(productUnitsTable.tenantId, tenantId)));
  if (!current) { res.status(404).json({ error: "Unit not found" }); return; }

  const next = {
    name: parsed.data.name?.trim() ?? current.name,
    baseUnit: (parsed.data.baseUnit?.trim() || undefined) ?? current.baseUnit,
    conversionFactor: parsed.data.conversionFactor ?? current.conversionFactor,
  };

  // Guard against renaming onto another existing unit (case-insensitive).
  if (next.name.toLowerCase() !== current.name.toLowerCase()) {
    const siblings = await db
      .select()
      .from(productUnitsTable)
      .where(eq(productUnitsTable.tenantId, tenantId));
    if (siblings.some((u) => u.id !== id && u.name.toLowerCase() === next.name.toLowerCase())) {
      res.status(409).json({ error: "UNIT_EXISTS", message: `A unit named "${next.name}" already exists` });
      return;
    }
  }

  try {
    const [updated] = await db
      .update(productUnitsTable)
      .set(next)
      .where(and(eq(productUnitsTable.id, id), eq(productUnitsTable.tenantId, tenantId)))
      .returning();
    res.json(updated);
  } catch (e) {
    if ((e as { code?: string })?.code === "23505") {
      res.status(409).json({ error: "UNIT_EXISTS", message: `A unit named "${next.name}" already exists` });
      return;
    }
    throw e;
  }
});

router.delete("/product-units/:id", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  await db
    .delete(productUnitsTable)
    .where(and(eq(productUnitsTable.id, id), eq(productUnitsTable.tenantId, tenantId)));
  res.json({ success: true });
});

export default router;
