import { Router, type IRouter } from "express";
import { eq, inArray } from "drizzle-orm";
import { db, ordersTable, orderItemsTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/kitchen", async (req, res): Promise<void> => {
  const pendingOrders = await db
    .select()
    .from(ordersTable)
    .where(inArray(ordersTable.status, ["pending", "preparing"]))
    .orderBy(ordersTable.createdAt);

  const ordersWithItems = await Promise.all(
    pendingOrders.map(async (order) => {
      const items = await db
        .select()
        .from(orderItemsTable)
        .where(eq(orderItemsTable.orderId, order.id));

      return {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        tableId: order.tableId ?? undefined,
        orderType: order.orderType ?? "counter",
        notes: order.notes ?? undefined,
        createdAt: order.createdAt,
        items: items.map((item) => ({
          id: item.id,
          productName: item.productName,
          quantity: item.quantity,
          variantChoices: (item.variantChoices as any[] | null) ?? undefined,
          modifierChoices: (item.modifierChoices as any[] | null) ?? undefined,
        })),
      };
    }),
  );

  res.json(ordersWithItems);
});

router.patch("/kitchen/:id/status", async (req, res): Promise<void> => {
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

  const [order] = await db
    .update(ordersTable)
    .set({ status })
    .where(eq(ordersTable.id, id))
    .returning();

  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  res.json({ id: order.id, status: order.status });
});

export default router;
