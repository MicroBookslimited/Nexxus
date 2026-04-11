import { Router, type IRouter } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  db, productionBatchesTable, productionBatchItemsTable,
  recipesTable, recipeIngredientsTable, ingredientsTable,
  ingredientUsageLogsTable, productsTable,
} from "@workspace/db";
import { verifyTenantToken } from "./saas-auth";
import { z } from "zod/v4";

const router: IRouter = Router();

function getTenantId(req: { headers: Record<string, string | undefined> }): number | null {
  const auth = req.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) return null;
  const p = verifyTenantToken(auth.slice(7));
  return p ? p.tenantId : null;
}

const BatchItemBody = z.object({
  productId: z.number().int(),
  quantityPlanned: z.number().positive(),
  unit: z.string().default("pcs"),
});

const CreateBatchBody = z.object({
  notes: z.string().optional(),
  items: z.array(BatchItemBody).min(1),
});

async function enrichBatch(batch: typeof productionBatchesTable.$inferSelect) {
  const items = await db
    .select({
      id: productionBatchItemsTable.id,
      batchId: productionBatchItemsTable.batchId,
      productId: productionBatchItemsTable.productId,
      productName: productsTable.name,
      quantityPlanned: productionBatchItemsTable.quantityPlanned,
      quantityProduced: productionBatchItemsTable.quantityProduced,
      unit: productionBatchItemsTable.unit,
      costCalculated: productionBatchItemsTable.costCalculated,
    })
    .from(productionBatchItemsTable)
    .innerJoin(productsTable, eq(productionBatchItemsTable.productId, productsTable.id))
    .where(eq(productionBatchItemsTable.batchId, batch.id));

  return { ...batch, items };
}

router.get("/production/batches", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const batches = await db.select().from(productionBatchesTable)
    .where(eq(productionBatchesTable.tenantId, tenantId))
    .orderBy(desc(productionBatchesTable.createdAt));

  const enriched = await Promise.all(batches.map(enrichBatch));
  res.json(enriched);
});

router.get("/production/batches/:id", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [batch] = await db.select().from(productionBatchesTable)
    .where(and(eq(productionBatchesTable.id, id), eq(productionBatchesTable.tenantId, tenantId)));
  if (!batch) { res.status(404).json({ error: "Not found" }); return; }

  res.json(await enrichBatch(batch));
});

router.post("/production/batches", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = CreateBatchBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const now = new Date();
  const yymm = String(now.getFullYear()).slice(-2) + String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const [{ cnt }] = await db.select({ cnt: sql<number>`cast(count(*) as int)` })
    .from(productionBatchesTable)
    .where(eq(productionBatchesTable.tenantId, tenantId));
  const batchNumber = `BATCH-${yymm}-${dd}-${String((cnt ?? 0) + 1).padStart(4, "0")}`;

  const [batch] = await db.insert(productionBatchesTable).values({
    tenantId,
    batchNumber,
    status: "draft",
    notes: parsed.data.notes,
  }).returning();

  await db.insert(productionBatchItemsTable).values(
    parsed.data.items.map(i => ({
      batchId: batch.id,
      productId: i.productId,
      quantityPlanned: i.quantityPlanned,
      unit: i.unit,
    }))
  );

  res.status(201).json(await enrichBatch(batch));
});

router.patch("/production/batches/:id/complete", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [batch] = await db.select().from(productionBatchesTable)
    .where(and(eq(productionBatchesTable.id, id), eq(productionBatchesTable.tenantId, tenantId)));
  if (!batch) { res.status(404).json({ error: "Not found" }); return; }
  if (batch.status === "completed") { res.status(400).json({ error: "Already completed" }); return; }

  const batchItems = await db.select().from(productionBatchItemsTable)
    .where(eq(productionBatchItemsTable.batchId, id));

  let totalCost = 0;

  for (const item of batchItems) {
    const produced = item.quantityProduced ?? item.quantityPlanned;

    const [recipe] = await db.select().from(recipesTable)
      .where(and(eq(recipesTable.productId, item.productId), eq(recipesTable.tenantId, tenantId)));

    if (recipe) {
      const rIngredients = await db
        .select({
          ingredientId: recipeIngredientsTable.ingredientId,
          quantity: recipeIngredientsTable.quantity,
          costPerUnit: ingredientsTable.costPerUnit,
        })
        .from(recipeIngredientsTable)
        .innerJoin(ingredientsTable, eq(recipeIngredientsTable.ingredientId, ingredientsTable.id))
        .where(eq(recipeIngredientsTable.recipeId, recipe.id));

      let itemCost = 0;
      for (const ri of rIngredients) {
        const toDeduct = (ri.quantity / recipe.yieldQuantity) * produced;
        itemCost += toDeduct * ri.costPerUnit;

        await db.update(ingredientsTable)
          .set({ stockQuantity: sql`GREATEST(0, ${ingredientsTable.stockQuantity} - ${toDeduct})`, updatedAt: new Date() })
          .where(eq(ingredientsTable.id, ri.ingredientId));

        await db.insert(ingredientUsageLogsTable).values({
          tenantId,
          ingredientId: ri.ingredientId,
          quantity: toDeduct,
          reason: "production",
          referenceId: id,
          referenceType: "production_batch",
          notes: `Batch ${batch.batchNumber}`,
        });
      }

      totalCost += itemCost;

      await db.update(productionBatchItemsTable)
        .set({ quantityProduced: produced, costCalculated: Math.round(itemCost * 100) / 100 })
        .where(eq(productionBatchItemsTable.id, item.id));
    }
  }

  const [updated] = await db.update(productionBatchesTable)
    .set({ status: "completed", completedAt: new Date(), totalCost: Math.round(totalCost * 100) / 100 })
    .where(eq(productionBatchesTable.id, id))
    .returning();

  res.json(await enrichBatch(updated));
});

router.patch("/production/batches/:id/item/:itemId", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id);
  const itemId = parseInt(req.params.itemId);
  if (isNaN(id) || isNaN(itemId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { quantityProduced } = req.body;
  if (typeof quantityProduced !== "number") { res.status(400).json({ error: "quantityProduced required" }); return; }

  const [item] = await db.update(productionBatchItemsTable)
    .set({ quantityProduced })
    .where(eq(productionBatchItemsTable.id, itemId))
    .returning();
  if (!item) { res.status(404).json({ error: "Not found" }); return; }

  const [batch] = await db.select().from(productionBatchesTable)
    .where(and(eq(productionBatchesTable.id, id), eq(productionBatchesTable.tenantId, tenantId)));
  if (!batch) { res.status(404).json({ error: "Not found" }); return; }

  res.json(await enrichBatch(batch));
});

router.delete("/production/batches/:id", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [batch] = await db.select().from(productionBatchesTable)
    .where(and(eq(productionBatchesTable.id, id), eq(productionBatchesTable.tenantId, tenantId)));
  if (!batch) { res.status(404).json({ error: "Not found" }); return; }
  if (batch.status === "completed") { res.status(400).json({ error: "Cannot delete a completed batch" }); return; }

  await db.delete(productionBatchesTable).where(eq(productionBatchesTable.id, id));
  res.json({ success: true });
});

export default router;
