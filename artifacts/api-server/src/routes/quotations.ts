import { Router, type IRouter } from "express";
import { and, eq, gte, desc, sql } from "drizzle-orm";
import { db, quotationsTable, customersTable } from "@workspace/db";
import {
  CreateQuotationBody,
  GetQuotationParams,
  GetQuotationResponse,
  ListQuotationsResponse,
  UpdateQuotationParams,
  UpdateQuotationBody,
  UpdateQuotationResponse,
  DeleteQuotationParams,
} from "@workspace/api-zod";
import { verifyTenantToken, requireFullTenant } from "./saas-auth";
import { getSetting } from "./settings";

const router: IRouter = Router();

/* ─── Auth helper ─── */
function getTenantId(req: { headers: Record<string, string | undefined> }): number | null {
  const auth = req.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) return null;
  const p = verifyTenantToken(auth.slice(7));
  return p ? p.tenantId : null;
}

type CustomerSnapshot = {
  name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
} | null;

function normalizeQuotation(
  q: typeof quotationsTable.$inferSelect,
  customer?: CustomerSnapshot,
) {
  return {
    ...q,
    customerId: q.customerId ?? undefined,
    customerName: customer?.name ?? undefined,
    customerPhone: customer?.phone ?? undefined,
    customerEmail: customer?.email ?? undefined,
    customerAddress: customer?.address ?? undefined,
    discountType: q.discountType ?? undefined,
    discountAmount: q.discountAmount ?? undefined,
    notes: q.notes ?? undefined,
    expiryDate: q.expiryDate ?? undefined,
    convertedOrderId: q.convertedOrderId ?? undefined,
  };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Compute quote totals server-side from the line items and the tenant's tax
 * settings. Mirrors the cart math in pos-hardware.tsx so the saved quote and
 * the on-screen cart agree. A quotation is non-binding (no stock/JE side
 * effects) but totals are still authoritative on the server.
 */
async function computeTotals(
  tenantId: number,
  items: Array<{ price: number; quantity: number; isTaxable?: boolean }>,
  discountInput: number | undefined,
  discountType: "percent" | "fixed" | undefined,
) {
  const taxRate = parseFloat((await getSetting("tax_rate", tenantId)) || "15") / 100;
  const taxMode = ((await getSetting("tax_mode", tenantId)) ?? "exclusive") as
    | "exclusive"
    | "inclusive";

  const subtotal = items.reduce((s, c) => s + c.price * c.quantity, 0);
  // Honor the discount type: "percent" applies a percentage of the subtotal,
  // anything else (default) treats the amount as a fixed currency value.
  const rawDiscount =
    discountInput && discountInput > 0
      ? discountType === "percent"
        ? subtotal * (discountInput / 100)
        : discountInput
      : 0;
  const discount = Math.min(Math.max(0, rawDiscount), subtotal);
  // Items default to taxable unless explicitly flagged isTaxable === false.
  const taxBase = items.reduce(
    (s, c) => (c.isTaxable === false ? s : s + c.price * c.quantity),
    0,
  );
  const taxableShare = subtotal > 0 ? taxBase / subtotal : 1;
  const taxableAfterDiscount = Math.max(0, taxBase - discount * taxableShare);
  const tax =
    taxMode === "inclusive"
      ? (taxableAfterDiscount * taxRate) / (1 + taxRate)
      : taxableAfterDiscount * taxRate;
  const total = subtotal - discount + (taxMode === "exclusive" ? tax : 0);

  return {
    subtotal: r2(subtotal),
    discount: r2(discount),
    tax: r2(tax),
    total: r2(total),
  };
}

/**
 * Generate a per-tenant, per-year sequential quote number (QUO-YY-NNNN) inside
 * the given transaction. A transaction-scoped advisory lock keyed on
 * (tenantId, year) serializes concurrent creates so the count-based sequence
 * can't hand out the same number twice. The unique index on
 * (tenant_id, quote_number) is the final backstop.
 */
async function nextQuoteNumber(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  tenantId: number,
): Promise<string> {
  // Jamaica is UTC-5 year-round; shift to local time for the calendar year.
  const nowJa = new Date(Date.now() - 5 * 60 * 60 * 1000);
  const year = nowJa.getUTCFullYear();
  const yy = String(year).slice(-2);
  const yearStart = new Date(`${year}-01-01T05:00:00.000Z`);
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${tenantId}, ${year})`);
  const [{ cnt }] = await tx
    .select({ cnt: sql<number>`cast(count(*) as int)` })
    .from(quotationsTable)
    .where(and(eq(quotationsTable.tenantId, tenantId), gte(quotationsTable.createdAt, yearStart)));
  const seq = String((cnt ?? 0) + 1).padStart(4, "0");
  return `QUO-${yy}-${seq}`;
}

router.get("/quotations", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const rows = await db
    .select({
      quotation: quotationsTable,
      customer: {
        name: customersTable.name,
        phone: customersTable.phone,
        email: customersTable.email,
        address: customersTable.address,
      },
    })
    .from(quotationsTable)
    .leftJoin(
      customersTable,
      and(
        eq(quotationsTable.customerId, customersTable.id),
        eq(customersTable.tenantId, tenantId),
      ),
    )
    .where(eq(quotationsTable.tenantId, tenantId))
    .orderBy(desc(quotationsTable.createdAt));
  res.json(
    ListQuotationsResponse.parse(
      rows.map((row) => normalizeQuotation(row.quotation, row.customer)),
    ),
  );
});

router.post("/quotations", async (req, res): Promise<void> => {
  if (!requireFullTenant(req as never, res as never)) return;
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = CreateQuotationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (parsed.data.items.length === 0) {
    res.status(400).json({ error: "A quotation needs at least one item" });
    return;
  }
  // Reject nonsensical line items so totals can't be poisoned.
  const badItem = parsed.data.items.find(
    (it) => !(it.quantity > 0) || it.price < 0 || !Number.isFinite(it.price),
  );
  if (badItem) {
    res.status(400).json({ error: "Each item needs a positive quantity and a non-negative price" });
    return;
  }

  // Reject a customerId that doesn't belong to this tenant — otherwise the
  // quote could later embed and leak another tenant's customer PII on read.
  if (parsed.data.customerId != null) {
    const [owned] = await db
      .select({ id: customersTable.id })
      .from(customersTable)
      .where(
        and(
          eq(customersTable.id, parsed.data.customerId),
          eq(customersTable.tenantId, tenantId),
        ),
      );
    if (!owned) {
      res.status(400).json({ error: "Customer not found" });
      return;
    }
  }

  const totals = await computeTotals(
    tenantId,
    parsed.data.items,
    parsed.data.discountAmount,
    parsed.data.discountType,
  );

  const values = {
    tenantId,
    customerId: parsed.data.customerId ?? null,
    items: parsed.data.items,
    subtotal: totals.subtotal,
    discountType: totals.discount > 0 ? (parsed.data.discountType ?? "fixed") : null,
    discountAmount: totals.discount > 0 ? totals.discount : null,
    tax: totals.tax,
    total: totals.total,
    notes: parsed.data.notes ?? null,
    expiryDate: parsed.data.expiryDate ?? null,
    status: "active",
  };

  // Generate the quote number and insert in one transaction; the advisory lock
  // inside nextQuoteNumber serializes concurrent creates for this tenant/year.
  const row = await db.transaction(async (tx) => {
    const quoteNumber = await nextQuoteNumber(tx, tenantId);
    const [created] = await tx
      .insert(quotationsTable)
      .values({ ...values, quoteNumber })
      .returning();
    return created;
  });

  let customer: CustomerSnapshot = null;
  if (row.customerId != null) {
    const [c] = await db
      .select({
        name: customersTable.name,
        phone: customersTable.phone,
        email: customersTable.email,
        address: customersTable.address,
      })
      .from(customersTable)
      .where(and(eq(customersTable.id, row.customerId), eq(customersTable.tenantId, tenantId)));
    customer = c ?? null;
  }

  res.status(201).json(GetQuotationResponse.parse(normalizeQuotation(row, customer)));
});

router.get("/quotations/:id", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetQuotationParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [row] = await db
    .select({
      quotation: quotationsTable,
      customer: {
        name: customersTable.name,
        phone: customersTable.phone,
        email: customersTable.email,
        address: customersTable.address,
      },
    })
    .from(quotationsTable)
    .leftJoin(
      customersTable,
      and(
        eq(quotationsTable.customerId, customersTable.id),
        eq(customersTable.tenantId, tenantId),
      ),
    )
    .where(and(eq(quotationsTable.id, params.data.id), eq(quotationsTable.tenantId, tenantId)));

  if (!row) {
    res.status(404).json({ error: "Quotation not found" });
    return;
  }

  res.json(GetQuotationResponse.parse(normalizeQuotation(row.quotation, row.customer)));
});

router.patch("/quotations/:id", async (req, res): Promise<void> => {
  if (!requireFullTenant(req as never, res as never)) return;
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = UpdateQuotationParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateQuotationBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const updates: Partial<typeof quotationsTable.$inferInsert> = { updatedAt: new Date() };
  if (body.data.status !== undefined) updates.status = body.data.status;
  if (body.data.convertedOrderId !== undefined) updates.convertedOrderId = body.data.convertedOrderId;
  if (body.data.notes !== undefined) updates.notes = body.data.notes;
  if (body.data.expiryDate !== undefined) updates.expiryDate = body.data.expiryDate;

  const [row] = await db
    .update(quotationsTable)
    .set(updates)
    .where(and(eq(quotationsTable.id, params.data.id), eq(quotationsTable.tenantId, tenantId)))
    .returning();

  if (!row) {
    res.status(404).json({ error: "Quotation not found" });
    return;
  }

  res.json(UpdateQuotationResponse.parse(normalizeQuotation(row)));
});

router.delete("/quotations/:id", async (req, res): Promise<void> => {
  if (!requireFullTenant(req as never, res as never)) return;
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = DeleteQuotationParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [row] = await db
    .delete(quotationsTable)
    .where(and(eq(quotationsTable.id, params.data.id), eq(quotationsTable.tenantId, tenantId)))
    .returning();

  if (!row) {
    res.status(404).json({ error: "Quotation not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
