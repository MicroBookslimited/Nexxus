import { Router, type IRouter } from "express";
import { and, eq, desc } from "drizzle-orm";
import { db, purchasesTable, productsTable, stockMovementsTable, productPurchaseUnitsTable } from "@workspace/db";
import { z } from "zod";
import { verifyTenantToken } from "./saas-auth";
import { convertToBaseUnit } from "../lib/pricing";

const router: IRouter = Router();

/* ─── Auth helper ─── */
function getTenantId(req: { headers: Record<string, string | undefined> }): number | null {
  const auth = req.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) return null;
  const p = verifyTenantToken(auth.slice(7));
  return p ? p.tenantId : null;
}

const CreatePurchaseBody = z.object({
  productId: z.number().int().positive(),
  /** Quantity in `unit` (NOT base units). Server converts using product purchase units. */
  quantity: z.number().positive(),
  /** The unit the quantity is expressed in. Defaults to product's base unit. */
  unit: z.string().optional(),
  /** Cost per `unit` (NOT per base unit). */
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
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const query = ListPurchasesQuery.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const conditions = [eq(purchasesTable.tenantId, tenantId)];
  if (query.data.productId) conditions.push(eq(purchasesTable.productId, query.data.productId));

  const rows = await db
    .select()
    .from(purchasesTable)
    .where(and(...conditions))
    .orderBy(desc(purchasesTable.createdAt));

  const enriched = await Promise.all(rows.map(enrichPurchase));
  res.json(enriched);
});

router.post("/purchases", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = CreatePurchaseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { productId, quantity, unit, unitCost, notes } = parsed.data;

  const [product] = await db
    .select()
    .from(productsTable)
    .where(and(eq(productsTable.id, productId), eq(productsTable.tenantId, tenantId)));

  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  // Convert purchase qty -> base units using product's purchase-unit table.
  const purchaseUnits = await db
    .select()
    .from(productPurchaseUnitsTable)
    .where(and(
      eq(productPurchaseUnitsTable.tenantId, tenantId),
      eq(productPurchaseUnitsTable.productId, productId),
    ));
  const baseQty = convertToBaseUnit(quantity, unit, product.baseUnit, purchaseUnits);
  // stock_count is integer in current schema — round to avoid drift on
  // partial conversions (e.g. half-cases). Logged in notes for audit.
  const baseQtyRounded = Math.round(baseQty);
  const totalCost = unitCost * quantity;
  const newStockCount = product.stockCount + baseQtyRounded;
  const noteWithConversion = unit && unit !== product.baseUnit
    ? `${notes ? notes + " · " : ""}${quantity} ${unit} → ${baseQty} ${product.baseUnit}`
    : notes ?? null;

  const [purchase] = await db
    .insert(purchasesTable)
    .values({
      tenantId,
      productId,
      quantity: baseQtyRounded,
      unitCost,
      totalCost,
      notes: noteWithConversion,
    })
    .returning();

  await db
    .update(productsTable)
    .set({ stockCount: newStockCount, inStock: newStockCount > 0 })
    .where(and(eq(productsTable.id, productId), eq(productsTable.tenantId, tenantId)));

  await db.insert(stockMovementsTable).values({
    tenantId,
    productId,
    type: "restock",
    quantity: baseQtyRounded,
    balanceAfter: newStockCount,
    referenceType: "purchase",
    referenceId: purchase.id,
    notes: noteWithConversion,
  });

  const enriched = await enrichPurchase(purchase);
  res.status(201).json(enriched);
});

router.delete("/purchases/:id", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  if (Array.isArray(req.params.id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  await db.delete(purchasesTable).where(and(eq(purchasesTable.id, id), eq(purchasesTable.tenantId, tenantId)));
  res.status(204).send();
});

export default router;
