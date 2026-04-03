import React from "react";
import {
  useGetDashboardSummary,
  useGetSalesByCategory,
  useGetRecentOrders,
  useGetDailySales,
  useGetTopProducts,
  useGetPaymentMethodBreakdown,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, ShoppingBag, Package, TrendingUp, ArrowUpRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie,
  Legend,
} from "recharts";
import { format, parseISO } from "date-fns";

const BLUE_PALETTE = ["#3b82f6", "#60a5fa", "#93c5fd", "#bfdbfe", "#dbeafe"];
const PAYMENT_COLORS: Record<string, string> = {
  card: "#3b82f6",
  cash: "#22c55e",
  split: "#a855f7",
  unknown: "#6b7280",
};

function formatCurrency(v: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);
}

function MetricCard({
  title,
  value,
  icon: Icon,
  loading,
  sub,
}: {
  title: string;
  value: string;
  icon: React.ElementType;
  loading: boolean;
  sub?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-[120px]" />
        ) : (
          <>
            <div className="text-2xl font-bold">{value}</div>
            {sub && (
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                <ArrowUpRight className="h-3 w-3 text-green-400" />
                {sub}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-lg">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {p.name === "Revenue" ? formatCurrency(p.value) : p.value}
        </p>
      ))}
    </div>
  );
};

export function Dashboard() {
  const { data: summary, isLoading: loadingSummary } = useGetDashboardSummary();
  const { data: categories, isLoading: loadingCategories } = useGetSalesByCategory();
  const { data: recentOrders, isLoading: loadingOrders } = useGetRecentOrders({ limit: 5 });
  const { data: dailySales, isLoading: loadingDaily } = useGetDailySales({ days: 7 });
  const { data: topProducts, isLoading: loadingTop } = useGetTopProducts({ limit: 5 });
  const { data: paymentMethods, isLoading: loadingPayments } = useGetPaymentMethodBreakdown();

  const dailyChartData = (dailySales ?? []).map((d) => ({
    date: format(parseISO(d.date), "MMM d"),
    Revenue: d.revenue,
    Orders: d.orders,
  }));

  const topChartData = (topProducts ?? []).map((p) => ({
    name: p.productName.length > 14 ? p.productName.slice(0, 14) + "…" : p.productName,
    Revenue: p.totalRevenue,
    Units: p.unitsSold,
  }));

  const paymentChartData = (paymentMethods ?? []).map((m) => ({
    name: m.method.charAt(0).toUpperCase() + m.method.slice(1),
    value: m.revenue,
    count: m.count,
  }));

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-8 space-y-8"
    >
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground mt-1">Overview of your business performance.</p>
      </div>

      {/* KPI row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Today's Sales"
          value={summary ? formatCurrency(summary.todaySales) : ""}
          icon={DollarSign}
          loading={loadingSummary}
          sub={`${summary?.todayOrders ?? 0} orders today`}
        />
        <MetricCard
          title="Week Revenue"
          value={summary ? formatCurrency(summary.weekSales) : ""}
          icon={TrendingUp}
          loading={loadingSummary}
          sub={`${summary?.weekOrders ?? 0} orders this week`}
        />
        <MetricCard
          title="Avg Order Value"
          value={summary ? formatCurrency(summary.avgOrderValue) : ""}
          icon={ShoppingBag}
          loading={loadingSummary}
        />
        <MetricCard
          title="Total Products"
          value={summary?.totalProducts.toString() || ""}
          icon={Package}
          loading={loadingSummary}
        />
      </div>

      {/* Revenue chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Revenue – Last 7 Days</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingDaily ? (
            <Skeleton className="h-56 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={dailyChartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 11, fill: "#6b7280" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `$${v}`}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="Revenue"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  fill="url(#revGrad)"
                  dot={{ r: 3, fill: "#3b82f6" }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Bottom row: top products + payment methods + recent orders */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Top products */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top Products</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingTop ? (
              <Skeleton className="h-48 w-full" />
            ) : topChartData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No sales data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={topChartData} layout="vertical" margin={{ left: 0, right: 8 }}>
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10, fill: "#6b7280" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `$${v}`}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 10, fill: "#9ca3af" }}
                    axisLine={false}
                    tickLine={false}
                    width={90}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="Revenue" radius={[0, 4, 4, 0]}>
                    {topChartData.map((_, i) => (
                      <Cell key={i} fill={BLUE_PALETTE[i % BLUE_PALETTE.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Payment method breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payment Methods</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingPayments ? (
              <Skeleton className="h-48 w-full" />
            ) : paymentChartData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No sales data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={paymentChartData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="45%"
                    innerRadius={50}
                    outerRadius={75}
                    paddingAngle={3}
                  >
                    {paymentChartData.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={PAYMENT_COLORS[entry.name.toLowerCase()] ?? "#6b7280"}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: number, name) => [formatCurrency(v), name]}
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: 11, color: "#9ca3af" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Recent orders */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Orders</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingOrders ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : (recentOrders ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No orders yet</p>
            ) : (
              <div className="space-y-2">
                {recentOrders?.map((order) => (
                  <div
                    key={order.id}
                    className="flex items-center justify-between rounded-lg bg-secondary/30 px-3 py-2"
                  >
                    <div>
                      <p className="text-sm font-medium">{order.orderNumber}</p>
                      <p className="text-xs text-muted-foreground">
                        {order.items.length} item{order.items.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          order.status === "completed"
                            ? "default"
                            : order.status === "voided"
                            ? "destructive"
                            : "secondary"
                        }
                        className="text-xs capitalize"
                      >
                        {order.status}
                      </Badge>
                      <span className="font-mono text-sm font-semibold text-primary">
                        {formatCurrency(order.total)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Category breakdown */}
      {!loadingCategories && (categories ?? []).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sales by Category</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {categories?.map((cat) => (
                <div
                  key={cat.category}
                  className="rounded-lg bg-secondary/30 p-4 space-y-1"
                >
                  <p className="text-sm font-medium">{cat.category}</p>
                  <p className="text-xl font-bold text-primary font-mono">
                    {formatCurrency(cat.totalSales)}
                  </p>
                  <p className="text-xs text-muted-foreground">{cat.orderCount} orders</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </motion.div>
  );
}
