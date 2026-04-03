import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, ordersTable, orderItemsTable, productsTable } from "@workspace/db";
import {
  CreateOrderBody,
  GetOrderParams,
  GetOrderResponse,
  UpdateOrderStatusParams,
  UpdateOrderStatusBody,
  UpdateOrderStatusResponse,
  ListOrdersResponse,
  ListOrdersQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

async function getOrderWithItems(orderId: number) {
  const [order] = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.id, orderId));

  if (!order) return null;

  const items = await db
    .select()
    .from(orderItemsTable)
    .where(eq(orderItemsTable.orderId, orderId));

  return {
    ...order,
    items: items.map((item) => ({
      id: item.id,
      productId: item.productId,
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal,
    })),
  };
}

router.get("/orders", async (req, res): Promise<void> => {
  const query = ListOrdersQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  let ordersQuery = db.select().from(ordersTable);
  if (query.data.status) {
    // @ts-expect-error drizzle conditional chaining
    ordersQuery = ordersQuery.where(eq(ordersTable.status, query.data.status));
  }

  const orders = await ordersQuery.orderBy(ordersTable.createdAt);

  const ordersWithItems = await Promise.all(
    orders.map(async (order) => {
      const items = await db
        .select()
        .from(orderItemsTable)
        .where(eq(orderItemsTable.orderId, order.id));
      return {
        ...order,
        items: items.map((item) => ({
          id: item.id,
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          lineTotal: item.lineTotal,
        })),
      };
    }),
  );

  res.json(ListOrdersResponse.parse(ordersWithItems));
});

router.post("/orders", async (req, res): Promise<void> => {
  const parsed = CreateOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  let subtotal = 0;
  const resolvedItems: Array<{
    productId: number;
    productName: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }> = [];

  for (const item of parsed.data.items) {
    const [product] = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, item.productId));

    if (!product) {
      res.status(400).json({ error: `Product ${item.productId} not found` });
      return;
    }

    const lineTotal = product.price * item.quantity;
    subtotal += lineTotal;
    resolvedItems.push({
      productId: product.id,
      productName: product.name,
      quantity: item.quantity,
      unitPrice: product.price,
      lineTotal,
    });
  }

  const tax = Math.round(subtotal * 0.1 * 100) / 100;
  const total = Math.round((subtotal + tax) * 100) / 100;
  subtotal = Math.round(subtotal * 100) / 100;

  const orderNumber = `ORD-${Date.now().toString().slice(-6)}`;

  const [order] = await db
    .insert(ordersTable)
    .values({
      orderNumber,
      status: "completed",
      subtotal,
      tax,
      total,
      paymentMethod: parsed.data.paymentMethod,
      completedAt: new Date(),
    })
    .returning();

  await db.insert(orderItemsTable).values(
    resolvedItems.map((item) => ({
      orderId: order.id,
      ...item,
    })),
  );

  const fullOrder = await getOrderWithItems(order.id);
  res.status(201).json(GetOrderResponse.parse(fullOrder));
});

router.get("/orders/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetOrderParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const order = await getOrderWithItems(params.data.id);
  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  res.json(GetOrderResponse.parse(order));
});

router.patch("/orders/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = UpdateOrderStatusParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateOrderStatusBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [order] = await db
    .update(ordersTable)
    .set({
      status: parsed.data.status,
      completedAt: parsed.data.status === "completed" ? new Date() : undefined,
    })
    .where(eq(ordersTable.id, params.data.id))
    .returning();

  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  const fullOrder = await getOrderWithItems(order.id);
  res.json(UpdateOrderStatusResponse.parse(fullOrder));
});

export default router;
