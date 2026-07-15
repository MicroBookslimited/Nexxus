import { Router, type IRouter } from "express";
import { and, eq, gte, desc, sql } from "drizzle-orm";
import {
  db,
  layawaysTable,
  layawayPaymentsTable,
  customersTable,
  productsTable,
  ordersTable,
  orderItemsTable,
} from "@workspace/db";
import { z } from "zod";
import { verifyTenantToken, requireFullTenant } from "./saas-auth";
import { getSetting } from "./settings";

const router: IRouter = Router();

function getTenantId(req: { headers: Record<string, string | undefined> }): number | null {
  const auth = req.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) return null;
  const p = verifyTenantToken(auth.slice(7));
  return p ? p.tenantId : null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/* ─── Validation ─── */

const LayawayItem = z.object({
  productId: z.number().int(),
  productName: z.string().min(1),
  price: z.number().nonnegative().finite(),
  quantity: z.number().positive().finite(),
  isTaxable: z.boolean().optional(),
  isCustom: z.boolean().optional(),
  unitLabel: z.string().optional(),
  unitFactor: z.number().positive().optional(),
});

const CreateLayawayBody = z.object({
  customerId: z.number().int(),
  items: z.array(LayawayItem).min(1),
  discountType: z.enum(["percent", "fixed"]).optional(),
  discountAmount: z.number().nonnegative().optional(),
  depositAmount: z.number().nonnegative(),
  depositMethod: z.enum(["cash", "card", "other"]).default("cash"),
  planType: z.enum(["flexible", "installment"]).default("flexible"),
  installmentAmount: z.number().positive().optional(),
  installmentFrequency: z.enum(["weekly", "biweekly", "monthly"]).optional(),
  firstDueDate: z.coerce.date().optional(),
  notes: z.string().max(2000).optional(),
  staffName: z.string().max(200).optional(),
});

const AddPaymentBody = z.object({
  amount: z.number().positive().finite(),
  method: z.enum(["cash", "card", "other"]).default("cash"),
  reference: z.string().max(200).optional(),
  staffName: z.string().max(200).optional(),
});

const CancelBody = z.object({
  // Portion of the paid amount the store keeps (restocking fee). The rest is
  // assumed refunded to the customer outside the system (cash drawer).
  cancellationFee: z.number().nonnegative().default(0),
  reason: z.string().max(500).optional(),
  markDefaulted: z.boolean().default(false),
});

/* ─── Totals (mirrors quotations.ts computeTotals) ─── */
async function computeTotals(
  tenantId: number,
  items: Array<{ price: number; quantity: number; isTaxable?: boolean }>,
  discountInput: number | undefined,
  discountType: "percent" | "fixed" | undefined,
) {
  const taxRate = parseFloat((await getSetting("tax_rate", tenantId)) || "15") / 100;
  const taxMode = ((await getSetting("tax_mode", tenantId)) ?? "exclusive") as "exclusive" | "inclusive";

  const subtotal = items.reduce((s, c) => s + c.price * c.quantity, 0);
  const rawDiscount =
    discountInput && discountInput > 0
      ? discountType === "percent"
        ? subtotal * (discountInput / 100)
        : discountInput
      : 0;
  const discount = Math.min(Math.max(0, rawDiscount), subtotal);
  const taxBase = items.reduce((s, c) => (c.isTaxable === false ? s : s + c.price * c.quantity), 0);
  const taxableShare = subtotal > 0 ? taxBase / subtotal : 1;
  const taxableAfterDiscount = Math.max(0, taxBase - discount * taxableShare);
  const tax =
    taxMode === "inclusive"
      ? (taxableAfterDiscount * taxRate) / (1 + taxRate)
      : taxableAfterDiscount * taxRate;
  const total = subtotal - discount + (taxMode === "exclusive" ? tax : 0);
  return { subtotal: r2(subtotal), discount: r2(discount), tax: r2(tax), total: r2(total) };
}

/* ─── Numbering: LAY-YY-NNNN (advisory-lock serialized, quotation pattern) ─── */
async function nextLayawayNumber(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  tenantId: number,
): Promise<string> {
  const nowJa = new Date(Date.now() - 5 * 60 * 60 * 1000);
  const year = nowJa.getUTCFullYear();
  const yy = String(year).slice(-2);
  const yearStart = new Date(`${year}-01-01T05:00:00.000Z`);
  // Different second lock key than quotations (year + 1) so the two features
  // don't serialize against each other.
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${tenantId}, ${year + 100000})`);
  const [{ cnt }] = await tx
    .select({ cnt: sql<number>`cast(count(*) as int)` })
    .from(layawaysTable)
    .where(and(eq(layawaysTable.tenantId, tenantId), gte(layawaysTable.createdAt, yearStart)));
  const seq = String((cnt ?? 0) + 1).padStart(4, "0");
  return `LAY-${yy}-${seq}`;
}

function addInterval(from: Date, frequency: string): Date {
  const d = new Date(from);
  if (frequency === "weekly") d.setUTCDate(d.getUTCDate() + 7);
  else if (frequency === "biweekly") d.setUTCDate(d.getUTCDate() + 14);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
}

type LayawayRow = typeof layawaysTable.$inferSelect;
function normalize(l: LayawayRow, customerName?: string | null, customerPhone?: string | null) {
  return {
    ...l,
    balance: r2(l.total - l.amountPaid),
    customerName: customerName ?? undefined,
    customerPhone: customerPhone ?? undefined,
  };
}

/* ─── Routes ─── */

router.get("/layaways", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const rows = await db
    .select({
      layaway: layawaysTable,
      customerName: customersTable.name,
      customerPhone: customersTable.phone,
    })
    .from(layawaysTable)
    .leftJoin(
      customersTable,
      and(eq(layawaysTable.customerId, customersTable.id), eq(customersTable.tenantId, tenantId)),
    )
    .where(eq(layawaysTable.tenantId, tenantId))
    .orderBy(desc(layawaysTable.createdAt));
  res.json(rows.map((r) => normalize(r.layaway, r.customerName, r.customerPhone)));
});

router.get("/layaways/:id", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [row] = await db
    .select({
      layaway: layawaysTable,
      customerName: customersTable.name,
      customerPhone: customersTable.phone,
    })
    .from(layawaysTable)
    .leftJoin(
      customersTable,
      and(eq(layawaysTable.customerId, customersTable.id), eq(customersTable.tenantId, tenantId)),
    )
    .where(and(eq(layawaysTable.id, id), eq(layawaysTable.tenantId, tenantId)));
  if (!row) { res.status(404).json({ error: "Layaway not found" }); return; }

  const payments = await db
    .select()
    .from(layawayPaymentsTable)
    .where(and(eq(layawayPaymentsTable.layawayId, id), eq(layawayPaymentsTable.tenantId, tenantId)))
    .orderBy(desc(layawayPaymentsTable.createdAt));

  res.json({ ...normalize(row.layaway, row.customerName, row.customerPhone), payments });
});

router.post("/layaways", async (req, res): Promise<void> => {
  if (!requireFullTenant(req as never, res as never)) return;
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = CreateLayawayBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const data = parsed.data;

  if (data.planType === "installment" && (!data.installmentAmount || !data.installmentFrequency)) {
    res.status(400).json({ error: "Installment plans need an installment amount and frequency" });
    return;
  }

  const [customer] = await db
    .select({ id: customersTable.id })
    .from(customersTable)
    .where(and(eq(customersTable.id, data.customerId), eq(customersTable.tenantId, tenantId)));
  if (!customer) { res.status(400).json({ error: "Customer not found" }); return; }

  const totals = await computeTotals(tenantId, data.items, data.discountAmount, data.discountType);
  if (data.depositAmount > totals.total) {
    res.status(400).json({ error: "Deposit cannot exceed the layaway total" });
    return;
  }

  const allowOverselling = (await getSetting("allow_overselling", tenantId)) === "true";

  try {
    const row = await db.transaction(async (tx) => {
      // Reserve stock now: decrement the global stock count for each catalog
      // line. Restored on cancel/default; NOT touched again at completion.
      for (const item of data.items) {
        if (item.isCustom || item.productId <= 0) continue;
        const [product] = await tx
          .select({ id: productsTable.id, stockCount: productsTable.stockCount, name: productsTable.name })
          .from(productsTable)
          .where(and(eq(productsTable.id, item.productId), eq(productsTable.tenantId, tenantId)))
          .for("update");
        if (!product) throw new Error(`Product not found: ${item.productName}`);
        if (!allowOverselling && (product.stockCount ?? 0) < item.quantity) {
          throw new Error(`Insufficient stock for ${product.name}`);
        }
        await tx
          .update(productsTable)
          .set({ stockCount: sql`${productsTable.stockCount} - ${item.quantity}` })
          .where(eq(productsTable.id, item.productId));
      }

      const layawayNumber = await nextLayawayNumber(tx, tenantId);
      const nextDue =
        data.planType === "installment"
          ? data.firstDueDate ?? addInterval(new Date(), data.installmentFrequency ?? "monthly")
          : null;

      const [created] = await tx
        .insert(layawaysTable)
        .values({
          tenantId,
          layawayNumber,
          customerId: data.customerId,
          items: data.items,
          subtotal: totals.subtotal,
          discountType: totals.discount > 0 ? (data.discountType ?? "fixed") : null,
          discountAmount: totals.discount > 0 ? totals.discount : null,
          tax: totals.tax,
          total: totals.total,
          amountPaid: r2(data.depositAmount),
          depositRequired: r2(data.depositAmount),
          planType: data.planType,
          installmentAmount: data.installmentAmount ?? null,
          installmentFrequency: data.installmentFrequency ?? null,
          nextDueDate: nextDue,
          status: "active",
          notes: data.notes ?? null,
        })
        .returning();

      if (data.depositAmount > 0) {
        await tx.insert(layawayPaymentsTable).values({
          tenantId,
          layawayId: created.id,
          amount: r2(data.depositAmount),
          method: data.depositMethod,
          staffName: data.staffName ?? null,
          kind: "deposit",
        });
      }
      return created;
    });
    res.status(201).json(normalize(row));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not create layaway";
    res.status(msg.startsWith("Insufficient stock") ? 409 : 400).json({ error: msg });
  }
});

/**
 * Record a payment. If the balance reaches zero the layaway completes:
 * a real order row is written for sales reporting (NO stock deduction —
 * stock was already reserved at creation) and the layaway is marked
 * completed with convertedOrderId set.
 */
router.post("/layaways/:id/payments", async (req, res): Promise<void> => {
  if (!requireFullTenant(req as never, res as never)) return;
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = AddPaymentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  try {
    const result = await db.transaction(async (tx) => {
      const [layaway] = await tx
        .select()
        .from(layawaysTable)
        .where(and(eq(layawaysTable.id, id), eq(layawaysTable.tenantId, tenantId)))
        .for("update");
      if (!layaway) throw new Error("Layaway not found");
      if (layaway.status !== "active") throw new Error("Layaway is not active");

      const balance = r2(layaway.total - layaway.amountPaid);
      if (parsed.data.amount > balance + 0.005) {
        throw new Error(`Payment exceeds remaining balance ($${balance.toFixed(2)})`);
      }

      await tx.insert(layawayPaymentsTable).values({
        tenantId,
        layawayId: id,
        amount: r2(parsed.data.amount),
        method: parsed.data.method,
        reference: parsed.data.reference ?? null,
        staffName: parsed.data.staffName ?? null,
        kind: "payment",
      });

      const newPaid = r2(layaway.amountPaid + parsed.data.amount);
      const paidOff = newPaid >= layaway.total - 0.005;

      let convertedOrderId: number | null = null;
      if (paidOff) {
        // Write the sale for reporting. ORD numbering matches orders.ts.
        const nowJa = new Date(Date.now() - 5 * 60 * 60 * 1000);
        const yymm = String(nowJa.getUTCFullYear()).slice(-2) + String(nowJa.getUTCMonth() + 1).padStart(2, "0");
        const dd = String(nowJa.getUTCDate()).padStart(2, "0");
        const dayStart = new Date(`${nowJa.getUTCFullYear()}-${String(nowJa.getUTCMonth() + 1).padStart(2, "0")}-${String(nowJa.getUTCDate()).padStart(2, "0")}T05:00:00.000Z`);
        const [{ cnt }] = await tx
          .select({ cnt: sql<number>`cast(count(*) as int)` })
          .from(ordersTable)
          .where(and(eq(ordersTable.tenantId, tenantId), gte(ordersTable.createdAt, dayStart)));
        const orderNumber = `ORD-${yymm}-${dd}-${String((cnt ?? 0) + 1).padStart(6, "0")}`;

        const [order] = await tx
          .insert(ordersTable)
          .values({
            tenantId,
            orderNumber,
            status: "completed",
            subtotal: layaway.subtotal,
            discountType: layaway.discountType,
            discountAmount: layaway.discountAmount,
            tax: layaway.tax,
            total: layaway.total,
            paymentMethod: "layaway",
            customerId: layaway.customerId,
            notes: `Layaway ${layaway.layawayNumber} paid off`,
            completedAt: new Date(),
          })
          .returning();
        convertedOrderId = order.id;

        for (const item of layaway.items) {
          await tx.insert(orderItemsTable).values({
            orderId: order.id,
            productId: item.productId > 0 ? item.productId : 0,
            productName: item.productName,
            quantity: item.quantity,
            unitPrice: item.price,
            lineTotal: r2(item.price * item.quantity),
          });
        }
      }

      const nextDue =
        !paidOff && layaway.planType === "installment" && layaway.nextDueDate
          ? addInterval(layaway.nextDueDate, layaway.installmentFrequency ?? "monthly")
          : layaway.nextDueDate;

      const [updated] = await tx
        .update(layawaysTable)
        .set({
          amountPaid: newPaid,
          status: paidOff ? "completed" : "active",
          convertedOrderId,
          nextDueDate: paidOff ? null : nextDue,
          updatedAt: new Date(),
        })
        .where(eq(layawaysTable.id, id))
        .returning();
      return updated;
    });
    res.json(normalize(result));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not record payment";
    res.status(msg === "Layaway not found" ? 404 : 400).json({ error: msg });
  }
});

/** Cancel (or mark defaulted): restores reserved stock, keeps optional fee. */
router.post("/layaways/:id/cancel", async (req, res): Promise<void> => {
  if (!requireFullTenant(req as never, res as never)) return;
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = CancelBody.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  try {
    const result = await db.transaction(async (tx) => {
      const [layaway] = await tx
        .select()
        .from(layawaysTable)
        .where(and(eq(layawaysTable.id, id), eq(layawaysTable.tenantId, tenantId)))
        .for("update");
      if (!layaway) throw new Error("Layaway not found");
      if (layaway.status !== "active") throw new Error("Layaway is not active");
      if (parsed.data.cancellationFee > layaway.amountPaid) {
        throw new Error("Cancellation fee cannot exceed the amount paid");
      }

      // Return reserved stock to the shelf.
      for (const item of layaway.items) {
        if (item.isCustom || item.productId <= 0) continue;
        await tx
          .update(productsTable)
          .set({ stockCount: sql`${productsTable.stockCount} + ${item.quantity}` })
          .where(and(eq(productsTable.id, item.productId), eq(productsTable.tenantId, tenantId)));
      }

      const refund = r2(layaway.amountPaid - parsed.data.cancellationFee);
      if (refund > 0) {
        await tx.insert(layawayPaymentsTable).values({
          tenantId,
          layawayId: id,
          amount: -refund,
          method: "cash",
          kind: "refund",
          reference: parsed.data.reason ?? null,
        });
      }

      const [updated] = await tx
        .update(layawaysTable)
        .set({
          status: parsed.data.markDefaulted ? "defaulted" : "cancelled",
          cancellationFee: parsed.data.cancellationFee > 0 ? parsed.data.cancellationFee : null,
          notes: parsed.data.reason
            ? [layaway.notes, `Cancelled: ${parsed.data.reason}`].filter(Boolean).join("\n")
            : layaway.notes,
          updatedAt: new Date(),
        })
        .where(eq(layawaysTable.id, id))
        .returning();
      return updated;
    });
    res.json(normalize(result));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not cancel layaway";
    res.status(msg === "Layaway not found" ? 404 : 400).json({ error: msg });
  }
});

export default router;
