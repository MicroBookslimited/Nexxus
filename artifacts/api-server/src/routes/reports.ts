import { Router, type IRouter } from "express";
import { eq, sql, and, gte, lte, desc, isNotNull, isNull, asc } from "drizzle-orm";
import {
  db, ordersTable, orderItemsTable, customersTable, staffTable,
  productsTable, cashSessionsTable, cashPayoutsTable,
} from "@workspace/db";
import { diningTablesTable, purchasesTable } from "@workspace/db";
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

function endOfDay(d: Date): Date {
  // Push to 23:59:59.999 UTC so the full day is included in lte comparisons
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

function rangeParams(q: Record<string, string | string[] | undefined>) {
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7); weekAgo.setUTCHours(0, 0, 0, 0);
  const from = parseDate(q["from"] as string | undefined, weekAgo);
  const to   = endOfDay(parseDate(q["to"] as string | undefined, new Date()));
  return { from, to };
}

// ── 1. Daily Sales Summary ─────────────────────────────────────────────────
router.get("/reports/summary", async (req, res): Promise<void> => {
  const query = GetReportSummaryQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: query.error.message }); return; }

  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7); weekAgo.setUTCHours(0, 0, 0, 0);
  const from = parseDate(query.data.from, weekAgo);
  const to   = endOfDay(parseDate(query.data.to, new Date()));

  const completedOrders = await db.select().from(ordersTable)
    .where(and(eq(ordersTable.status, "completed"), gte(ordersTable.createdAt, from), lte(ordersTable.createdAt, to)));

  const [voidedRes] = await db.select({ count: sql<number>`count(*)` }).from(ordersTable)
    .where(and(eq(ordersTable.status, "voided"), gte(ordersTable.createdAt, from), lte(ordersTable.createdAt, to)));

  const [newCustRes] = await db.select({ count: sql<number>`count(*)` }).from(customersTable)
    .where(and(gte(customersTable.createdAt, from), lte(customersTable.createdAt, to)));

  const revenue = completedOrders.reduce((s, o) => s + o.total, 0);
  const orders  = completedOrders.length;

  const [topRow] = await db.select({ productName: orderItemsTable.productName, total: sql<number>`sum(${orderItemsTable.quantity})` })
    .from(orderItemsTable).innerJoin(ordersTable, eq(orderItemsTable.orderId, ordersTable.id))
    .where(and(eq(ordersTable.status, "completed"), gte(ordersTable.createdAt, from), lte(ordersTable.createdAt, to)))
    .groupBy(orderItemsTable.productName).orderBy(desc(sql`sum(${orderItemsTable.quantity})`)).limit(1);

  res.json(GetReportSummaryResponse.parse({
    revenue: Math.round(revenue * 100) / 100,
    orders,
    avgOrderValue: orders > 0 ? Math.round((revenue / orders) * 100) / 100 : 0,
    newCustomers: Number(newCustRes?.count ?? 0),
    topProduct: topRow?.productName ?? null,
    voidedOrders: Number(voidedRes?.count ?? 0),
  }));
});

// ── Hourly ─────────────────────────────────────────────────────────────────
router.get("/reports/hourly", async (req, res): Promise<void> => {
  const query = GetHourlySalesQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: query.error.message }); return; }

  const dateStr = query.data.date ?? new Date().toISOString().split("T")[0];
  const from = new Date(`${dateStr}T00:00:00Z`);
  const to   = new Date(`${dateStr}T23:59:59Z`);

  const rows = await db.select({
    hour: sql<number>`EXTRACT(HOUR FROM ${ordersTable.createdAt})::int`,
    revenue: sql<number>`sum(${ordersTable.total})`,
    orders:  sql<number>`count(*)`,
  }).from(ordersTable)
    .where(and(eq(ordersTable.status, "completed"), gte(ordersTable.createdAt, from), lte(ordersTable.createdAt, to)))
    .groupBy(sql`EXTRACT(HOUR FROM ${ordersTable.createdAt})`)
    .orderBy(sql`EXTRACT(HOUR FROM ${ordersTable.createdAt})`);

  res.json(GetHourlySalesResponse.parse(
    Array.from({ length: 24 }, (_, h) => {
      const found = rows.find(r => r.hour === h);
      return { hour: h, revenue: found ? Math.round(Number(found.revenue) * 100) / 100 : 0, orders: found ? Number(found.orders) : 0 };
    })
  ));
});

// ── Daily Trend ────────────────────────────────────────────────────────────
router.get("/reports/daily-trend", async (req, res): Promise<void> => {
  const { from, to } = rangeParams(req.query as Record<string, string>);
  const rows = await db.select({
    date:    sql<string>`DATE(${ordersTable.createdAt})::text`,
    revenue: sql<number>`COALESCE(SUM(${ordersTable.total}), 0)`,
    orders:  sql<number>`COUNT(*)`,
    tax:     sql<number>`COALESCE(SUM(${ordersTable.tax}), 0)`,
    discount: sql<number>`COALESCE(SUM(${ordersTable.discountValue}), 0)`,
  }).from(ordersTable)
    .where(and(eq(ordersTable.status, "completed"), gte(ordersTable.createdAt, from), lte(ordersTable.createdAt, to)))
    .groupBy(sql`DATE(${ordersTable.createdAt})`)
    .orderBy(asc(sql`DATE(${ordersTable.createdAt})`));

  res.json(rows.map(r => ({
    date: r.date,
    revenue:  Math.round(Number(r.revenue)  * 100) / 100,
    orders:   Number(r.orders),
    tax:      Math.round(Number(r.tax)      * 100) / 100,
    discount: Math.round(Number(r.discount) * 100) / 100,
  })));
});

// ── 2. Payment Method Report ───────────────────────────────────────────────
router.get("/reports/payment-breakdown", async (req, res): Promise<void> => {
  const { from, to } = rangeParams(req.query as Record<string, string>);
  const rows = await db.select({
    method: ordersTable.paymentMethod,
    count:  sql<number>`COUNT(*)`,
    total:  sql<number>`COALESCE(SUM(${ordersTable.total}), 0)`,
    tax:    sql<number>`COALESCE(SUM(${ordersTable.tax}), 0)`,
  }).from(ordersTable)
    .where(and(eq(ordersTable.status, "completed"), gte(ordersTable.createdAt, from), lte(ordersTable.createdAt, to)))
    .groupBy(ordersTable.paymentMethod)
    .orderBy(desc(sql`SUM(${ordersTable.total})`));

  const grandTotal = rows.reduce((s, r) => s + Number(r.total), 0);
  res.json(rows.map(r => ({
    method:     r.method ?? "other",
    count:      Number(r.count),
    total:      Math.round(Number(r.total) * 100) / 100,
    tax:        Math.round(Number(r.tax)   * 100) / 100,
    percentage: grandTotal > 0 ? Math.round((Number(r.total) / grandTotal) * 1000) / 10 : 0,
  })));
});

// ── 3. Product Sales Report ────────────────────────────────────────────────
router.get("/reports/product-mix", async (req, res): Promise<void> => {
  const { from, to } = rangeParams(req.query as Record<string, string>);

  const items = await db.select({
    productId:   orderItemsTable.productId,
    productName: orderItemsTable.productName,
    quantity:    sql<number>`SUM(${orderItemsTable.quantity})`,
    revenue:     sql<number>`SUM(${orderItemsTable.lineTotal})`,
  }).from(orderItemsTable)
    .innerJoin(ordersTable, eq(orderItemsTable.orderId, ordersTable.id))
    .where(and(eq(ordersTable.status, "completed"), gte(ordersTable.createdAt, from), lte(ordersTable.createdAt, to)))
    .groupBy(orderItemsTable.productId, orderItemsTable.productName)
    .orderBy(desc(sql`SUM(${orderItemsTable.lineTotal})`));

  const totalRevenue = items.reduce((s, i) => s + Number(i.revenue), 0);

  // ── 7. Category Sales (embedded) ──────────────────────────────────────────
  const categoryRows = await db.select({
    category: productsTable.category,
    revenue:  sql<number>`SUM(${orderItemsTable.lineTotal})`,
    quantity: sql<number>`SUM(${orderItemsTable.quantity})`,
    orders:   sql<number>`COUNT(DISTINCT ${orderItemsTable.orderId})`,
  }).from(orderItemsTable)
    .innerJoin(ordersTable,  eq(orderItemsTable.orderId, ordersTable.id))
    .innerJoin(productsTable, eq(orderItemsTable.productId, productsTable.id))
    .where(and(eq(ordersTable.status, "completed"), gte(ordersTable.createdAt, from), lte(ordersTable.createdAt, to)))
    .groupBy(productsTable.category)
    .orderBy(desc(sql`SUM(${orderItemsTable.lineTotal})`));

  const catTotal = categoryRows.reduce((s, r) => s + Number(r.revenue), 0);

  res.json({
    items: items.map(i => ({
      productId:   i.productId,
      productName: i.productName,
      quantity:    Number(i.quantity),
      revenue:     Math.round(Number(i.revenue)  * 100) / 100,
      percentage:  totalRevenue > 0 ? Math.round((Number(i.revenue) / totalRevenue) * 1000) / 10 : 0,
    })),
    categories: categoryRows.map(c => ({
      category:   c.category ?? "Uncategorized",
      revenue:    Math.round(Number(c.revenue)  * 100) / 100,
      quantity:   Number(c.quantity),
      orders:     Number(c.orders),
      percentage: catTotal > 0 ? Math.round((Number(c.revenue) / catTotal) * 1000) / 10 : 0,
    })),
  });
});

// ── 4. Inventory Consumption Report ───────────────────────────────────────
router.get("/reports/inventory", async (req, res): Promise<void> => {
  const { from, to } = rangeParams(req.query as Record<string, string>);

  const products = await db.select().from(productsTable).orderBy(asc(productsTable.stockCount));

  // Units sold in period
  const soldInPeriod = await db.select({
    productId: orderItemsTable.productId,
    sold:      sql<number>`SUM(${orderItemsTable.quantity})`,
    revenue:   sql<number>`SUM(${orderItemsTable.lineTotal})`,
  }).from(orderItemsTable)
    .innerJoin(ordersTable, eq(orderItemsTable.orderId, ordersTable.id))
    .where(and(eq(ordersTable.status, "completed"), gte(ordersTable.createdAt, from), lte(ordersTable.createdAt, to)))
    .groupBy(orderItemsTable.productId);

  // Purchase cost per product (avg weighted)
  const costData = await db.select({
    productId: purchasesTable.productId,
    avgCost:   sql<number>`COALESCE(AVG(${purchasesTable.unitCost}), 0)`,
    totalPurchased: sql<number>`COALESCE(SUM(${purchasesTable.quantity}), 0)`,
    totalCost:      sql<number>`COALESCE(SUM(${purchasesTable.totalCost}), 0)`,
  }).from(purchasesTable).groupBy(purchasesTable.productId);

  const soldMap = new Map(soldInPeriod.map(r => [r.productId, { sold: Number(r.sold), revenue: Number(r.revenue) }]));
  const costMap = new Map(costData.map(r => [r.productId, { avgCost: Number(r.avgCost), totalPurchased: Number(r.totalPurchased), totalCost: Number(r.totalCost) }]));

  // All-time sold for stock comparison
  const allTimeSold = await db.select({
    productId: orderItemsTable.productId,
    sold:      sql<number>`SUM(${orderItemsTable.quantity})`,
  }).from(orderItemsTable)
    .innerJoin(ordersTable, eq(orderItemsTable.orderId, ordersTable.id))
    .where(eq(ordersTable.status, "completed"))
    .groupBy(orderItemsTable.productId);

  const allTimeSoldMap = new Map(allTimeSold.map(r => [r.productId, Number(r.sold)]));

  res.json({
    products: products.map(p => {
      const s = soldMap.get(p.id) ?? { sold: 0, revenue: 0 };
      const c = costMap.get(p.id) ?? { avgCost: 0, totalPurchased: 0, totalCost: 0 };
      return {
        id:             p.id,
        name:           p.name,
        category:       p.category,
        price:          p.price,
        inStock:        p.inStock,
        stockCount:     p.stockCount,
        soldThisPeriod: s.sold,
        revenueThisPeriod: Math.round(s.revenue * 100) / 100,
        soldAllTime:    allTimeSoldMap.get(p.id) ?? 0,
        avgCost:        Math.round(c.avgCost     * 100) / 100,
        cogs:           Math.round(c.avgCost * s.sold * 100) / 100,
        status:         !p.inStock ? "out" : p.stockCount <= 0 ? "out" : p.stockCount <= 5 ? "low" : "ok",
      };
    }),
    summary: {
      total:      products.length,
      inStock:    products.filter(p => p.inStock && p.stockCount > 0).length,
      outOfStock: products.filter(p => !p.inStock || p.stockCount === 0).length,
      lowStock:   products.filter(p => p.inStock && p.stockCount > 0 && p.stockCount <= 5).length,
      totalSoldInPeriod: soldInPeriod.reduce((s, r) => s + Number(r.sold), 0),
    },
  });
});

// ── 5. Staff Performance Report ────────────────────────────────────────────
router.get("/reports/staff-performance", async (req, res): Promise<void> => {
  const { from, to } = rangeParams(req.query as Record<string, string>);

  const staffPerf = await db.select({
    staffId: ordersTable.staffId,
    orders:  sql<number>`COUNT(*)`,
    revenue: sql<number>`COALESCE(SUM(${ordersTable.total}), 0)`,
    avgOrder: sql<number>`COALESCE(AVG(${ordersTable.total}), 0)`,
  }).from(ordersTable)
    .where(and(eq(ordersTable.status, "completed"), gte(ordersTable.createdAt, from), lte(ordersTable.createdAt, to), isNotNull(ordersTable.staffId)))
    .groupBy(ordersTable.staffId)
    .orderBy(desc(sql`SUM(${ordersTable.total})`));

  const allStaff = await db.select().from(staffTable);

  const [unattributed] = await db.select({
    orders:  sql<number>`COUNT(*)`,
    revenue: sql<number>`COALESCE(SUM(${ordersTable.total}), 0)`,
  }).from(ordersTable)
    .where(and(eq(ordersTable.status, "completed"), gte(ordersTable.createdAt, from), lte(ordersTable.createdAt, to), isNull(ordersTable.staffId)));

  const sessions = await db.select().from(cashSessionsTable)
    .where(and(gte(cashSessionsTable.openedAt, from), lte(cashSessionsTable.openedAt, to)))
    .orderBy(desc(cashSessionsTable.openedAt));

  res.json({
    staff: staffPerf.map(p => {
      const s = allStaff.find(s => s.id === p.staffId);
      return {
        staffId:       p.staffId,
        staffName:     s?.name ?? `Staff #${p.staffId}`,
        role:          s?.role ?? "unknown",
        orders:        Number(p.orders),
        revenue:       Math.round(Number(p.revenue)  * 100) / 100,
        avgOrderValue: Math.round(Number(p.avgOrder) * 100) / 100,
      };
    }),
    unattributed: {
      orders:  Number(unattributed?.orders  ?? 0),
      revenue: Math.round(Number(unattributed?.revenue ?? 0) * 100) / 100,
    },
    shifts: sessions.map(s => ({
      id:          s.id,
      staffName:   s.staffName,
      openedAt:    s.openedAt,
      closedAt:    s.closedAt,
      openingCash: s.openingCash,
      actualCash:  s.actualCash,
      actualCard:  s.actualCard,
      status:      s.status,
    })),
  });
});

// ── 6. Discount & Void Report ──────────────────────────────────────────────
router.get("/reports/exceptions", async (req, res): Promise<void> => {
  const { from, to } = rangeParams(req.query as Record<string, string>);

  const voids = await db.select({
    id:          ordersTable.id,
    orderNumber: ordersTable.orderNumber,
    total:       ordersTable.total,
    voidReason:  ordersTable.voidReason,
    staffId:     ordersTable.staffId,
    createdAt:   ordersTable.createdAt,
  }).from(ordersTable)
    .where(and(eq(ordersTable.status, "voided"), gte(ordersTable.createdAt, from), lte(ordersTable.createdAt, to)))
    .orderBy(desc(ordersTable.createdAt));

  const allStaff = await db.select().from(staffTable);
  const staffMap = new Map(allStaff.map(s => [s.id, s.name]));

  // Discount breakdown by type
  const discountByType = await db.select({
    discountType: ordersTable.discountType,
    count:        sql<number>`COUNT(*)`,
    totalDiscount: sql<number>`COALESCE(SUM(${ordersTable.discountValue}), 0)`,
  }).from(ordersTable)
    .where(and(eq(ordersTable.status, "completed"), gte(ordersTable.createdAt, from), lte(ordersTable.createdAt, to), sql`${ordersTable.discountValue} > 0`))
    .groupBy(ordersTable.discountType);

  const [discountStats] = await db.select({
    count:         sql<number>`COUNT(*)`,
    totalDiscount: sql<number>`COALESCE(SUM(${ordersTable.discountValue}), 0)`,
    avgDiscount:   sql<number>`COALESCE(AVG(${ordersTable.discountValue}), 0)`,
  }).from(ordersTable)
    .where(and(eq(ordersTable.status, "completed"), gte(ordersTable.createdAt, from), lte(ordersTable.createdAt, to), sql`${ordersTable.discountValue} > 0`));

  const [loyaltyStats] = await db.select({
    count:       sql<number>`COUNT(*)`,
    totalPoints: sql<number>`COALESCE(SUM(${ordersTable.loyaltyPointsRedeemed}), 0)`,
    totalValue:  sql<number>`COALESCE(SUM(${ordersTable.loyaltyDiscount}), 0)`,
  }).from(ordersTable)
    .where(and(eq(ordersTable.status, "completed"), gte(ordersTable.createdAt, from), lte(ordersTable.createdAt, to), sql`${ordersTable.loyaltyPointsRedeemed} > 0`));

  res.json({
    voids: voids.map(v => ({
      id:          v.id,
      orderNumber: v.orderNumber,
      total:       v.total,
      voidReason:  v.voidReason ?? "—",
      staffName:   v.staffId ? (staffMap.get(v.staffId) ?? `Staff #${v.staffId}`) : "—",
      createdAt:   v.createdAt,
    })),
    discountByType: discountByType.map(d => ({
      discountType:  d.discountType ?? "other",
      count:         Number(d.count),
      totalDiscount: Math.round(Number(d.totalDiscount) * 100) / 100,
    })),
    discounts: {
      count:         Number(discountStats?.count         ?? 0),
      totalDiscount: Math.round(Number(discountStats?.totalDiscount ?? 0) * 100) / 100,
      avgDiscount:   Math.round(Number(discountStats?.avgDiscount   ?? 0) * 100) / 100,
    },
    loyalty: {
      count:       Number(loyaltyStats?.count       ?? 0),
      totalPoints: Number(loyaltyStats?.totalPoints ?? 0),
      totalValue:  Math.round(Number(loyaltyStats?.totalValue ?? 0) * 100) / 100,
    },
  });
});

// ── 9. Table Turnover Report ───────────────────────────────────────────────
router.get("/reports/table-turnover", async (req, res): Promise<void> => {
  const { from, to } = rangeParams(req.query as Record<string, string>);

  const tableStats = await db.select({
    tableId:  ordersTable.tableId,
    orders:   sql<number>`COUNT(*)`,
    revenue:  sql<number>`COALESCE(SUM(${ordersTable.total}), 0)`,
    avgTotal: sql<number>`COALESCE(AVG(${ordersTable.total}), 0)`,
  }).from(ordersTable)
    .where(and(eq(ordersTable.status, "completed"), gte(ordersTable.createdAt, from), lte(ordersTable.createdAt, to), isNotNull(ordersTable.tableId)))
    .groupBy(ordersTable.tableId)
    .orderBy(desc(sql`COUNT(*)`));

  const allTables = await db.select().from(diningTablesTable).where(eq(diningTablesTable.isActive, true));

  // Order type breakdown
  const byType = await db.select({
    orderType: ordersTable.orderType,
    count:     sql<number>`COUNT(*)`,
    revenue:   sql<number>`COALESCE(SUM(${ordersTable.total}), 0)`,
  }).from(ordersTable)
    .where(and(eq(ordersTable.status, "completed"), gte(ordersTable.createdAt, from), lte(ordersTable.createdAt, to)))
    .groupBy(ordersTable.orderType);

  // Avg duration from createdAt → completedAt for dine-in orders
  const durRows = await db.select({
    tableId:     ordersTable.tableId,
    avgMinutes:  sql<number>`COALESCE(AVG(EXTRACT(EPOCH FROM (${ordersTable.completedAt} - ${ordersTable.createdAt}))/60), 0)`,
  }).from(ordersTable)
    .where(and(
      eq(ordersTable.status, "completed"),
      gte(ordersTable.createdAt, from),
      lte(ordersTable.createdAt, to),
      isNotNull(ordersTable.tableId),
      isNotNull(ordersTable.completedAt),
    ))
    .groupBy(ordersTable.tableId);

  const durMap = new Map(durRows.map(r => [r.tableId, Math.round(Number(r.avgMinutes))]));

  res.json({
    tables: tableStats.map(t => {
      const table = allTables.find(tbl => tbl.id === t.tableId);
      return {
        tableId:      t.tableId,
        tableName:    table?.name ?? `Table #${t.tableId}`,
        capacity:     table?.capacity ?? 0,
        turns:        Number(t.orders),
        revenue:      Math.round(Number(t.revenue)  * 100) / 100,
        avgRevenue:   Math.round(Number(t.avgTotal) * 100) / 100,
        avgDurationMin: durMap.get(t.tableId!) ?? null,
      };
    }),
    byOrderType: byType.map(t => ({
      orderType: t.orderType ?? "counter",
      count:     Number(t.count),
      revenue:   Math.round(Number(t.revenue) * 100) / 100,
    })),
    totalDineTables: allTables.length,
  });
});

// ── 10. Profit Snapshot Report ─────────────────────────────────────────────
router.get("/reports/profit-snapshot", async (req, res): Promise<void> => {
  const { from, to } = rangeParams(req.query as Record<string, string>);

  // Revenue from completed orders
  const [revRow] = await db.select({
    revenue:  sql<number>`COALESCE(SUM(${ordersTable.total}), 0)`,
    subtotal: sql<number>`COALESCE(SUM(${ordersTable.subtotal}), 0)`,
    tax:      sql<number>`COALESCE(SUM(${ordersTable.tax}), 0)`,
    discount: sql<number>`COALESCE(SUM(${ordersTable.discountValue}), 0)`,
  }).from(ordersTable)
    .where(and(eq(ordersTable.status, "completed"), gte(ordersTable.createdAt, from), lte(ordersTable.createdAt, to)));

  // Sold items with line totals
  const soldItems = await db.select({
    productId: orderItemsTable.productId,
    quantity:  sql<number>`SUM(${orderItemsTable.quantity})`,
    lineTotal: sql<number>`SUM(${orderItemsTable.lineTotal})`,
  }).from(orderItemsTable)
    .innerJoin(ordersTable, eq(orderItemsTable.orderId, ordersTable.id))
    .where(and(eq(ordersTable.status, "completed"), gte(ordersTable.createdAt, from), lte(ordersTable.createdAt, to)))
    .groupBy(orderItemsTable.productId);

  // Cost per product (avg from purchases)
  const costData = await db.select({
    productId: purchasesTable.productId,
    avgCost:   sql<number>`COALESCE(AVG(${purchasesTable.unitCost}), 0)`,
  }).from(purchasesTable).groupBy(purchasesTable.productId);

  const costMap = new Map(costData.map(r => [r.productId, Number(r.avgCost)]));
  const allProducts = await db.select({ id: productsTable.id, name: productsTable.name, category: productsTable.category, price: productsTable.price })
    .from(productsTable);
  const prodMap = new Map(allProducts.map(p => [p.id, p]));

  let totalCOGS = 0;
  const productProfits = soldItems.map(item => {
    const avgCost  = costMap.get(item.productId) ?? 0;
    const qty      = Number(item.quantity);
    const revenue  = Number(item.lineTotal);
    const cogs     = avgCost * qty;
    totalCOGS += cogs;
    const profit = revenue - cogs;
    const prod = prodMap.get(item.productId);
    return {
      productId:   item.productId,
      productName: prod?.name ?? `Product #${item.productId}`,
      category:    prod?.category ?? "—",
      sellPrice:   prod?.price ?? 0,
      avgCost:     Math.round(avgCost * 100) / 100,
      quantity:    qty,
      revenue:     Math.round(revenue * 100) / 100,
      cogs:        Math.round(cogs    * 100) / 100,
      grossProfit: Math.round(profit  * 100) / 100,
      margin:      revenue > 0 ? Math.round((profit / revenue) * 1000) / 10 : 0,
    };
  }).sort((a, b) => b.grossProfit - a.grossProfit);

  const revenue     = Math.round(Number(revRow?.revenue  ?? 0) * 100) / 100;
  const tax         = Math.round(Number(revRow?.tax      ?? 0) * 100) / 100;
  const discount    = Math.round(Number(revRow?.discount ?? 0) * 100) / 100;
  const cogs        = Math.round(totalCOGS  * 100) / 100;
  const grossProfit = Math.round((revenue - cogs) * 100) / 100;
  const grossMargin = revenue > 0 ? Math.round((grossProfit / revenue) * 1000) / 10 : 0;

  // Category-level profit
  const catMap = new Map<string, { revenue: number; cogs: number }>();
  productProfits.forEach(p => {
    const c = catMap.get(p.category) ?? { revenue: 0, cogs: 0 };
    c.revenue += p.revenue; c.cogs += p.cogs;
    catMap.set(p.category, c);
  });

  res.json({
    revenue, tax, discount, cogs, grossProfit, grossMargin,
    netRevenue: Math.round((revenue - discount) * 100) / 100,
    productProfits,
    byCategory: Array.from(catMap.entries()).map(([cat, d]) => ({
      category:    cat,
      revenue:     Math.round(d.revenue * 100) / 100,
      cogs:        Math.round(d.cogs    * 100) / 100,
      grossProfit: Math.round((d.revenue - d.cogs) * 100) / 100,
      margin:      d.revenue > 0 ? Math.round(((d.revenue - d.cogs) / d.revenue) * 1000) / 10 : 0,
    })).sort((a, b) => b.grossProfit - a.grossProfit),
  });
});

// ── Customer Summary ───────────────────────────────────────────────────────
router.get("/reports/customers-summary", async (req, res): Promise<void> => {
  const { from, to } = rangeParams(req.query as Record<string, string>);

  const topCustomers = await db.select().from(customersTable).orderBy(desc(customersTable.totalSpent)).limit(15);

  const [newCustRes] = await db.select({ count: sql<number>`COUNT(*)` }).from(customersTable)
    .where(and(gte(customersTable.createdAt, from), lte(customersTable.createdAt, to)));

  const [returningRes] = await db.select({
    revenue: sql<number>`COALESCE(SUM(${ordersTable.total}), 0)`,
    count:   sql<number>`COUNT(*)`,
  }).from(ordersTable)
    .where(and(eq(ordersTable.status, "completed"), gte(ordersTable.createdAt, from), lte(ordersTable.createdAt, to), isNotNull(ordersTable.customerId)));

  const [loyaltyRes] = await db.select({
    totalPoints:    sql<number>`COALESCE(SUM(${customersTable.loyaltyPoints}), 0)`,
    totalSpent:     sql<number>`COALESCE(SUM(${customersTable.totalSpent}), 0)`,
    totalCustomers: sql<number>`COUNT(*)`,
    withLoyalty:    sql<number>`COUNT(CASE WHEN ${customersTable.loyaltyPoints} > 0 THEN 1 END)`,
  }).from(customersTable);

  res.json({
    topCustomers: topCustomers.map(c => ({
      id:            c.id,
      name:          c.name,
      email:         c.email ?? "",
      totalSpent:    c.totalSpent,
      orderCount:    c.orderCount,
      loyaltyPoints: c.loyaltyPoints,
      avgOrderValue: c.orderCount > 0 ? Math.round((c.totalSpent / c.orderCount) * 100) / 100 : 0,
    })),
    newCustomers:      Number(newCustRes?.count      ?? 0),
    returningRevenue:  Math.round(Number(returningRes?.revenue ?? 0) * 100) / 100,
    returningOrders:   Number(returningRes?.count    ?? 0),
    loyalty: {
      totalPoints:    Number(loyaltyRes?.totalPoints    ?? 0),
      totalSpent:     Math.round(Number(loyaltyRes?.totalSpent  ?? 0) * 100) / 100,
      totalCustomers: Number(loyaltyRes?.totalCustomers ?? 0),
      withLoyalty:    Number(loyaltyRes?.withLoyalty    ?? 0),
    },
  });
});

// ── EOD Summary ────────────────────────────────────────────────────────────
router.get("/reports/eod-summary", async (req, res): Promise<void> => {
  const dateStr = (req.query["date"] as string) ?? new Date().toISOString().split("T")[0];
  const from = new Date(`${dateStr}T00:00:00`);
  const to   = new Date(`${dateStr}T23:59:59`);

  const orders = await db.select().from(ordersTable)
    .where(and(gte(ordersTable.createdAt, from), lte(ordersTable.createdAt, to)));

  const completed = orders.filter(o => o.status === "completed");
  const voided    = orders.filter(o => o.status === "voided");

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

  const revenue  = completed.reduce((s, o) => s + o.total, 0);
  const tax      = completed.reduce((s, o) => s + o.tax, 0);
  const discount = completed.reduce((s, o) => s + (o.discountValue ?? 0), 0);

  res.json({
    date: dateStr,
    revenue:  Math.round(revenue  * 100) / 100,
    tax:      Math.round(tax      * 100) / 100,
    discount: Math.round(discount * 100) / 100,
    completedOrders: completed.length,
    voidedOrders:    voided.length,
    avgOrderValue:   completed.length > 0 ? Math.round((revenue / completed.length) * 100) / 100 : 0,
    paymentBreakdown: Object.entries(paymentBreakdown).map(([method, d]) => ({ method, count: d.count, total: Math.round(d.total * 100) / 100 })),
    sessions: sessions.map(s => ({ id: s.id, staffName: s.staffName, openedAt: s.openedAt, closedAt: s.closedAt, openingCash: s.openingCash, actualCash: s.actualCash, actualCard: s.actualCard, status: s.status, closingNotes: s.closingNotes })),
    payouts:  payouts.map(p  => ({ id: p.id, amount: p.amount, reason: p.reason, staffName: p.staffName, createdAt: p.createdAt })),
  });
});

// ── Export CSV (main orders export) ───────────────────────────────────────
router.get("/reports/export", async (req, res): Promise<void> => {
  const query = ExportOrdersQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: query.error.message }); return; }

  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
  const from = parseDate(query.data.from, weekAgo);
  const to   = parseDate(query.data.to, new Date());

  const orders = await db.select().from(ordersTable)
    .where(and(gte(ordersTable.createdAt, from), lte(ordersTable.createdAt, to)))
    .orderBy(desc(ordersTable.createdAt));

  const header = "Order Number,Status,Type,Payment,Subtotal,Discount,Tax,Total,Table,Staff ID,Notes,Date\n";
  const rows = orders.map(o =>
    [o.orderNumber, o.status, o.orderType ?? "", o.paymentMethod ?? "", o.subtotal.toFixed(2),
     (o.discountValue ?? 0).toFixed(2), o.tax.toFixed(2), o.total.toFixed(2),
     o.tableId ?? "", o.staffId ?? "", `"${(o.notes ?? "").replace(/"/g, '""')}"`, o.createdAt.toISOString()].join(",")
  ).join("\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="nexus-orders-${from.toISOString().split("T")[0]}-to-${to.toISOString().split("T")[0]}.csv"`);
  res.send(header + rows);
});

// ── GCT Tax Report ─────────────────────────────────────────────────────────
router.get("/reports/tax", async (req, res): Promise<void> => {
  const { from, to } = rangeParams(req.query as Record<string, string>);
  const tenantId = (req as any).tenantId as number;

  // Fetch current GCT rate from settings
  const { appSettingsTable } = await import("@workspace/db");
  const settingsRows = await db.select().from(appSettingsTable).where(eq(appSettingsTable.tenantId, tenantId));
  const settings = Object.fromEntries(settingsRows.map(r => [r.key, r.value]));
  const gctRate = parseFloat(settings["tax_rate"] ?? "15");

  // Day-by-day breakdown
  const daily = await db.select({
    date:     sql<string>`DATE(${ordersTable.createdAt})::text`,
    orders:   sql<number>`COUNT(*)`,
    subtotal: sql<number>`COALESCE(SUM(${ordersTable.subtotal}), 0)`,
    tax:      sql<number>`COALESCE(SUM(${ordersTable.tax}), 0)`,
    total:    sql<number>`COALESCE(SUM(${ordersTable.total}), 0)`,
    discount: sql<number>`COALESCE(SUM(${ordersTable.discountValue}), 0)`,
  }).from(ordersTable)
    .where(and(eq(ordersTable.status, "completed"), gte(ordersTable.createdAt, from), lte(ordersTable.createdAt, to)))
    .groupBy(sql`DATE(${ordersTable.createdAt})`)
    .orderBy(asc(sql`DATE(${ordersTable.createdAt})`));

  // Payment-method GCT breakdown
  const byMethod = await db.select({
    method:   ordersTable.paymentMethod,
    orders:   sql<number>`COUNT(*)`,
    subtotal: sql<number>`COALESCE(SUM(${ordersTable.subtotal}), 0)`,
    tax:      sql<number>`COALESCE(SUM(${ordersTable.tax}), 0)`,
    total:    sql<number>`COALESCE(SUM(${ordersTable.total}), 0)`,
  }).from(ordersTable)
    .where(and(eq(ordersTable.status, "completed"), gte(ordersTable.createdAt, from), lte(ordersTable.createdAt, to)))
    .groupBy(ordersTable.paymentMethod);

  // Totals
  const totSubtotal = daily.reduce((s, r) => s + Number(r.subtotal), 0);
  const totTax      = daily.reduce((s, r) => s + Number(r.tax), 0);
  const totTotal    = daily.reduce((s, r) => s + Number(r.total), 0);
  const totDiscount = daily.reduce((s, r) => s + Number(r.discount), 0);
  const totOrders   = daily.reduce((s, r) => s + Number(r.orders), 0);

  res.json({
    gctRate,
    summary: {
      orders:          totOrders,
      grossSales:      Math.round(totTotal    * 100) / 100,
      taxableSubtotal: Math.round(totSubtotal * 100) / 100,
      gctCollected:    Math.round(totTax      * 100) / 100,
      totalDiscount:   Math.round(totDiscount * 100) / 100,
    },
    daily: daily.map(r => ({
      date:     r.date,
      orders:   Number(r.orders),
      subtotal: Math.round(Number(r.subtotal) * 100) / 100,
      tax:      Math.round(Number(r.tax)      * 100) / 100,
      total:    Math.round(Number(r.total)    * 100) / 100,
      discount: Math.round(Number(r.discount) * 100) / 100,
    })),
    byMethod: byMethod.map(r => ({
      method:   r.method ?? "other",
      orders:   Number(r.orders),
      subtotal: Math.round(Number(r.subtotal) * 100) / 100,
      tax:      Math.round(Number(r.tax)      * 100) / 100,
      total:    Math.round(Number(r.total)    * 100) / 100,
    })),
  });
});

export default router;
