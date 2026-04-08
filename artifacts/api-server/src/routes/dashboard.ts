import { Router, type IRouter } from "express";
import { and, eq, sql, desc, lte } from "drizzle-orm";
import { db, ordersTable, orderItemsTable, productsTable } from "@workspace/db";
import {
  GetDashboardSummaryResponse,
  GetRecentOrdersResponse,
  GetSalesByCategoryResponse,
  GetRecentOrdersQueryParams,
  GetDailySalesQueryParams,
  GetDailySalesResponse,
  GetTopProductsQueryParams,
  GetTopProductsResponse,
  GetPaymentMethodBreakdownResponse,
  GetLowStockProductsQueryParams,
  GetLowStockProductsResponse,
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

router.get("/dashboard/summary", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  weekAgo.setHours(0, 0, 0, 0);

  const todayOrders = await db
    .select()
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.tenantId, tenantId),
        eq(ordersTable.status, "completed"),
        sql`${ordersTable.createdAt} >= ${today}`,
      ),
    );

  const weekOrders = await db
    .select()
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.tenantId, tenantId),
        eq(ordersTable.status, "completed"),
        sql`${ordersTable.createdAt} >= ${weekAgo}`,
      ),
    );

  const todaySales = todayOrders.reduce((s, o) => s + o.total, 0);
  const weekSales = weekOrders.reduce((s, o) => s + o.total, 0);
  const avgOrderValue = weekOrders.length > 0 ? weekSales / weekOrders.length : 0;

  const [{ count: totalProducts }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(productsTable)
    .where(eq(productsTable.tenantId, tenantId));

  res.json(
    GetDashboardSummaryResponse.parse({
      todaySales: Math.round(todaySales * 100) / 100,
      todayOrders: todayOrders.length,
      totalProducts: Number(totalProducts),
      avgOrderValue: Math.round(avgOrderValue * 100) / 100,
      weekSales: Math.round(weekSales * 100) / 100,
      weekOrders: weekOrders.length,
    }),
  );
});

router.get("/dashboard/recent-orders", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const query = GetRecentOrdersQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const limit = query.data.limit ?? 10;

  const orders = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.tenantId, tenantId))
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
        discountType: order.discountType ?? undefined,
        discountAmount: order.discountAmount ?? undefined,
        discountValue: order.discountValue ?? undefined,
        paymentMethod: order.paymentMethod ?? undefined,
        splitCardAmount: order.splitCardAmount ?? undefined,
        splitCashAmount: order.splitCashAmount ?? undefined,
        notes: order.notes ?? undefined,
        voidReason: order.voidReason ?? undefined,
        completedAt: order.completedAt ?? undefined,
        items: items.map((item) => ({
          id: item.id,
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discountAmount: item.discountAmount ?? undefined,
          lineTotal: item.lineTotal,
        })),
      };
    }),
  );

  res.json(GetRecentOrdersResponse.parse(ordersWithItems));
});

router.get("/dashboard/sales-by-category", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const rows = await db
    .select({
      category: productsTable.category,
      totalSales: sql<number>`sum(${orderItemsTable.lineTotal})`,
      orderCount: sql<number>`count(distinct ${orderItemsTable.orderId})`,
    })
    .from(orderItemsTable)
    .innerJoin(productsTable, and(eq(orderItemsTable.productId, productsTable.id), eq(productsTable.tenantId, tenantId)))
    .innerJoin(ordersTable, and(eq(orderItemsTable.orderId, ordersTable.id), eq(ordersTable.tenantId, tenantId)))
    .where(eq(ordersTable.status, "completed"))
    .groupBy(productsTable.category)
    .orderBy(desc(sql`sum(${orderItemsTable.lineTotal})`));

  res.json(
    GetSalesByCategoryResponse.parse(
      rows.map((r) => ({
        category: r.category,
        totalSales: Math.round(Number(r.totalSales) * 100) / 100,
        orderCount: Number(r.orderCount),
      })),
    ),
  );
});

router.get("/dashboard/daily-sales", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const query = GetDailySalesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const days = query.data.days ?? 7;

  const rows = await db
    .select({
      date: sql<string>`DATE(${ordersTable.createdAt})::text`,
      revenue: sql<number>`sum(${ordersTable.total})`,
      orders: sql<number>`count(*)`,
    })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.tenantId, tenantId),
        eq(ordersTable.status, "completed"),
        sql`${ordersTable.createdAt} >= NOW() - INTERVAL '${sql.raw(String(days))} days'`,
      ),
    )
    .groupBy(sql`DATE(${ordersTable.createdAt})`)
    .orderBy(sql`DATE(${ordersTable.createdAt})`);

  const result: Array<{ date: string; revenue: number; orders: number }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    const found = rows.find((r) => r.date === dateStr);
    result.push({
      date: dateStr,
      revenue: found ? Math.round(Number(found.revenue) * 100) / 100 : 0,
      orders: found ? Number(found.orders) : 0,
    });
  }

  res.json(GetDailySalesResponse.parse(result));
});

router.get("/dashboard/top-products", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const query = GetTopProductsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const limit = query.data.limit ?? 5;

  const rows = await db
    .select({
      productId: orderItemsTable.productId,
      productName: orderItemsTable.productName,
      totalRevenue: sql<number>`sum(${orderItemsTable.lineTotal})`,
      unitsSold: sql<number>`sum(${orderItemsTable.quantity})`,
    })
    .from(orderItemsTable)
    .innerJoin(ordersTable, and(eq(orderItemsTable.orderId, ordersTable.id), eq(ordersTable.tenantId, tenantId)))
    .where(eq(ordersTable.status, "completed"))
    .groupBy(orderItemsTable.productId, orderItemsTable.productName)
    .orderBy(desc(sql`sum(${orderItemsTable.lineTotal})`))
    .limit(limit);

  res.json(
    GetTopProductsResponse.parse(
      rows.map((r) => ({
        productId: r.productId,
        productName: r.productName,
        totalRevenue: Math.round(Number(r.totalRevenue) * 100) / 100,
        unitsSold: Number(r.unitsSold),
      })),
    ),
  );
});

router.get("/dashboard/payment-methods", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const rows = await db
    .select({
      method: ordersTable.paymentMethod,
      revenue: sql<number>`sum(${ordersTable.total})`,
      count: sql<number>`count(*)`,
    })
    .from(ordersTable)
    .where(and(eq(ordersTable.tenantId, tenantId), eq(ordersTable.status, "completed")))
    .groupBy(ordersTable.paymentMethod);

  res.json(
    GetPaymentMethodBreakdownResponse.parse(
      rows.map((r) => ({
        method: r.method ?? "unknown",
        revenue: Math.round(Number(r.revenue) * 100) / 100,
        count: Number(r.count),
      })),
    ),
  );
});

router.get("/dashboard/low-stock", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const query = GetLowStockProductsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const threshold = query.data.threshold ?? 10;

  const products = await db
    .select()
    .from(productsTable)
    .where(and(eq(productsTable.tenantId, tenantId), lte(productsTable.stockCount, threshold)))
    .orderBy(productsTable.stockCount);

  res.json(
    GetLowStockProductsResponse.parse(
      products.map((p) => ({
        ...p,
        imageUrl: p.imageUrl ?? undefined,
        description: p.description ?? undefined,
        barcode: p.barcode ?? undefined,
      })),
    ),
  );
});

export default router;
