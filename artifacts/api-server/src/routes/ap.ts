import { Router, type IRouter } from "express";
import { and, asc, desc, eq, gte, lt, lte, sql, isNull, or } from "drizzle-orm";
import {
  db, apEntriesTable, apPaymentsTable, apCreditsTable, vendorsTable,
  rawMaterialPurchasesTable,
} from "@workspace/db";
import { verifyTenantToken, requireFullTenant } from "./saas-auth";
import { z } from "zod/v4";

const router: IRouter = Router();

function getTenantId(req: { headers: Record<string, string | undefined> }): number | null {
  const auth = req.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) return null;
  const p = verifyTenantToken(auth.slice(7));
  return p ? p.tenantId : null;
}

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

/** Compute status based on balance, due date */
function computeStatus(amountBalance: number, dueDate: Date | null, existing: string): string {
  if (existing === "cancelled") return "cancelled";
  if (amountBalance <= 0) return "paid";
  if (dueDate && new Date() > dueDate) return "overdue";
  if (amountBalance > 0 && amountBalance < 999999999) {
    // partial check against original total is done by caller
    return existing === "partially_paid" ? "partially_paid" : "pending";
  }
  return existing;
}

async function enrichEntry(e: typeof apEntriesTable.$inferSelect) {
  let vendorName: string | null = null;
  if (e.vendorId) {
    const [v] = await db.select({ name: vendorsTable.name }).from(vendorsTable).where(eq(vendorsTable.id, e.vendorId));
    vendorName = v?.name ?? null;
  }

  const payments = await db.select().from(apPaymentsTable)
    .where(eq(apPaymentsTable.apEntryId, e.id))
    .orderBy(desc(apPaymentsTable.paymentDate));

  // Aging bucket (days past due)
  const daysPastDue = e.dueDate ? Math.floor((Date.now() - new Date(e.dueDate).getTime()) / 86400000) : null;

  return { ...e, vendorName, payments, daysPastDue };
}

/* ─── AP Entry list ───────────────────────────────────────────────────────── */

router.get("/ap/entries", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const statusFilter = req.query.status as string | undefined;
  const vendorFilter = req.query.vendorId ? parseInt(req.query.vendorId as string) : null;

  // Update overdue statuses first
  await db.update(apEntriesTable)
    .set({ status: "overdue", updatedAt: new Date() })
    .where(and(
      eq(apEntriesTable.tenantId, tenantId),
      sql`${apEntriesTable.status} IN ('pending','partially_paid')`,
      sql`${apEntriesTable.dueDate} < NOW()`,
      sql`${apEntriesTable.amountBalance} > 0`,
    ));

  const conditions: ReturnType<typeof eq>[] = [eq(apEntriesTable.tenantId, tenantId)];
  if (statusFilter && statusFilter !== "all") conditions.push(eq(apEntriesTable.status, statusFilter) as any);
  if (vendorFilter) conditions.push(eq(apEntriesTable.vendorId, vendorFilter) as any);

  const rows = await db.select().from(apEntriesTable)
    .where(and(...conditions))
    .orderBy(desc(apEntriesTable.entryDate));

  const enriched = await Promise.all(rows.map(enrichEntry));
  res.json(enriched);
});

router.get("/ap/entries/:id", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [e] = await db.select().from(apEntriesTable)
    .where(and(eq(apEntriesTable.id, id), eq(apEntriesTable.tenantId, tenantId)));
  if (!e) { res.status(404).json({ error: "Not found" }); return; }

  res.json(await enrichEntry(e));
});

/* ─── Manual AP Entry creation ────────────────────────────────────────────── */

const CreateEntryBody = z.object({
  vendorId: z.number().int().positive().optional(),
  dueDate: z.string().optional(),
  invoiceRef: z.string().optional(),
  currency: z.string().default("JMD"),
  exchangeRate: z.number().positive().default(1),
  amountTotal: z.number().positive(),
  notes: z.string().optional(),
});

router.post("/ap/entries", async (req, res): Promise<void> => {
  if (!requireFullTenant(req as never, res as never)) return;
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = CreateEntryBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { vendorId, dueDate, invoiceRef, currency, exchangeRate, amountTotal, notes } = parsed.data;

  const [entry] = await db.insert(apEntriesTable).values({
    tenantId,
    vendorId: vendorId ?? null,
    dueDate: dueDate ? new Date(dueDate) : null,
    invoiceRef: invoiceRef ?? null,
    currency,
    exchangeRate,
    amountTotal,
    amountPaid: 0,
    amountBalance: amountTotal,
    status: "pending",
    notes: notes ?? null,
  }).returning();

  res.status(201).json(await enrichEntry(entry));
});

/* ─── Cancel AP entry ─────────────────────────────────────────────────────── */

router.patch("/ap/entries/:id/cancel", async (req, res): Promise<void> => {
  if (!requireFullTenant(req as never, res as never)) return;
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [e] = await db.select().from(apEntriesTable)
    .where(and(eq(apEntriesTable.id, id), eq(apEntriesTable.tenantId, tenantId)));
  if (!e) { res.status(404).json({ error: "Not found" }); return; }
  if (e.amountPaid > 0) { res.status(400).json({ error: "Cannot cancel an entry that has payments. Reverse the payments first." }); return; }

  const [updated] = await db.update(apEntriesTable)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(apEntriesTable.id, id))
    .returning();
  res.json(await enrichEntry(updated));
});

/* ─── Payments ────────────────────────────────────────────────────────────── */

const RecordPaymentBody = z.object({
  apEntryId: z.number().int().positive(),
  paymentDate: z.string().optional(),
  amount: z.number().positive(),
  paymentMethod: z.enum(["cash", "bank", "cheque", "transfer", "credit"]).default("cash"),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

router.post("/ap/payments", async (req, res): Promise<void> => {
  if (!requireFullTenant(req as never, res as never)) return;
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = RecordPaymentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { apEntryId, paymentDate, amount, paymentMethod, reference, notes } = parsed.data;

  const [entry] = await db.select().from(apEntriesTable)
    .where(and(eq(apEntriesTable.id, apEntryId), eq(apEntriesTable.tenantId, tenantId)));
  if (!entry) { res.status(404).json({ error: "AP entry not found" }); return; }
  if (entry.status === "cancelled") { res.status(400).json({ error: "Cannot pay a cancelled entry" }); return; }
  if (entry.status === "paid") { res.status(400).json({ error: "Entry is already fully paid" }); return; }

  // Record the payment
  await db.insert(apPaymentsTable).values({
    tenantId,
    apEntryId,
    vendorId: entry.vendorId,
    paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
    amount,
    paymentMethod,
    reference: reference ?? null,
    notes: notes ?? null,
  });

  // Update entry balance
  const newPaid = entry.amountPaid + amount;
  const newBalance = Math.max(0, entry.amountTotal - newPaid);
  const overpayment = newPaid > entry.amountTotal ? newPaid - entry.amountTotal : 0;

  let newStatus: string;
  if (newBalance <= 0) {
    newStatus = "paid";
  } else if (newPaid > 0) {
    newStatus = "partially_paid";
  } else {
    newStatus = "pending";
  }

  const [updatedEntry] = await db.update(apEntriesTable)
    .set({ amountPaid: newPaid, amountBalance: newBalance, status: newStatus, updatedAt: new Date() })
    .where(eq(apEntriesTable.id, apEntryId))
    .returning();

  // Handle overpayment — store as vendor credit
  if (overpayment > 0 && entry.vendorId) {
    await db.insert(apCreditsTable).values({
      tenantId,
      vendorId: entry.vendorId,
      amount: overpayment,
      usedAmount: 0,
      availableAmount: overpayment,
      reason: `Overpayment on AP entry #${apEntryId}`,
    });
  }

  res.status(201).json(await enrichEntry(updatedEntry));
});

/* ─── Summary (dashboard) ─────────────────────────────────────────────────── */

router.get("/ap/summary", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  // Auto-update overdue statuses
  await db.update(apEntriesTable)
    .set({ status: "overdue", updatedAt: new Date() })
    .where(and(
      eq(apEntriesTable.tenantId, tenantId),
      sql`${apEntriesTable.status} IN ('pending','partially_paid')`,
      sql`${apEntriesTable.dueDate} < NOW()`,
      sql`${apEntriesTable.amountBalance} > 0`,
    ));

  const [totals] = await db.select({
    totalPayable: sql<number>`COALESCE(SUM(CASE WHEN status != 'cancelled' AND status != 'paid' THEN amount_balance ELSE 0 END), 0)`,
    totalOverdue: sql<number>`COALESCE(SUM(CASE WHEN status = 'overdue' THEN amount_balance ELSE 0 END), 0)`,
    totalPaid30d: sql<number>`COALESCE(SUM(CASE WHEN status = 'paid' AND updated_at >= NOW() - INTERVAL '30 days' THEN amount_total ELSE 0 END), 0)`,
    pendingCount: sql<number>`COUNT(CASE WHEN status IN ('pending','partially_paid','overdue') THEN 1 END)`,
    overdueCount: sql<number>`COUNT(CASE WHEN status = 'overdue' THEN 1 END)`,
  }).from(apEntriesTable).where(eq(apEntriesTable.tenantId, tenantId));

  // Due in next 7 days
  const next7 = new Date();
  next7.setDate(next7.getDate() + 7);
  const [dueSoon] = await db.select({
    count: sql<number>`COUNT(*)`,
    amount: sql<number>`COALESCE(SUM(amount_balance), 0)`,
  }).from(apEntriesTable).where(and(
    eq(apEntriesTable.tenantId, tenantId),
    sql`${apEntriesTable.status} IN ('pending','partially_paid')`,
    sql`${apEntriesTable.dueDate} BETWEEN NOW() AND ${next7.toISOString()}`,
  ));

  // Vendor credits available
  const [credits] = await db.select({
    total: sql<number>`COALESCE(SUM(available_amount), 0)`,
  }).from(apCreditsTable).where(and(
    eq(apCreditsTable.tenantId, tenantId),
    sql`available_amount > 0`,
  ));

  res.json({
    totalPayable: totals?.totalPayable ?? 0,
    totalOverdue: totals?.totalOverdue ?? 0,
    totalPaid30d: totals?.totalPaid30d ?? 0,
    pendingCount: totals?.pendingCount ?? 0,
    overdueCount: totals?.overdueCount ?? 0,
    dueSoonCount: dueSoon?.count ?? 0,
    dueSoonAmount: dueSoon?.amount ?? 0,
    availableCredits: credits?.total ?? 0,
  });
});

/* ─── Aging Report ────────────────────────────────────────────────────────── */

router.get("/ap/reports/aging", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  // Update overdue statuses
  await db.update(apEntriesTable)
    .set({ status: "overdue", updatedAt: new Date() })
    .where(and(
      eq(apEntriesTable.tenantId, tenantId),
      sql`${apEntriesTable.status} IN ('pending','partially_paid')`,
      sql`${apEntriesTable.dueDate} < NOW()`,
      sql`${apEntriesTable.amountBalance} > 0`,
    ));

  const [buckets] = await db.select({
    current:    sql<number>`COALESCE(SUM(CASE WHEN due_date IS NULL OR due_date >= NOW() THEN amount_balance ELSE 0 END), 0)`,
    days1_30:   sql<number>`COALESCE(SUM(CASE WHEN due_date < NOW() AND due_date >= NOW() - INTERVAL '30 days' THEN amount_balance ELSE 0 END), 0)`,
    days31_60:  sql<number>`COALESCE(SUM(CASE WHEN due_date < NOW() - INTERVAL '30 days' AND due_date >= NOW() - INTERVAL '60 days' THEN amount_balance ELSE 0 END), 0)`,
    days61_90:  sql<number>`COALESCE(SUM(CASE WHEN due_date < NOW() - INTERVAL '60 days' AND due_date >= NOW() - INTERVAL '90 days' THEN amount_balance ELSE 0 END), 0)`,
    over90:     sql<number>`COALESCE(SUM(CASE WHEN due_date < NOW() - INTERVAL '90 days' THEN amount_balance ELSE 0 END), 0)`,
  }).from(apEntriesTable).where(and(
    eq(apEntriesTable.tenantId, tenantId),
    sql`${apEntriesTable.status} NOT IN ('paid','cancelled')`,
  ));

  // Per-vendor breakdown
  const vendorRows = await db.select({
    vendorId: apEntriesTable.vendorId,
    vendorName: vendorsTable.name,
    current:   sql<number>`COALESCE(SUM(CASE WHEN due_date IS NULL OR due_date >= NOW() THEN amount_balance ELSE 0 END), 0)`,
    days1_30:  sql<number>`COALESCE(SUM(CASE WHEN due_date < NOW() AND due_date >= NOW() - INTERVAL '30 days' THEN amount_balance ELSE 0 END), 0)`,
    days31_60: sql<number>`COALESCE(SUM(CASE WHEN due_date < NOW() - INTERVAL '30 days' AND due_date >= NOW() - INTERVAL '60 days' THEN amount_balance ELSE 0 END), 0)`,
    days61_90: sql<number>`COALESCE(SUM(CASE WHEN due_date < NOW() - INTERVAL '60 days' AND due_date >= NOW() - INTERVAL '90 days' THEN amount_balance ELSE 0 END), 0)`,
    over90:    sql<number>`COALESCE(SUM(CASE WHEN due_date < NOW() - INTERVAL '90 days' THEN amount_balance ELSE 0 END), 0)`,
    total:     sql<number>`COALESCE(SUM(amount_balance), 0)`,
  }).from(apEntriesTable)
    .leftJoin(vendorsTable, eq(apEntriesTable.vendorId, vendorsTable.id))
    .where(and(
      eq(apEntriesTable.tenantId, tenantId),
      sql`${apEntriesTable.status} NOT IN ('paid','cancelled')`,
    ))
    .groupBy(apEntriesTable.vendorId, vendorsTable.name)
    .having(sql`SUM(amount_balance) > 0`);

  res.json({ buckets, vendors: vendorRows });
});

/* ─── Supplier Ledger ──────────────────────────────────────────────────────── */

router.get("/ap/reports/supplier-ledger/:vendorId", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const vendorId = parseInt(req.params.vendorId);
  if (isNaN(vendorId)) { res.status(400).json({ error: "Invalid vendorId" }); return; }

  const [vendor] = await db.select().from(vendorsTable)
    .where(and(eq(vendorsTable.id, vendorId), eq(vendorsTable.tenantId, tenantId)));
  if (!vendor) { res.status(404).json({ error: "Vendor not found" }); return; }

  const entries = await db.select().from(apEntriesTable)
    .where(and(eq(apEntriesTable.vendorId, vendorId), eq(apEntriesTable.tenantId, tenantId)))
    .orderBy(asc(apEntriesTable.entryDate));

  const payments = await db.select().from(apPaymentsTable)
    .where(and(eq(apPaymentsTable.vendorId, vendorId), eq(apPaymentsTable.tenantId, tenantId)))
    .orderBy(asc(apPaymentsTable.paymentDate));

  const credits = await db.select().from(apCreditsTable)
    .where(and(eq(apCreditsTable.vendorId, vendorId), eq(apCreditsTable.tenantId, tenantId)));

  const totalPurchased = entries.filter(e => e.status !== "cancelled").reduce((s, e) => s + e.amountTotal, 0);
  const totalPaid      = entries.reduce((s, e) => s + e.amountPaid, 0);
  const totalBalance   = entries.filter(e => e.status !== "paid" && e.status !== "cancelled").reduce((s, e) => s + e.amountBalance, 0);
  const totalCredits   = credits.reduce((s, c) => s + c.availableAmount, 0);

  res.json({ vendor, entries, payments, credits, summary: { totalPurchased, totalPaid, totalBalance, totalCredits } });
});

/* ─── Payments list ───────────────────────────────────────────────────────── */

router.get("/ap/payments", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const rows = await db.select({
    id: apPaymentsTable.id,
    apEntryId: apPaymentsTable.apEntryId,
    vendorId: apPaymentsTable.vendorId,
    vendorName: vendorsTable.name,
    paymentDate: apPaymentsTable.paymentDate,
    amount: apPaymentsTable.amount,
    paymentMethod: apPaymentsTable.paymentMethod,
    reference: apPaymentsTable.reference,
    notes: apPaymentsTable.notes,
    createdAt: apPaymentsTable.createdAt,
  }).from(apPaymentsTable)
    .leftJoin(vendorsTable, eq(apPaymentsTable.vendorId, vendorsTable.id))
    .where(eq(apPaymentsTable.tenantId, tenantId))
    .orderBy(desc(apPaymentsTable.paymentDate))
    .limit(200);

  res.json(rows);
});

/* ─── Vendor credits list ─────────────────────────────────────────────────── */

router.get("/ap/credits", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const rows = await db.select({
    id: apCreditsTable.id,
    vendorId: apCreditsTable.vendorId,
    vendorName: vendorsTable.name,
    amount: apCreditsTable.amount,
    usedAmount: apCreditsTable.usedAmount,
    availableAmount: apCreditsTable.availableAmount,
    reason: apCreditsTable.reason,
    createdAt: apCreditsTable.createdAt,
  }).from(apCreditsTable)
    .leftJoin(vendorsTable, eq(apCreditsTable.vendorId, vendorsTable.id))
    .where(and(eq(apCreditsTable.tenantId, tenantId), sql`${apCreditsTable.availableAmount} > 0`))
    .orderBy(desc(apCreditsTable.createdAt));

  res.json(rows);
});

export default router;
