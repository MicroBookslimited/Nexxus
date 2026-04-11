import { Router, type IRouter } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, ingredientsTable, ingredientUsageLogsTable } from "@workspace/db";
import { verifyTenantToken } from "./saas-auth";
import { z } from "zod/v4";

const router: IRouter = Router();

function getTenantId(req: { headers: Record<string, string | undefined> }): number | null {
  const auth = req.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) return null;
  const p = verifyTenantToken(auth.slice(7));
  return p ? p.tenantId : null;
}

const CreateIngredientBody = z.object({
  name: z.string().min(1),
  unit: z.enum(["pcs", "g", "kg", "ml", "l"]),
  costPerUnit: z.number().min(0).default(0),
  stockQuantity: z.number().min(0).default(0),
  minStockLevel: z.number().min(0).default(0),
  category: z.string().optional(),
  notes: z.string().optional(),
});

const UpdateIngredientBody = CreateIngredientBody.partial().extend({
  stockQuantity: z.number().optional(),
});

const AdjustStockBody = z.object({
  quantity: z.number(),
  reason: z.string().optional(),
});

router.get("/ingredients", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const rows = await db.select().from(ingredientsTable)
    .where(eq(ingredientsTable.tenantId, tenantId))
    .orderBy(ingredientsTable.name);
  res.json(rows);
});

router.get("/ingredients/:id", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [row] = await db.select().from(ingredientsTable)
    .where(and(eq(ingredientsTable.id, id), eq(ingredientsTable.tenantId, tenantId)));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }

  const logs = await db.select().from(ingredientUsageLogsTable)
    .where(eq(ingredientUsageLogsTable.ingredientId, id))
    .orderBy(desc(ingredientUsageLogsTable.createdAt))
    .limit(50);

  res.json({ ...row, usageLogs: logs });
});

router.post("/ingredients", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = CreateIngredientBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [row] = await db.insert(ingredientsTable).values({
    ...parsed.data,
    tenantId,
  }).returning();
  res.status(201).json(row);
});

router.patch("/ingredients/:id", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = UpdateIngredientBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [row] = await db.update(ingredientsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(ingredientsTable.id, id), eq(ingredientsTable.tenantId, tenantId)))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.post("/ingredients/:id/adjust-stock", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = AdjustStockBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [current] = await db.select().from(ingredientsTable)
    .where(and(eq(ingredientsTable.id, id), eq(ingredientsTable.tenantId, tenantId)));
  if (!current) { res.status(404).json({ error: "Not found" }); return; }

  const newQty = Math.max(0, current.stockQuantity + parsed.data.quantity);

  const [updated] = await db.update(ingredientsTable)
    .set({ stockQuantity: newQty, updatedAt: new Date() })
    .where(eq(ingredientsTable.id, id))
    .returning();

  await db.insert(ingredientUsageLogsTable).values({
    tenantId,
    ingredientId: id,
    quantity: parsed.data.quantity,
    reason: "adjustment",
    notes: parsed.data.reason,
  });

  res.json(updated);
});

router.delete("/ingredients/:id", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [row] = await db.delete(ingredientsTable)
    .where(and(eq(ingredientsTable.id, id), eq(ingredientsTable.tenantId, tenantId)))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ success: true });
});

router.get("/ingredients-usage-report", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const from = req.query.from as string | undefined;
  const to = req.query.to as string | undefined;

  const jamaicaDayStart = (d: string) => new Date(`${d}T05:00:00.000Z`);
  const jamaicaDayEnd   = (d: string) => { const x = jamaicaDayStart(d); x.setUTCDate(x.getUTCDate() + 1); return x; };

  const rows = await db
    .select({
      ingredientId: ingredientUsageLogsTable.ingredientId,
      ingredientName: ingredientsTable.name,
      unit: ingredientsTable.unit,
      totalUsed: sql<number>`cast(sum(${ingredientUsageLogsTable.quantity}) as real)`,
      costPerUnit: ingredientsTable.costPerUnit,
      totalCost: sql<number>`cast(sum(${ingredientUsageLogsTable.quantity}) * ${ingredientsTable.costPerUnit} as real)`,
    })
    .from(ingredientUsageLogsTable)
    .innerJoin(ingredientsTable, eq(ingredientUsageLogsTable.ingredientId, ingredientsTable.id))
    .where(and(
      eq(ingredientUsageLogsTable.tenantId, tenantId),
      eq(ingredientUsageLogsTable.reason, "sale"),
      from ? sql`${ingredientUsageLogsTable.createdAt} >= ${jamaicaDayStart(from)}` : sql`1=1`,
      to ? sql`${ingredientUsageLogsTable.createdAt} < ${jamaicaDayEnd(to)}` : sql`1=1`,
    ))
    .groupBy(ingredientUsageLogsTable.ingredientId, ingredientsTable.name, ingredientsTable.unit, ingredientsTable.costPerUnit);

  res.json(rows);
});

export default router;
