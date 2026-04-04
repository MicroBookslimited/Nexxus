import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, purchasesTable, productsTable } from "@workspace/db";
import { z } from "zod";

const router: IRouter = Router();

const CreatePurchaseBody = z.object({
  productId: z.number().int().positive(),
  quantity: z.number().int().positive(),
  unitCost: z.number().min(0).default(0),
  notes: z.string().optional(),
});

const ListPurchasesQuery = z.object({
  productId: z.coerce.number().int().positive().optional(),
});

async function enrichPurchase(p: typeof purchasesTable.$inferSelect) {
  const [product] = await db
    .select({ name: productsTable.name })
    .from(productsTable)
    .where(eq(productsTable.id, p.productId));
  return {
    ...p,
    productName: product?.name ?? "Unknown",
    notes: p.notes ?? undefined,
  };
}

router.get("/purchases", async (req, res): Promise<void> => {
  const query = ListPurchasesQuery.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const rows = query.data.productId
    ? await db
        .select()
        .from(purchasesTable)
        .where(eq(purchasesTable.productId, query.data.productId))
        .orderBy(desc(purchasesTable.createdAt))
    : await db
        .select()
        .from(purchasesTable)
        .orderBy(desc(purchasesTable.createdAt));

  const enriched = await Promise.all(rows.map(enrichPurchase));
  res.json(enriched);
});

router.post("/purchases", async (req, res): Promise<void> => {
  const parsed = CreatePurchaseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { productId, quantity, unitCost, notes } = parsed.data;

  const [product] = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.id, productId));

  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  const totalCost = unitCost * quantity;
  const newStockCount = product.stockCount + quantity;

  const [purchase] = await db
    .insert(purchasesTable)
    .values({
      productId,
      quantity,
      unitCost,
      totalCost,
      notes: notes ?? null,
    })
    .returning();

  await db
    .update(productsTable)
    .set({
      stockCount: newStockCount,
      inStock: newStockCount > 0,
    })
    .where(eq(productsTable.id, productId));

  const enriched = await enrichPurchase(purchase);
  res.status(201).json(enriched);
});

router.delete("/purchases/:id", async (req, res): Promise<void> => {
  if (Array.isArray(req.params.id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  await db.delete(purchasesTable).where(eq(purchasesTable.id, id));
  res.status(204).send();
});

export default router;
