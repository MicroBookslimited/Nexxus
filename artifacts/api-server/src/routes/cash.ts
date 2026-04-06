import { Router, type IRouter } from "express";
import { eq, and, gte, lte, isNotNull, sum, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { cashSessionsTable, cashPayoutsTable, ordersTable } from "@workspace/db";
import { z } from "zod";

const router: IRouter = Router();

const OpenSessionBody = z.object({
  staffName: z.string().min(1),
  staffId: z.number().int().optional(),
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
});

/** Build sales summary and order list from a set of orders */
function computeSales(orders: { paymentMethod: string | null; total: number | null }[]) {
  const cashSales = orders
    .filter((r) => r.paymentMethod === "cash")
    .reduce((s, r) => s + Number(r.total ?? 0), 0);
  const cardSales = orders
    .filter((r) => r.paymentMethod === "card")
    .reduce((s, r) => s + Number(r.total ?? 0), 0);
  const splitSales = orders
    .filter((r) => r.paymentMethod === "split")
    .reduce((s, r) => s + Number(r.total ?? 0), 0);
  return { cashSales, cardSales, splitSales, totalSales: cashSales + cardSales + splitSales };
}

router.get("/cash/sessions", async (_req, res): Promise<void> => {
  const sessions = await db
    .select()
    .from(cashSessionsTable)
    .orderBy(sql`${cashSessionsTable.openedAt} desc`);
  res.json(sessions);
});

router.get("/cash/sessions/current", async (_req, res): Promise<void> => {
  const [session] = await db
    .select()
    .from(cashSessionsTable)
    .where(eq(cashSessionsTable.status, "open"))
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

  // Count any paid order (has a paymentMethod), regardless of kitchen status
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
        gte(ordersTable.createdAt, session.openedAt),
        isNotNull(ordersTable.paymentMethod)
      )
    )
    .orderBy(ordersTable.createdAt);

  const salesSummary = computeSales(orderRows);
  const totalPayouts = payouts.reduce((s, p) => s + p.amount, 0);
  const expectedCash = session.openingCash + salesSummary.cashSales - totalPayouts;

  res.json({
    session,
    payouts,
    orders: orderRows,
    salesSummary,
    expectedCash,
    totalPayouts,
  });
});

router.get("/cash/sessions/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid session id" });
    return;
  }

  const [session] = await db
    .select()
    .from(cashSessionsTable)
    .where(eq(cashSessionsTable.id, id));

  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

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
        gte(ordersTable.createdAt, session.openedAt),
        lte(ordersTable.createdAt, closedAt),
        isNotNull(ordersTable.paymentMethod)
      )
    )
    .orderBy(ordersTable.createdAt);

  const salesSummary = computeSales(orderRows);
  const totalPayouts = payouts.reduce((s, p) => s + p.amount, 0);
  const expectedCash = session.openingCash + salesSummary.cashSales - totalPayouts;

  res.json({
    session,
    payouts,
    orders: orderRows,
    salesSummary,
    expectedCash,
    totalPayouts,
  });
});

router.post("/cash/sessions", async (req, res): Promise<void> => {
  const parsed = OpenSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const existing = await db
    .select()
    .from(cashSessionsTable)
    .where(eq(cashSessionsTable.status, "open"))
    .limit(1);

  if (existing.length > 0) {
    res.status(409).json({ error: "A session is already open", sessionId: existing[0].id });
    return;
  }

  const [session] = await db
    .insert(cashSessionsTable)
    .values({
      staffName: parsed.data.staffName,
      staffId: parsed.data.staffId ?? null,
      openingCash: parsed.data.openingCash,
      status: "open",
    })
    .returning();

  res.status(201).json(session);
});

router.post("/cash/sessions/:id/payouts", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid session id" });
    return;
  }

  const parsed = AddPayoutBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const [session] = await db
    .select()
    .from(cashSessionsTable)
    .where(and(eq(cashSessionsTable.id, id), eq(cashSessionsTable.status, "open")));

  if (!session) {
    res.status(404).json({ error: "Open session not found" });
    return;
  }

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

router.post("/cash/sessions/:id/close", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid session id" });
    return;
  }

  const parsed = CloseSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const [session] = await db
    .select()
    .from(cashSessionsTable)
    .where(and(eq(cashSessionsTable.id, id), eq(cashSessionsTable.status, "open")));

  if (!session) {
    res.status(404).json({ error: "Open session not found" });
    return;
  }

  const [closed] = await db
    .update(cashSessionsTable)
    .set({
      status: "closed",
      closedAt: new Date(),
      actualCash: parsed.data.actualCash,
      actualCard: parsed.data.actualCard,
      actualOther: parsed.data.actualOther ?? 0,
      closingNotes: parsed.data.closingNotes ?? null,
    })
    .where(eq(cashSessionsTable.id, id))
    .returning();

  res.json(closed);
});

export default router;
