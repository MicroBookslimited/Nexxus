import { Router, type IRouter } from "express";
import { eq, sql, and, gte, lte, desc } from "drizzle-orm";
import { db, ordersTable, orderItemsTable, customersTable } from "@workspace/db";
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

router.get("/reports/summary", async (req, res): Promise<void> => {
  const query = GetReportSummaryQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  weekAgo.setHours(0, 0, 0, 0);

  const from = parseDate(query.data.from, weekAgo);
  const to = parseDate(query.data.to, new Date());

  const completedOrders = await db
    .select()
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.status, "completed"),
        gte(ordersTable.createdAt, from),
        lte(ordersTable.createdAt, to),
      ),
    );

  const voidedOrders = await db
    .select({ count: sql<number>`count(*)` })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.status, "voided"),
        gte(ordersTable.createdAt, from),
        lte(ordersTable.createdAt, to),
      ),
    );

  const newCustomers = await db
    .select({ count: sql<number>`count(*)` })
    .from(customersTable)
    .where(
      and(
        gte(customersTable.createdAt, from),
        lte(customersTable.createdAt, to),
      ),
    );

  const revenue = completedOrders.reduce((s, o) => s + o.total, 0);
  const orders = completedOrders.length;
  const avgOrderValue = orders > 0 ? revenue / orders : 0;

  // Top product by units sold
  const topRow = await db
    .select({
      productName: orderItemsTable.productName,
      total: sql<number>`sum(${orderItemsTable.quantity})`,
    })
    .from(orderItemsTable)
    .innerJoin(ordersTable, eq(orderItemsTable.orderId, ordersTable.id))
    .where(
      and(
        eq(ordersTable.status, "completed"),
        gte(ordersTable.createdAt, from),
        lte(ordersTable.createdAt, to),
      ),
    )
    .groupBy(orderItemsTable.productName)
    .orderBy(desc(sql`sum(${orderItemsTable.quantity})`))
    .limit(1);

  res.json(
    GetReportSummaryResponse.parse({
      revenue: Math.round(revenue * 100) / 100,
      orders,
      avgOrderValue: Math.round(avgOrderValue * 100) / 100,
      newCustomers: Number(newCustomers[0]?.count ?? 0),
      topProduct: topRow[0]?.productName ?? null,
      voidedOrders: Number(voidedOrders[0]?.count ?? 0),
    }),
  );
});

router.get("/reports/hourly", async (req, res): Promise<void> => {
  const query = GetHourlySalesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const dateStr = query.data.date ?? new Date().toISOString().split("T")[0];
  const from = new Date(`${dateStr}T00:00:00Z`);
  const to = new Date(`${dateStr}T23:59:59Z`);

  const rows = await db
    .select({
      hour: sql<number>`EXTRACT(HOUR FROM ${ordersTable.createdAt})::int`,
      revenue: sql<number>`sum(${ordersTable.total})`,
      orders: sql<number>`count(*)`,
    })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.status, "completed"),
        gte(ordersTable.createdAt, from),
        lte(ordersTable.createdAt, to),
      ),
    )
    .groupBy(sql`EXTRACT(HOUR FROM ${ordersTable.createdAt})`)
    .orderBy(sql`EXTRACT(HOUR FROM ${ordersTable.createdAt})`);

  const result = Array.from({ length: 24 }, (_, h) => {
    const found = rows.find((r) => r.hour === h);
    return {
      hour: h,
      revenue: found ? Math.round(Number(found.revenue) * 100) / 100 : 0,
      orders: found ? Number(found.orders) : 0,
    };
  });

  res.json(GetHourlySalesResponse.parse(result));
});

router.get("/reports/export", async (req, res): Promise<void> => {
  const query = ExportOrdersQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const today = new Date();
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const from = parseDate(query.data.from, weekAgo);
  const to = parseDate(query.data.to, today);

  const orders = await db
    .select()
    .from(ordersTable)
    .where(
      and(
        gte(ordersTable.createdAt, from),
        lte(ordersTable.createdAt, to),
      ),
    )
    .orderBy(desc(ordersTable.createdAt));

  const header = "Order Number,Status,Payment,Subtotal,Discount,Tax,Total,Notes,Date\n";
  const rows = orders
    .map((o) =>
      [
        o.orderNumber,
        o.status,
        o.paymentMethod ?? "",
        o.subtotal.toFixed(2),
        (o.discountValue ?? 0).toFixed(2),
        o.tax.toFixed(2),
        o.total.toFixed(2),
        `"${(o.notes ?? "").replace(/"/g, '""')}"`,
        o.createdAt.toISOString(),
      ].join(","),
    )
    .join("\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="nexus-orders-${from.toISOString().split("T")[0]}-to-${to.toISOString().split("T")[0]}.csv"`,
  );
  res.send(header + rows);
});

export default router;
