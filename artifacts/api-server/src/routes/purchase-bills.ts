import { Router, type IRouter } from "express";
import { and, eq, desc, count } from "drizzle-orm";
import { db, purchaseBillsTable, purchaseBillItemsTable, productsTable, stockMovementsTable } from "@workspace/db";
import { z } from "zod";
import { verifyTenantToken } from "./saas-auth";

const router: IRouter = Router();

/* ─── Auth helper ─── */
function getTenantId(req: { headers: Record<string, string | undefined> }): number | null {
  const auth = req.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) return null;
  const p = verifyTenantToken(auth.slice(7));
  return p ? p.tenantId : null;
}

const CreateBillItemBody = z.object({
  productId: z.number().int().positive(),
  quantity: z.number().int().positive(),
  unitCost: z.number().min(0).default(0),
});

const CreatePurchaseBillBody = z.object({
  billNumber: z.string().min(1),
  supplier: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(["draft", "confirmed"]).default("draft"),
  items: z.array(CreateBillItemBody).min(1),
});

async function enrichBill(bill: typeof purchaseBillsTable.$inferSelect, itemCountOverride?: number) {
  const [{ n }] = await db
    .select({ n: count() })
    .from(purchaseBillItemsTable)
    .where(eq(purchaseBillItemsTable.billId, bill.id));

  return {
    ...bill,
    supplier: bill.supplier ?? undefined,
    notes: bill.notes ?? undefined,
    itemCount: itemCountOverride ?? Number(n),
  };
}

async function enrichBillWithItems(bill: typeof purchaseBillsTable.$inferSelect) {
  const items = await db
    .select()
    .from(purchaseBillItemsTable)
    .where(eq(purchaseBillItemsTable.billId, bill.id));

  const enrichedItems = await Promise.all(
    items.map(async (item) => {
      const [product] = await db
        .select({ name: productsTable.name })
        .from(productsTable)
        .where(eq(productsTable.id, item.productId));
      return {
        ...item,
        productName: product?.name ?? "Unknown",
      };
    }),
  );

  return {
    ...bill,
    supplier: bill.supplier ?? undefined,
    notes: bill.notes ?? undefined,
    itemCount: items.length,
    items: enrichedItems,
  };
}

router.get("/purchase-bills", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const bills = await db
    .select()
    .from(purchaseBillsTable)
    .where(eq(purchaseBillsTable.tenantId, tenantId))
    .orderBy(desc(purchaseBillsTable.createdAt));

  const enriched = await Promise.all(bills.map((b) => enrichBill(b)));
  res.json(enriched);
});

router.post("/purchase-bills", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = CreatePurchaseBillBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { billNumber, supplier, notes, status, items } = parsed.data;

  for (const item of items) {
    const [product] = await db.select({ id: productsTable.id }).from(productsTable)
      .where(and(eq(productsTable.id, item.productId), eq(productsTable.tenantId, tenantId)));
    if (!product) {
      res.status(400).json({ error: `Product ${item.productId} not found` });
      return;
    }
  }

  const totalCost = items.reduce((sum, item) => sum + item.unitCost * item.quantity, 0);

  const [bill] = await db
    .insert(purchaseBillsTable)
    .values({ tenantId, billNumber, supplier: supplier ?? null, notes: notes ?? null, status, totalCost })
    .returning();

  await db.insert(purchaseBillItemsTable).values(
    items.map((item) => ({
      billId: bill.id,
      productId: item.productId,
      quantity: item.quantity,
      unitCost: item.unitCost,
      totalCost: item.unitCost * item.quantity,
    })),
  );

  if (status === "confirmed") {
    for (const item of items) {
      const [product] = await db.select().from(productsTable)
        .where(and(eq(productsTable.id, item.productId), eq(productsTable.tenantId, tenantId)));
      if (product) {
        const newBalance = product.stockCount + item.quantity;
        await db.update(productsTable)
          .set({ stockCount: newBalance, inStock: true })
          .where(and(eq(productsTable.id, item.productId), eq(productsTable.tenantId, tenantId)));
        await db.insert(stockMovementsTable).values({
          tenantId,
          productId: item.productId,
          type: "purchase_bill",
          quantity: item.quantity,
          balanceAfter: newBalance,
          referenceType: "purchase_bill",
          referenceId: bill.id,
          notes: `Purchase Bill – ${bill.billNumber}`,
        });
      }
    }
  }

  const enriched = await enrichBill(bill, items.length);
  res.status(201).json(enriched);
});

router.get("/purchase-bills/:id", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  if (Array.isArray(req.params.id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [bill] = await db.select().from(purchaseBillsTable)
    .where(and(eq(purchaseBillsTable.id, id), eq(purchaseBillsTable.tenantId, tenantId)));

  if (!bill) { res.status(404).json({ error: "Bill not found" }); return; }

  const enriched = await enrichBillWithItems(bill);
  res.json(enriched);
});

router.post("/purchase-bills/:id/confirm", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  if (Array.isArray(req.params.id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [bill] = await db.select().from(purchaseBillsTable)
    .where(and(eq(purchaseBillsTable.id, id), eq(purchaseBillsTable.tenantId, tenantId)));

  if (!bill) { res.status(404).json({ error: "Bill not found" }); return; }
  if (bill.status === "confirmed") { res.status(400).json({ error: "Bill already confirmed" }); return; }

  const items = await db.select().from(purchaseBillItemsTable).where(eq(purchaseBillItemsTable.billId, id));

  for (const item of items) {
    const [product] = await db.select().from(productsTable)
      .where(and(eq(productsTable.id, item.productId), eq(productsTable.tenantId, tenantId)));
    if (product) {
      const newBalance = product.stockCount + item.quantity;
      await db.update(productsTable)
        .set({ stockCount: newBalance, inStock: true })
        .where(and(eq(productsTable.id, item.productId), eq(productsTable.tenantId, tenantId)));
      await db.insert(stockMovementsTable).values({
        tenantId,
        productId: item.productId,
        type: "purchase_bill",
        quantity: item.quantity,
        balanceAfter: newBalance,
        referenceType: "purchase_bill",
        referenceId: id,
        notes: `Purchase Bill confirmed`,
      });
    }
  }

  const [updated] = await db.update(purchaseBillsTable).set({ status: "confirmed" })
    .where(and(eq(purchaseBillsTable.id, id), eq(purchaseBillsTable.tenantId, tenantId)))
    .returning();

  const enriched = await enrichBillWithItems(updated);
  res.json(enriched);
});

router.delete("/purchase-bills/:id", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  if (Array.isArray(req.params.id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  await db.delete(purchaseBillsTable)
    .where(and(eq(purchaseBillsTable.id, id), eq(purchaseBillsTable.tenantId, tenantId)));

  res.status(204).send();
});

export default router;
