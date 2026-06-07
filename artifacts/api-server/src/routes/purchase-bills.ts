import { Router, type IRouter } from "express";
import { and, eq, desc, count, inArray } from "drizzle-orm";
import {
  db,
  purchaseBillsTable,
  purchaseBillItemsTable,
  productsTable,
  productBatchesTable,
  stockMovementsTable,
  journalEntriesTable,
  journalEntryLinesTable,
} from "@workspace/db";
import { z } from "zod";
import { verifyTenantToken } from "./saas-auth";
import { getAccountIdByCode } from "./accounting";

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
  // Per-line input-tax rate (%). Omit/null = inherit bill default.
  taxRate: z.number().min(0).max(100).nullable().optional(),
  // Batch / lot tracking — only required when the product has
  // `trackBatches = true`. Validated server-side after product lookup.
  batchNumber: z.string().min(1).optional().nullable(),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

const CreatePurchaseBillBody = z.object({
  billNumber: z.string().min(1),
  supplier: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(["draft", "confirmed"]).default("draft"),
  defaultTaxRate: z.number().min(0).max(100).default(0),
  // "exclusive" (default): entered unit cost is net, tax added on top.
  // "inclusive": entered unit cost already includes tax; the server
  // back-computes the net cost so unitCost is always STORED net.
  taxMode: z.enum(["exclusive", "inclusive"]).default("exclusive"),
  items: z.array(CreateBillItemBody).min(1),
});

type BillCostChange = {
  productId: number;
  productName: string;
  oldCost: number | null;
  newCost: number;
  currentPrice: number;
  suggestedPrice: number;
};

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Confirm a bill: bump stock, update product cost (only when higher),
 * post the journal entry, and return the list of products whose cost
 * went up so the UI can prompt for a selling-price adjustment.
 *
 * All work runs inside a single transaction (`tx`) so a mid-flight failure
 * never leaves stock partially updated or a half-posted journal entry.
 * Repairs legacy drafts whose `subtotal`/`taxTotal` were never persisted by
 * recomputing them from the items before posting the journal entry.
 * Cost-change rows are aggregated per `productId` — a bill with the same
 * product on multiple lines emits at most one prompt row for that product.
 */
async function confirmBillSideEffects(
  tx: Tx,
  tenantId: number,
  bill: typeof purchaseBillsTable.$inferSelect,
  items: (typeof purchaseBillItemsTable.$inferSelect)[],
): Promise<BillCostChange[]> {
  const cents = (n: number) => Math.round(n * 100) / 100;

  // Legacy drafts may have zero subtotal/taxTotal but a populated totalCost.
  // Recompute from items so the JE balances; persist the repair to the bill.
  let subtotal = bill.subtotal;
  let taxTotal = bill.taxTotal;
  if ((subtotal <= 0 || taxTotal <= 0) && items.length > 0) {
    const computedSub = cents(items.reduce((s, i) => s + i.quantity * i.unitCost, 0));
    const computedTax = cents(items.reduce((s, i) => s + (i.taxAmount ?? 0), 0));
    if (computedSub + computedTax > 0) {
      subtotal = computedSub;
      taxTotal = computedTax;
    }
  }
  const totalCost = cents(subtotal + taxTotal);

  // Aggregate items by productId so a product appearing on multiple lines
  // is treated as one cost-change candidate (single price prompt + update).
  const grouped = new Map<number, { quantity: number; weightedCostSum: number; maxUnitCost: number }>();
  for (const item of items) {
    const g = grouped.get(item.productId) ?? { quantity: 0, weightedCostSum: 0, maxUnitCost: 0 };
    g.quantity += item.quantity;
    g.weightedCostSum += item.quantity * item.unitCost;
    g.maxUnitCost = Math.max(g.maxUnitCost, item.unitCost);
    grouped.set(item.productId, g);
  }

  const costChanges: BillCostChange[] = [];

  for (const [productId, g] of grouped) {
    const [product] = await tx
      .select()
      .from(productsTable)
      .where(and(eq(productsTable.id, productId), eq(productsTable.tenantId, tenantId)));
    if (!product) continue;

    // For batch-tracked products, create one product_batches row per
    // purchase-bill line so different lots (e.g. different expiry dates)
    // stay separate. Aggregation above only drives cost/stockCount updates.
    if (product.trackBatches) {
      const productLines = items.filter((i) => i.productId === productId);
      const batchRows = productLines.map((line) => ({
        tenantId,
        productId,
        batchNumber: line.batchNumber ?? null,
        expiryDate: line.expiryDate ?? null,
        quantityRemaining: line.quantity,
        sourceType: "purchase",
        purchaseBillId: bill.id,
      }));
      if (batchRows.length > 0) {
        await tx.insert(productBatchesTable).values(batchRows);
      }
    }

    const newBalance = product.stockCount + g.quantity;
    const oldCost = product.costPrice;
    // Use the highest unit cost across the lines so the "cost going up"
    // check reflects the worst case; the standing costPrice should never
    // be lowered by a cheap one-off PO.
    const effectiveCost = g.maxUnitCost;
    const costGoingUp = effectiveCost > (oldCost ?? 0) && effectiveCost > 0;

    await tx
      .update(productsTable)
      .set({
        stockCount: newBalance,
        inStock: true,
        ...(costGoingUp ? { costPrice: effectiveCost } : {}),
      })
      .where(and(eq(productsTable.id, productId), eq(productsTable.tenantId, tenantId)));

    await tx.insert(stockMovementsTable).values({
      tenantId,
      productId,
      type: "purchase_bill",
      quantity: g.quantity,
      balanceAfter: newBalance,
      referenceType: "purchase_bill",
      referenceId: bill.id,
      notes: `Purchase Bill – ${bill.billNumber}`,
    });

    if (costGoingUp) {
      const currentPrice = product.price;
      // Preserve the previous margin. If we have no prior cost or the price
      // is below cost, default to a 30% markup so the user has a sane number
      // to edit instead of zero.
      let suggestedPrice = effectiveCost * 1.3;
      if (oldCost && oldCost > 0 && currentPrice > oldCost) {
        const marginPct = (currentPrice - oldCost) / currentPrice; // selling-price margin
        if (marginPct < 0.999) {
          suggestedPrice = effectiveCost / (1 - marginPct);
        }
      }
      costChanges.push({
        productId: product.id,
        productName: product.name,
        oldCost,
        newCost: effectiveCost,
        currentPrice,
        suggestedPrice: cents(suggestedPrice),
      });
    }
  }

  // Repair the bill row if we recomputed totals above so subsequent reads
  // (and any retried confirm) see the corrected figures.
  if (subtotal !== bill.subtotal || taxTotal !== bill.taxTotal || totalCost !== bill.totalCost) {
    await tx
      .update(purchaseBillsTable)
      .set({ subtotal, taxTotal, totalCost })
      .where(eq(purchaseBillsTable.id, bill.id));
  }

  // Post the journal entry so input tax nets against output tax on reports.
  // Skip silently if the chart of accounts is missing — bill still confirms.
  const inventoryAcct = await getAccountIdByCode(tenantId, "1200");
  const inputTaxAcct = await getAccountIdByCode(tenantId, "1250");
  const apAcct = await getAccountIdByCode(tenantId, "2000");
  if (inventoryAcct && apAcct && totalCost > 0) {
    const lines: { accountId: number; description: string; debit: number; credit: number }[] = [];
    if (subtotal > 0) {
      lines.push({
        accountId: inventoryAcct,
        description: "Inventory received",
        debit: subtotal,
        credit: 0,
      });
    }
    if (taxTotal > 0 && inputTaxAcct) {
      lines.push({
        accountId: inputTaxAcct,
        description: "Input tax (recoverable)",
        debit: taxTotal,
        credit: 0,
      });
    } else if (taxTotal > 0 && !inputTaxAcct) {
      // No input-tax account — fold tax into inventory so the entry balances.
      lines.push({
        accountId: inventoryAcct,
        description: "Input tax (no recoverable account; capitalised to inventory)",
        debit: taxTotal,
        credit: 0,
      });
    } else if (subtotal <= 0) {
      // No items breakdown at all — fall back to a single inventory debit
      // for the full amount so the entry still balances.
      lines.push({
        accountId: inventoryAcct,
        description: "Inventory received",
        debit: totalCost,
        credit: 0,
      });
    }
    lines.push({
      accountId: apAcct,
      description: bill.supplier ?? "Supplier",
      debit: 0,
      credit: totalCost,
    });

    // Sanity: only post if the entry balances. Guards against any rounding
    // drift introduced by the legacy-draft repair path.
    const debitSum = cents(lines.reduce((s, l) => s + l.debit, 0));
    const creditSum = cents(lines.reduce((s, l) => s + l.credit, 0));
    if (debitSum === creditSum && debitSum > 0) {
      const [entry] = await tx
        .insert(journalEntriesTable)
        .values({
          tenantId,
          date: new Date(),
          description: `Purchase Bill ${bill.billNumber}${bill.supplier ? ` – ${bill.supplier}` : ""}`,
          reference: bill.billNumber,
          type: "purchase",
        })
        .returning();
      await tx
        .insert(journalEntryLinesTable)
        .values(lines.map((l) => ({ ...l, entryId: entry.id })));
    }
  }

  return costChanges;
}

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

  const { billNumber, supplier, notes, status, defaultTaxRate, taxMode, items } = parsed.data;

  for (const item of items) {
    const [product] = await db.select({
      id: productsTable.id,
      trackBatches: productsTable.trackBatches,
      name: productsTable.name,
    }).from(productsTable)
      .where(and(eq(productsTable.id, item.productId), eq(productsTable.tenantId, tenantId)));
    if (!product) {
      res.status(400).json({ error: `Product ${item.productId} not found` });
      return;
    }
    if (product.trackBatches && !item.batchNumber) {
      res.status(400).json({ error: `Product "${product.name}" requires a batch/lot number` });
      return;
    }
  }

  // Compute per-line and bill totals. Round to cents so the journal entry
  // balances cleanly to two decimal places.
  const cents = (n: number) => Math.round(n * 100) / 100;
  const computed = items.map((item) => {
    const effectiveRate = item.taxRate ?? defaultTaxRate;
    if (taxMode === "inclusive") {
      // The entered unit cost already includes tax, so the entered GROSS line
      // total is authoritative. Round the gross first, then back out the net
      // subtotal and derive tax as (gross - net) so the persisted split always
      // sums back to exactly what the user entered (no ±0.01 drift).
      const lineTotal = cents(item.quantity * item.unitCost);
      const lineSubtotal =
        effectiveRate > 0 ? cents(lineTotal / (1 + effectiveRate / 100)) : lineTotal;
      const lineTax = cents(lineTotal - lineSubtotal);
      // Store net unit cost so the confirm flow (qty * unitCost) reproduces the
      // net subtotal exactly. unitCost is ALWAYS stored net in both modes.
      const netUnitCost = item.quantity > 0 ? lineSubtotal / item.quantity : item.unitCost;
      return { ...item, netUnitCost, lineSubtotal, lineTax, lineTotal };
    }
    // Exclusive (default): entered unit cost is net, tax added on top.
    const netUnitCost = item.unitCost;
    const lineSubtotal = cents(item.quantity * netUnitCost);
    const lineTax = cents((lineSubtotal * effectiveRate) / 100);
    return { ...item, netUnitCost, lineSubtotal, lineTax, lineTotal: cents(lineSubtotal + lineTax) };
  });
  const subtotal = cents(computed.reduce((s, i) => s + i.lineSubtotal, 0));
  const taxTotal = cents(computed.reduce((s, i) => s + i.lineTax, 0));
  const totalCost = cents(subtotal + taxTotal);

  // Insert bill + items + (optional) side effects atomically. If anything
  // throws mid-way nothing is persisted, so a retry cannot double-apply
  // stock movements or journal entries.
  const { bill, costChanges } = await db.transaction(async (tx) => {
    const [createdBill] = await tx
      .insert(purchaseBillsTable)
      .values({
        tenantId,
        billNumber,
        supplier: supplier ?? null,
        notes: notes ?? null,
        status,
        defaultTaxRate,
        taxMode,
        subtotal,
        taxTotal,
        totalCost,
      })
      .returning();

    const insertedItems = await tx
      .insert(purchaseBillItemsTable)
      .values(
        computed.map((item) => ({
          billId: createdBill.id,
          productId: item.productId,
          quantity: item.quantity,
          unitCost: item.netUnitCost,
          taxRate: item.taxRate ?? null,
          taxAmount: item.lineTax,
          totalCost: item.lineTotal,
          batchNumber: item.batchNumber ?? null,
          expiryDate: item.expiryDate ?? null,
        })),
      )
      .returning();

    let changes: BillCostChange[] = [];
    if (status === "confirmed") {
      changes = await confirmBillSideEffects(tx, tenantId, createdBill, insertedItems);
    }
    return { bill: createdBill, costChanges: changes };
  });

  const enriched = await enrichBill(bill, items.length);
  res.status(201).json({ ...enriched, costChanges });
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

  // Side effects + status flip in one transaction. The status='draft'
  // guard on the UPDATE (below) makes the transition atomic — two
  // concurrent confirms cannot both succeed.
  type ConfirmResult = { updated: typeof bill | null; costChanges: BillCostChange[]; errorMessage?: string };
  const result: ConfirmResult = await db.transaction(async (tx): Promise<ConfirmResult> => {
    const [locked] = await tx.select().from(purchaseBillsTable)
      .where(and(eq(purchaseBillsTable.id, id), eq(purchaseBillsTable.tenantId, tenantId)));
    if (!locked || locked.status === "confirmed") {
      return { updated: null, costChanges: [] };
    }
    const items = await tx.select().from(purchaseBillItemsTable).where(eq(purchaseBillItemsTable.billId, id));

    // Revalidate against current product settings — a draft created
    // before `trackBatches` was toggled on could otherwise confirm
    // without a batch number. (Create-path validation lives at
    // line ~342.)
    const itemPids = Array.from(new Set(items.map(i => i.productId)));
    if (itemPids.length > 0) {
      const prods = await tx.select({ id: productsTable.id, trackBatches: productsTable.trackBatches, name: productsTable.name })
        .from(productsTable)
        .where(and(inArray(productsTable.id, itemPids), eq(productsTable.tenantId, tenantId)));
      const trackMap = new Map(prods.map(p => [p.id, p]));
      for (const it of items) {
        const p = trackMap.get(it.productId);
        if (p?.trackBatches && !it.batchNumber) {
          throw new Error(`Batch number required for "${p.name}" — toggle was enabled after this draft was created. Edit the bill and add a batch number.`);
        }
      }
    }

    const changes = await confirmBillSideEffects(tx, tenantId, locked, items);
    // Atomic transition: only flip the row if it's STILL in draft.
    const [u] = await tx.update(purchaseBillsTable).set({ status: "confirmed" })
      .where(and(
        eq(purchaseBillsTable.id, id),
        eq(purchaseBillsTable.tenantId, tenantId),
        eq(purchaseBillsTable.status, "draft"),
      ))
      .returning();
    if (!u) {
      throw new Error("Bill already confirmed by another request");
    }
    return { updated: u, costChanges: changes };
  }).catch((err: unknown): ConfirmResult => ({
    updated: null,
    costChanges: [],
    errorMessage: err instanceof Error ? err.message : "Bill confirm failed",
  }));

  const { updated, costChanges, errorMessage } = result;
  if (!updated) {
    res.status(400).json({ error: errorMessage ?? "Bill already confirmed" });
    return;
  }

  const enriched = await enrichBillWithItems(updated);
  res.json({ ...enriched, costChanges });
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
