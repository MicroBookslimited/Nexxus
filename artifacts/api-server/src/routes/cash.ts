import { Router, type IRouter } from "express";
import { eq, and, gte, lte, isNotNull, sql, desc } from "drizzle-orm";
import { db, cashSessionsTable, cashPayoutsTable, ordersTable, orderItemsTable, customersTable, accountsReceivableTable, productsTable } from "@workspace/db";
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

const OpenSessionBody = z.object({
  staffName: z.string().min(1),
  staffId: z.number().int().optional(),
  locationId: z.number().int().optional(),
  locationName: z.string().optional(),
  openingCash: z.number().min(0),
});

const AddPayoutBody = z.object({
  amount: z.number().min(0.01),
  reason: z.string().min(1),
  staffName: z.string().min(1),
});

const CloseSessionBody = z.object({
  actualCash: z.number().min(0),
  actualCard: z.number().min(0),
  actualOther: z.number().min(0).optional(),
  closingNotes: z.string().optional(),
  denominationBreakdown: z.string().optional(),
});

function computeSales(orders: { paymentMethod: string | null; total: number | null; status: string | null }[]) {
  // Voided orders never completed — exclude from all sales.
  // Refunded orders DID complete as sales first, so include them in gross sales
  // and also track them separately as refunds (net = 0 for that order).
  const notVoided = orders.filter((r) => r.status !== "voided");
  const refunded  = orders.filter((r) => r.status === "refunded");

  const cashSales   = notVoided.filter((r) => r.paymentMethod === "cash").reduce((s, r) => s + Number(r.total ?? 0), 0);
  const cardSales   = notVoided.filter((r) => r.paymentMethod === "card").reduce((s, r) => s + Number(r.total ?? 0), 0);
  const splitSales  = notVoided.filter((r) => r.paymentMethod === "split").reduce((s, r) => s + Number(r.total ?? 0), 0);
  const creditSales = notVoided.filter((r) => r.paymentMethod === "credit").reduce((s, r) => s + Number(r.total ?? 0), 0);

  const voided = orders.filter((r) => r.status === "voided");

  const refundedCash  = refunded.filter((r) => r.paymentMethod === "cash").reduce((s, r) => s + Number(r.total ?? 0), 0);
  const refundedCard  = refunded.filter((r) => r.paymentMethod === "card").reduce((s, r) => s + Number(r.total ?? 0), 0);
  const refundedOther = refunded.filter((r) => r.paymentMethod !== "cash" && r.paymentMethod !== "card").reduce((s, r) => s + Number(r.total ?? 0), 0);
  const totalRefunds  = refundedCash + refundedCard + refundedOther;

  const voidedCount = voided.length;
  const voidedTotal = voided.reduce((s, r) => s + Number(r.total ?? 0), 0);

  return {
    cashSales, cardSales, splitSales, creditSales,
    totalSales: cashSales + cardSales + splitSales + creditSales,
    refundedCash, refundedCard, refundedOther, totalRefunds,
    voidedCount, voidedTotal,
  };
}

async function computeCreditOrders(tenantId: number, from: Date, to: Date) {
  return db
    .select({
      orderNumber: ordersTable.orderNumber,
      total: ordersTable.total,
      customerName: customersTable.name,
      customerPhone: customersTable.phone,
      arId: accountsReceivableTable.id,
      amountPaid: accountsReceivableTable.amountPaid,
      arStatus: accountsReceivableTable.status,
      createdAt: ordersTable.createdAt,
    })
    .from(ordersTable)
    .leftJoin(customersTable, eq(ordersTable.customerId, customersTable.id))
    .leftJoin(accountsReceivableTable, eq(accountsReceivableTable.orderId, ordersTable.id))
    .where(
      and(
        eq(ordersTable.tenantId, tenantId),
        gte(ordersTable.createdAt, from),
        lte(ordersTable.createdAt, to),
        eq(ordersTable.paymentMethod, "credit"),
      )
    )
    .orderBy(desc(ordersTable.createdAt));
}

async function computeItemSummary(tenantId: number, from: Date, to: Date) {
  return db
    .select({
      productName: orderItemsTable.productName,
      sku: productsTable.barcode,
      totalQty: sql<number>`cast(sum(${orderItemsTable.quantity}) as int)`.as("total_qty"),
      totalRevenue: sql<number>`sum(${orderItemsTable.lineTotal})`.as("total_revenue"),
      totalTax: sql<number>`sum(${orderItemsTable.lineTotal} / NULLIF(${ordersTable.subtotal}, 0) * COALESCE(${ordersTable.tax}, 0))`.as("total_tax"),
    })
    .from(orderItemsTable)
    .innerJoin(ordersTable, eq(orderItemsTable.orderId, ordersTable.id))
    .leftJoin(productsTable, eq(orderItemsTable.productId, productsTable.id))
    .where(
      and(
        eq(ordersTable.tenantId, tenantId),
        gte(ordersTable.createdAt, from),
        lte(ordersTable.createdAt, to),
        isNotNull(ordersTable.paymentMethod),
      )
    )
    .groupBy(orderItemsTable.productName, productsTable.barcode)
    .orderBy(sql`sum(${orderItemsTable.quantity}) desc`);
}

router.get("/cash/sessions", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const sessions = await db
    .select()
    .from(cashSessionsTable)
    .where(eq(cashSessionsTable.tenantId, tenantId))
    .orderBy(sql`${cashSessionsTable.openedAt} desc`);
  res.json(sessions);
});

/* ─── GET /cash/register-report  (Admin / Manager only) ─── */
router.get("/cash/register-report", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { from, to } = req.query as { from?: string; to?: string };

  // Build conditions
  const conditions = [eq(cashSessionsTable.tenantId, tenantId)];
  if (from) conditions.push(gte(cashSessionsTable.openedAt, new Date(from)));
  if (to)   conditions.push(lte(cashSessionsTable.openedAt, new Date(`${to}T23:59:59`)));

  const sessions = await db
    .select()
    .from(cashSessionsTable)
    .where(and(...conditions))
    .orderBy(desc(cashSessionsTable.openedAt));

  // For each session aggregate orders by payment method
  const report = await Promise.all(sessions.map(async (s) => {
    const closedAt = s.closedAt ?? new Date();

    // Scope orders to this cashier's staffId so overlapping sessions (multiple
    // simultaneous cashiers) don't bleed into each other's totals.
    const sessionConditions = [
      eq(ordersTable.tenantId, tenantId),
      gte(ordersTable.createdAt, s.openedAt),
      lte(ordersTable.createdAt, closedAt),
      isNotNull(ordersTable.paymentMethod),
      ...(s.staffId ? [eq(ordersTable.staffId, s.staffId)] : []),
    ];

    const orderRows = await db
      .select({
        total: ordersTable.total,
        paymentMethod: ordersTable.paymentMethod,
        status: ordersTable.status,
        splitCashAmount: ordersTable.splitCashAmount,
        splitCardAmount: ordersTable.splitCardAmount,
      })
      .from(ordersTable)
      .where(and(...sessionConditions));

    const sales = computeSales(orderRows);

    // For split payments, attribute each portion to its correct column so
    // Cash and Card Slips totals reflect exactly what each tender received.
    const notVoided = orderRows.filter(r => r.status !== "voided");
    const splitCash = notVoided
      .filter(r => r.paymentMethod === "split")
      .reduce((s, r) => s + Number(r.splitCashAmount ?? 0), 0);
    const splitCard = notVoided
      .filter(r => r.paymentMethod === "split")
      .reduce((s, r) => s + Number(r.splitCardAmount ?? 0), 0);

    return {
      id:           s.id,
      openedAt:     s.openedAt,
      closedAt:     s.closedAt,
      status:       s.status,
      staffName:    s.staffName,
      locationName: s.locationName,
      openingCash:  s.openingCash,
      // Cash = pure cash orders + cash portion of split payments
      cashSales:    sales.cashSales - sales.refundedCash + splitCash,
      // Card = pure card orders + card portion of split payments
      cardSales:    sales.cardSales - sales.refundedCard + splitCard,
      creditSales:  sales.creditSales,
      // Split total kept for audit trail but cash/card already broken out above
      splitSales:   sales.splitSales,
      totalSales:   sales.totalSales - sales.totalRefunds,
      refunds:      sales.totalRefunds,
      orderCount:   orderRows.filter(r => r.status !== "voided").length,
    };
  }));

  res.json(report);
});

router.get("/cash/sessions/current", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  // Use x-staff-id header to scope the session to the requesting cashier.
  // This allows multiple cashiers to have simultaneous open sessions.
  const staffIdHeader = (req as never as { headers: { "x-staff-id"?: string } }).headers["x-staff-id"];
  const staffId = staffIdHeader ? parseInt(staffIdHeader) : null;

  const whereClause = staffId && !isNaN(staffId)
    ? and(eq(cashSessionsTable.status, "open"), eq(cashSessionsTable.tenantId, tenantId), eq(cashSessionsTable.staffId, staffId))
    : and(eq(cashSessionsTable.status, "open"), eq(cashSessionsTable.tenantId, tenantId));

  const [session] = await db
    .select()
    .from(cashSessionsTable)
    .where(whereClause)
    .orderBy(sql`${cashSessionsTable.openedAt} desc`)
    .limit(1);

  if (!session) {
    res.status(404).json({ error: "No open session" });
    return;
  }

  const payouts = await db
    .select()
    .from(cashPayoutsTable)
    .where(eq(cashPayoutsTable.sessionId, session.id))
    .orderBy(cashPayoutsTable.createdAt);

  const orderRows = await db
    .select({
      id: ordersTable.id,
      orderNumber: ordersTable.orderNumber,
      total: ordersTable.total,
      paymentMethod: ordersTable.paymentMethod,
      status: ordersTable.status,
      createdAt: ordersTable.createdAt,
    })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.tenantId, tenantId),
        gte(ordersTable.createdAt, session.openedAt),
        isNotNull(ordersTable.paymentMethod),
        ...(session.staffId ? [eq(ordersTable.staffId, session.staffId)] : []),
      )
    )
    .orderBy(ordersTable.createdAt);

  const salesSummary = computeSales(orderRows);
  const totalPayouts = payouts.reduce((s, p) => s + p.amount, 0);
  const expectedCash = session.openingCash + salesSummary.cashSales - totalPayouts - salesSummary.refundedCash;
  const itemSummary = await computeItemSummary(tenantId, session.openedAt, new Date());
  const creditOrders = await computeCreditOrders(tenantId, session.openedAt, new Date());

  res.json({ session, payouts, orders: orderRows, salesSummary, expectedCash, totalPayouts, itemSummary, creditOrders });
});

router.get("/cash/sessions/:id", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid session id" }); return; }

  const [session] = await db
    .select()
    .from(cashSessionsTable)
    .where(and(eq(cashSessionsTable.id, id), eq(cashSessionsTable.tenantId, tenantId)));

  if (!session) { res.status(404).json({ error: "Session not found" }); return; }

  const payouts = await db
    .select()
    .from(cashPayoutsTable)
    .where(eq(cashPayoutsTable.sessionId, id))
    .orderBy(cashPayoutsTable.createdAt);

  const closedAt = session.closedAt ?? new Date();

  const orderRows = await db
    .select({
      id: ordersTable.id,
      orderNumber: ordersTable.orderNumber,
      total: ordersTable.total,
      paymentMethod: ordersTable.paymentMethod,
      status: ordersTable.status,
      createdAt: ordersTable.createdAt,
    })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.tenantId, tenantId),
        gte(ordersTable.createdAt, session.openedAt),
        lte(ordersTable.createdAt, closedAt),
        isNotNull(ordersTable.paymentMethod),
        ...(session.staffId ? [eq(ordersTable.staffId, session.staffId)] : []),
      )
    )
    .orderBy(ordersTable.createdAt);

  const salesSummary = computeSales(orderRows);
  const totalPayouts = payouts.reduce((s, p) => s + p.amount, 0);
  const expectedCash = session.openingCash + salesSummary.cashSales - totalPayouts - salesSummary.refundedCash;
  const itemSummary = await computeItemSummary(tenantId, session.openedAt, closedAt);
  const creditOrders = await computeCreditOrders(tenantId, session.openedAt, closedAt);

  res.json({ session, payouts, orders: orderRows, salesSummary, expectedCash, totalPayouts, itemSummary, creditOrders });
});

router.post("/cash/sessions", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = OpenSessionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request body" }); return; }

  // Scope conflict check to this specific cashier (staffId) so multiple
  // cashiers can each have their own simultaneous open session.
  const incomingStaffId = parsed.data.staffId ?? null;
  const conflictWhere = incomingStaffId
    ? and(eq(cashSessionsTable.status, "open"), eq(cashSessionsTable.tenantId, tenantId), eq(cashSessionsTable.staffId, incomingStaffId))
    : and(eq(cashSessionsTable.status, "open"), eq(cashSessionsTable.tenantId, tenantId));

  const existing = await db
    .select()
    .from(cashSessionsTable)
    .where(conflictWhere)
    .limit(1);

  if (existing.length > 0) {
    res.status(409).json({ error: "A session is already open", sessionId: existing[0].id });
    return;
  }

  const [session] = await db
    .insert(cashSessionsTable)
    .values({
      tenantId,
      staffName: parsed.data.staffName,
      staffId: incomingStaffId,
      locationId: parsed.data.locationId ?? null,
      locationName: parsed.data.locationName ?? null,
      openingCash: parsed.data.openingCash,
      status: "open",
    })
    .returning();

  res.status(201).json(session);
});

router.post("/cash/sessions/:id/payouts", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid session id" }); return; }

  const parsed = AddPayoutBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request body" }); return; }

  const [session] = await db
    .select()
    .from(cashSessionsTable)
    .where(and(eq(cashSessionsTable.id, id), eq(cashSessionsTable.status, "open"), eq(cashSessionsTable.tenantId, tenantId)));

  if (!session) { res.status(404).json({ error: "Open session not found" }); return; }

  const [payout] = await db
    .insert(cashPayoutsTable)
    .values({
      sessionId: id,
      amount: parsed.data.amount,
      reason: parsed.data.reason,
      staffName: parsed.data.staffName,
    })
    .returning();

  res.status(201).json(payout);
});

/* Force-close any stuck open session for this tenant (manager recovery) */
router.post("/cash/sessions/force-close", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [existing] = await db
    .select()
    .from(cashSessionsTable)
    .where(and(eq(cashSessionsTable.status, "open"), eq(cashSessionsTable.tenantId, tenantId)))
    .orderBy(sql`${cashSessionsTable.openedAt} desc`)
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "No open session found" });
    return;
  }

  const [closed] = await db
    .update(cashSessionsTable)
    .set({
      status: "closed",
      closedAt: new Date(),
      actualCash: existing.openingCash,
      closingNotes: "Force-closed by manager to recover stuck session",
    })
    .where(and(eq(cashSessionsTable.id, existing.id), eq(cashSessionsTable.tenantId, tenantId)))
    .returning();

  res.json(closed);
});

router.post("/cash/sessions/:id/close", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid session id" }); return; }

  const parsed = CloseSessionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request body" }); return; }

  const [session] = await db
    .select()
    .from(cashSessionsTable)
    .where(and(eq(cashSessionsTable.id, id), eq(cashSessionsTable.status, "open"), eq(cashSessionsTable.tenantId, tenantId)));

  if (!session) { res.status(404).json({ error: "Open session not found" }); return; }

  const [closed] = await db
    .update(cashSessionsTable)
    .set({
      status: "closed",
      closedAt: new Date(),
      actualCash: parsed.data.actualCash,
      actualCard: parsed.data.actualCard,
      actualOther: parsed.data.actualOther ?? 0,
      closingNotes: parsed.data.closingNotes ?? null,
      denominationBreakdown: parsed.data.denominationBreakdown ?? null,
    })
    .where(and(eq(cashSessionsTable.id, id), eq(cashSessionsTable.tenantId, tenantId)))
    .returning();

  res.json(closed);
});

/* ─── POST /cash/sessions/:id/admin-close — manager force-closes any session ─── */
router.post("/cash/sessions/:id/admin-close", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid session id" }); return; }

  const [session] = await db
    .select()
    .from(cashSessionsTable)
    .where(and(eq(cashSessionsTable.id, id), eq(cashSessionsTable.tenantId, tenantId), eq(cashSessionsTable.status, "open")));

  if (!session) { res.status(404).json({ error: "Open session not found" }); return; }

  // Compute expected cash so we can close with reasonable actuals
  const payouts = await db.select().from(cashPayoutsTable).where(eq(cashPayoutsTable.sessionId, id));
  const totalPayouts = payouts.reduce((s, p) => s + p.amount, 0);

  const orderRows = await db
    .select({ paymentMethod: ordersTable.paymentMethod, total: ordersTable.total, status: ordersTable.status })
    .from(ordersTable)
    .where(and(
      eq(ordersTable.tenantId, tenantId),
      gte(ordersTable.createdAt, session.openedAt),
      isNotNull(ordersTable.paymentMethod),
      ...(session.staffId ? [eq(ordersTable.staffId, session.staffId)] : []),
    ));

  const sales = computeSales(orderRows);
  const expectedCash = session.openingCash + sales.cashSales - totalPayouts - sales.refundedCash;

  const [closed] = await db
    .update(cashSessionsTable)
    .set({
      status: "closed",
      closedAt: new Date(),
      actualCash: expectedCash,
      actualCard: sales.cardSales - sales.refundedCard,
      actualOther: 0,
      closingNotes: (req.body as any).notes ?? "Closed by manager",
    })
    .where(and(eq(cashSessionsTable.id, id), eq(cashSessionsTable.tenantId, tenantId)))
    .returning();

  res.json(closed);
});

export default router;
