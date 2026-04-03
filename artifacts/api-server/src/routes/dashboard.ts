import { Router, type IRouter } from "express";
import { eq, sql, desc } from "drizzle-orm";
import { db, ordersTable, orderItemsTable, productsTable } from "@workspace/db";
import {
  GetDashboardSummaryResponse,
  GetRecentOrdersResponse,
  GetSalesByCategoryResponse,
  GetRecentOrdersQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  weekAgo.setHours(0, 0, 0, 0);

  const todayOrders = await db
    .select()
    .from(ordersTable)
    .where(
      sql`${ordersTable.status} = 'completed' AND ${ordersTable.createdAt} >= ${today}`,
    );

  const weekOrders = await db
    .select()
    .from(ordersTable)
    .where(
      sql`${ordersTable.status} = 'completed' AND ${ordersTable.createdAt} >= ${weekAgo}`,
    );

  const todaySales = todayOrders.reduce((sum, o) => sum + o.total, 0);
  const weekSales = weekOrders.reduce((sum, o) => sum + o.total, 0);
  const avgOrderValue =
    weekOrders.length > 0 ? weekSales / weekOrders.length : 0;

  const [{ count: totalProducts }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(productsTable);

  const summary = {
    todaySales: Math.round(todaySales * 100) / 100,
    todayOrders: todayOrders.length,
    totalProducts: Number(totalProducts),
    avgOrderValue: Math.round(avgOrderValue * 100) / 100,
    weekSales: Math.round(weekSales * 100) / 100,
    weekOrders: weekOrders.length,
  };

  res.json(GetDashboardSummaryResponse.parse(summary));
});

router.get("/dashboard/recent-orders", async (req, res): Promise<void> => {
  const query = GetRecentOrdersQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const limit = query.data.limit ?? 10;

  const orders = await db
    .select()
    .from(ordersTable)
    .orderBy(desc(ordersTable.createdAt))
    .limit(limit);

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

  res.json(GetRecentOrdersResponse.parse(ordersWithItems));
});

router.get("/dashboard/sales-by-category", async (_req, res): Promise<void> => {
  const products = await db.select().from(productsTable);
  const orderItems = await db.select().from(orderItemsTable);
  const orders = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.status, "completed"));

  const completedOrderIds = new Set(orders.map((o) => o.id));
  const productCategoryMap = new Map(
    products.map((p) => [p.id, p.category]),
  );

  const categoryMap: Record<string, { totalSales: number; orderCount: number }> =
    {};

  for (const item of orderItems) {
    if (!completedOrderIds.has(item.orderId)) continue;
    const category = productCategoryMap.get(item.productId) ?? "Other";
    if (!categoryMap[category]) {
      categoryMap[category] = { totalSales: 0, orderCount: 0 };
    }
    categoryMap[category].totalSales += item.lineTotal;
    categoryMap[category].orderCount += 1;
  }

  const result = Object.entries(categoryMap).map(([category, data]) => ({
    category,
    totalSales: Math.round(data.totalSales * 100) / 100,
    orderCount: data.orderCount,
  }));

  res.json(GetSalesByCategoryResponse.parse(result));
});

export default router;
