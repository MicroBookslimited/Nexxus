import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, ordersTable, orderItemsTable, productsTable, customersTable, diningTablesTable, appSettingsTable } from "@workspace/db";
import {
  CreateOrderBody,
  GetOrderParams,
  GetOrderResponse,
  UpdateOrderStatusParams,
  UpdateOrderStatusBody,
  UpdateOrderStatusResponse,
  ListOrdersResponse,
  ListOrdersQueryParams,
  ChargeOrderParams,
  ChargeOrderBody,
  ChargeOrderResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

function normalizeOrder(order: typeof ordersTable.$inferSelect) {
  return {
    ...order,
    discountType: order.discountType ?? undefined,
    discountAmount: order.discountAmount ?? undefined,
    discountValue: order.discountValue ?? undefined,
    paymentMethod: order.paymentMethod ?? undefined,
    splitCardAmount: order.splitCardAmount ?? undefined,
    splitCashAmount: order.splitCashAmount ?? undefined,
    notes: order.notes ?? undefined,
    voidReason: order.voidReason ?? undefined,
    customerId: order.customerId ?? undefined,
    tableId: order.tableId ?? undefined,
    staffId: order.staffId ?? undefined,
    orderType: order.orderType ?? undefined,
    loyaltyPointsRedeemed: order.loyaltyPointsRedeemed ?? undefined,
    loyaltyDiscount: order.loyaltyDiscount ?? undefined,
    completedAt: order.completedAt ?? undefined,
  };
}

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
    ...normalizeOrder(order),
    items: items.map((item) => ({
      id: item.id,
      productId: item.productId,
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discountAmount: item.discountAmount ?? undefined,
      variantAdjustment: item.variantAdjustment ?? undefined,
      modifierAdjustment: item.modifierAdjustment ?? undefined,
      variantChoices: (item.variantChoices as any[] | null) ?? undefined,
      modifierChoices: (item.modifierChoices as any[] | null) ?? undefined,
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

  const orders = query.data.status
    ? await db.select().from(ordersTable).where(eq(ordersTable.status, query.data.status))
    : await db.select().from(ordersTable);

  const ordersWithItems = await Promise.all(
    orders.map(async (order) => {
      const items = await db
        .select()
        .from(orderItemsTable)
        .where(eq(orderItemsTable.orderId, order.id));
      return {
        ...normalizeOrder(order),
        items: items.map((item) => ({
          id: item.id,
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discountAmount: item.discountAmount ?? undefined,
          variantAdjustment: item.variantAdjustment ?? undefined,
          modifierAdjustment: item.modifierAdjustment ?? undefined,
          variantChoices: (item.variantChoices as any[] | null) ?? undefined,
          modifierChoices: (item.modifierChoices as any[] | null) ?? undefined,
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

  let rawSubtotal = 0;
  type ChoiceItem = { groupId: number; groupName: string; optionId: number; optionName: string; priceAdjustment: number };
  const resolvedItems: Array<{
    productId: number;
    productName: string;
    quantity: number;
    unitPrice: number;
    discountAmount: number | undefined;
    variantAdjustment: number | undefined;
    modifierAdjustment: number | undefined;
    variantChoices: ChoiceItem[] | undefined;
    modifierChoices: ChoiceItem[] | undefined;
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

    const itemDiscount = item.discountAmount ?? 0;
    const variantAdj = (item.variantChoices ?? []).reduce((s, c) => s + c.priceAdjustment, 0);
    const modifierAdj = (item.modifierChoices ?? []).reduce((s, c) => s + c.priceAdjustment, 0);
    const effectiveUnitPrice = product.price + variantAdj + modifierAdj;
    const lineTotal = Math.max(0, effectiveUnitPrice * item.quantity - itemDiscount);
    rawSubtotal += lineTotal;
    resolvedItems.push({
      productId: product.id,
      productName: product.name,
      quantity: item.quantity,
      unitPrice: product.price,
      discountAmount: itemDiscount > 0 ? itemDiscount : undefined,
      variantAdjustment: variantAdj !== 0 ? variantAdj : undefined,
      modifierAdjustment: modifierAdj !== 0 ? modifierAdj : undefined,
      variantChoices: item.variantChoices && item.variantChoices.length > 0 ? item.variantChoices : undefined,
      modifierChoices: item.modifierChoices && item.modifierChoices.length > 0 ? item.modifierChoices : undefined,
      lineTotal,
    });
  }

  // Apply cart-level discount
  let discountValue = 0;
  if (parsed.data.discountAmount && parsed.data.discountType) {
    discountValue =
      parsed.data.discountType === "percent"
        ? rawSubtotal * (parsed.data.discountAmount / 100)
        : parsed.data.discountAmount;
    discountValue = Math.min(discountValue, rawSubtotal);
  }

  // Apply loyalty points redemption: 100 pts = $1
  const LOYALTY_REDEEM_RATE = 100; // points per dollar
  const pointsToRedeem = parsed.data.loyaltyPointsToRedeem ?? 0;
  const loyaltyDiscount = pointsToRedeem > 0 ? Math.round((pointsToRedeem / LOYALTY_REDEEM_RATE) * 100) / 100 : 0;

  const subtotal = Math.round(rawSubtotal * 100) / 100;
  const discountedSubtotal = Math.max(0, rawSubtotal - discountValue - loyaltyDiscount);

  const [taxRateSetting] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, "tax_rate"));
  const taxRate = parseFloat(taxRateSetting?.value ?? "0.08");
  const tax = Math.round(discountedSubtotal * taxRate * 100) / 100;
  const total = Math.round((discountedSubtotal + tax) * 100) / 100;

  const isOpenOrder = parsed.data.orderType === "dine-in" && !parsed.data.paymentMethod;
  const orderNumber = `ORD-${Date.now().toString().slice(-6)}`;

  const [order] = await db
    .insert(ordersTable)
    .values({
      orderNumber,
      status: isOpenOrder ? "open" : "pending",
      subtotal,
      discountType: parsed.data.discountType,
      discountAmount: parsed.data.discountAmount,
      discountValue: discountValue > 0 ? Math.round(discountValue * 100) / 100 : undefined,
      tax,
      total,
      paymentMethod: parsed.data.paymentMethod,
      splitCardAmount: parsed.data.splitCardAmount,
      splitCashAmount: parsed.data.splitCashAmount,
      notes: parsed.data.notes,
      customerId: parsed.data.customerId,
      tableId: parsed.data.tableId,
      staffId: parsed.data.staffId,
      orderType: parsed.data.orderType ?? "counter",
      loyaltyPointsRedeemed: pointsToRedeem > 0 ? pointsToRedeem : undefined,
      loyaltyDiscount: loyaltyDiscount > 0 ? loyaltyDiscount : undefined,
      completedAt: undefined,
    })
    .returning();

  await db.insert(orderItemsTable).values(
    resolvedItems.map((item) => ({
      orderId: order.id,
      productId: item.productId,
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discountAmount: item.discountAmount,
      variantAdjustment: item.variantAdjustment,
      modifierAdjustment: item.modifierAdjustment,
      variantChoices: item.variantChoices ?? null,
      modifierChoices: item.modifierChoices ?? null,
      lineTotal: item.lineTotal,
    })),
  );

  // Always deduct stock immediately (kitchen needs to prepare)
  for (const item of resolvedItems) {
    await db
      .update(productsTable)
      .set({
        stockCount: sql`GREATEST(0, ${productsTable.stockCount} - ${item.quantity})`,
        inStock: sql`CASE WHEN ${productsTable.stockCount} - ${item.quantity} <= 0 THEN false ELSE ${productsTable.inStock} END`,
      })
      .where(eq(productsTable.id, item.productId));
  }

  // Update customer stats only on completed orders (not open/deferred payment)
  if (!isOpenOrder && parsed.data.customerId) {
    const LOYALTY_EARN_RATE = 10; // 1 point per $10 spent
    const pointsEarned = Math.floor(total / LOYALTY_EARN_RATE);
    const netPoints = pointsEarned - pointsToRedeem;
    await db
      .update(customersTable)
      .set({
        totalSpent: sql`${customersTable.totalSpent} + ${total}`,
        orderCount: sql`${customersTable.orderCount} + 1`,
        loyaltyPoints: sql`GREATEST(0, ${customersTable.loyaltyPoints} + ${netPoints})`,
      })
      .where(eq(customersTable.id, parsed.data.customerId));
  }

  // For open/dine-in orders: mark the table as occupied
  // For completed counter orders: free the table
  if (parsed.data.tableId) {
    if (isOpenOrder) {
      await db
        .update(diningTablesTable)
        .set({ status: "occupied", currentOrderId: order.id })
        .where(eq(diningTablesTable.id, parsed.data.tableId));
    } else if (parsed.data.orderType === "counter" || !parsed.data.orderType) {
      await db
        .update(diningTablesTable)
        .set({ status: "available", currentOrderId: null })
        .where(eq(diningTablesTable.id, parsed.data.tableId));
    }
  }

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

  const [existing] = await db.select().from(ordersTable).where(eq(ordersTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  const [order] = await db
    .update(ordersTable)
    .set({
      status: parsed.data.status,
      voidReason: parsed.data.voidReason,
      completedAt: parsed.data.status === "completed" ? new Date() : undefined,
    })
    .where(eq(ordersTable.id, params.data.id))
    .returning();

  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  // Restore stock when order is refunded or voided (if it was previously completed/paid)
  if (parsed.data.status === "refunded" || parsed.data.status === "voided") {
    const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, order.id));
    for (const item of items) {
      await db
        .update(productsTable)
        .set({
          stockCount: sql`${productsTable.stockCount} + ${item.quantity}`,
          inStock: true,
        })
        .where(eq(productsTable.id, item.productId));
    }
  }

  const fullOrder = await getOrderWithItems(order.id);
  res.json(UpdateOrderStatusResponse.parse(fullOrder));
});

router.post("/orders/:id/charge", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = ChargeOrderParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = ChargeOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db.select().from(ordersTable).where(eq(ordersTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  if (existing.paymentMethod) {
    res.status(400).json({ error: "Order is already paid" });
    return;
  }
  if (!["open", "pending", "preparing", "ready"].includes(existing.status)) {
    res.status(400).json({ error: "Order cannot be charged in its current status" });
    return;
  }

  const [order] = await db
    .update(ordersTable)
    .set({
      status: "pending",
      paymentMethod: parsed.data.paymentMethod,
      splitCardAmount: parsed.data.splitCardAmount,
      splitCashAmount: parsed.data.splitCashAmount,
    })
    .where(eq(ordersTable.id, params.data.id))
    .returning();

  // Update customer stats now that payment is collected
  if (existing.customerId) {
    const LOYALTY_EARN_RATE = 10;
    const pointsEarned = Math.floor(existing.total / LOYALTY_EARN_RATE);
    const pointsRedeemed = existing.loyaltyPointsRedeemed ?? 0;
    const netPoints = pointsEarned - pointsRedeemed;
    await db
      .update(customersTable)
      .set({
        totalSpent: sql`${customersTable.totalSpent} + ${existing.total}`,
        orderCount: sql`${customersTable.orderCount} + 1`,
        loyaltyPoints: sql`GREATEST(0, ${customersTable.loyaltyPoints} + ${netPoints})`,
      })
      .where(eq(customersTable.id, existing.customerId));
  }

  // Free up the dining table
  if (existing.tableId) {
    await db
      .update(diningTablesTable)
      .set({ status: "available", currentOrderId: null })
      .where(eq(diningTablesTable.id, existing.tableId));
  }

  const fullOrder = await getOrderWithItems(order.id);
  res.json(ChargeOrderResponse.parse(fullOrder));
});

export default router;
