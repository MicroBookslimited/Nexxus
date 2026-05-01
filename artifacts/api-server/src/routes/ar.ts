import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  accountsReceivableTable,
  arPaymentsTable,
  customersTable,
  ordersTable,
  orderItemsTable,
} from "@workspace/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { verifyTenantToken, requireFullTenant } from "./saas-auth.js";

const router: IRouter = Router();

function getTenantId(req: { headers: Record<string, string | undefined> }): number | null {
  const auth = req.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) return null;
  const p = verifyTenantToken(auth.slice(7));
  return p ? p.tenantId : null;
}

/* ── List all AR records ────────────────────────────────── */
router.get("/ar", async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) return res.status(401).json({ error: "Unauthorized" });

    const rows = await db
      .select({
        id: accountsReceivableTable.id,
        customerId: accountsReceivableTable.customerId,
        customerName: accountsReceivableTable.customerName,
        orderNumber: accountsReceivableTable.orderNumber,
        amount: accountsReceivableTable.amount,
        amountPaid: accountsReceivableTable.amountPaid,
        status: accountsReceivableTable.status,
        notes: accountsReceivableTable.notes,
        dueDate: accountsReceivableTable.dueDate,
        createdAt: accountsReceivableTable.createdAt,
        phone: customersTable.phone,
        email: customersTable.email,
      })
      .from(accountsReceivableTable)
      .leftJoin(
        customersTable,
        and(
          eq(accountsReceivableTable.customerId, customersTable.id),
          eq(customersTable.tenantId, tenantId),
        ),
      )
      .where(eq(accountsReceivableTable.tenantId, tenantId))
      .orderBy(desc(accountsReceivableTable.createdAt));

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch accounts receivable" });
  }
});

/* ── AR summary (outstanding by customer) ───────────────── */
router.get("/ar/summary", async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) return res.status(401).json({ error: "Unauthorized" });

    const rows = await db
      .select({
        customerId: accountsReceivableTable.customerId,
        customerName: accountsReceivableTable.customerName,
        totalOwed: sql<number>`CAST(SUM(${accountsReceivableTable.amount} - ${accountsReceivableTable.amountPaid}) AS REAL)`,
        recordCount: sql<number>`CAST(COUNT(*) AS INTEGER)`,
      })
      .from(accountsReceivableTable)
      .where(
        and(
          eq(accountsReceivableTable.tenantId, tenantId),
          sql`${accountsReceivableTable.status} != 'paid'`,
        )
      )
      .groupBy(accountsReceivableTable.customerId, accountsReceivableTable.customerName)
      .orderBy(desc(sql`SUM(${accountsReceivableTable.amount} - ${accountsReceivableTable.amountPaid})`));

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch AR summary" });
  }
});

/* ── Single AR record with payments + customer + order details ── */
router.get("/ar/:id", async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) return res.status(401).json({ error: "Unauthorized" });

    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid id" });
    }

    const [ar] = await db
      .select({
        id: accountsReceivableTable.id,
        tenantId: accountsReceivableTable.tenantId,
        customerId: accountsReceivableTable.customerId,
        customerName: accountsReceivableTable.customerName,
        orderId: accountsReceivableTable.orderId,
        orderNumber: accountsReceivableTable.orderNumber,
        amount: accountsReceivableTable.amount,
        amountPaid: accountsReceivableTable.amountPaid,
        status: accountsReceivableTable.status,
        notes: accountsReceivableTable.notes,
        dueDate: accountsReceivableTable.dueDate,
        createdAt: accountsReceivableTable.createdAt,
        phone: customersTable.phone,
        email: customersTable.email,
      })
      .from(accountsReceivableTable)
      .leftJoin(
        customersTable,
        and(
          eq(accountsReceivableTable.customerId, customersTable.id),
          eq(customersTable.tenantId, tenantId),
        ),
      )
      .where(and(eq(accountsReceivableTable.id, id), eq(accountsReceivableTable.tenantId, tenantId)));

    if (!ar) return res.status(404).json({ error: "Not found" });

    const payments = await db
      .select()
      .from(arPaymentsTable)
      .where(eq(arPaymentsTable.arId, id))
      .orderBy(desc(arPaymentsTable.createdAt));

    // Pull the original order header (subtotal, tax, total, location,
    // staff, payment-method/status snapshot at sale time) plus its
    // line items so the AR drawer can show exactly what was sold on
    // credit. All of this is read-only — payments stay on the AR row.
    let order: {
      id: number;
      orderNumber: string;
      subtotal: number;
      tax: number;
      total: number;
      discountAmount: number | null;
      paymentMethod: string | null;
      orderType: string | null;
      orderNotes: string | null;
      createdAt: Date;
    } | null = null;
    let items: Array<{
      id: number;
      productName: string;
      quantity: number;
      unitPrice: number;
      lineTotal: number;
      discountAmount: number | null;
      variantAdjustment: number | null;
      modifierAdjustment: number | null;
    }> = [];

    if (ar.orderId) {
      const [o] = await db
        .select({
          id: ordersTable.id,
          orderNumber: ordersTable.orderNumber,
          subtotal: ordersTable.subtotal,
          tax: ordersTable.tax,
          total: ordersTable.total,
          discountAmount: ordersTable.discountAmount,
          paymentMethod: ordersTable.paymentMethod,
          orderType: ordersTable.orderType,
          orderNotes: ordersTable.notes,
          createdAt: ordersTable.createdAt,
        })
        .from(ordersTable)
        .where(and(eq(ordersTable.id, ar.orderId), eq(ordersTable.tenantId, tenantId)));

      // Only fetch line items when the tenant-scoped order lookup succeeded.
      // `order_items` has no `tenantId` column, so the only safe gate is the
      // verified `o.id`. Using `ar.orderId` directly here would leak items
      // from another tenant's order if `ar.orderId` were ever inconsistent.
      if (o) {
        order = o;
        const itemRows = await db
          .select({
            id: orderItemsTable.id,
            productName: orderItemsTable.productName,
            quantity: orderItemsTable.quantity,
            unitPrice: orderItemsTable.unitPrice,
            lineTotal: orderItemsTable.lineTotal,
            discountAmount: orderItemsTable.discountAmount,
            variantAdjustment: orderItemsTable.variantAdjustment,
            modifierAdjustment: orderItemsTable.modifierAdjustment,
          })
          .from(orderItemsTable)
          .where(eq(orderItemsTable.orderId, o.id));
        items = itemRows;
      }
    }

    res.json({ ...ar, payments, order, items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch AR record" });
  }
});

/* ── Record a payment ────────────────────────────────────── */
router.post("/ar/:id/payments", async (req, res) => {
  try {
    if (!requireFullTenant(req as never, res as never)) return;
    const tenantId = getTenantId(req);
    if (!tenantId) return res.status(401).json({ error: "Unauthorized" });

    const id = parseInt(req.params.id);
    const { amount, paymentMethod = "cash", staffName, notes } = req.body;

    const payAmt = parseFloat(amount);
    if (!payAmt || isNaN(payAmt) || payAmt <= 0) {
      return res.status(400).json({ error: "Valid amount required" });
    }

    const [ar] = await db
      .select()
      .from(accountsReceivableTable)
      .where(and(eq(accountsReceivableTable.id, id), eq(accountsReceivableTable.tenantId, tenantId)));

    if (!ar) return res.status(404).json({ error: "Not found" });

    const remaining = Math.round((ar.amount - ar.amountPaid) * 100) / 100;
    const applied = Math.min(payAmt, remaining);

    await db.insert(arPaymentsTable).values({
      tenantId,
      arId: id,
      amount: applied,
      paymentMethod,
      staffName: staffName ?? null,
      notes: notes ?? null,
    });

    const newAmountPaid = Math.round((ar.amountPaid + applied) * 100) / 100;
    const newStatus: string =
      newAmountPaid >= ar.amount ? "paid" : newAmountPaid > 0 ? "partial" : "open";

    const [updated] = await db
      .update(accountsReceivableTable)
      .set({ amountPaid: newAmountPaid, status: newStatus })
      .where(eq(accountsReceivableTable.id, id))
      .returning();

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to record payment" });
  }
});

/* ── Update notes / due date ─────────────────────────────── */
router.patch("/ar/:id", async (req, res) => {
  try {
    if (!requireFullTenant(req as never, res as never)) return;
    const tenantId = getTenantId(req);
    if (!tenantId) return res.status(401).json({ error: "Unauthorized" });

    const id = parseInt(req.params.id);
    const { notes, dueDate } = req.body;

    const [updated] = await db
      .update(accountsReceivableTable)
      .set({ notes: notes ?? null, dueDate: dueDate ? new Date(dueDate) : null })
      .where(and(eq(accountsReceivableTable.id, id), eq(accountsReceivableTable.tenantId, tenantId)))
      .returning();

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update AR record" });
  }
});

export default router;
