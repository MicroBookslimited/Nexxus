import { Router, type IRouter } from "express";
import { and, eq, inArray, isNull, lt, or } from "drizzle-orm";
import { db, ordersTable, orderItemsTable, productsTable, kdsScreensTable, diningTablesTable } from "@workspace/db";
import { verifyTenantToken } from "./saas-auth";

const KITCHEN_EXPIRY_HOURS = 48;

const router: IRouter = Router();

/* ─── Auth helper ─── */
function getTenantId(req: { headers: Record<string, string | undefined> }): number | null {
  const auth = req.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) return null;
  const p = verifyTenantToken(auth.slice(7));
  return p ? p.tenantId : null;
}

router.get("/kitchen", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  // Auto-expire orders older than 48 hours (fire-and-forget)
  const expiryThreshold = new Date(Date.now() - KITCHEN_EXPIRY_HOURS * 60 * 60 * 1000);
  db.update(ordersTable)
    .set({ kitchenStatus: "completed" })
    .where(and(
      eq(ordersTable.tenantId, tenantId),
      lt(ordersTable.createdAt, expiryThreshold),
      inArray(ordersTable.kitchenStatus, ["pending", "preparing", "ready"]),
    ))
    .catch(() => {});
  // Also expire legacy orders without kitchenStatus
  db.update(ordersTable)
    .set({ status: "completed" })
    .where(and(
      eq(ordersTable.tenantId, tenantId),
      lt(ordersTable.createdAt, expiryThreshold),
      isNull(ordersTable.kitchenStatus),
      inArray(ordersTable.status, ["open", "pending", "preparing", "ready"]),
    ))
    .catch(() => {});

  const activeOrders = await db
    .select()
    .from(ordersTable)
    .where(and(
      eq(ordersTable.tenantId, tenantId),
      or(
        // New orders: use kitchenStatus field (active or cancelled-but-was-sent)
        inArray(ordersTable.kitchenStatus, ["pending", "preparing", "ready"]),
        // Voided/refunded orders that had already been sent to the kitchen
        and(
          inArray(ordersTable.status, ["voided", "refunded"]),
          inArray(ordersTable.kitchenStatus, ["pending", "preparing", "ready", "completed"]),
        ),
        // Backward compat: old orders without kitchenStatus that are still active
        and(
          isNull(ordersTable.kitchenStatus),
          inArray(ordersTable.status, ["open", "pending", "preparing", "ready"]),
        ),
      ),
    ))
    .orderBy(ordersTable.createdAt);

  const allTables = await db.select().from(diningTablesTable)
    .where(eq(diningTablesTable.tenantId, tenantId));
  const tableNameMap = new Map(allTables.map((t) => [t.id, t.name]));

  const ordersWithItems = await Promise.all(
    activeOrders.map(async (order) => {
      const items = await db
        .select({
          id: orderItemsTable.id,
          productName: orderItemsTable.productName,
          quantity: orderItemsTable.quantity,
          variantChoices: orderItemsTable.variantChoices,
          modifierChoices: orderItemsTable.modifierChoices,
          category: productsTable.category,
        })
        .from(orderItemsTable)
        .leftJoin(productsTable, and(eq(orderItemsTable.productId, productsTable.id), eq(productsTable.tenantId, tenantId)))
        .where(eq(orderItemsTable.orderId, order.id));

      return {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.kitchenStatus ?? (order.status === "open" ? "pending" : order.status),
        orderStatus: order.status,
        tableId: order.tableId ?? undefined,
        tableName: order.tableId ? (tableNameMap.get(order.tableId) ?? undefined) : undefined,
        orderType: order.orderType ?? "counter",
        notes: order.notes ?? undefined,
        createdAt: order.createdAt,
        items: items.map((item) => ({
          id: item.id,
          productName: item.productName,
          quantity: item.quantity,
          variantChoices: (item.variantChoices as any[] | null) ?? undefined,
          modifierChoices: (item.modifierChoices as any[] | null) ?? undefined,
          category: item.category ?? "Other",
        })),
      };
    }),
  );

  res.json(ordersWithItems);
});

/* ─── Clear All Kitchen Orders ─── */
router.post("/kitchen/clear-all", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  // Mark all active kitchen orders as completed (new kitchenStatus field)
  const cleared1 = await db
    .update(ordersTable)
    .set({ kitchenStatus: "completed" })
    .where(and(
      eq(ordersTable.tenantId, tenantId),
      inArray(ordersTable.kitchenStatus, ["pending", "preparing", "ready"]),
    ))
    .returning({ id: ordersTable.id });

  // Also handle legacy orders without kitchenStatus
  const cleared2 = await db
    .update(ordersTable)
    .set({ status: "completed" })
    .where(and(
      eq(ordersTable.tenantId, tenantId),
      isNull(ordersTable.kitchenStatus),
      inArray(ordersTable.status, ["open", "pending", "preparing", "ready"]),
    ))
    .returning({ id: ordersTable.id });

  res.json({ cleared: cleared1.length + cleared2.length });
});

router.patch("/kitchen/:id/status", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = Array.isArray(req.params.id) ? parseInt(req.params.id[0]) : parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid order id" });
    return;
  }

  const { status } = req.body as { status?: string };
  const allowed = ["pending", "preparing", "ready", "completed"];
  if (!status || !allowed.includes(status)) {
    res.status(400).json({ error: `Status must be one of: ${allowed.join(", ")}` });
    return;
  }

  // Fetch the current order to determine which field to update (backward compat)
  const [existing] = await db.select().from(ordersTable)
    .where(and(eq(ordersTable.id, id), eq(ordersTable.tenantId, tenantId)));
  if (!existing) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  const updates: Partial<typeof ordersTable.$inferInsert> = {};
  if (existing.kitchenStatus !== null && existing.kitchenStatus !== undefined) {
    // New order: update kitchenStatus
    updates.kitchenStatus = status;
  } else {
    // Old order (backward compat): update main status
    updates.status = status;
  }

  const [order] = await db
    .update(ordersTable)
    .set(updates)
    .where(and(eq(ordersTable.id, id), eq(ordersTable.tenantId, tenantId)))
    .returning();

  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  res.json({ id: order.id, status: order.kitchenStatus ?? order.status });
});

router.get("/kds-screens", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const screens = await db.select().from(kdsScreensTable).orderBy(kdsScreensTable.createdAt);
  res.json(screens.map((s) => ({ ...s, categories: s.categories ?? [] })));
});

router.post("/kds-screens", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { name, categories } = req.body as { name?: string; categories?: string[] };
  if (!name?.trim()) {
    res.status(400).json({ error: "Name is required" });
    return;
  }
  const [screen] = await db
    .insert(kdsScreensTable)
    .values({ name: name.trim(), categories: categories ?? [] })
    .returning();
  res.status(201).json({ ...screen, categories: screen.categories ?? [] });
});

router.patch("/kds-screens/:id", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = Array.isArray(req.params.id) ? parseInt(req.params.id[0]) : parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { name, categories, isActive } = req.body as { name?: string; categories?: string[]; isActive?: boolean };
  const updates: Partial<typeof kdsScreensTable.$inferInsert> = {};
  if (name !== undefined) updates.name = name.trim();
  if (categories !== undefined) updates.categories = categories;
  if (isActive !== undefined) updates.isActive = isActive;

  const [screen] = await db.update(kdsScreensTable).set(updates).where(eq(kdsScreensTable.id, id)).returning();
  if (!screen) { res.status(404).json({ error: "Screen not found" }); return; }
  res.json({ ...screen, categories: screen.categories ?? [] });
});

router.delete("/kds-screens/:id", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const id = Array.isArray(req.params.id) ? parseInt(req.params.id[0]) : parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(kdsScreensTable).where(eq(kdsScreensTable.id, id));
  res.status(204).end();
});

export default router;
