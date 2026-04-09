import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  accountsReceivableTable,
  arPaymentsTable,
  customersTable,
} from "@workspace/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { verifyTenantToken } from "./saas-auth.js";

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
      .leftJoin(customersTable, eq(accountsReceivableTable.customerId, customersTable.id))
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

/* ── Single AR record with payments ─────────────────────── */
router.get("/ar/:id", async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) return res.status(401).json({ error: "Unauthorized" });

    const id = parseInt(req.params.id);
    const [ar] = await db
      .select()
      .from(accountsReceivableTable)
      .where(and(eq(accountsReceivableTable.id, id), eq(accountsReceivableTable.tenantId, tenantId)));

    if (!ar) return res.status(404).json({ error: "Not found" });

    const payments = await db
      .select()
      .from(arPaymentsTable)
      .where(eq(arPaymentsTable.arId, id))
      .orderBy(desc(arPaymentsTable.createdAt));

    res.json({ ...ar, payments });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch AR record" });
  }
});

/* ── Record a payment ────────────────────────────────────── */
router.post("/ar/:id/payments", async (req, res) => {
  try {
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
