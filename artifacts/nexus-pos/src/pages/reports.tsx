import React, { useState } from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useGetReportSummary, useGetHourlySales } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
  LineChart, Line, PieChart, Pie, Legend,
} from "recharts";
import {
  DollarSign, ShoppingBag, TrendingUp, Users, Package, XCircle, Download,
  AlertTriangle, CheckCircle2, Clock, CreditCard, Banknote, Star,
  BarChart2, ChefHat, UserCheck, Calendar, Layers, ArrowUpRight, ArrowDownRight,
} from "lucide-react";
import { format, subDays, startOfDay, endOfDay } from "date-fns";

// ── Helpers ──────────────────────────────────────────────────────────────────

function fc(v: number, currency = "JMD") {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(v);
  } catch {
    return `${currency} ${v.toFixed(2)}`;
  }
}

const HOUR_LABELS = Array.from({ length: 24 }, (_, h) => {
  if (h === 0) return "12am";
  if (h === 12) return "12pm";
  return h < 12 ? `${h}am` : `${h - 12}pm`;
});

type Preset = "today" | "yesterday" | "week" | "month" | "custom";
const PRESETS: { label: string; value: Preset }[] = [
  { label: "Today", value: "today" },
  { label: "Yesterday", value: "yesterday" },
  { label: "Last 7 Days", value: "week" },
  { label: "Last 30 Days", value: "month" },
  { label: "Custom", value: "custom" },
];

function getRange(preset: Preset, customFrom: string, customTo: string) {
  const now = new Date();
  switch (preset) {
    case "today": return { from: format(startOfDay(now), "yyyy-MM-dd"), to: format(endOfDay(now), "yyyy-MM-dd") };
    case "yesterday": { const y = subDays(now, 1); return { from: format(startOfDay(y), "yyyy-MM-dd"), to: format(endOfDay(y), "yyyy-MM-dd") }; }
    case "week": return { from: format(subDays(now, 6), "yyyy-MM-dd"), to: format(now, "yyyy-MM-dd") };
    case "month": return { from: format(subDays(now, 29), "yyyy-MM-dd"), to: format(now, "yyyy-MM-dd") };
    case "custom": return { from: customFrom, to: customTo };
  }
}

const CHART_COLORS = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#f97316"];
const METHOD_LABELS: Record<string, string> = { cash: "Cash", card: "Card", split: "Split", bank_transfer: "Bank Transfer", other: "Other" };

// ── Generic hooks ─────────────────────────────────────────────────────────────

function useReportFetch<T>(key: string[], url: string, enabled = true) {
  return useQuery<T>({
    queryKey: key,
    queryFn: async () => {
      const r = await fetch(url);
      if (!r.ok) throw new Error("Failed to load report data");
      return r.json();
    },
    enabled,
  });
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ title, value, icon: Icon, loading, sub, accent }: {
  title: string; value: string; icon: React.ElementType; loading: boolean; sub?: string; accent?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${accent ?? "text-muted-foreground"}`} />
      </CardHeader>
      <CardContent>
        {loading ? <Skeleton className="h-8 w-[120px]" /> : (
          <>
            <div className="text-2xl font-bold">{value}</div>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
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
          {p.name}: {typeof p.value === "number" && (p.name?.toLowerCase().includes("revenue") || p.name?.toLowerCase().includes("total") || p.name?.toLowerCase().includes("spend")) ? fc(p.value) : p.value}
        </p>
      ))}
    </div>
  );
};

function SectionSkeleton() {
  return <div className="space-y-4">{[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full" />)}</div>;
}

// ── Date Range Controls ───────────────────────────────────────────────────────

function DateRangeBar({ preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo }: {
  preset: Preset; setPreset: (p: Preset) => void;
  customFrom: string; setCustomFrom: (s: string) => void;
  customTo: string; setCustomTo: (s: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      {PRESETS.map((p) => (
        <Button key={p.value} size="sm" variant={preset === p.value ? "default" : "outline"} onClick={() => setPreset(p.value)}>
          {p.label}
        </Button>
      ))}
      {preset === "custom" && (
        <>
          <div className="flex items-end gap-1">
            <div className="grid gap-1"><Label className="text-xs">From</Label><Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-8 w-36 text-xs" /></div>
            <div className="grid gap-1"><Label className="text-xs">To</Label><Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-8 w-36 text-xs" /></div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Tab: Sales ────────────────────────────────────────────────────────────────

function SalesTab({ range, preset }: { range: { from: string; to: string }; preset: Preset }) {
  const { data: summary, isLoading: loadingSummary } = useGetReportSummary(range);
  const hourlyDate = preset === "today" ? format(new Date(), "yyyy-MM-dd")
    : preset === "yesterday" ? format(subDays(new Date(), 1), "yyyy-MM-dd")
    : range.to;
  const { data: hourly, isLoading: loadingHourly } = useGetHourlySales({ date: hourlyDate });

  const { data: trend, isLoading: loadingTrend } = useReportFetch<any[]>(
    ["daily-trend", range.from, range.to],
    `/api/reports/daily-trend?from=${range.from}&to=${range.to}`,
  );

  const { data: payBreak, isLoading: loadingPay } = useReportFetch<any[]>(
    ["payment-breakdown", range.from, range.to],
    `/api/reports/payment-breakdown?from=${range.from}&to=${range.to}`,
  );

  const hourlyChartData = (hourly ?? []).map((h, i) => ({ hour: HOUR_LABELS[i], Revenue: h.revenue, Orders: h.orders, active: h.orders > 0 }));
  const pieData = (payBreak ?? []).map(p => ({ name: METHOD_LABELS[p.method] ?? p.method, value: p.total, count: p.count }));

  const handleExport = () => {
    const a = document.createElement("a");
    a.href = `/api/reports/export?from=${range.from}&to=${range.to}`;
    a.download = `nexus-report-${range.from}-to-${range.to}.csv`;
    a.click();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={handleExport} className="gap-2">
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-3">
        <StatCard title="Revenue" value={summary ? fc(summary.revenue) : ""} icon={DollarSign} loading={loadingSummary} />
        <StatCard title="Orders" value={summary?.orders.toString() ?? ""} icon={ShoppingBag} loading={loadingSummary} />
        <StatCard title="Avg Order Value" value={summary ? fc(summary.avgOrderValue) : ""} icon={TrendingUp} loading={loadingSummary} />
        <StatCard title="New Customers" value={summary?.newCustomers.toString() ?? ""} icon={Users} loading={loadingSummary} />
        <StatCard title="Top Product" value={summary?.topProduct ?? "—"} icon={Package} loading={loadingSummary} sub="By units sold" />
        <StatCard title="Voided Orders" value={summary?.voidedOrders.toString() ?? ""} icon={XCircle} loading={loadingSummary} accent="text-amber-500" />
      </div>

      {/* Revenue Trend */}
      {trend && trend.length > 1 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Revenue Trend</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={trend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#6b7280" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3, fill: "#3b82f6" }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Hourly Chart */}
        <Card>
          <CardHeader><CardTitle className="text-base">Hourly Sales — {format(new Date(hourlyDate + "T12:00:00"), "MMM d, yyyy")}</CardTitle></CardHeader>
          <CardContent>
            {loadingHourly ? <Skeleton className="h-48 w-full" /> : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={hourlyChartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="hour" tick={{ fontSize: 9, fill: "#6b7280" }} axisLine={false} tickLine={false} interval={2} />
                  <YAxis tick={{ fontSize: 9, fill: "#6b7280" }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="Revenue" radius={[3, 3, 0, 0]}>
                    {hourlyChartData.map((entry, i) => <Cell key={i} fill={entry.active ? "#3b82f6" : "rgba(59,130,246,0.15)"} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Payment Breakdown */}
        <Card>
          <CardHeader><CardTitle className="text-base">Payment Method Breakdown</CardTitle></CardHeader>
          <CardContent>
            {loadingPay ? <Skeleton className="h-48 w-full" /> : pieData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No payment data for this period</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={11}>
                    {pieData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => fc(v)} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Payment detail table */}
      {payBreak && payBreak.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Payment Method Detail</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Method</TableHead><TableHead className="text-right">Orders</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
              <TableBody>
                {payBreak.map((p, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium capitalize">{METHOD_LABELS[p.method] ?? p.method}</TableCell>
                    <TableCell className="text-right">{p.count}</TableCell>
                    <TableCell className="text-right font-mono">{fc(p.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Tab: Exceptions ───────────────────────────────────────────────────────────

function ExceptionsTab({ range }: { range: { from: string; to: string } }) {
  const { data, isLoading } = useReportFetch<any>(
    ["exceptions", range.from, range.to],
    `/api/reports/exceptions?from=${range.from}&to=${range.to}`,
  );

  if (isLoading) return <SectionSkeleton />;

  const voids: any[] = data?.voids ?? [];
  const discounts = data?.discounts ?? { count: 0, totalDiscount: 0, avgDiscount: 0 };
  const loyalty = data?.loyalty ?? { count: 0, totalPoints: 0, totalValue: 0 };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard title="Voided Orders" value={voids.length.toString()} icon={XCircle} loading={false} accent="text-red-400" sub="Orders cancelled" />
        <StatCard title="Voided Value" value={fc(voids.reduce((s, v) => s + v.total, 0))} icon={DollarSign} loading={false} accent="text-red-400" />
        <StatCard title="Discounted Orders" value={discounts.count.toString()} icon={AlertTriangle} loading={false} accent="text-amber-400" />
        <StatCard title="Total Discounts Given" value={fc(discounts.totalDiscount)} icon={TrendingUp} loading={false} accent="text-amber-400" sub={`Avg: ${fc(discounts.avgDiscount)}`} />
      </div>

      {/* Loyalty redemptions */}
      {loyalty.count > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Star className="h-4 w-4 text-yellow-400" />Loyalty Redemptions</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-3 gap-4 text-center">
            <div><p className="text-2xl font-bold">{loyalty.count}</p><p className="text-xs text-muted-foreground">Redemptions</p></div>
            <div><p className="text-2xl font-bold">{loyalty.totalPoints.toLocaleString()}</p><p className="text-xs text-muted-foreground">Points Redeemed</p></div>
            <div><p className="text-2xl font-bold">{fc(loyalty.totalValue)}</p><p className="text-xs text-muted-foreground">Value Discounted</p></div>
          </CardContent>
        </Card>
      )}

      {/* Voided orders table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Voided Orders</CardTitle>
          <CardDescription>{voids.length === 0 ? "No voided orders in this period" : `${voids.length} voided order${voids.length !== 1 ? "s" : ""}`}</CardDescription>
        </CardHeader>
        <CardContent>
          {voids.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-muted-foreground gap-2">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              <p className="text-sm">No voids in this period — great work!</p>
            </div>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>Order #</TableHead><TableHead>Total</TableHead><TableHead>Reason</TableHead><TableHead>Date/Time</TableHead></TableRow></TableHeader>
              <TableBody>
                {voids.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="font-mono text-sm">{v.orderNumber}</TableCell>
                    <TableCell className="font-mono text-red-400">{fc(v.total)}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{v.voidReason}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{format(new Date(v.createdAt), "MMM d, HH:mm")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Tab: Product Mix ──────────────────────────────────────────────────────────

function ProductMixTab({ range }: { range: { from: string; to: string } }) {
  const { data, isLoading } = useReportFetch<any>(
    ["product-mix", range.from, range.to],
    `/api/reports/product-mix?from=${range.from}&to=${range.to}`,
  );

  if (isLoading) return <SectionSkeleton />;

  const items: any[] = data?.items ?? [];
  const categories: any[] = data?.categories ?? [];
  const top10 = items.slice(0, 10);
  const bottom5 = items.length > 5 ? items.slice(-5).reverse() : [];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 grid-cols-3">
        <StatCard title="Products Sold" value={items.length.toString()} icon={Package} loading={false} />
        <StatCard title="Total Units" value={items.reduce((s, i) => s + i.quantity, 0).toLocaleString()} icon={ShoppingBag} loading={false} />
        <StatCard title="Product Revenue" value={fc(items.reduce((s, i) => s + i.revenue, 0))} icon={DollarSign} loading={false} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Top by revenue */}
        <Card>
          <CardHeader><CardTitle className="text-base">Top Items by Revenue</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {top10.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">No sales in this period</p> : top10.map((item, i) => (
              <div key={item.productId} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className="w-5 text-xs text-muted-foreground font-mono">{i + 1}.</span>
                    <span className="font-medium truncate max-w-[160px]">{item.productName}</span>
                  </span>
                  <span className="font-mono text-xs">{fc(item.revenue)}</span>
                </div>
                <Progress value={item.percentage} className="h-1.5" />
                <p className="text-xs text-muted-foreground">{item.quantity} units · {item.percentage}% of revenue</p>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Category breakdown */}
        <Card>
          <CardHeader><CardTitle className="text-base">Revenue by Category</CardTitle></CardHeader>
          <CardContent>
            {categories.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">No data</p> : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={categories} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 9, fill: "#6b7280" }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
                  <YAxis type="category" dataKey="category" tick={{ fontSize: 10, fill: "#6b7280" }} axisLine={false} tickLine={false} width={80} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="revenue" name="Revenue" radius={[0, 3, 3, 0]}>
                    {categories.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Full product table */}
      <Card>
        <CardHeader><CardTitle className="text-base">All Products Ranked</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>#</TableHead><TableHead>Product</TableHead><TableHead className="text-right">Units</TableHead><TableHead className="text-right">Revenue</TableHead><TableHead className="text-right">% of Total</TableHead></TableRow></TableHeader>
            <TableBody>
              {items.map((item, i) => (
                <TableRow key={item.productId}>
                  <TableCell className="text-xs text-muted-foreground font-mono w-8">{i + 1}</TableCell>
                  <TableCell className="font-medium">{item.productName}</TableCell>
                  <TableCell className="text-right">{item.quantity}</TableCell>
                  <TableCell className="text-right font-mono">{fc(item.revenue)}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant={i < 3 ? "default" : "secondary"}>{item.percentage}%</Badge>
                  </TableCell>
                </TableRow>
              ))}
              {items.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No sales in this period</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Underperformers */}
      {bottom5.length > 0 && (
        <Card className="border-amber-500/20">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-400" />Lowest Performing Items</CardTitle>
            <CardDescription>Consider removing or promoting these items</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Product</TableHead><TableHead className="text-right">Units Sold</TableHead><TableHead className="text-right">Revenue</TableHead></TableRow></TableHeader>
              <TableBody>
                {bottom5.map((item) => (
                  <TableRow key={item.productId}>
                    <TableCell className="font-medium text-amber-400/80">{item.productName}</TableCell>
                    <TableCell className="text-right">{item.quantity}</TableCell>
                    <TableCell className="text-right font-mono">{fc(item.revenue)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Tab: Inventory ────────────────────────────────────────────────────────────

function InventoryTab() {
  const { data, isLoading } = useReportFetch<any>(["inventory"], "/api/reports/inventory");
  const [filter, setFilter] = useState<"all" | "ok" | "low" | "out">("all");

  if (isLoading) return <SectionSkeleton />;

  const products: any[] = data?.products ?? [];
  const summary = data?.summary ?? { total: 0, inStock: 0, outOfStock: 0, lowStock: 0 };
  const filtered = filter === "all" ? products : products.filter(p => p.status === filter);

  const statusColor = (s: string) => s === "out" ? "text-red-400" : s === "low" ? "text-amber-400" : "text-emerald-400";
  const statusBadge = (s: string) => s === "out" ? "destructive" : s === "low" ? "outline" : "secondary";
  const statusLabel = (s: string) => s === "out" ? "Out of Stock" : s === "low" ? "Low Stock" : "In Stock";

  return (
    <div className="space-y-6">
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Products" value={summary.total.toString()} icon={Package} loading={false} />
        <StatCard title="In Stock" value={summary.inStock.toString()} icon={CheckCircle2} loading={false} accent="text-emerald-400" />
        <StatCard title="Low Stock" value={summary.lowStock.toString()} icon={AlertTriangle} loading={false} accent="text-amber-400" sub="5 or fewer units" />
        <StatCard title="Out of Stock" value={summary.outOfStock.toString()} icon={XCircle} loading={false} accent="text-red-400" />
      </div>

      {/* Filter buttons */}
      <div className="flex gap-2">
        {(["all", "ok", "low", "out"] as const).map(f => (
          <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
            {f === "all" ? "All" : f === "ok" ? "In Stock" : f === "low" ? "Low Stock" : "Out of Stock"}
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Product Inventory</CardTitle>
          <CardDescription>Showing {filtered.length} of {products.length} products</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Product</TableHead><TableHead>Category</TableHead><TableHead className="text-right">Price</TableHead><TableHead className="text-right">Stock</TableHead><TableHead className="text-right">Total Sold</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {filtered.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{p.category}</TableCell>
                  <TableCell className="text-right font-mono">{fc(p.price)}</TableCell>
                  <TableCell className={`text-right font-mono font-bold ${statusColor(p.status)}`}>{p.stockCount}</TableCell>
                  <TableCell className="text-right">{p.soldTotal}</TableCell>
                  <TableCell><Badge variant={statusBadge(p.status) as any} className="text-xs">{statusLabel(p.status)}</Badge></TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No products match this filter</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Tab: Labor ────────────────────────────────────────────────────────────────

function LaborTab({ range }: { range: { from: string; to: string } }) {
  const { data, isLoading } = useReportFetch<any>(
    ["staff-performance", range.from, range.to],
    `/api/reports/staff-performance?from=${range.from}&to=${range.to}`,
  );

  if (isLoading) return <SectionSkeleton />;

  const staff: any[] = data?.staff ?? [];
  const shifts: any[] = data?.shifts ?? [];
  const unattributed = data?.unattributed ?? { orders: 0, revenue: 0 };

  const chartData = staff.map(s => ({ name: s.staffName.split(" ")[0], Revenue: s.revenue, Orders: s.orders }));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 grid-cols-3">
        <StatCard title="Active Staff" value={staff.length.toString()} icon={UserCheck} loading={false} />
        <StatCard title="Total Shifts" value={shifts.length.toString()} icon={Clock} loading={false} />
        <StatCard title="Unattributed Orders" value={unattributed.orders.toString()} icon={AlertTriangle} loading={false} sub={`${fc(unattributed.revenue)} revenue`} accent="text-amber-400" />
      </div>

      {/* Staff performance chart */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Revenue by Staff Member</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="Revenue" radius={[4, 4, 0, 0]}>
                  {chartData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Staff table */}
      <Card>
        <CardHeader><CardTitle className="text-base">Staff Performance</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Staff</TableHead><TableHead>Role</TableHead><TableHead className="text-right">Orders</TableHead><TableHead className="text-right">Revenue</TableHead><TableHead className="text-right">Avg Order</TableHead></TableRow></TableHeader>
            <TableBody>
              {staff.map(s => (
                <TableRow key={s.staffId}>
                  <TableCell className="font-medium">{s.staffName}</TableCell>
                  <TableCell><Badge variant="outline" className="text-xs capitalize">{s.role}</Badge></TableCell>
                  <TableCell className="text-right">{s.orders}</TableCell>
                  <TableCell className="text-right font-mono">{fc(s.revenue)}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{fc(s.avgOrderValue)}</TableCell>
                </TableRow>
              ))}
              {staff.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No staff-attributed orders in this period</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Shift history */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Shift History</CardTitle>
          <CardDescription>{shifts.length} shift{shifts.length !== 1 ? "s" : ""} in this period</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Staff</TableHead><TableHead>Opened</TableHead><TableHead>Closed</TableHead><TableHead className="text-right">Opening Cash</TableHead><TableHead className="text-right">Actual Cash</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {shifts.map(s => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.staffName}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{format(new Date(s.openedAt), "MMM d, HH:mm")}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{s.closedAt ? format(new Date(s.closedAt), "MMM d, HH:mm") : "—"}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{fc(s.openingCash)}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{s.actualCash != null ? fc(s.actualCash) : "—"}</TableCell>
                  <TableCell><Badge variant={s.status === "open" ? "default" : "secondary"} className="text-xs capitalize">{s.status}</Badge></TableCell>
                </TableRow>
              ))}
              {shifts.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No shifts in this period</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Tab: Customers ────────────────────────────────────────────────────────────

function CustomersTab({ range }: { range: { from: string; to: string } }) {
  const { data, isLoading } = useReportFetch<any>(
    ["customers-summary", range.from, range.to],
    `/api/reports/customers-summary?from=${range.from}&to=${range.to}`,
  );

  if (isLoading) return <SectionSkeleton />;

  const topCustomers: any[] = data?.topCustomers ?? [];
  const loyalty = data?.loyalty ?? { totalCustomers: 0, withLoyalty: 0, totalPoints: 0, totalSpent: 0 };
  const loyaltyPct = loyalty.totalCustomers > 0 ? Math.round((loyalty.withLoyalty / loyalty.totalCustomers) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Customers" value={loyalty.totalCustomers.toString()} icon={Users} loading={false} />
        <StatCard title="New This Period" value={data?.newCustomers?.toString() ?? "0"} icon={ArrowUpRight} loading={false} accent="text-emerald-400" />
        <StatCard title="Loyalty Members" value={`${loyalty.withLoyalty} (${loyaltyPct}%)`} icon={Star} loading={false} accent="text-yellow-400" />
        <StatCard title="Identified Revenue" value={fc(data?.returningRevenue ?? 0)} icon={DollarSign} loading={false} sub={`${data?.returningOrders ?? 0} orders linked to customers`} />
      </div>

      {/* Loyalty Overview */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Star className="h-4 w-4 text-yellow-400" />Loyalty Programme Overview</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-muted-foreground">Members with points</span>
            <span className="font-medium">{loyalty.withLoyalty} / {loyalty.totalCustomers}</span>
          </div>
          <Progress value={loyaltyPct} className="h-2" />
          <div className="grid grid-cols-2 gap-4 pt-2">
            <div className="text-center"><p className="text-xl font-bold">{loyalty.totalPoints.toLocaleString()}</p><p className="text-xs text-muted-foreground">Total Points Outstanding</p></div>
            <div className="text-center"><p className="text-xl font-bold">{fc(loyalty.totalSpent)}</p><p className="text-xs text-muted-foreground">Lifetime Customer Spend</p></div>
          </div>
        </CardContent>
      </Card>

      {/* Top customers */}
      <Card>
        <CardHeader><CardTitle className="text-base">Top Customers by Lifetime Spend</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>#</TableHead><TableHead>Customer</TableHead><TableHead>Contact</TableHead><TableHead className="text-right">Orders</TableHead><TableHead className="text-right">Lifetime Spend</TableHead><TableHead className="text-right">Avg Order</TableHead><TableHead className="text-right">Points</TableHead></TableRow></TableHeader>
            <TableBody>
              {topCustomers.map((c, i) => (
                <TableRow key={c.id}>
                  <TableCell className="text-xs text-muted-foreground font-mono w-8">{i + 1}</TableCell>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{c.email || "—"}</TableCell>
                  <TableCell className="text-right">{c.orderCount}</TableCell>
                  <TableCell className="text-right font-mono">{fc(c.totalSpent)}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{fc(c.avgOrderValue)}</TableCell>
                  <TableCell className="text-right">
                    {c.loyaltyPoints > 0 ? <Badge variant="outline" className="text-xs text-yellow-400 border-yellow-400/30">{c.loyaltyPoints} pts</Badge> : <span className="text-muted-foreground text-xs">—</span>}
                  </TableCell>
                </TableRow>
              ))}
              {topCustomers.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">No customers yet</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Tab: End of Day ───────────────────────────────────────────────────────────

function EodTab() {
  const [eodDate, setEodDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const { data, isLoading } = useReportFetch<any>(
    ["eod-summary", eodDate],
    `/api/reports/eod-summary?date=${eodDate}`,
  );

  const payBreak: any[] = data?.paymentBreakdown ?? [];
  const sessions: any[] = data?.sessions ?? [];
  const payouts: any[] = data?.payouts ?? [];

  const totalPayouts = payouts.reduce((s: number, p: any) => s + p.amount, 0);

  return (
    <div className="space-y-6">
      {/* Date picker */}
      <div className="flex items-end gap-3">
        <div className="grid gap-1.5">
          <Label className="text-xs">Report Date</Label>
          <Input type="date" value={eodDate} onChange={e => setEodDate(e.target.value)} className="h-8 w-44 text-sm" max={format(new Date(), "yyyy-MM-dd")} />
        </div>
      </div>

      {isLoading ? <SectionSkeleton /> : (
        <>
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            <StatCard title="Net Revenue" value={fc(data?.revenue ?? 0)} icon={DollarSign} loading={false} />
            <StatCard title="Completed Orders" value={(data?.completedOrders ?? 0).toString()} icon={ShoppingBag} loading={false} />
            <StatCard title="Avg Order Value" value={fc(data?.avgOrderValue ?? 0)} icon={TrendingUp} loading={false} />
            <StatCard title="Voided Orders" value={(data?.voidedOrders ?? 0).toString()} icon={XCircle} loading={false} accent="text-amber-400" />
          </div>

          <div className="grid gap-4 grid-cols-3">
            <StatCard title="Total Tax Collected" value={fc(data?.tax ?? 0)} icon={Layers} loading={false} />
            <StatCard title="Total Discounts" value={fc(data?.discount ?? 0)} icon={ArrowDownRight} loading={false} accent="text-amber-400" />
            <StatCard title="Total Cash Payouts" value={fc(totalPayouts)} icon={Banknote} loading={false} accent={totalPayouts > 0 ? "text-red-400" : "text-muted-foreground"} />
          </div>

          {/* Payment breakdown */}
          {payBreak.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Payment Breakdown</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow><TableHead>Method</TableHead><TableHead className="text-right">Transactions</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {payBreak.map((p, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium capitalize flex items-center gap-2">
                          {p.method === "cash" ? <Banknote className="h-4 w-4 text-emerald-400" /> : <CreditCard className="h-4 w-4 text-blue-400" />}
                          {METHOD_LABELS[p.method] ?? p.method}
                        </TableCell>
                        <TableCell className="text-right">{p.count}</TableCell>
                        <TableCell className="text-right font-mono font-semibold">{fc(p.total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Cash sessions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cash Sessions</CardTitle>
              <CardDescription>{sessions.length} session{sessions.length !== 1 ? "s" : ""} on {format(new Date(eodDate + "T12:00:00"), "MMMM d, yyyy")}</CardDescription>
            </CardHeader>
            <CardContent>
              {sessions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No cash sessions opened on this date</p>
              ) : (
                <div className="space-y-3">
                  {sessions.map(s => (
                    <div key={s.id} className="rounded-lg border border-border p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <UserCheck className="h-4 w-4 text-blue-400" />
                          <span className="font-semibold">{s.staffName}</span>
                        </div>
                        <Badge variant={s.status === "open" ? "default" : "secondary"} className="capitalize">{s.status}</Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                        <div className="flex justify-between"><span className="text-muted-foreground">Opened</span><span>{format(new Date(s.openedAt), "HH:mm")}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Closed</span><span>{s.closedAt ? format(new Date(s.closedAt), "HH:mm") : "Still open"}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Opening Cash</span><span className="font-mono">{fc(s.openingCash)}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Actual Cash</span><span className="font-mono">{s.actualCash != null ? fc(s.actualCash) : "—"}</span></div>
                        {s.actualCard != null && <div className="flex justify-between"><span className="text-muted-foreground">Actual Card</span><span className="font-mono">{fc(s.actualCard)}</span></div>}
                        {s.closingNotes && <div className="col-span-2 text-muted-foreground text-xs italic">"{s.closingNotes}"</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Cash payouts */}
          {payouts.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Cash Payouts</CardTitle><CardDescription>Total: {fc(totalPayouts)}</CardDescription></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow><TableHead>Staff</TableHead><TableHead>Reason</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Time</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {payouts.map(p => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.staffName}</TableCell>
                        <TableCell className="text-muted-foreground">{p.reason}</TableCell>
                        <TableCell className="text-right font-mono text-red-400">{fc(p.amount)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{format(new Date(p.createdAt), "HH:mm")}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

// ── Main Reports Page ─────────────────────────────────────────────────────────

const TABS = [
  { value: "sales", label: "Sales", icon: DollarSign },
  { value: "exceptions", label: "Exceptions", icon: AlertTriangle },
  { value: "product-mix", label: "Product Mix", icon: BarChart2 },
  { value: "inventory", label: "Inventory", icon: Package },
  { value: "labor", label: "Labor", icon: ChefHat },
  { value: "customers", label: "Customers", icon: Users },
  { value: "eod", label: "End of Day", icon: Calendar },
];

export function Reports() {
  const [preset, setPreset] = useState<Preset>("today");
  const [customFrom, setCustomFrom] = useState(format(subDays(new Date(), 7), "yyyy-MM-dd"));
  const [customTo, setCustomTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [activeTab, setActiveTab] = useState("sales");

  const range = getRange(preset, customFrom, customTo);

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-6 space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Reports</h2>
        <p className="text-muted-foreground mt-1">Comprehensive business intelligence across all operations.</p>
      </div>

      {/* Date range — hidden for EOD tab (it has its own) */}
      {activeTab !== "eod" && activeTab !== "inventory" && (
        <DateRangeBar
          preset={preset} setPreset={setPreset}
          customFrom={customFrom} setCustomFrom={setCustomFrom}
          customTo={customTo} setCustomTo={setCustomTo}
        />
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex flex-wrap h-auto gap-1 p-1 mb-2">
          {TABS.map(t => (
            <TabsTrigger key={t.value} value={t.value} className="flex items-center gap-1.5 text-xs px-3 py-1.5">
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="sales"><SalesTab range={range} preset={preset} /></TabsContent>
        <TabsContent value="exceptions"><ExceptionsTab range={range} /></TabsContent>
        <TabsContent value="product-mix"><ProductMixTab range={range} /></TabsContent>
        <TabsContent value="inventory"><InventoryTab /></TabsContent>
        <TabsContent value="labor"><LaborTab range={range} /></TabsContent>
        <TabsContent value="customers"><CustomersTab range={range} /></TabsContent>
        <TabsContent value="eod"><EodTab /></TabsContent>
      </Tabs>
    </motion.div>
  );
}
