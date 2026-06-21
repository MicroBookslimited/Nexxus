import { Router, type IRouter } from "express";
import { and, eq, ne, desc, count, inArray, sql } from "drizzle-orm";
import {
  db,
  supplierReturnsTable,
  supplierReturnItemsTable,
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

function getTenantId(req: { headers: Record<string, string | undefined> }): number | null {
  const auth = req.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) return null;
  const p = verifyTenantToken(auth.slice(7));
  return p ? p.tenantId : null;
}

const cents = (n: number) => Math.round(n * 100) / 100;

/* ─── Validation ──────────────────────────────────────────────────────── */

const CreateReturnItemBody = z.object({
  productId: z.number().int().positive(),
  // For bill-linked returns: original purchase_bill_items row. Server
  // validates the line belongs to the chosen bill and that quantity
  // doesn't exceed (received - already-returned).
  purchaseBillItemId: z.number().int().positive().nullable().optional(),
  quantity: z.number().int().positive(),
  unitCost: z.number().min(0).default(0),
  taxRate: z.number().min(0).max(100).nullable().optional(),
  // For batch-tracked products: which lot to return from. The lot is
  // decremented by `quantity` on confirm. Optional for the draft; the
  // confirm path enforces presence when the product is batch-tracked.
  batchId: z.number().int().positive().nullable().optional(),
  notes: z.string().optional().nullable(),
});

const CreateSupplierReturnBody = z.object({
  returnNumber: z.string().min(1),
  supplier: z.string().optional().nullable(),
  // null => standalone debit note (no bill reference)
  purchaseBillId: z.number().int().positive().nullable().optional(),
  notes: z.string().optional().nullable(),
  status: z.enum(["draft", "confirmed"]).default("draft"),
  defaultTaxRate: z.number().min(0).max(100).default(0),
  items: z.array(CreateReturnItemBody).min(1),
});

/* ─── Side-effects helper ─────────────────────────────────────────────── */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Confirm a supplier return: decrement stock, decrement chosen batches,
 * write stock_movements, and post the reversing JE.
 *
 * JE shape (mirror of the bill):
 *   Dr AP            totalAmount   (reduces what we owe supplier)
 *   Cr Inventory     subtotal      (reduces inventory at cost)
 *   Cr Input Tax     taxTotal      (recaptures previously-claimed input tax)
 *
 * Caller must run this inside a transaction.
 */
async function confirmReturnSideEffects(
  tx: Tx,
  tenantId: number,
  ret: typeof supplierReturnsTable.$inferSelect,
  items: (typeof supplierReturnItemsTable.$inferSelect)[],
): Promise<void> {
  // 1. Validate stock + batch availability and apply deductions.
  //    Aggregate by productId so the same product on multiple lines
  //    produces a single stock_movement entry.
  const grouped = new Map<number, number>();
  for (const item of items) {
    grouped.set(item.productId, (grouped.get(item.productId) ?? 0) + item.quantity);
  }

  // For bill-linked returns: re-check cap inside the tx so concurrent
  // confirms can't both pass a stale check. We sum *other* confirmed
  // returns (excluding this one — it's still draft right now) and
  // ensure each line's qty fits.
  if (ret.purchaseBillId != null) {
    const billLineIds = items
      .map((i) => i.purchaseBillItemId)
      .filter((x): x is number => x != null);
    if (billLineIds.length > 0) {
      const billLines = await tx
        .select()
        .from(purchaseBillItemsTable)
        .where(inArray(purchaseBillItemsTable.id, billLineIds));
      const billLineMap = new Map(billLines.map((l) => [l.id, l]));
      const prior = await tx
        .select({
          purchaseBillItemId: supplierReturnItemsTable.purchaseBillItemId,
          qty: supplierReturnItemsTable.quantity,
        })
        .from(supplierReturnItemsTable)
        .innerJoin(supplierReturnsTable, eq(supplierReturnItemsTable.returnId, supplierReturnsTable.id))
        .where(and(
          inArray(supplierReturnItemsTable.purchaseBillItemId, billLineIds),
          eq(supplierReturnsTable.tenantId, tenantId),
          eq(supplierReturnsTable.status, "confirmed"),
          // Exclude the current return itself — when "Confirm now" is used on
          // creation the row is already inserted as "confirmed" before this
          // check runs, so without this exclusion it counts its own qty as
          // already-returned and falsely reports available = 0.
          ne(supplierReturnsTable.id, ret.id),
        ));
      const priorMap = new Map<number, number>();
      for (const p of prior) {
        if (p.purchaseBillItemId == null) continue;
        priorMap.set(p.purchaseBillItemId, (priorMap.get(p.purchaseBillItemId) ?? 0) + p.qty);
      }
      for (const item of items) {
        if (item.purchaseBillItemId == null) continue;
        const bl = billLineMap.get(item.purchaseBillItemId);
        if (!bl) throw new Error(`Bill line ${item.purchaseBillItemId} no longer exists`);
        const cap = bl.quantity - (priorMap.get(bl.id) ?? 0);
        if (item.quantity > cap) {
          throw new Error(
            `Return exceeds returnable qty for bill line ${bl.id}: requested ${item.quantity}, available ${cap}`,
          );
        }
      }
    }
  }

  // Per-line batch decrement (must happen before stock_count so we can
  // error before mutating product state if a batch is short).
  // Use a guarded UPDATE so concurrent confirms can't drive the lot
  // negative (the WHERE includes quantityRemaining >= qty).
  for (const item of items) {
    const [product] = await tx
      .select()
      .from(productsTable)
      .where(and(eq(productsTable.id, item.productId), eq(productsTable.tenantId, tenantId)));
    if (!product) throw new Error(`Product ${item.productId} not found`);

    if (product.trackBatches) {
      if (!item.batchId) {
        throw new Error(`Product "${product.name}" requires a batch selection for return`);
      }
      // Tenant-scoped + product-scoped guard.
      const updated = await tx
        .update(productBatchesTable)
        .set({ quantityRemaining: sql`${productBatchesTable.quantityRemaining} - ${item.quantity}` })
        .where(and(
          eq(productBatchesTable.id, item.batchId),
          eq(productBatchesTable.tenantId, tenantId),
          eq(productBatchesTable.productId, item.productId),
          sql`${productBatchesTable.quantityRemaining} >= ${item.quantity}`,
        ))
        .returning({ id: productBatchesTable.id });
      if (updated.length === 0) {
        throw new Error(
          `Batch ${item.batchId} for "${product.name}" is unavailable or has insufficient quantity for ${item.quantity}`,
        );
      }
    }
  }

  // Now apply the stock_count decrement + stock_movement per product.
  // Use a guarded UPDATE to avoid lost updates under concurrent confirms.
  for (const [productId, qty] of grouped) {
    const updated = await tx
      .update(productsTable)
      .set({
        stockCount: sql`${productsTable.stockCount} - ${qty}`,
        inStock: sql`(${productsTable.stockCount} - ${qty}) > 0`,
      })
      .where(and(
        eq(productsTable.id, productId),
        eq(productsTable.tenantId, tenantId),
        sql`${productsTable.stockCount} >= ${qty}`,
      ))
      .returning({ id: productsTable.id, stockCount: productsTable.stockCount });
    if (updated.length === 0) {
      const [p] = await tx
        .select({ name: productsTable.name, stockCount: productsTable.stockCount })
        .from(productsTable)
        .where(and(eq(productsTable.id, productId), eq(productsTable.tenantId, tenantId)));
      throw new Error(
        `Insufficient stock for "${p?.name ?? productId}": have ${p?.stockCount ?? 0}, returning ${qty}`,
      );
    }
    const newBalance = updated[0].stockCount;

    await tx.insert(stockMovementsTable).values({
      tenantId,
      productId,
      type: "supplier_return",
      quantity: -qty,
      balanceAfter: newBalance,
      referenceType: "supplier_return",
      referenceId: ret.id,
      notes: `Supplier Return – ${ret.returnNumber}`,
    });
  }

  // 2. Post the reversing JE: Dr AP, Cr Inventory, Cr Input Tax.
  //    Skip silently if chart of accounts is missing (mirrors bill behaviour).
  const inventoryAcct = await getAccountIdByCode(tenantId, "1200");
  const inputTaxAcct = await getAccountIdByCode(tenantId, "1250");
  const apAcct = await getAccountIdByCode(tenantId, "2000");

  const subtotal = ret.subtotal;
  const taxTotal = ret.taxTotal;
  const totalAmount = ret.totalAmount;

  if (apAcct && inventoryAcct && totalAmount > 0) {
    const lines: { accountId: number; description: string; debit: number; credit: number }[] = [];
    lines.push({
      accountId: apAcct,
      description: ret.supplier ?? "Supplier",
      debit: totalAmount,
      credit: 0,
    });
    if (subtotal > 0) {
      lines.push({
        accountId: inventoryAcct,
        description: "Inventory returned to supplier",
        debit: 0,
        credit: subtotal,
      });
    }
    if (taxTotal > 0 && inputTaxAcct) {
      lines.push({
        accountId: inputTaxAcct,
        description: "Input tax reversed (return to supplier)",
        debit: 0,
        credit: taxTotal,
      });
    } else if (taxTotal > 0 && !inputTaxAcct) {
      // No input-tax account — fold the tax back into the inventory credit.
      lines.push({
        accountId: inventoryAcct,
        description: "Input tax (no recoverable account; reversed against inventory)",
        debit: 0,
        credit: taxTotal,
      });
    } else if (subtotal <= 0) {
      // No item breakdown — single inventory credit for the full amount.
      lines.push({
        accountId: inventoryAcct,
        description: "Inventory returned to supplier",
        debit: 0,
        credit: totalAmount,
      });
    }

    const debitSum = cents(lines.reduce((s, l) => s + l.debit, 0));
    const creditSum = cents(lines.reduce((s, l) => s + l.credit, 0));
    if (debitSum === creditSum && debitSum > 0) {
      const [entry] = await tx
        .insert(journalEntriesTable)
        .values({
          tenantId,
          date: new Date(),
          description: `Supplier Return ${ret.returnNumber}${ret.supplier ? ` – ${ret.supplier}` : ""}`,
          reference: ret.returnNumber,
          type: "purchase_return",
        })
        .returning();
      await tx
        .insert(journalEntryLinesTable)
        .values(lines.map((l) => ({ ...l, entryId: entry.id })));
    }
  }
}

/* ─── Enrichment helpers ──────────────────────────────────────────────── */

async function enrichReturn(ret: typeof supplierReturnsTable.$inferSelect, itemCountOverride?: number) {
  const [{ n }] = await db
    .select({ n: count() })
    .from(supplierReturnItemsTable)
    .where(eq(supplierReturnItemsTable.returnId, ret.id));
  return {
    ...ret,
    supplier: ret.supplier ?? undefined,
    notes: ret.notes ?? undefined,
    purchaseBillId: ret.purchaseBillId ?? undefined,
    itemCount: itemCountOverride ?? Number(n),
  };
}

async function enrichReturnWithItems(ret: typeof supplierReturnsTable.$inferSelect) {
  const items = await db
    .select()
    .from(supplierReturnItemsTable)
    .where(eq(supplierReturnItemsTable.returnId, ret.id));

  const enrichedItems = await Promise.all(
    items.map(async (item) => {
      // Tenant-scoped lookup so a doctored row can't leak cross-tenant data.
      const [product] = await db
        .select({ name: productsTable.name })
        .from(productsTable)
        .where(and(eq(productsTable.id, item.productId), eq(productsTable.tenantId, ret.tenantId)));
      let batchLabel: string | null = null;
      if (item.batchId) {
        const [batch] = await db
          .select({ batchNumber: productBatchesTable.batchNumber, expiryDate: productBatchesTable.expiryDate })
          .from(productBatchesTable)
          .where(and(eq(productBatchesTable.id, item.batchId), eq(productBatchesTable.tenantId, ret.tenantId)));
        if (batch) {
          batchLabel = batch.batchNumber ?? `#${item.batchId}`;
          if (batch.expiryDate) batchLabel += ` (exp ${batch.expiryDate})`;
        }
      }
      return {
        ...item,
        productName: product?.name ?? "Unknown",
        batchLabel,
      };
    }),
  );

  return {
    ...ret,
    supplier: ret.supplier ?? undefined,
    notes: ret.notes ?? undefined,
    purchaseBillId: ret.purchaseBillId ?? undefined,
    itemCount: items.length,
    items: enrichedItems,
  };
}

/* ─── Routes ──────────────────────────────────────────────────────────── */

router.get("/supplier-returns", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const rows = await db
    .select()
    .from(supplierReturnsTable)
    .where(eq(supplierReturnsTable.tenantId, tenantId))
    .orderBy(desc(supplierReturnsTable.createdAt));

  const enriched = await Promise.all(rows.map((r) => enrichReturn(r)));
  res.json(enriched);
});

router.get("/supplier-returns/:id", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [ret] = await db
    .select()
    .from(supplierReturnsTable)
    .where(and(eq(supplierReturnsTable.id, id), eq(supplierReturnsTable.tenantId, tenantId)));
  if (!ret) { res.status(404).json({ error: "Return not found" }); return; }

  const enriched = await enrichReturnWithItems(ret);
  res.json(enriched);
});

/**
 * Returnable lines for a given bill — original received qty minus
 * the sum of confirmed returns against that line. The UI uses this
 * to cap per-line return quantities.
 */
router.get("/supplier-returns/eligible/:billId", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const billId = parseInt(req.params.billId as string, 10);
  if (isNaN(billId)) { res.status(400).json({ error: "Invalid billId" }); return; }

  const [bill] = await db
    .select()
    .from(purchaseBillsTable)
    .where(and(eq(purchaseBillsTable.id, billId), eq(purchaseBillsTable.tenantId, tenantId)));
  if (!bill) { res.status(404).json({ error: "Bill not found" }); return; }
  if (bill.status !== "confirmed") {
    res.status(400).json({ error: "Bill must be confirmed before returning" });
    return;
  }

  const items = await db
    .select()
    .from(purchaseBillItemsTable)
    .where(eq(purchaseBillItemsTable.billId, billId));

  // Sum prior returns per bill-line (only against CONFIRMED returns —
  // drafts shouldn't reserve capacity since they could be deleted).
  const itemIds = items.map((i) => i.id);
  const priorReturnsByLine = new Map<number, number>();
  if (itemIds.length > 0) {
    const prior = await db
      .select({
        purchaseBillItemId: supplierReturnItemsTable.purchaseBillItemId,
        qty: supplierReturnItemsTable.quantity,
      })
      .from(supplierReturnItemsTable)
      .innerJoin(supplierReturnsTable, eq(supplierReturnItemsTable.returnId, supplierReturnsTable.id))
      .where(and(
        inArray(supplierReturnItemsTable.purchaseBillItemId, itemIds),
        eq(supplierReturnsTable.tenantId, tenantId),
        eq(supplierReturnsTable.status, "confirmed"),
      ));
    for (const p of prior) {
      if (p.purchaseBillItemId == null) continue;
      priorReturnsByLine.set(p.purchaseBillItemId, (priorReturnsByLine.get(p.purchaseBillItemId) ?? 0) + p.qty);
    }
  }

  const enriched = await Promise.all(
    items.map(async (item) => {
      const [product] = await db
        .select({ name: productsTable.name, trackBatches: productsTable.trackBatches })
        .from(productsTable)
        .where(eq(productsTable.id, item.productId));
      const returned = priorReturnsByLine.get(item.id) ?? 0;
      return {
        purchaseBillItemId: item.id,
        productId: item.productId,
        productName: product?.name ?? "Unknown",
        trackBatches: product?.trackBatches ?? false,
        originalQuantity: item.quantity,
        alreadyReturned: returned,
        returnableQuantity: Math.max(0, item.quantity - returned),
        unitCost: item.unitCost,
        taxRate: item.taxRate,
      };
    }),
  );

  res.json({
    billId: bill.id,
    billNumber: bill.billNumber,
    supplier: bill.supplier,
    defaultTaxRate: bill.defaultTaxRate,
    lines: enriched,
  });
});

router.post("/supplier-returns", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = CreateSupplierReturnBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { returnNumber, supplier, purchaseBillId, notes, status, defaultTaxRate, items } = parsed.data;

  // If bill-linked: validate bill belongs to tenant + is confirmed,
  // and cap each line at (originalQty - alreadyReturned). Tax/cost
  // come from the bill line for bill-linked returns to keep the JE
  // a true mirror of the original.
  let billLineMap: Map<number, typeof purchaseBillItemsTable.$inferSelect> | null = null;
  if (purchaseBillId != null) {
    const [bill] = await db
      .select()
      .from(purchaseBillsTable)
      .where(and(eq(purchaseBillsTable.id, purchaseBillId), eq(purchaseBillsTable.tenantId, tenantId)));
    if (!bill) { res.status(400).json({ error: "Linked bill not found" }); return; }
    if (bill.status !== "confirmed") { res.status(400).json({ error: "Linked bill must be confirmed first" }); return; }

    const billLines = await db
      .select()
      .from(purchaseBillItemsTable)
      .where(eq(purchaseBillItemsTable.billId, purchaseBillId));
    billLineMap = new Map(billLines.map((l) => [l.id, l]));

    // Sum prior confirmed returns once so we can validate caps.
    const prior = await db
      .select({
        purchaseBillItemId: supplierReturnItemsTable.purchaseBillItemId,
        qty: supplierReturnItemsTable.quantity,
      })
      .from(supplierReturnItemsTable)
      .innerJoin(supplierReturnsTable, eq(supplierReturnItemsTable.returnId, supplierReturnsTable.id))
      .where(and(
        inArray(supplierReturnItemsTable.purchaseBillItemId, billLines.map((l) => l.id)),
        eq(supplierReturnsTable.tenantId, tenantId),
        eq(supplierReturnsTable.status, "confirmed"),
      ));
    const priorMap = new Map<number, number>();
    for (const p of prior) {
      if (p.purchaseBillItemId == null) continue;
      priorMap.set(p.purchaseBillItemId, (priorMap.get(p.purchaseBillItemId) ?? 0) + p.qty);
    }

    for (const item of items) {
      if (!item.purchaseBillItemId) {
        res.status(400).json({ error: "Each line must reference a purchase bill line when the return is bill-linked" });
        return;
      }
      const billLine = billLineMap.get(item.purchaseBillItemId);
      if (!billLine) {
        res.status(400).json({ error: `Bill line ${item.purchaseBillItemId} does not belong to bill ${purchaseBillId}` });
        return;
      }
      if (billLine.productId !== item.productId) {
        res.status(400).json({ error: `Bill line ${item.purchaseBillItemId} is for a different product` });
        return;
      }
      const cap = billLine.quantity - (priorMap.get(billLine.id) ?? 0);
      if (item.quantity > cap) {
        res.status(400).json({
          error: `Line for product ${item.productId}: max returnable is ${cap} (original ${billLine.quantity}, already returned ${priorMap.get(billLine.id) ?? 0})`,
        });
        return;
      }
    }
  } else {
    // Standalone: ensure no lines carry a bill-item id by mistake.
    for (const item of items) {
      if (item.purchaseBillItemId) {
        res.status(400).json({ error: "Standalone return must not reference a purchase bill line" });
        return;
      }
    }
  }

  // Validate products exist + batch requirements for confirmed returns.
  // Also tenant-scope any provided batchId so a draft can't reference a
  // cross-tenant lot (which would leak metadata via the detail view).
  for (const item of items) {
    const [product] = await db
      .select({ id: productsTable.id, name: productsTable.name, trackBatches: productsTable.trackBatches })
      .from(productsTable)
      .where(and(eq(productsTable.id, item.productId), eq(productsTable.tenantId, tenantId)));
    if (!product) {
      res.status(400).json({ error: `Product ${item.productId} not found` });
      return;
    }
    if (status === "confirmed" && product.trackBatches && !item.batchId) {
      res.status(400).json({ error: `Product "${product.name}" requires a batch selection` });
      return;
    }
    if (item.batchId != null) {
      const [batch] = await db
        .select({ id: productBatchesTable.id })
        .from(productBatchesTable)
        .where(and(
          eq(productBatchesTable.id, item.batchId),
          eq(productBatchesTable.tenantId, tenantId),
          eq(productBatchesTable.productId, item.productId),
        ));
      if (!batch) {
        res.status(400).json({ error: `Batch ${item.batchId} not found for product "${product.name}"` });
        return;
      }
    }
  }

  // Compute totals — for bill-linked lines, prefer the bill line's
  // unit cost so the JE mirrors the original. The client may still
  // send a unitCost; we override here as the server-authoritative
  // source. Tax-rate fallback also comes from the bill, never the
  // client, when bill-linked (prevents tampered reversal JEs).
  let linkedBill: typeof purchaseBillsTable.$inferSelect | null = null;
  if (purchaseBillId != null) {
    const [b] = await db
      .select()
      .from(purchaseBillsTable)
      .where(and(eq(purchaseBillsTable.id, purchaseBillId), eq(purchaseBillsTable.tenantId, tenantId)));
    linkedBill = b ?? null;
  }
  const computed = items.map((item) => {
    const billLine = billLineMap?.get(item.purchaseBillItemId ?? -1) ?? null;
    const unitCost = billLine ? billLine.unitCost : item.unitCost;
    const taxRate = billLine ? billLine.taxRate : (item.taxRate ?? null);
    const fallbackRate = billLine ? (linkedBill?.defaultTaxRate ?? 0) : defaultTaxRate;
    const effectiveRate = taxRate ?? fallbackRate;
    const lineSub = cents(item.quantity * unitCost);
    const lineTax = cents(lineSub * effectiveRate / 100);
    return {
      ...item,
      unitCost,
      taxRate,
      lineSubtotal: lineSub,
      lineTax,
      lineTotal: cents(lineSub + lineTax),
    };
  });
  const subtotal = cents(computed.reduce((s, i) => s + i.lineSubtotal, 0));
  const taxTotal = cents(computed.reduce((s, i) => s + i.lineTax, 0));
  const totalAmount = cents(subtotal + taxTotal);

  type CreateResult = { row: typeof supplierReturnsTable.$inferSelect | null; errorMessage?: string };
  const result: CreateResult = await db.transaction(async (tx): Promise<CreateResult> => {
    const [row] = await tx
      .insert(supplierReturnsTable)
      .values({
        tenantId,
        returnNumber,
        supplier: supplier ?? null,
        purchaseBillId: purchaseBillId ?? null,
        notes: notes ?? null,
        status,
        subtotal,
        taxTotal,
        totalAmount,
      })
      .returning();

    const insertedItems = await tx
      .insert(supplierReturnItemsTable)
      .values(
        computed.map((item) => ({
          returnId: row.id,
          productId: item.productId,
          purchaseBillItemId: item.purchaseBillItemId ?? null,
          quantity: item.quantity,
          unitCost: item.unitCost,
          taxRate: item.taxRate,
          taxAmount: item.lineTax,
          totalAmount: item.lineTotal,
          batchId: item.batchId ?? null,
          notes: item.notes ?? null,
        })),
      )
      .returning();

    if (status === "confirmed") {
      await confirmReturnSideEffects(tx, tenantId, row, insertedItems);
    }
    return { row };
  }).catch((err: unknown): CreateResult => ({
    row: null,
    errorMessage: err instanceof Error ? err.message : "Failed to save return",
  }));

  if (!result.row) {
    res.status(400).json({ error: result.errorMessage ?? "Failed to save return" });
    return;
  }

  const enriched = await enrichReturn(result.row, items.length);
  res.status(201).json(enriched);
});

router.post("/supplier-returns/:id/confirm", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [existing] = await db
    .select()
    .from(supplierReturnsTable)
    .where(and(eq(supplierReturnsTable.id, id), eq(supplierReturnsTable.tenantId, tenantId)));
  if (!existing) { res.status(404).json({ error: "Return not found" }); return; }
  if (existing.status === "confirmed") { res.status(400).json({ error: "Return already confirmed" }); return; }
  if (existing.status === "cancelled") { res.status(400).json({ error: "Return is cancelled" }); return; }

  type ConfirmResult = { updated: typeof existing | null; errorMessage?: string };
  const result: ConfirmResult = await db.transaction(async (tx): Promise<ConfirmResult> => {
    const [locked] = await tx
      .select()
      .from(supplierReturnsTable)
      .where(and(eq(supplierReturnsTable.id, id), eq(supplierReturnsTable.tenantId, tenantId)));
    if (!locked || locked.status !== "draft") {
      return { updated: null };
    }
    const items = await tx
      .select()
      .from(supplierReturnItemsTable)
      .where(eq(supplierReturnItemsTable.returnId, id));

    await confirmReturnSideEffects(tx, tenantId, locked, items);

    const [u] = await tx
      .update(supplierReturnsTable)
      .set({ status: "confirmed" })
      .where(and(
        eq(supplierReturnsTable.id, id),
        eq(supplierReturnsTable.tenantId, tenantId),
        eq(supplierReturnsTable.status, "draft"),
      ))
      .returning();
    if (!u) throw new Error("Return was modified by another request");
    return { updated: u };
  }).catch((err: unknown): ConfirmResult => ({
    updated: null,
    errorMessage: err instanceof Error ? err.message : "Return confirm failed",
  }));

  if (!result.updated) {
    res.status(400).json({ error: result.errorMessage ?? "Return already confirmed" });
    return;
  }

  const enriched = await enrichReturnWithItems(result.updated);
  res.json(enriched);
});

router.delete("/supplier-returns/:id", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [existing] = await db
    .select()
    .from(supplierReturnsTable)
    .where(and(eq(supplierReturnsTable.id, id), eq(supplierReturnsTable.tenantId, tenantId)));
  if (!existing) { res.status(404).json({ error: "Return not found" }); return; }
  // Only drafts can be deleted; confirmed returns must stay as audit history.
  if (existing.status === "confirmed") {
    res.status(400).json({ error: "Cannot delete a confirmed return" });
    return;
  }

  await db
    .delete(supplierReturnsTable)
    .where(and(eq(supplierReturnsTable.id, id), eq(supplierReturnsTable.tenantId, tenantId)));

  res.status(204).send();
});

export default router;
