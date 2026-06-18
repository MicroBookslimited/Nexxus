import { Router, type IRouter } from "express";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { diningTablesTable, ordersTable, customersTable } from "@workspace/db";
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

const CreateTableBody = z.object({
  name: z.string().min(1),
  capacity: z.number().int().min(1).optional().default(4),
  color: z.string().optional().default("blue"),
  positionX: z.number().int().optional().default(0),
  positionY: z.number().int().optional().default(0),
});

const UpdateTableBody = z.object({
  name: z.string().min(1).optional(),
  capacity: z.number().int().min(1).optional(),
  color: z.string().optional(),
  status: z.enum(["available", "occupied", "reserved", "billed"]).optional(),
  currentOrderId: z.number().int().nullable().optional(),
  positionX: z.number().int().optional(),
  positionY: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

router.get("/tables", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const rows = await db
    .select({
      id: diningTablesTable.id,
      name: diningTablesTable.name,
      capacity: diningTablesTable.capacity,
      color: diningTablesTable.color,
      status: diningTablesTable.status,
      currentOrderId: diningTablesTable.currentOrderId,
      currentOrderNumber: ordersTable.orderNumber,
      positionX: diningTablesTable.positionX,
      positionY: diningTablesTable.positionY,
      isActive: diningTablesTable.isActive,
      createdAt: diningTablesTable.createdAt,
    })
    .from(diningTablesTable)
    .leftJoin(ordersTable, eq(diningTablesTable.currentOrderId, ordersTable.id))
    .where(eq(diningTablesTable.tenantId, tenantId))
    .orderBy(diningTablesTable.name);

  res.json(rows.map(t => ({
    ...t,
    currentOrderId: t.currentOrderId ?? undefined,
    currentOrderNumber: t.currentOrderNumber ?? undefined,
  })));
});

router.post("/tables", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = CreateTableBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const [table] = await db.insert(diningTablesTable).values({
    tenantId,
    name: parsed.data.name,
    capacity: parsed.data.capacity,
    color: parsed.data.color,
    positionX: parsed.data.positionX,
    positionY: parsed.data.positionY,
    status: "available",
    isActive: true,
  }).returning();

  res.status(201).json({ ...table, currentOrderId: table.currentOrderId ?? undefined });
});

router.patch("/tables/:id", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = Array.isArray(req.params.id) ? parseInt(req.params.id[0]) : parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid table id" });
    return;
  }

  const parsed = UpdateTableBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const updates: Partial<typeof diningTablesTable.$inferInsert> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.capacity !== undefined) updates.capacity = parsed.data.capacity;
  if (parsed.data.color !== undefined) updates.color = parsed.data.color;
  if (parsed.data.status !== undefined) updates.status = parsed.data.status;
  if (parsed.data.positionX !== undefined) updates.positionX = parsed.data.positionX;
  if (parsed.data.positionY !== undefined) updates.positionY = parsed.data.positionY;
  if (parsed.data.isActive !== undefined) updates.isActive = parsed.data.isActive;
  if ("currentOrderId" in parsed.data) updates.currentOrderId = parsed.data.currentOrderId ?? null;

  const [table] = await db
    .update(diningTablesTable)
    .set(updates)
    .where(and(eq(diningTablesTable.id, id), eq(diningTablesTable.tenantId, tenantId)))
    .returning();

  if (!table) {
    res.status(404).json({ error: "Table not found" });
    return;
  }

  res.json({ ...table, currentOrderId: table.currentOrderId ?? undefined });
});

/* ── Close table — atomically charges all open orders and frees the table ── */
const CloseTableBody = z.object({
  paymentMethod: z.string().min(1),
  cardType: z.string().optional(),
  splitCardAmount: z.number().optional(),
  splitCashAmount: z.number().optional(),
});

router.post("/tables/:id/close", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const tableId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  if (isNaN(tableId)) { res.status(400).json({ error: "Invalid table id" }); return; }

  const parsed = CloseTableBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request body" }); return; }

  const openOrders = await db
    .select()
    .from(ordersTable)
    .where(and(
      eq(ordersTable.tenantId, tenantId),
      eq(ordersTable.tableId as any, tableId),
      eq(ordersTable.status, "open"),
    ));

  if (openOrders.length === 0) {
    res.status(400).json({ error: "No open orders found for this table." });
    return;
  }

  const orderIds = openOrders.map((o) => o.id);
  const grandTotal = openOrders.reduce((s, o) => s + (o.total ?? 0), 0);

  await db.transaction(async (tx) => {
    await tx
      .update(ordersTable)
      .set({
        status: "completed",
        completedAt: new Date(),
        paymentMethod: parsed.data.paymentMethod,
        cardType: parsed.data.cardType ?? null,
        splitCardAmount: parsed.data.splitCardAmount ?? null,
        splitCashAmount: parsed.data.splitCashAmount ?? null,
      })
      .where(and(eq(ordersTable.tenantId, tenantId), inArray(ordersTable.id, orderIds)));

    const LOYALTY_EARN_RATE = 10;
    const customerOrderCount = new Map<number, number>();
    const customerSpent = new Map<number, number>();
    for (const order of openOrders) {
      if (!order.customerId) continue;
      customerSpent.set(order.customerId, (customerSpent.get(order.customerId) ?? 0) + (order.total ?? 0));
      customerOrderCount.set(order.customerId, (customerOrderCount.get(order.customerId) ?? 0) + 1);
    }
    for (const [customerId, spent] of customerSpent) {
      const pointsEarned = Math.floor(spent / LOYALTY_EARN_RATE);
      const orderCount = customerOrderCount.get(customerId) ?? 1;
      await tx
        .update(customersTable)
        .set({
          totalSpent: sql`${customersTable.totalSpent} + ${spent}`,
          orderCount: sql`${customersTable.orderCount} + ${orderCount}`,
          loyaltyPoints: sql`GREATEST(0, ${customersTable.loyaltyPoints} + ${pointsEarned})`,
        })
        .where(and(eq(customersTable.id, customerId), eq(customersTable.tenantId, tenantId)));
    }

    await tx
      .update(diningTablesTable)
      .set({ status: "available", currentOrderId: null })
      .where(and(eq(diningTablesTable.id, tableId), eq(diningTablesTable.tenantId, tenantId)));
  });

  res.json({ closedOrderIds: orderIds, total: grandTotal });
});

router.delete("/tables/:id", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = Array.isArray(req.params.id) ? parseInt(req.params.id[0]) : parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid table id" });
    return;
  }

  await db.delete(diningTablesTable)
    .where(and(eq(diningTablesTable.id, id), eq(diningTablesTable.tenantId, tenantId)));
  res.status(204).send();
});

export default router;
