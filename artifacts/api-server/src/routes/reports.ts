import { Router, type IRouter } from "express";
import { eq, sql, and, gte, lte, desc, isNotNull, isNull, asc } from "drizzle-orm";
import {
  db, ordersTable, orderItemsTable, customersTable,
  staffTable, productsTable, cashSessionsTable, cashPayoutsTable,
} from "@workspace/db";
import {
  GetReportSummaryResponse,
  GetReportSummaryQueryParams,
  GetHourlySalesResponse,
  GetHourlySalesQueryParams,
  ExportOrdersQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function parseDate(str: string | undefined, fallback: Date): Date {
  if (!str) return fallback;
  const d = new Date(str);
  return isNaN(d.getTime()) ? fallback : d;
}

function rangeParams(query: Record<string, string | string[] | undefined>) {
  const today = new Date();
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  weekAgo.setHours(0, 0, 0, 0);
  const from = parseDate(query["from"] as string | undefined, weekAgo);
  const to = parseDate(query["to"] as string | undefined, today);
  return { from, to };
}

/* ─── Existing: Summary ─── */
router.get("/reports/summary", async (req, res): Promise<void> => {
  const query = GetReportSummaryQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: query.error.message }); return; }

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7); weekAgo.setHours(0, 0, 0, 0);
  const from = parseDate(query.data.from, weekAgo);
  const to = parseDate(query.data.to, new Date());

  const completedOrders = await db.select().from(ordersTable).where(and(eq(ordersTable.status, "completed"), gte(ordersTable.createdAt, from), lte(ordersTable.createdAt, to)));
  const voidedOrders = await db.select({ count: sql<number>`count(*)` }).from(ordersTable).where(and(eq(ordersTable.status, "voided"), gte(ordersTable.createdAt, from), lte(ordersTable.createdAt, to)));
  const newCustomers = await db.select({ count: sql<number>`count(*)` }).from(customersTable).where(and(gte(customersTable.createdAt, from), lte(customersTable.createdAt, to)));

  const revenue = completedOrders.reduce((s, o) => s + o.total, 0);
  const orders = completedOrders.length;
  const avgOrderValue = orders > 0 ? revenue / orders : 0;

  const topRow = await db.select({ productName: orderItemsTable.productName, total: sql<number>`sum(${orderItemsTable.quantity})` })
    .from(orderItemsTable).innerJoin(ordersTable, eq(orderItemsTable.orderId, ordersTable.id))
    .where(and(eq(ordersTable.status, "completed"), gte(ordersTable.createdAt, from), lte(ordersTable.createdAt, to)))
    .groupBy(orderItemsTable.productName).orderBy(desc(sql`sum(${orderItemsTable.quantity})`)).limit(1);

  res.json(GetReportSummaryResponse.parse({
    revenue: Math.round(revenue * 100) / 100,
    orders,
    avgOrderValue: Math.round(avgOrderValue * 100) / 100,
    newCustomers: Number(newCustomers[0]?.count ?? 0),
    topProduct: topRow[0]?.productName ?? null,
    voidedOrders: Number(voidedOrders[0]?.count ?? 0),
  }));
});

/* ─── Existing: Hourly ─── */
router.get("/reports/hourly", async (req, res): Promise<void> => {
  const query = GetHourlySalesQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: query.error.message }); return; }

  const dateStr = query.data.date ?? new Date().toISOString().split("T")[0];
  const from = new Date(`${dateStr}T00:00:00Z`);
  const to = new Date(`${dateStr}T23:59:59Z`);

  const rows = await db.select({
    hour: sql<number>`EXTRACT(HOUR FROM ${ordersTable.createdAt})::int`,
    revenue: sql<number>`sum(${ordersTable.total})`,
    orders: sql<number>`count(*)`,
  }).from(ordersTable).where(and(eq(ordersTable.status, "completed"), gte(ordersTable.createdAt, from), lte(ordersTable.createdAt, to)))
    .groupBy(sql`EXTRACT(HOUR FROM ${ordersTable.createdAt})`).orderBy(sql`EXTRACT(HOUR FROM ${ordersTable.createdAt})`);

  const result = Array.from({ length: 24 }, (_, h) => {
    const found = rows.find((r) => r.hour === h);
    return { hour: h, revenue: found ? Math.round(Number(found.revenue) * 100) / 100 : 0, orders: found ? Number(found.orders) : 0 };
  });

  res.json(GetHourlySalesResponse.parse(result));
});

/* ─── Existing: Export CSV ─── */
router.get("/reports/export", async (req, res): Promise<void> => {
  const query = ExportOrdersQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: query.error.message }); return; }

  const today = new Date(); const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
  const from = parseDate(query.data.from, weekAgo);
  const to = parseDate(query.data.to, today);

  const orders = await db.select().from(ordersTable).where(and(gte(ordersTable.createdAt, from), lte(ordersTable.createdAt, to))).orderBy(desc(ordersTable.createdAt));

  const header = "Order Number,Status,Payment,Subtotal,Discount,Tax,Total,Notes,Date\n";
  const rows = orders.map((o) => [o.orderNumber, o.status, o.paymentMethod ?? "", o.subtotal.toFixed(2), (o.discountValue ?? 0).toFixed(2), o.tax.toFixed(2), o.total.toFixed(2), `"${(o.notes ?? "").replace(/"/g, '""')}"`, o.createdAt.toISOString()].join(",")).join("\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="nexus-orders-${from.toISOString().split("T")[0]}-to-${to.toISOString().split("T")[0]}.csv"`);
  res.send(header + rows);
});

/* ─── NEW: Daily Trend ─── */
router.get("/reports/daily-trend", async (req, res): Promise<void> => {
  const { from, to } = rangeParams(req.query as Record<string, string>);

  const rows = await db.select({
    date: sql<string>`DATE(${ordersTable.createdAt})::text`,
    revenue: sql<number>`COALESCE(SUM(${ordersTable.total}), 0)`,
    orders: sql<number>`COUNT(*)`,
  }).from(ordersTable)
    .where(and(eq(ordersTable.status, "completed"), gte(ordersTable.createdAt, from), lte(ordersTable.createdAt, to)))
    .groupBy(sql`DATE(${ordersTable.createdAt})`)
    .orderBy(asc(sql`DATE(${ordersTable.createdAt})`));

  res.json(rows.map(r => ({ date: r.date, revenue: Math.round(Number(r.revenue) * 100) / 100, orders: Number(r.orders) })));
});

/* ─── NEW: Payment Breakdown ─── */
router.get("/reports/payment-breakdown", async (req, res): Promise<void> => {
  const { from, to } = rangeParams(req.query as Record<string, string>);

  const rows = await db.select({
    method: ordersTable.paymentMethod,
    count: sql<number>`COUNT(*)`,
    total: sql<number>`COALESCE(SUM(${ordersTable.total}), 0)`,
  }).from(ordersTable)
    .where(and(eq(ordersTable.status, "completed"), gte(ordersTable.createdAt, from), lte(ordersTable.createdAt, to)))
    .groupBy(ordersTable.paymentMethod);

  res.json(rows.map(r => ({ method: r.method ?? "other", count: Number(r.count), total: Math.round(Number(r.total) * 100) / 100 })));
});

/* ─── NEW: Product Mix ─── */
router.get("/reports/product-mix", async (req, res): Promise<void> => {
  const { from, to } = rangeParams(req.query as Record<string, string>);

  const items = await db.select({
    productId: orderItemsTable.productId,
    productName: orderItemsTable.productName,
    quantity: sql<number>`SUM(${orderItemsTable.quantity})`,
    revenue: sql<number>`SUM(${orderItemsTable.lineTotal})`,
  }).from(orderItemsTable)
    .innerJoin(ordersTable, eq(orderItemsTable.orderId, ordersTable.id))
    .where(and(eq(ordersTable.status, "completed"), gte(ordersTable.createdAt, from), lte(ordersTable.createdAt, to)))
    .groupBy(orderItemsTable.productId, orderItemsTable.productName)
    .orderBy(desc(sql`SUM(${orderItemsTable.lineTotal})`));

  const totalRevenue = items.reduce((s, i) => s + Number(i.revenue), 0);

  const categoryRows = await db.select({
    category: productsTable.category,
    revenue: sql<number>`SUM(${orderItemsTable.lineTotal})`,
    quantity: sql<number>`SUM(${orderItemsTable.quantity})`,
  }).from(orderItemsTable)
    .innerJoin(ordersTable, eq(orderItemsTable.orderId, ordersTable.id))
    .innerJoin(productsTable, eq(orderItemsTable.productId, productsTable.id))
    .where(and(eq(ordersTable.status, "completed"), gte(ordersTable.createdAt, from), lte(ordersTable.createdAt, to)))
    .groupBy(productsTable.category)
    .orderBy(desc(sql`SUM(${orderItemsTable.lineTotal})`));

  res.json({
    items: items.map(i => ({
      productId: i.productId,
      productName: i.productName,
      quantity: Number(i.quantity),
      revenue: Math.round(Number(i.revenue) * 100) / 100,
      percentage: totalRevenue > 0 ? Math.round((Number(i.revenue) / totalRevenue) * 1000) / 10 : 0,
    })),
    categories: categoryRows.map(c => ({
      category: c.category ?? "Uncategorized",
      revenue: Math.round(Number(c.revenue) * 100) / 100,
      quantity: Number(c.quantity),
    })),
  });
});

/* ─── NEW: Sales Exceptions ─── */
router.get("/reports/exceptions", async (req, res): Promise<void> => {
  const { from, to } = rangeParams(req.query as Record<string, string>);

  const voids = await db.select({
    id: ordersTable.id,
    orderNumber: ordersTable.orderNumber,
    total: ordersTable.total,
    voidReason: ordersTable.voidReason,
    createdAt: ordersTable.createdAt,
  }).from(ordersTable)
    .where(and(eq(ordersTable.status, "voided"), gte(ordersTable.createdAt, from), lte(ordersTable.createdAt, to)))
    .orderBy(desc(ordersTable.createdAt));

  const discountStats = await db.select({
    count: sql<number>`COUNT(*)`,
    totalDiscount: sql<number>`COALESCE(SUM(${ordersTable.discountValue}), 0)`,
    avgDiscount: sql<number>`COALESCE(AVG(${ordersTable.discountValue}), 0)`,
  }).from(ordersTable)
    .where(and(
      eq(ordersTable.status, "completed"),
      gte(ordersTable.createdAt, from),
      lte(ordersTable.createdAt, to),
      sql`${ordersTable.discountValue} > 0`,
    ));

  const loyaltyStats = await db.select({
    count: sql<number>`COUNT(*)`,
    totalPoints: sql<number>`COALESCE(SUM(${ordersTable.loyaltyPointsRedeemed}), 0)`,
    totalValue: sql<number>`COALESCE(SUM(${ordersTable.loyaltyDiscount}), 0)`,
  }).from(ordersTable)
    .where(and(
      eq(ordersTable.status, "completed"),
      gte(ordersTable.createdAt, from),
      lte(ordersTable.createdAt, to),
      sql`${ordersTable.loyaltyPointsRedeemed} > 0`,
    ));

  res.json({
    voids: voids.map(v => ({ id: v.id, orderNumber: v.orderNumber, total: v.total, voidReason: v.voidReason ?? "—", createdAt: v.createdAt })),
    discounts: {
      count: Number(discountStats[0]?.count ?? 0),
      totalDiscount: Math.round(Number(discountStats[0]?.totalDiscount ?? 0) * 100) / 100,
      avgDiscount: Math.round(Number(discountStats[0]?.avgDiscount ?? 0) * 100) / 100,
    },
    loyalty: {
      count: Number(loyaltyStats[0]?.count ?? 0),
      totalPoints: Number(loyaltyStats[0]?.totalPoints ?? 0),
      totalValue: Math.round(Number(loyaltyStats[0]?.totalValue ?? 0) * 100) / 100,
    },
  });
});

/* ─── NEW: Staff / Labor Performance ─── */
router.get("/reports/staff-performance", async (req, res): Promise<void> => {
  const { from, to } = rangeParams(req.query as Record<string, string>);

  const staffPerf = await db.select({
    staffId: ordersTable.staffId,
    orders: sql<number>`COUNT(*)`,
    revenue: sql<number>`COALESCE(SUM(${ordersTable.total}), 0)`,
  }).from(ordersTable)
    .where(and(
      eq(ordersTable.status, "completed"),
      gte(ordersTable.createdAt, from),
      lte(ordersTable.createdAt, to),
      isNotNull(ordersTable.staffId),
    ))
    .groupBy(ordersTable.staffId)
    .orderBy(desc(sql`SUM(${ordersTable.total})`));

  const allStaff = await db.select().from(staffTable);

  const unattributed = await db.select({
    orders: sql<number>`COUNT(*)`,
    revenue: sql<number>`COALESCE(SUM(${ordersTable.total}), 0)`,
  }).from(ordersTable)
    .where(and(
      eq(ordersTable.status, "completed"),
      gte(ordersTable.createdAt, from),
      lte(ordersTable.createdAt, to),
      isNull(ordersTable.staffId),
    ));

  const sessions = await db.select().from(cashSessionsTable)
    .where(and(gte(cashSessionsTable.openedAt, from), lte(cashSessionsTable.openedAt, to)))
    .orderBy(desc(cashSessionsTable.openedAt));

  const result = staffPerf.map(p => {
    const staff = allStaff.find(s => s.id === p.staffId);
    const orders = Number(p.orders);
    const revenue = Math.round(Number(p.revenue) * 100) / 100;
    return {
      staffId: p.staffId,
      staffName: staff?.name ?? `Staff #${p.staffId}`,
      role: staff?.role ?? "unknown",
      orders,
      revenue,
      avgOrderValue: orders > 0 ? Math.round((revenue / orders) * 100) / 100 : 0,
    };
  });

  res.json({
    staff: result,
    unattributed: {
      orders: Number(unattributed[0]?.orders ?? 0),
      revenue: Math.round(Number(unattributed[0]?.revenue ?? 0) * 100) / 100,
    },
    shifts: sessions.map(s => ({
      id: s.id,
      staffName: s.staffName,
      openedAt: s.openedAt,
      closedAt: s.closedAt,
      openingCash: s.openingCash,
      actualCash: s.actualCash,
      actualCard: s.actualCard,
      status: s.status,
    })),
  });
});

/* ─── NEW: Customer Summary ─── */
router.get("/reports/customers-summary", async (req, res): Promise<void> => {
  const { from, to } = rangeParams(req.query as Record<string, string>);

  const topCustomers = await db.select({
    id: customersTable.id,
    name: customersTable.name,
    email: customersTable.email,
    totalSpent: customersTable.totalSpent,
    orderCount: customersTable.orderCount,
    loyaltyPoints: customersTable.loyaltyPoints,
  }).from(customersTable)
    .orderBy(desc(customersTable.totalSpent))
    .limit(15);

  const newCustomers = await db.select({ count: sql<number>`COUNT(*)` })
    .from(customersTable)
    .where(and(gte(customersTable.createdAt, from), lte(customersTable.createdAt, to)));

  const returningRevenue = await db.select({ revenue: sql<number>`COALESCE(SUM(${ordersTable.total}), 0)`, count: sql<number>`COUNT(*)` })
    .from(ordersTable)
    .where(and(
      eq(ordersTable.status, "completed"),
      gte(ordersTable.createdAt, from),
      lte(ordersTable.createdAt, to),
      isNotNull(ordersTable.customerId),
    ));

  const loyaltyOverall = await db.select({
    totalPoints: sql<number>`COALESCE(SUM(${customersTable.loyaltyPoints}), 0)`,
    totalSpent: sql<number>`COALESCE(SUM(${customersTable.totalSpent}), 0)`,
    totalCustomers: sql<number>`COUNT(*)`,
    withLoyalty: sql<number>`COUNT(CASE WHEN ${customersTable.loyaltyPoints} > 0 THEN 1 END)`,
  }).from(customersTable);

  res.json({
    topCustomers: topCustomers.map(c => ({
      id: c.id,
      name: c.name,
      email: c.email ?? "",
      totalSpent: c.totalSpent,
      orderCount: c.orderCount,
      loyaltyPoints: c.loyaltyPoints,
      avgOrderValue: c.orderCount > 0 ? Math.round((c.totalSpent / c.orderCount) * 100) / 100 : 0,
    })),
    newCustomers: Number(newCustomers[0]?.count ?? 0),
    returningRevenue: Math.round(Number(returningRevenue[0]?.revenue ?? 0) * 100) / 100,
    returningOrders: Number(returningRevenue[0]?.count ?? 0),
    loyalty: {
      totalPoints: Number(loyaltyOverall[0]?.totalPoints ?? 0),
      totalSpent: Math.round(Number(loyaltyOverall[0]?.totalSpent ?? 0) * 100) / 100,
      totalCustomers: Number(loyaltyOverall[0]?.totalCustomers ?? 0),
      withLoyalty: Number(loyaltyOverall[0]?.withLoyalty ?? 0),
    },
  });
});

/* ─── NEW: Inventory ─── */
router.get("/reports/inventory", async (_req, res): Promise<void> => {
  const products = await db.select().from(productsTable).orderBy(asc(productsTable.stockCount));

  const totalRevenue = await db.select({
    productId: orderItemsTable.productId,
    soldQty: sql<number>`SUM(${orderItemsTable.quantity})`,
  }).from(orderItemsTable)
    .innerJoin(ordersTable, eq(orderItemsTable.orderId, ordersTable.id))
    .where(eq(ordersTable.status, "completed"))
    .groupBy(orderItemsTable.productId);

  const soldMap = new Map(totalRevenue.map(r => [r.productId, Number(r.soldQty)]));

  res.json({
    products: products.map(p => ({
      id: p.id,
      name: p.name,
      category: p.category,
      price: p.price,
      inStock: p.inStock,
      stockCount: p.stockCount,
      soldTotal: soldMap.get(p.id) ?? 0,
      status: !p.inStock ? "out" : p.stockCount <= 0 ? "out" : p.stockCount <= 5 ? "low" : "ok",
    })),
    summary: {
      total: products.length,
      inStock: products.filter(p => p.inStock && p.stockCount > 0).length,
      outOfStock: products.filter(p => !p.inStock || p.stockCount === 0).length,
      lowStock: products.filter(p => p.inStock && p.stockCount > 0 && p.stockCount <= 5).length,
    },
  });
});

/* ─── NEW: End of Day ─── */
router.get("/reports/eod-summary", async (req, res): Promise<void> => {
  const dateStr = (req.query["date"] as string) ?? new Date().toISOString().split("T")[0];
  const from = new Date(`${dateStr}T00:00:00`);
  const to = new Date(`${dateStr}T23:59:59`);

  const orders = await db.select().from(ordersTable)
    .where(and(gte(ordersTable.createdAt, from), lte(ordersTable.createdAt, to)));

  const completed = orders.filter(o => o.status === "completed");
  const voided = orders.filter(o => o.status === "voided");

  const paymentBreakdown = completed.reduce<Record<string, { count: number; total: number }>>((acc, o) => {
    const m = o.paymentMethod ?? "other";
    if (!acc[m]) acc[m] = { count: 0, total: 0 };
    acc[m].count++;
    acc[m].total += o.total;
    return acc;
  }, {});

  const sessions = await db.select().from(cashSessionsTable)
    .where(and(gte(cashSessionsTable.openedAt, from), lte(cashSessionsTable.openedAt, to)))
    .orderBy(asc(cashSessionsTable.openedAt));

  const payouts = await db.select().from(cashPayoutsTable)
    .where(and(gte(cashPayoutsTable.createdAt, from), lte(cashPayoutsTable.createdAt, to)));

  const totalRevenue = completed.reduce((s, o) => s + o.total, 0);
  const totalTax = completed.reduce((s, o) => s + o.tax, 0);
  const totalDiscount = completed.reduce((s, o) => s + (o.discountValue ?? 0), 0);

  res.json({
    date: dateStr,
    revenue: Math.round(totalRevenue * 100) / 100,
    tax: Math.round(totalTax * 100) / 100,
    discount: Math.round(totalDiscount * 100) / 100,
    completedOrders: completed.length,
    voidedOrders: voided.length,
    avgOrderValue: completed.length > 0 ? Math.round((totalRevenue / completed.length) * 100) / 100 : 0,
    paymentBreakdown: Object.entries(paymentBreakdown).map(([method, d]) => ({ method, count: d.count, total: Math.round(d.total * 100) / 100 })),
    sessions: sessions.map(s => ({
      id: s.id, staffName: s.staffName, openedAt: s.openedAt, closedAt: s.closedAt,
      openingCash: s.openingCash, actualCash: s.actualCash, actualCard: s.actualCard,
      status: s.status, closingNotes: s.closingNotes,
    })),
    payouts: payouts.map(p => ({ id: p.id, amount: p.amount, reason: p.reason, staffName: p.staffName, createdAt: p.createdAt })),
  });
});

export default router;
