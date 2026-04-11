import { Router, type IRouter } from "express";
import { and, desc, eq, gte, isNull, lt, or, sql } from "drizzle-orm";
import { db, ordersTable, orderItemsTable, productsTable, customersTable, diningTablesTable, locationInventoryTable, accountsReceivableTable } from "@workspace/db";
import { getSetting } from "./settings";
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
import { verifyTenantToken } from "./saas-auth";

const router: IRouter = Router();

/* ─── Auth helper ─── */
function getTenantId(req: { headers: Record<string, string | undefined> }): number | null {
  const auth = req.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) return null;
  const p = verifyTenantToken(auth.slice(7));
  return p ? p.tenantId : null;
}

function normalizeOrder(order: typeof ordersTable.$inferSelect) {
  return {
    ...order,
    kitchenStatus: order.kitchenStatus ?? undefined,
    discountType: order.discountType ?? undefined,
    discountAmount: order.discountAmount ?? undefined,
    discountValue: order.discountValue ?? undefined,
    paymentMethod: order.paymentMethod ?? undefined,
    splitCardAmount: order.splitCardAmount ?? undefined,
    splitCashAmount: order.splitCashAmount ?? undefined,
    cashTendered: order.cashTendered ?? undefined,
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
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const query = ListOrdersQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  // Jamaica is UTC-5 year-round (no DST). Local midnight = T05:00:00.000Z in UTC.
  const jamaicaDayStart = (dateStr: string) => new Date(`${dateStr}T05:00:00.000Z`);
  const jamaicaDayEnd   = (dateStr: string) => {
    const d = jamaicaDayStart(dateStr);
    d.setUTCDate(d.getUTCDate() + 1);
    return d;
  };

  const conditions = [eq(ordersTable.tenantId, tenantId)];
  if (query.data.status) conditions.push(eq(ordersTable.status, query.data.status));
  if (query.data.from) {
    conditions.push(gte(ordersTable.createdAt, jamaicaDayStart(query.data.from)));
  }
  if (query.data.to) {
    conditions.push(lt(ordersTable.createdAt, jamaicaDayEnd(query.data.to)));
  }

  const orders = await db
    .select()
    .from(ordersTable)
    .where(and(...conditions))
    .orderBy(desc(ordersTable.createdAt));

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
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

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
      .where(and(eq(productsTable.id, item.productId), eq(productsTable.tenantId, tenantId)));

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

  let discountValue = 0;
  if (parsed.data.discountAmount && parsed.data.discountType) {
    discountValue =
      parsed.data.discountType === "percent"
        ? rawSubtotal * (parsed.data.discountAmount / 100)
        : parsed.data.discountAmount;
    discountValue = Math.min(discountValue, rawSubtotal);
  }

  const LOYALTY_REDEEM_RATE = 100;
  const pointsToRedeem = parsed.data.loyaltyPointsToRedeem ?? 0;
  const loyaltyDiscount = pointsToRedeem > 0 ? Math.round((pointsToRedeem / LOYALTY_REDEEM_RATE) * 100) / 100 : 0;

  const subtotal = Math.round(rawSubtotal * 100) / 100;
  const discountedSubtotal = Math.max(0, rawSubtotal - discountValue - loyaltyDiscount);

  const taxRateValue = await getSetting("tax_rate", tenantId);
  const taxRate = parseFloat(taxRateValue || "15") / 100;
  const tax = Math.round(discountedSubtotal * taxRate * 100) / 100;
  const total = Math.round((discountedSubtotal + tax) * 100) / 100;

  const isOpenOrder = parsed.data.orderType === "dine-in" && !parsed.data.paymentMethod;
  const isPaid = !!parsed.data.paymentMethod;

  // Generate sequential order number: ORD-YY-DD-XXXXXX
  // Jamaica is UTC-5 year-round; shift UTC time back 5 hours to get local date
  const nowJamaica = new Date(Date.now() - 5 * 60 * 60 * 1000);
  const yymm = String(nowJamaica.getUTCFullYear()).slice(-2) + String(nowJamaica.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(nowJamaica.getUTCDate()).padStart(2, "0");
  // Count orders already placed today (Jamaica time) for this tenant to get next seq
  const dayStart = new Date(`${nowJamaica.getUTCFullYear()}-${String(nowJamaica.getUTCMonth() + 1).padStart(2, "0")}-${String(nowJamaica.getUTCDate()).padStart(2, "0")}T05:00:00.000Z`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const [{ todayCount }] = await db
    .select({ todayCount: sql<number>`cast(count(*) as int)` })
    .from(ordersTable)
    .where(and(eq(ordersTable.tenantId, tenantId), gte(ordersTable.createdAt, dayStart), lt(ordersTable.createdAt, dayEnd)));
  const seq = String((todayCount ?? 0) + 1).padStart(6, "0");
  const orderNumber = `ORD-${yymm}-${dd}-${seq}`;

  const [order] = await db
    .insert(ordersTable)
    .values({
      tenantId,
      orderNumber,
      status: isOpenOrder ? "open" : isPaid ? "completed" : "pending",
      kitchenStatus: "pending",
      subtotal,
      discountType: parsed.data.discountType,
      discountAmount: parsed.data.discountAmount,
      discountValue: discountValue > 0 ? Math.round(discountValue * 100) / 100 : undefined,
      tax,
      total,
      paymentMethod: parsed.data.paymentMethod,
      splitCardAmount: parsed.data.splitCardAmount,
      splitCashAmount: parsed.data.splitCashAmount,
      cashTendered: parsed.data.cashTendered,
      notes: parsed.data.notes,
      customerId: parsed.data.customerId,
      tableId: parsed.data.tableId,
      staffId: parsed.data.staffId,
      locationId: parsed.data.locationId,
      orderType: parsed.data.orderType ?? "counter",
      loyaltyPointsRedeemed: pointsToRedeem > 0 ? pointsToRedeem : undefined,
      loyaltyDiscount: loyaltyDiscount > 0 ? loyaltyDiscount : undefined,
      completedAt: isPaid ? new Date() : undefined,
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

  for (const item of resolvedItems) {
    await db
      .update(productsTable)
      .set({
        stockCount: sql`GREATEST(0, ${productsTable.stockCount} - ${item.quantity})`,
        inStock: sql`CASE WHEN ${productsTable.stockCount} - ${item.quantity} <= 0 THEN false ELSE ${productsTable.inStock} END`,
      })
      .where(and(eq(productsTable.id, item.productId), eq(productsTable.tenantId, tenantId)));

    if (parsed.data.locationId) {
      await db
        .update(locationInventoryTable)
        .set({ stockCount: sql`GREATEST(0, ${locationInventoryTable.stockCount} - ${item.quantity})`, updatedAt: new Date() })
        .where(
          and(
            eq(locationInventoryTable.locationId, parsed.data.locationId),
            eq(locationInventoryTable.productId, item.productId),
          )
        );
    }
  }

  if (!isOpenOrder && parsed.data.customerId) {
    const LOYALTY_EARN_RATE = 10;
    const pointsEarned = Math.floor(total / LOYALTY_EARN_RATE);
    const netPoints = pointsEarned - pointsToRedeem;
    await db
      .update(customersTable)
      .set({
        totalSpent: sql`${customersTable.totalSpent} + ${total}`,
        orderCount: sql`${customersTable.orderCount} + 1`,
        loyaltyPoints: sql`GREATEST(0, ${customersTable.loyaltyPoints} + ${netPoints})`,
      })
      .where(and(eq(customersTable.id, parsed.data.customerId), eq(customersTable.tenantId, tenantId)));
  }

  if (parsed.data.tableId) {
    if (isOpenOrder) {
      await db
        .update(diningTablesTable)
        .set({ status: "occupied", currentOrderId: order.id })
        .where(and(eq(diningTablesTable.id, parsed.data.tableId), eq(diningTablesTable.tenantId, tenantId)));
    } else if (parsed.data.orderType === "counter" || !parsed.data.orderType) {
      await db
        .update(diningTablesTable)
        .set({ status: "available", currentOrderId: null })
        .where(and(eq(diningTablesTable.id, parsed.data.tableId), eq(diningTablesTable.tenantId, tenantId)));
    }
  }

  if (parsed.data.paymentMethod === "credit" && parsed.data.customerId) {
    const [cust] = await db
      .select({ name: customersTable.name })
      .from(customersTable)
      .where(eq(customersTable.id, parsed.data.customerId));
    if (cust) {
      await db.insert(accountsReceivableTable).values({
        tenantId,
        customerId: parsed.data.customerId,
        customerName: cust.name,
        orderId: order.id,
        orderNumber: order.orderNumber,
        amount: order.total,
        amountPaid: 0,
        status: "open",
      });
    }
  }

  const fullOrder = await getOrderWithItems(order.id);
  res.status(201).json(GetOrderResponse.parse(fullOrder));
});

router.get("/orders/:id", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetOrderParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [orderRow] = await db.select().from(ordersTable)
    .where(and(eq(ordersTable.id, params.data.id), eq(ordersTable.tenantId, tenantId)));
  if (!orderRow) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  const order = await getOrderWithItems(params.data.id);
  res.json(GetOrderResponse.parse(order));
});

router.patch("/orders/:id", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

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

  const [existing] = await db.select().from(ordersTable)
    .where(and(eq(ordersTable.id, params.data.id), eq(ordersTable.tenantId, tenantId)));
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
    .where(and(eq(ordersTable.id, params.data.id), eq(ordersTable.tenantId, tenantId)))
    .returning();

  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  if (parsed.data.status === "refunded" || parsed.data.status === "voided") {
    const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, order.id));
    for (const item of items) {
      await db
        .update(productsTable)
        .set({
          stockCount: sql`${productsTable.stockCount} + ${item.quantity}`,
          inStock: true,
        })
        .where(and(eq(productsTable.id, item.productId), eq(productsTable.tenantId, tenantId)));
    }
  }

  const fullOrder = await getOrderWithItems(order.id);
  res.json(UpdateOrderStatusResponse.parse(fullOrder));
});

router.post("/orders/:id/charge", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

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

  const [existing] = await db.select().from(ordersTable)
    .where(and(eq(ordersTable.id, params.data.id), eq(ordersTable.tenantId, tenantId)));
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
      status: "completed",
      completedAt: new Date(),
      paymentMethod: parsed.data.paymentMethod,
      splitCardAmount: parsed.data.splitCardAmount,
      splitCashAmount: parsed.data.splitCashAmount,
    })
    .where(and(eq(ordersTable.id, params.data.id), eq(ordersTable.tenantId, tenantId)))
    .returning();

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
      .where(and(eq(customersTable.id, existing.customerId), eq(customersTable.tenantId, tenantId)));
  }

  if (existing.tableId) {
    await db
      .update(diningTablesTable)
      .set({ status: "available", currentOrderId: null })
      .where(and(eq(diningTablesTable.id, existing.tableId), eq(diningTablesTable.tenantId, tenantId)));
  }

  const fullOrder = await getOrderWithItems(order.id);
  res.json(ChargeOrderResponse.parse(fullOrder));
});

export default router;
