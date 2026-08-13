import { Router, type IRouter } from "express";
import { and, eq, gte, desc, count, sql } from "drizzle-orm";
import {
  db,
  purchaseOrdersTable,
  purchaseOrderItemsTable,
  purchaseBillsTable,
  productsTable,
  vendorsTable,
} from "@workspace/db";
import {
  CreatePurchaseOrderBody,
  UpdatePurchaseOrderBody,
} from "@workspace/api-zod";
import { verifyTenantToken, requireFullTenant } from "./saas-auth";

const router: IRouter = Router();

/* ─── Auth helper ─── */
function getTenantId(req: { headers: Record<string, string | undefined> }): number | null {
  const auth = req.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) return null;
  const p = verifyTenantToken(auth.slice(7));
  return p ? p.tenantId : null;
}

const cents = (n: number) => Math.round(n * 100) / 100;

type POItemInput = {
  productId: number;
  quantity: number;
  unitCost?: number;
  taxRate?: number | null;
};

/**
 * Compute per-line and PO totals. Identical tax math to purchase bills:
 * "exclusive" — entered unit cost is net, tax added on top; "inclusive" — the
 * entered cost already includes tax, so the gross line total is authoritative,
 * the net subtotal is backed out and tax = gross − net (no ±0.01 drift). The
 * net unit cost is always what gets stored so a later bill conversion matches.
 */
function computeLines(
  items: POItemInput[],
  defaultTaxRate: number,
  taxMode: "exclusive" | "inclusive",
) {
  const computed = items.map((item) => {
    const quantity = item.quantity;
    const enteredUnitCost = item.unitCost ?? 0;
    const effectiveRate = item.taxRate ?? defaultTaxRate;
    if (taxMode === "inclusive") {
      const lineTotal = cents(quantity * enteredUnitCost);
      const lineSubtotal =
        effectiveRate > 0 ? cents(lineTotal / (1 + effectiveRate / 100)) : lineTotal;
      const lineTax = cents(lineTotal - lineSubtotal);
      const netUnitCost = quantity > 0 ? lineSubtotal / quantity : enteredUnitCost;
      return { item, netUnitCost, lineSubtotal, lineTax, lineTotal };
    }
    const netUnitCost = enteredUnitCost;
    const lineSubtotal = cents(quantity * netUnitCost);
    const lineTax = cents((lineSubtotal * effectiveRate) / 100);
    return { item, netUnitCost, lineSubtotal, lineTax, lineTotal: cents(lineSubtotal + lineTax) };
  });
  const subtotal = cents(computed.reduce((s, i) => s + i.lineSubtotal, 0));
  const taxTotal = cents(computed.reduce((s, i) => s + i.lineTax, 0));
  const totalCost = cents(subtotal + taxTotal);
  return { computed, subtotal, taxTotal, totalCost };
}

/**
 * Generate a per-tenant, per-year sequential PO number (PO-YY-NNNN) inside the
 * given transaction. A transaction-scoped advisory lock keyed on
 * (tenantId, year) serializes concurrent creates so the count-based sequence
 * can't hand out the same number twice. The unique index on
 * (tenant_id, po_number) is the final backstop. Keyed with a salt so it never
 * collides with the quotation lock that uses the same (tenantId, year) pair.
 */
async function nextPoNumber(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  tenantId: number,
): Promise<string> {
  // Jamaica is UTC-5 year-round; shift to local time for the calendar year.
  const nowJa = new Date(Date.now() - 5 * 60 * 60 * 1000);
  const year = nowJa.getUTCFullYear();
  const yy = String(year).slice(-2);
  const yearStart = new Date(`${year}-01-01T05:00:00.000Z`);
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${tenantId}, ${year + 700000})`);
  const [{ cnt }] = await tx
    .select({ cnt: sql<number>`cast(count(*) as int)` })
    .from(purchaseOrdersTable)
    .where(and(eq(purchaseOrdersTable.tenantId, tenantId), gte(purchaseOrdersTable.createdAt, yearStart)));
  const seq = String((cnt ?? 0) + 1).padStart(4, "0");
  return `PO-${yy}-${seq}`;
}

async function enrichPO(po: typeof purchaseOrdersTable.$inferSelect, itemCountOverride?: number) {
  let n = itemCountOverride;
  if (n === undefined) {
    const [row] = await db
      .select({ c: count() })
      .from(purchaseOrderItemsTable)
      .where(eq(purchaseOrderItemsTable.poId, po.id));
    n = Number(row?.c ?? 0);
  }
  return { ...po, itemCount: n };
}

async function enrichPOWithItems(po: typeof purchaseOrdersTable.$inferSelect) {
  const items = await db
    .select({
      id: purchaseOrderItemsTable.id,
      poId: purchaseOrderItemsTable.poId,
      productId: purchaseOrderItemsTable.productId,
      quantity: purchaseOrderItemsTable.quantity,
      unitCost: purchaseOrderItemsTable.unitCost,
      taxRate: purchaseOrderItemsTable.taxRate,
      taxAmount: purchaseOrderItemsTable.taxAmount,
      totalCost: purchaseOrderItemsTable.totalCost,
      productName: productsTable.name,
    })
    .from(purchaseOrderItemsTable)
    .leftJoin(productsTable, eq(productsTable.id, purchaseOrderItemsTable.productId))
    .where(eq(purchaseOrderItemsTable.poId, po.id));

  return {
    ...po,
    itemCount: items.length,
    items: items.map((it) => ({ ...it, productName: it.productName ?? "Unknown" })),
  };
}

/**
 * Resolves a supplier picked from the supplier list (vendors master) and
 * returns its name, which becomes the document's stored `supplier` text so the
 * two can't disagree. Returns null when the id isn't one of this tenant's
 * suppliers.
 */
async function vendorName(tenantId: number, vendorId: number): Promise<string | null> {
  const [vendor] = await db
    .select({ name: vendorsTable.name })
    .from(vendorsTable)
    .where(and(eq(vendorsTable.id, vendorId), eq(vendorsTable.tenantId, tenantId)));
  return vendor?.name ?? null;
}

/** Reject lines that point at a product not owned by this tenant. */
async function validateProducts(tenantId: number, items: POItemInput[]): Promise<string | null> {
  for (const item of items) {
    const [product] = await db
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(and(eq(productsTable.id, item.productId), eq(productsTable.tenantId, tenantId)));
    if (!product) return `Product ${item.productId} not found`;
  }
  return null;
}

router.get("/purchase-orders", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const orders = await db
    .select()
    .from(purchaseOrdersTable)
    .where(eq(purchaseOrdersTable.tenantId, tenantId))
    .orderBy(desc(purchaseOrdersTable.createdAt));

  const enriched = await Promise.all(orders.map((o) => enrichPO(o)));
  res.json(enriched);
});

router.post("/purchase-orders", async (req, res): Promise<void> => {
  if (!requireFullTenant(req as never, res as never)) return;
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = CreatePurchaseOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { vendorId, supplier, expectedDate, notes, status, defaultTaxRate, taxMode, items } = parsed.data;

  // A supplier chosen from the list wins over any typed name.
  let supplierName = supplier ?? null;
  if (vendorId) {
    supplierName = await vendorName(tenantId, vendorId);
    if (!supplierName) { res.status(400).json({ error: "Supplier not found" }); return; }
  }
  if (items.length === 0) {
    res.status(400).json({ error: "A purchase order needs at least one item" });
    return;
  }
  const bad = items.find((it) => !(it.quantity > 0) || (it.unitCost ?? 0) < 0);
  if (bad) {
    res.status(400).json({ error: "Each item needs a positive quantity and a non-negative cost" });
    return;
  }

  const productErr = await validateProducts(tenantId, items);
  if (productErr) { res.status(400).json({ error: productErr }); return; }

  const rate = defaultTaxRate ?? 0;
  const mode = (taxMode ?? "exclusive") as "exclusive" | "inclusive";
  const { computed, subtotal, taxTotal, totalCost } = computeLines(items, rate, mode);

  // Generate the PO number and insert PO + items in one transaction; the
  // advisory lock inside nextPoNumber serializes concurrent creates.
  const order = await db.transaction(async (tx) => {
    const poNumber = await nextPoNumber(tx, tenantId);
    const [created] = await tx
      .insert(purchaseOrdersTable)
      .values({
        tenantId,
        poNumber,
        vendorId: vendorId ?? null,
        supplier: supplierName,
        status: status ?? "draft",
        expectedDate: expectedDate ?? null,
        notes: notes ?? null,
        defaultTaxRate: rate,
        taxMode: mode,
        subtotal,
        taxTotal,
        totalCost,
      })
      .returning();

    await tx.insert(purchaseOrderItemsTable).values(
      computed.map((c) => ({
        poId: created.id,
        productId: c.item.productId,
        quantity: c.item.quantity,
        unitCost: c.netUnitCost,
        taxRate: c.item.taxRate ?? null,
        taxAmount: c.lineTax,
        totalCost: c.lineTotal,
      })),
    );
    return created;
  });

  const enriched = await enrichPOWithItems(order);
  res.status(201).json(enriched);
});

router.get("/purchase-orders/:id", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [po] = await db.select().from(purchaseOrdersTable)
    .where(and(eq(purchaseOrdersTable.id, id), eq(purchaseOrdersTable.tenantId, tenantId)));
  if (!po) { res.status(404).json({ error: "Purchase order not found" }); return; }

  res.json(await enrichPOWithItems(po));
});

router.patch("/purchase-orders/:id", async (req, res): Promise<void> => {
  if (!requireFullTenant(req as never, res as never)) return;
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const body = UpdatePurchaseOrderBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const [existing] = await db.select().from(purchaseOrdersTable)
    .where(and(eq(purchaseOrdersTable.id, id), eq(purchaseOrdersTable.tenantId, tenantId)));
  if (!existing) { res.status(404).json({ error: "Purchase order not found" }); return; }

  // Converted/cancelled orders are terminal — no further edits of any kind.
  if (existing.status === "converted" || existing.status === "cancelled") {
    res.status(400).json({ error: `A ${existing.status} purchase order cannot be edited` });
    return;
  }

  // Enforce the lifecycle: draft → sent | converted | cancelled; sent → converted | cancelled.
  // (Terminal states are already rejected above.) A no-op status (same value) is allowed.
  if (body.data.status !== undefined && body.data.status !== existing.status) {
    const allowed: Record<string, string[]> = {
      draft: ["sent", "converted", "cancelled"],
      sent: ["converted", "cancelled"],
    };
    if (!allowed[existing.status]?.includes(body.data.status)) {
      res.status(400).json({ error: `Cannot move a ${existing.status} purchase order to ${body.data.status}` });
      return;
    }
  }

  // When marking converted, a valid same-tenant bill reference is required.
  if (body.data.status === "converted") {
    const billId = body.data.convertedBillId ?? existing.convertedBillId;
    if (!billId) {
      res.status(400).json({ error: "convertedBillId is required when marking a purchase order converted" });
      return;
    }
    const [bill] = await db.select({ id: purchaseBillsTable.id }).from(purchaseBillsTable)
      .where(and(eq(purchaseBillsTable.id, billId), eq(purchaseBillsTable.tenantId, tenantId)));
    if (!bill) {
      res.status(400).json({ error: "convertedBillId does not reference a bill in this tenant" });
      return;
    }
  }

  const editingLines = body.data.items !== undefined
    || body.data.defaultTaxRate !== undefined
    || body.data.taxMode !== undefined;
  if (editingLines && existing.status !== "draft") {
    res.status(400).json({ error: "Line items and tax can only be edited on a draft purchase order" });
    return;
  }

  const updates: Partial<typeof purchaseOrdersTable.$inferInsert> = { updatedAt: new Date() };
  if (body.data.status !== undefined) updates.status = body.data.status;
  if (body.data.convertedBillId !== undefined) updates.convertedBillId = body.data.convertedBillId ?? null;
  if (body.data.supplier !== undefined) updates.supplier = body.data.supplier ?? null;
  // A supplier picked from the list wins over any typed name; sending
  // vendorId: null unlinks it and leaves whatever name is on the order.
  if (body.data.vendorId !== undefined) {
    updates.vendorId = body.data.vendorId ?? null;
    if (body.data.vendorId) {
      const name = await vendorName(tenantId, body.data.vendorId);
      if (!name) { res.status(400).json({ error: "Supplier not found" }); return; }
      updates.supplier = name;
    }
  }
  if (body.data.expectedDate !== undefined) updates.expectedDate = body.data.expectedDate ?? null;
  if (body.data.notes !== undefined) updates.notes = body.data.notes ?? null;

  const nextRate = body.data.defaultTaxRate ?? existing.defaultTaxRate;
  const nextMode = (body.data.taxMode ?? existing.taxMode) as "exclusive" | "inclusive";

  // If replacing line items, recompute totals and rewrite the item rows.
  if (body.data.items !== undefined) {
    const items = body.data.items;
    if (items.length === 0) { res.status(400).json({ error: "A purchase order needs at least one item" }); return; }
    const bad = items.find((it) => !(it.quantity > 0) || (it.unitCost ?? 0) < 0);
    if (bad) { res.status(400).json({ error: "Each item needs a positive quantity and a non-negative cost" }); return; }
    const productErr = await validateProducts(tenantId, items);
    if (productErr) { res.status(400).json({ error: productErr }); return; }

    const { computed, subtotal, taxTotal, totalCost } = computeLines(items, nextRate, nextMode);
    updates.defaultTaxRate = nextRate;
    updates.taxMode = nextMode;
    updates.subtotal = subtotal;
    updates.taxTotal = taxTotal;
    updates.totalCost = totalCost;

    await db.transaction(async (tx) => {
      await tx.update(purchaseOrdersTable).set(updates)
        .where(and(eq(purchaseOrdersTable.id, id), eq(purchaseOrdersTable.tenantId, tenantId)));
      await tx.delete(purchaseOrderItemsTable).where(eq(purchaseOrderItemsTable.poId, id));
      await tx.insert(purchaseOrderItemsTable).values(
        computed.map((c) => ({
          poId: id,
          productId: c.item.productId,
          quantity: c.item.quantity,
          unitCost: c.netUnitCost,
          taxRate: c.item.taxRate ?? null,
          taxAmount: c.lineTax,
          totalCost: c.lineTotal,
        })),
      );
    });
  } else {
    // Tax-only edit on a draft recomputes totals from the existing items so the
    // header stays consistent with what the lines imply.
    if (body.data.defaultTaxRate !== undefined || body.data.taxMode !== undefined) {
      const existingItems = await db.select().from(purchaseOrderItemsTable)
        .where(eq(purchaseOrderItemsTable.poId, id));
      const recompInput: POItemInput[] = existingItems.map((it) => ({
        productId: it.productId,
        quantity: it.quantity,
        unitCost: it.unitCost,
        taxRate: it.taxRate,
      }));
      const { computed, subtotal, taxTotal, totalCost } = computeLines(recompInput, nextRate, nextMode);
      updates.defaultTaxRate = nextRate;
      updates.taxMode = nextMode;
      updates.subtotal = subtotal;
      updates.taxTotal = taxTotal;
      updates.totalCost = totalCost;
      await db.transaction(async (tx) => {
        await tx.update(purchaseOrdersTable).set(updates)
          .where(and(eq(purchaseOrdersTable.id, id), eq(purchaseOrdersTable.tenantId, tenantId)));
        for (const c of computed) {
          await tx.update(purchaseOrderItemsTable)
            .set({ unitCost: c.netUnitCost, taxAmount: c.lineTax, totalCost: c.lineTotal })
            .where(eq(purchaseOrderItemsTable.id, existingItems[computed.indexOf(c)].id));
        }
      });
    } else {
      await db.update(purchaseOrdersTable).set(updates)
        .where(and(eq(purchaseOrdersTable.id, id), eq(purchaseOrdersTable.tenantId, tenantId)));
    }
  }

  const [updated] = await db.select().from(purchaseOrdersTable)
    .where(and(eq(purchaseOrdersTable.id, id), eq(purchaseOrdersTable.tenantId, tenantId)));
  res.json(await enrichPOWithItems(updated));
});

router.delete("/purchase-orders/:id", async (req, res): Promise<void> => {
  if (!requireFullTenant(req as never, res as never)) return;
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [po] = await db.select().from(purchaseOrdersTable)
    .where(and(eq(purchaseOrdersTable.id, id), eq(purchaseOrdersTable.tenantId, tenantId)));
  if (!po) { res.status(404).json({ error: "Purchase order not found" }); return; }
  if (po.status !== "draft") {
    res.status(400).json({ error: "Only draft purchase orders can be deleted. Cancel it instead." });
    return;
  }

  await db.delete(purchaseOrdersTable)
    .where(and(eq(purchaseOrdersTable.id, id), eq(purchaseOrdersTable.tenantId, tenantId)));
  res.status(204).send();
});

export default router;
