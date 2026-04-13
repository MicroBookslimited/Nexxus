import { Router, type IRouter } from "express";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import {
  db, vendorsTable, rawMaterialPurchasesTable, rawMaterialPurchaseItemsTable,
  unitsOfMeasurementTable, ingredientsTable, ingredientUsageLogsTable,
  apEntriesTable,
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

/* ─────────────────────────────────────────────
   UNIT OF MEASUREMENT
───────────────────────────────────────────── */

router.get("/units-of-measurement", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const rows = await db
    .select()
    .from(unitsOfMeasurementTable)
    .where(
      sql`(${unitsOfMeasurementTable.tenantId} = 0 OR ${unitsOfMeasurementTable.tenantId} = ${tenantId}) AND ${unitsOfMeasurementTable.isActive} = true`
    )
    .orderBy(unitsOfMeasurementTable.baseUnit, asc(unitsOfMeasurementTable.name));

  res.json(rows);
});

const CreateUnitBody = z.object({
  name: z.string().min(1),
  symbol: z.string().min(1),
  baseUnit: z.enum(["pcs", "g", "ml"]),
  conversionFactor: z.number().positive(),
});

router.post("/units-of-measurement", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = CreateUnitBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [row] = await db.insert(unitsOfMeasurementTable).values({ ...parsed.data, tenantId, isSystem: false }).returning();
  res.status(201).json(row);
});

router.delete("/units-of-measurement/:id", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  await db.update(unitsOfMeasurementTable)
    .set({ isActive: false })
    .where(and(eq(unitsOfMeasurementTable.id, id), eq(unitsOfMeasurementTable.tenantId, tenantId)));

  res.json({ success: true });
});

/* ─────────────────────────────────────────────
   VENDORS
───────────────────────────────────────────── */

const VendorBody = z.object({
  name: z.string().min(1),
  contactName: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  address: z.string().optional(),
  taxId: z.string().optional(),
  currency: z.string().default("JMD"),
  paymentTermsDays: z.number().int().min(0).default(30),
  creditLimit: z.number().min(0).default(0),
  notes: z.string().optional(),
});

router.get("/vendors", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const vendors = await db.select().from(vendorsTable)
    .where(and(eq(vendorsTable.tenantId, tenantId), eq(vendorsTable.isActive, true)))
    .orderBy(asc(vendorsTable.name));

  // Add current balance from AP entries for each vendor
  const balances = await db.select({
    vendorId: apEntriesTable.vendorId,
    balance: sql<number>`COALESCE(SUM(CASE WHEN status NOT IN ('paid','cancelled') THEN amount_balance ELSE 0 END), 0)`,
  }).from(apEntriesTable)
    .where(eq(apEntriesTable.tenantId, tenantId))
    .groupBy(apEntriesTable.vendorId);

  const balanceMap = Object.fromEntries(balances.map(b => [b.vendorId, b.balance]));
  const enriched = vendors.map(v => ({ ...v, currentBalance: balanceMap[v.id] ?? 0 }));

  res.json(enriched);
});

router.get("/vendors/:id", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [vendor] = await db.select().from(vendorsTable)
    .where(and(eq(vendorsTable.id, id), eq(vendorsTable.tenantId, tenantId)));
  if (!vendor) { res.status(404).json({ error: "Not found" }); return; }

  const purchases = await db.select({
    id: rawMaterialPurchasesTable.id,
    purchaseNumber: rawMaterialPurchasesTable.purchaseNumber,
    status: rawMaterialPurchasesTable.status,
    paymentType: rawMaterialPurchasesTable.paymentType,
    purchaseDate: rawMaterialPurchasesTable.purchaseDate,
    totalCost: rawMaterialPurchasesTable.totalCost,
    currency: rawMaterialPurchasesTable.currency,
  }).from(rawMaterialPurchasesTable)
    .where(and(eq(rawMaterialPurchasesTable.vendorId, id), eq(rawMaterialPurchasesTable.tenantId, tenantId)))
    .orderBy(desc(rawMaterialPurchasesTable.purchaseDate))
    .limit(20);

  const [apBalance] = await db.select({
    balance: sql<number>`COALESCE(SUM(CASE WHEN status NOT IN ('paid','cancelled') THEN amount_balance ELSE 0 END), 0)`,
    totalOwed: sql<number>`COALESCE(SUM(amount_total), 0)`,
    totalPaid: sql<number>`COALESCE(SUM(amount_paid), 0)`,
  }).from(apEntriesTable)
    .where(and(eq(apEntriesTable.vendorId, id), eq(apEntriesTable.tenantId, tenantId)));

  res.json({ ...vendor, recentPurchases: purchases, currentBalance: apBalance?.balance ?? 0, totalOwed: apBalance?.totalOwed ?? 0, totalPaid: apBalance?.totalPaid ?? 0 });
});

router.post("/vendors", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = VendorBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [row] = await db.insert(vendorsTable).values({ ...parsed.data, tenantId }).returning();
  res.status(201).json(row);
});

router.patch("/vendors/:id", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = VendorBody.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [row] = await db.update(vendorsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(vendorsTable.id, id), eq(vendorsTable.tenantId, tenantId)))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.delete("/vendors/:id", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  await db.update(vendorsTable)
    .set({ isActive: false, updatedAt: new Date() })
    .where(and(eq(vendorsTable.id, id), eq(vendorsTable.tenantId, tenantId)));

  res.json({ success: true });
});

/* ─────────────────────────────────────────────
   RAW MATERIAL PURCHASES
───────────────────────────────────────────── */

const PurchaseItemBody = z.object({
  ingredientId: z.number().int().positive(),
  purchaseUnit: z.string().min(1),
  purchaseQty: z.number().positive(),
  conversionFactor: z.number().positive(),
  baseUnit: z.enum(["pcs", "g", "ml"]),
  unitCost: z.number().min(0).default(0),
});

const CreatePurchaseBody = z.object({
  vendorId: z.number().int().positive().optional(),
  purchaseDate: z.string().optional(),
  dueDate: z.string().optional(),
  invoiceRef: z.string().optional(),
  notes: z.string().optional(),
  paymentType: z.enum(["cash", "credit"]).default("credit"),
  currency: z.string().default("JMD"),
  exchangeRate: z.number().positive().default(1),
  items: z.array(PurchaseItemBody).min(1),
});

async function enrichPurchase(p: typeof rawMaterialPurchasesTable.$inferSelect) {
  const items = await db
    .select({
      id: rawMaterialPurchaseItemsTable.id,
      purchaseId: rawMaterialPurchaseItemsTable.purchaseId,
      ingredientId: rawMaterialPurchaseItemsTable.ingredientId,
      ingredientName: ingredientsTable.name,
      ingredientUnit: ingredientsTable.unit,
      purchaseUnit: rawMaterialPurchaseItemsTable.purchaseUnit,
      purchaseQty: rawMaterialPurchaseItemsTable.purchaseQty,
      conversionFactor: rawMaterialPurchaseItemsTable.conversionFactor,
      baseUnit: rawMaterialPurchaseItemsTable.baseUnit,
      baseQty: rawMaterialPurchaseItemsTable.baseQty,
      unitCost: rawMaterialPurchaseItemsTable.unitCost,
      totalCost: rawMaterialPurchaseItemsTable.totalCost,
    })
    .from(rawMaterialPurchaseItemsTable)
    .innerJoin(ingredientsTable, eq(rawMaterialPurchaseItemsTable.ingredientId, ingredientsTable.id))
    .where(eq(rawMaterialPurchaseItemsTable.purchaseId, p.id));

  let vendorName: string | null = null;
  if (p.vendorId) {
    const [v] = await db.select({ name: vendorsTable.name }).from(vendorsTable).where(eq(vendorsTable.id, p.vendorId));
    vendorName = v?.name ?? null;
  }

  return { ...p, items, vendorName };
}

router.get("/raw-material-purchases", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const rows = await db.select().from(rawMaterialPurchasesTable)
    .where(eq(rawMaterialPurchasesTable.tenantId, tenantId))
    .orderBy(desc(rawMaterialPurchasesTable.purchaseDate));

  const enriched = await Promise.all(rows.map(enrichPurchase));
  res.json(enriched);
});

router.get("/raw-material-purchases/:id", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [p] = await db.select().from(rawMaterialPurchasesTable)
    .where(and(eq(rawMaterialPurchasesTable.id, id), eq(rawMaterialPurchasesTable.tenantId, tenantId)));
  if (!p) { res.status(404).json({ error: "Not found" }); return; }

  res.json(await enrichPurchase(p));
});

router.post("/raw-material-purchases", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = CreatePurchaseBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { vendorId, purchaseDate, dueDate, invoiceRef, notes, paymentType, currency, exchangeRate, items } = parsed.data;

  const totalCost = items.reduce((s, i) => s + i.purchaseQty * i.unitCost, 0);
  const totalCostJmd = totalCost * exchangeRate;

  const [[{ n }]] = await Promise.all([
    db.select({ n: sql<number>`count(*)` }).from(rawMaterialPurchasesTable)
      .where(eq(rawMaterialPurchasesTable.tenantId, tenantId)),
  ]);
  const purchaseNumber = `PO-${String(Number(n) + 1).padStart(5, "0")}`;

  const [purchase] = await db.insert(rawMaterialPurchasesTable).values({
    tenantId,
    purchaseNumber,
    vendorId: vendorId ?? null,
    purchaseDate: purchaseDate ? new Date(purchaseDate) : new Date(),
    dueDate: dueDate ? new Date(dueDate) : null,
    invoiceRef: invoiceRef ?? null,
    notes: notes ?? null,
    paymentType,
    currency,
    exchangeRate,
    totalCost,
    totalCostJmd,
    status: "draft",
  }).returning();

  const itemRows = items.map(i => ({
    purchaseId: purchase.id,
    ingredientId: i.ingredientId,
    purchaseUnit: i.purchaseUnit,
    purchaseQty: i.purchaseQty,
    conversionFactor: i.conversionFactor,
    baseUnit: i.baseUnit,
    baseQty: i.purchaseQty * i.conversionFactor,
    unitCost: i.unitCost,
    totalCost: i.purchaseQty * i.unitCost,
  }));

  await db.insert(rawMaterialPurchaseItemsTable).values(itemRows);

  res.status(201).json(await enrichPurchase(purchase));
});

/* POST /raw-material-purchases/:id/confirm
   Confirms purchase, updates ingredient stock, and auto-creates AP entry for credit purchases. */
router.post("/raw-material-purchases/:id/confirm", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [p] = await db.select().from(rawMaterialPurchasesTable)
    .where(and(eq(rawMaterialPurchasesTable.id, id), eq(rawMaterialPurchasesTable.tenantId, tenantId)));
  if (!p) { res.status(404).json({ error: "Not found" }); return; }
  if (p.status === "confirmed") { res.status(400).json({ error: "Already confirmed" }); return; }

  const items = await db.select().from(rawMaterialPurchaseItemsTable)
    .where(eq(rawMaterialPurchaseItemsTable.purchaseId, id));

  // 1. Update ingredient stock
  for (const item of items) {
    await db.update(ingredientsTable)
      .set({ stockQuantity: sql`stock_quantity + ${item.baseQty}`, updatedAt: new Date() })
      .where(and(eq(ingredientsTable.id, item.ingredientId), eq(ingredientsTable.tenantId, tenantId)));

    await db.insert(ingredientUsageLogsTable).values({
      tenantId,
      ingredientId: item.ingredientId,
      quantity: item.baseQty,
      reason: `Purchase: ${p.purchaseNumber} (${item.purchaseQty} ${item.purchaseUnit} → ${item.baseQty} ${item.baseUnit})`,
      referenceId: p.id,
      referenceType: "raw_material_purchase",
    });
  }

  // 2. Auto-create AP entry for credit purchases
  const amountJmd = (p.totalCostJmd ?? 0) > 0 ? p.totalCostJmd! : p.totalCost;
  if (p.paymentType === "credit" && amountJmd > 0) {
    // Determine due date: use purchase due date, or vendor terms, or default 30 days
    let dueDate = p.dueDate ? new Date(p.dueDate) : null;
    if (!dueDate && p.vendorId) {
      const [vendor] = await db.select({ paymentTermsDays: vendorsTable.paymentTermsDays })
        .from(vendorsTable).where(eq(vendorsTable.id, p.vendorId));
      const days = vendor?.paymentTermsDays ?? 30;
      dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + days);
    }
    if (!dueDate) {
      dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 30);
    }

    await db.insert(apEntriesTable).values({
      tenantId,
      vendorId: p.vendorId,
      purchaseId: p.id,
      entryDate: new Date(),
      dueDate,
      invoiceRef: p.invoiceRef,
      currency: p.currency ?? "JMD",
      exchangeRate: p.exchangeRate ?? 1,
      amountTotal: amountJmd,
      amountPaid: 0,
      amountBalance: amountJmd,
      status: "pending",
      notes: `Auto-created from purchase ${p.purchaseNumber}`,
    });
  } else if (p.paymentType === "cash" && amountJmd > 0) {
    // Cash purchase: create an AP entry already marked paid
    await db.insert(apEntriesTable).values({
      tenantId,
      vendorId: p.vendorId,
      purchaseId: p.id,
      entryDate: new Date(),
      dueDate: new Date(),
      invoiceRef: p.invoiceRef,
      currency: p.currency ?? "JMD",
      exchangeRate: p.exchangeRate ?? 1,
      amountTotal: amountJmd,
      amountPaid: amountJmd,
      amountBalance: 0,
      status: "paid",
      notes: `Cash purchase ${p.purchaseNumber} — auto-paid`,
    });
  }

  const [updated] = await db.update(rawMaterialPurchasesTable)
    .set({ status: "confirmed", updatedAt: new Date() })
    .where(eq(rawMaterialPurchasesTable.id, id))
    .returning();

  res.json(await enrichPurchase(updated));
});

// DELETE (cancel) a draft purchase
router.delete("/raw-material-purchases/:id", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [p] = await db.select().from(rawMaterialPurchasesTable)
    .where(and(eq(rawMaterialPurchasesTable.id, id), eq(rawMaterialPurchasesTable.tenantId, tenantId)));
  if (!p) { res.status(404).json({ error: "Not found" }); return; }
  if (p.status === "confirmed") { res.status(400).json({ error: "Cannot delete a confirmed purchase" }); return; }

  await db.delete(rawMaterialPurchasesTable).where(eq(rawMaterialPurchasesTable.id, id));
  res.json({ success: true });
});

export default router;
