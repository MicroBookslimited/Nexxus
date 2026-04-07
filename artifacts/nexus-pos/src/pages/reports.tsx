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
  BarChart2, ChefHat, UserCheck, Calendar, Layers, ArrowUpRight, Tag,
  UtensilsCrossed, TrendingDown, Table2, Percent, Receipt, Activity,
} from "lucide-react";
import { format, subDays, startOfDay, endOfDay } from "date-fns";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fc(v: number) {
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency: "JMD" }).format(v); }
  catch { return `JMD ${v.toFixed(2)}`; }
}

const HOUR_LABELS = Array.from({ length: 24 }, (_, h) =>
  h === 0 ? "12am" : h === 12 ? "12pm" : h < 12 ? `${h}am` : `${h - 12}pm`
);

type Preset = "today" | "yesterday" | "week" | "month" | "custom";
const PRESETS: { label: string; value: Preset }[] = [
  { label: "Today",      value: "today" },
  { label: "Yesterday",  value: "yesterday" },
  { label: "Last 7 Days",  value: "week" },
  { label: "Last 30 Days", value: "month" },
  { label: "Custom",     value: "custom" },
];

function getRange(preset: Preset, cf: string, ct: string) {
  const now = new Date();
  if (preset === "today")     return { from: format(startOfDay(now), "yyyy-MM-dd"), to: format(endOfDay(now), "yyyy-MM-dd") };
  if (preset === "yesterday") { const y = subDays(now, 1); return { from: format(startOfDay(y), "yyyy-MM-dd"), to: format(endOfDay(y), "yyyy-MM-dd") }; }
  if (preset === "week")      return { from: format(subDays(now, 6), "yyyy-MM-dd"), to: format(now, "yyyy-MM-dd") };
  if (preset === "month")     return { from: format(subDays(now, 29), "yyyy-MM-dd"), to: format(now, "yyyy-MM-dd") };
  return { from: cf, to: ct };
}

const COLORS = ["#3b82f6","#8b5cf6","#10b981","#f59e0b","#ef4444","#06b6d4","#f97316","#ec4899","#84cc16","#a78bfa"];
const METHOD_LABELS: Record<string, string> = { cash: "Cash", card: "Card", split: "Split", bank_transfer: "Bank Transfer", other: "Other" };
const TYPE_LABELS: Record<string, string>   = { counter: "Counter", "dine-in": "Dine-in", takeout: "Takeout", delivery: "Delivery" };

// ─── CSV Utility ──────────────────────────────────────────────────────────────

function downloadCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const escape = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.join(","), ...rows.map(r => r.map(escape).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ─── Custom hooks ─────────────────────────────────────────────────────────────

function useReport<T>(key: string[], url: string) {
  return useQuery<T>({
    queryKey: key,
    queryFn: async () => {
      const r = await fetch(url);
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
  });
}

// ─── Shared Components ────────────────────────────────────────────────────────

function StatCard({ title, value, icon: Icon, loading, sub, color = "text-muted-foreground" }: {
  title: string; value: string; icon: React.ElementType; loading: boolean; sub?: string; color?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${color}`} />
      </CardHeader>
      <CardContent>
        {loading ? <Skeleton className="h-8 w-[120px]" /> : <>
          <div className="text-2xl font-bold">{value}</div>
          {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
        </>}
      </CardContent>
    </Card>
  );
}

const CT = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-lg">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((p: any) => {
        const isMonetary = /revenue|total|profit|cogs|spend/i.test(p.name ?? "");
        return <p key={p.dataKey} style={{ color: p.color }}>{p.name}: {isMonetary ? fc(p.value) : p.value}</p>;
      })}
    </div>
  );
};

function ExportBtn({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="outline" size="sm" onClick={onClick} className="gap-2 shrink-0">
      <Download className="h-4 w-4" /> Export CSV
    </Button>
  );
}

function Empty({ message = "No data for this period" }: { message?: string }) {
  return <p className="text-sm text-muted-foreground text-center py-8">{message}</p>;
}

function Loading() {
  return <div className="space-y-4">{[1,2,3].map(i => <Skeleton key={i} className="h-24 w-full" />)}</div>;
}

// ─── Date Range Bar ───────────────────────────────────────────────────────────

function DateRangeBar({ preset, setPreset, cf, setCf, ct, setCt }: {
  preset: Preset; setPreset: (p: Preset) => void;
  cf: string; setCf: (s: string) => void;
  ct: string; setCt: (s: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      {PRESETS.map(p => (
        <Button key={p.value} size="sm" variant={preset === p.value ? "default" : "outline"} onClick={() => setPreset(p.value)}>
          {p.label}
        </Button>
      ))}
      {preset === "custom" && <>
        <div className="grid gap-1"><Label className="text-xs">From</Label><Input type="date" value={cf} onChange={e => setCf(e.target.value)} className="h-8 w-36 text-xs" /></div>
        <div className="grid gap-1"><Label className="text-xs">To</Label><Input type="date" value={ct} onChange={e => setCt(e.target.value)} className="h-8 w-36 text-xs" /></div>
      </>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. DAILY SALES SUMMARY
// ═══════════════════════════════════════════════════════════════════════════════

function DailySalesTab({ range }: { range: { from: string; to: string } }) {
  const { data: summary, isLoading: ls } = useGetReportSummary(range);
  const { data: trend,   isLoading: lt } = useReport<any[]>(["trend", range.from, range.to], `/api/reports/daily-trend?from=${range.from}&to=${range.to}`);

  const handleExport = () => {
    if (!trend) return;
    downloadCsv(`daily-sales-${range.from}-to-${range.to}.csv`,
      ["Date", "Revenue (JMD)", "Orders", "Tax", "Discount"],
      trend.map(r => [r.date, r.revenue, r.orders, r.tax, r.discount])
    );
  };

  const handleOrdersExport = () => {
    const a = document.createElement("a");
    a.href = `/api/reports/export?from=${range.from}&to=${range.to}`;
    a.download = `orders-${range.from}-to-${range.to}.csv`;
    a.click();
  };

  return (
    <div className="space-y-5">
      <div className="flex justify-end gap-2">
        <ExportBtn onClick={handleExport} />
        <Button variant="outline" size="sm" onClick={handleOrdersExport} className="gap-2">
          <Receipt className="h-4 w-4" /> All Orders CSV
        </Button>
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-3">
        <StatCard title="Total Revenue"    value={summary ? fc(summary.revenue) : ""}         icon={DollarSign} loading={ls} color="text-blue-400" />
        <StatCard title="Completed Orders" value={summary?.orders.toString() ?? ""}            icon={ShoppingBag} loading={ls} />
        <StatCard title="Avg Order Value"  value={summary ? fc(summary.avgOrderValue) : ""}    icon={TrendingUp} loading={ls} />
        <StatCard title="New Customers"    value={summary?.newCustomers.toString() ?? ""}      icon={Users} loading={ls} color="text-emerald-400" />
        <StatCard title="Top Product"      value={summary?.topProduct ?? "—"}                  icon={Package} loading={ls} sub="By units sold" />
        <StatCard title="Voided Orders"    value={summary?.voidedOrders.toString() ?? ""}      icon={XCircle} loading={ls} color="text-amber-400" />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Revenue by Day</CardTitle></CardHeader>
        <CardContent>
          {lt ? <Skeleton className="h-52 w-full" /> : (trend ?? []).length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#6b7280" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
                <Tooltip content={<CT />} />
                <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="orders"  name="Orders"  stroke="#8b5cf6" strokeWidth={1.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {trend && trend.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Day-by-Day Breakdown</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Date</TableHead><TableHead className="text-right">Orders</TableHead><TableHead className="text-right">Revenue</TableHead><TableHead className="text-right">Tax</TableHead><TableHead className="text-right">Discount</TableHead><TableHead className="text-right">Net</TableHead></TableRow></TableHeader>
              <TableBody>
                {trend.map(r => (
                  <TableRow key={r.date}>
                    <TableCell className="font-mono text-sm">{r.date}</TableCell>
                    <TableCell className="text-right">{r.orders}</TableCell>
                    <TableCell className="text-right font-mono">{fc(r.revenue)}</TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">{fc(r.tax)}</TableCell>
                    <TableCell className="text-right font-mono text-amber-400">{r.discount > 0 ? fc(r.discount) : "—"}</TableCell>
                    <TableCell className="text-right font-mono font-semibold">{fc(r.revenue - r.discount)}</TableCell>
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

// ═══════════════════════════════════════════════════════════════════════════════
// 2. PAYMENT METHOD REPORT
// ═══════════════════════════════════════════════════════════════════════════════

function PaymentMethodTab({ range }: { range: { from: string; to: string } }) {
  const { data, isLoading } = useReport<any[]>(["pay-breakdown", range.from, range.to], `/api/reports/payment-breakdown?from=${range.from}&to=${range.to}`);

  const handleExport = () => {
    if (!data) return;
    downloadCsv(`payment-methods-${range.from}-to-${range.to}.csv`,
      ["Method", "Transactions", "Total (JMD)", "Tax (JMD)", "% of Revenue"],
      data.map(r => [METHOD_LABELS[r.method] ?? r.method, r.count, r.total, r.tax, r.percentage])
    );
  };

  const pieData = (data ?? []).map(p => ({ name: METHOD_LABELS[p.method] ?? p.method, value: p.total }));
  const total   = (data ?? []).reduce((s, r) => s + r.total, 0);

  return (
    <div className="space-y-5">
      <div className="flex justify-end"><ExportBtn onClick={handleExport} /></div>

      {isLoading ? <Loading /> : (
        <>
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            {(data ?? []).map((p, i) => (
              <Card key={i} className="border-l-4" style={{ borderLeftColor: COLORS[i % COLORS.length] }}>
                <CardHeader className="pb-1"><CardTitle className="text-sm text-muted-foreground">{METHOD_LABELS[p.method] ?? p.method}</CardTitle></CardHeader>
                <CardContent>
                  <p className="text-xl font-bold font-mono">{fc(p.total)}</p>
                  <p className="text-xs text-muted-foreground mt-1">{p.count} transactions · {p.percentage}%</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Revenue Share</CardTitle></CardHeader>
              <CardContent>
                {pieData.length === 0 ? <Empty /> : (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={11}>
                        {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: any) => fc(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Comparison</CardTitle></CardHeader>
              <CardContent className="space-y-3 pt-1">
                {(data ?? []).map((p, i) => (
                  <div key={i} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">{METHOD_LABELS[p.method] ?? p.method}</span>
                      <span className="font-mono">{fc(p.total)}</span>
                    </div>
                    <Progress value={p.percentage} className="h-2" style={{ "--progress-color": COLORS[i % COLORS.length] } as any} />
                    <p className="text-xs text-muted-foreground">{p.count} txns · Tax: {fc(p.tax)}</p>
                  </div>
                ))}
                {(data ?? []).length === 0 && <Empty />}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Detail Table</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Payment Method</TableHead><TableHead className="text-right">Transactions</TableHead><TableHead className="text-right">Revenue</TableHead><TableHead className="text-right">Tax Collected</TableHead><TableHead className="text-right">% of Total</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(data ?? []).map((p, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium flex items-center gap-2">
                        {p.method === "cash" ? <Banknote className="h-4 w-4 text-emerald-400" /> : <CreditCard className="h-4 w-4 text-blue-400" />}
                        {METHOD_LABELS[p.method] ?? p.method}
                      </TableCell>
                      <TableCell className="text-right">{p.count}</TableCell>
                      <TableCell className="text-right font-mono font-semibold">{fc(p.total)}</TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">{fc(p.tax)}</TableCell>
                      <TableCell className="text-right"><Badge variant="secondary">{p.percentage}%</Badge></TableCell>
                    </TableRow>
                  ))}
                  {(data ?? []).length > 0 && (
                    <TableRow className="border-t-2 font-semibold">
                      <TableCell>Total</TableCell>
                      <TableCell className="text-right">{(data ?? []).reduce((s, r) => s + r.count, 0)}</TableCell>
                      <TableCell className="text-right font-mono">{fc(total)}</TableCell>
                      <TableCell className="text-right font-mono">{fc((data ?? []).reduce((s, r) => s + r.tax, 0))}</TableCell>
                      <TableCell className="text-right">100%</TableCell>
                    </TableRow>
                  )}
                  {(data ?? []).length === 0 && <TableRow><TableCell colSpan={5}><Empty /></TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. PRODUCT SALES REPORT
// ═══════════════════════════════════════════════════════════════════════════════

function ProductSalesTab({ range }: { range: { from: string; to: string } }) {
  const { data, isLoading } = useReport<any>(["prod-mix", range.from, range.to], `/api/reports/product-mix?from=${range.from}&to=${range.to}`);
  const items: any[] = data?.items ?? [];

  const handleExport = () => {
    downloadCsv(`product-sales-${range.from}-to-${range.to}.csv`,
      ["Rank", "Product", "Units Sold", "Revenue (JMD)", "% of Revenue"],
      items.map((i, idx) => [idx + 1, i.productName, i.quantity, i.revenue, i.percentage])
    );
  };

  const top10 = items.slice(0, 10);

  return (
    <div className="space-y-5">
      <div className="flex justify-end"><ExportBtn onClick={handleExport} /></div>
      {isLoading ? <Loading /> : (
        <>
          <div className="grid gap-4 grid-cols-3">
            <StatCard title="Unique Products Sold" value={items.length.toString()}                          icon={Package}    loading={false} />
            <StatCard title="Total Units Sold"      value={items.reduce((s, i) => s + i.quantity, 0).toLocaleString()} icon={ShoppingBag} loading={false} />
            <StatCard title="Product Revenue"       value={fc(items.reduce((s, i) => s + i.revenue, 0))}   icon={DollarSign} loading={false} color="text-blue-400" />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Top 10 by Revenue</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {top10.length === 0 ? <Empty /> : top10.map((item, i) => (
                  <div key={item.productId} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <span className="w-5 text-xs text-muted-foreground font-mono shrink-0">{i + 1}.</span>
                        <span className="font-medium truncate max-w-[150px]">{item.productName}</span>
                      </span>
                      <span className="font-mono text-xs shrink-0">{fc(item.revenue)}</span>
                    </div>
                    <Progress value={item.percentage} className="h-1.5" />
                    <p className="text-xs text-muted-foreground">{item.quantity} units · {item.percentage}%</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Top 10 Revenue Chart</CardTitle></CardHeader>
              <CardContent>
                {top10.length === 0 ? <Empty /> : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={top10.map(i => ({ name: i.productName.split(" ").slice(0, 2).join(" "), Revenue: i.revenue, Units: i.quantity }))} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 9, fill: "#6b7280" }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: "#6b7280" }} axisLine={false} tickLine={false} width={80} />
                      <Tooltip content={<CT />} />
                      <Bar dataKey="Revenue" radius={[0, 3, 3, 0]}>
                        {top10.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">All Products Ranked</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>#</TableHead><TableHead>Product</TableHead><TableHead className="text-right">Units</TableHead><TableHead className="text-right">Revenue</TableHead><TableHead className="text-right">Revenue %</TableHead></TableRow></TableHeader>
                <TableBody>
                  {items.map((item, i) => (
                    <TableRow key={item.productId}>
                      <TableCell className="text-xs text-muted-foreground font-mono w-8">{i + 1}</TableCell>
                      <TableCell className="font-medium">{item.productName}</TableCell>
                      <TableCell className="text-right">{item.quantity}</TableCell>
                      <TableCell className="text-right font-mono">{fc(item.revenue)}</TableCell>
                      <TableCell className="text-right"><Badge variant={i < 3 ? "default" : "secondary"}>{item.percentage}%</Badge></TableCell>
                    </TableRow>
                  ))}
                  {items.length === 0 && <TableRow><TableCell colSpan={5}><Empty /></TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. INVENTORY CONSUMPTION REPORT
// ═══════════════════════════════════════════════════════════════════════════════

function InventoryTab({ range }: { range: { from: string; to: string } }) {
  const { data, isLoading } = useReport<any>(["inventory", range.from, range.to], `/api/reports/inventory?from=${range.from}&to=${range.to}`);
  const [filter, setFilter] = useState<"all" | "ok" | "low" | "out">("all");

  const products: any[] = data?.products ?? [];
  const summary = data?.summary ?? {};
  const filtered = filter === "all" ? products : products.filter(p => p.status === filter);

  const handleExport = () => {
    downloadCsv(`inventory-${range.from}-to-${range.to}.csv`,
      ["Product", "Category", "Price", "Stock", "Status", "Sold (Period)", "Revenue (Period)", "Avg Cost", "COGS"],
      products.map(p => [p.name, p.category, p.price, p.stockCount, p.status, p.soldThisPeriod, p.revenueThisPeriod, p.avgCost, p.cogs])
    );
  };

  const statusColor = (s: string) => s === "out" ? "text-red-400" : s === "low" ? "text-amber-400" : "text-emerald-400";
  const statusVariant = (s: string): any => s === "out" ? "destructive" : s === "low" ? "outline" : "secondary";
  const statusLabel   = (s: string) => s === "out" ? "Out of Stock" : s === "low" ? "Low Stock" : "In Stock";

  return (
    <div className="space-y-5">
      <div className="flex justify-end"><ExportBtn onClick={handleExport} /></div>
      {isLoading ? <Loading /> : (
        <>
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            <StatCard title="Total Products"  value={(summary.total ?? 0).toString()}      icon={Package}      loading={false} />
            <StatCard title="In Stock"        value={(summary.inStock ?? 0).toString()}    icon={CheckCircle2} loading={false} color="text-emerald-400" />
            <StatCard title="Low Stock"       value={(summary.lowStock ?? 0).toString()}   icon={AlertTriangle} loading={false} color="text-amber-400"  sub="≤5 units remaining" />
            <StatCard title="Out of Stock"    value={(summary.outOfStock ?? 0).toString()} icon={XCircle}      loading={false} color="text-red-400" />
          </div>

          <div className="flex gap-2 flex-wrap">
            {(["all","ok","low","out"] as const).map(f => (
              <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
                {f === "all" ? "All" : f === "ok" ? "In Stock" : f === "low" ? "Low Stock" : "Out of Stock"}
              </Button>
            ))}
            <span className="ml-auto text-xs text-muted-foreground self-center">
              Showing {filtered.length} of {products.length}
            </span>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Product Inventory & Consumption</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead><TableHead>Category</TableHead>
                    <TableHead className="text-right">Price</TableHead><TableHead className="text-right">Stock</TableHead>
                    <TableHead className="text-right">Sold (Period)</TableHead><TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Avg Cost</TableHead><TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(p => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{p.category}</TableCell>
                      <TableCell className="text-right font-mono">{fc(p.price)}</TableCell>
                      <TableCell className={`text-right font-mono font-bold ${statusColor(p.status)}`}>{p.stockCount}</TableCell>
                      <TableCell className="text-right">{p.soldThisPeriod || "—"}</TableCell>
                      <TableCell className="text-right font-mono">{p.revenueThisPeriod > 0 ? fc(p.revenueThisPeriod) : "—"}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">{p.avgCost > 0 ? fc(p.avgCost) : "—"}</TableCell>
                      <TableCell><Badge variant={statusVariant(p.status)} className="text-xs">{statusLabel(p.status)}</Badge></TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 && <TableRow><TableCell colSpan={8}><Empty message="No products match this filter" /></TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. STAFF PERFORMANCE REPORT
// ═══════════════════════════════════════════════════════════════════════════════

function StaffPerformanceTab({ range }: { range: { from: string; to: string } }) {
  const { data, isLoading } = useReport<any>(["staff-perf", range.from, range.to], `/api/reports/staff-performance?from=${range.from}&to=${range.to}`);

  const staff: any[]  = data?.staff  ?? [];
  const shifts: any[] = data?.shifts ?? [];
  const unattr = data?.unattributed ?? { orders: 0, revenue: 0 };

  const handleExport = () => {
    downloadCsv(`staff-performance-${range.from}-to-${range.to}.csv`,
      ["Staff", "Role", "Orders", "Revenue (JMD)", "Avg Order Value (JMD)"],
      staff.map(s => [s.staffName, s.role, s.orders, s.revenue, s.avgOrderValue])
    );
  };

  const chartData = staff.map(s => ({ name: s.staffName.split(" ")[0], Revenue: s.revenue, Orders: s.orders }));

  return (
    <div className="space-y-5">
      <div className="flex justify-end"><ExportBtn onClick={handleExport} /></div>
      {isLoading ? <Loading /> : (
        <>
          <div className="grid gap-4 grid-cols-3">
            <StatCard title="Staff Members"        value={staff.length.toString()}          icon={UserCheck}     loading={false} />
            <StatCard title="Shifts This Period"   value={shifts.length.toString()}         icon={Clock}         loading={false} />
            <StatCard title="Unattributed Orders"  value={unattr.orders.toString()}         icon={AlertTriangle} loading={false} color="text-amber-400" sub={fc(unattr.revenue)} />
          </div>

          {chartData.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Revenue by Staff Member</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
                    <Tooltip content={<CT />} />
                    <Bar dataKey="Revenue" radius={[4, 4, 0, 0]}>
                      {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle className="text-base">Performance Table</CardTitle></CardHeader>
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
                  {staff.length === 0 && <TableRow><TableCell colSpan={5}><Empty message="No staff-attributed orders this period" /></TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Shift Log</CardTitle></CardHeader>
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
                  {shifts.length === 0 && <TableRow><TableCell colSpan={6}><Empty message="No shifts this period" /></TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 6. DISCOUNT & VOID REPORT
// ═══════════════════════════════════════════════════════════════════════════════

function DiscountVoidTab({ range }: { range: { from: string; to: string } }) {
  const { data, isLoading } = useReport<any>(["exceptions", range.from, range.to], `/api/reports/exceptions?from=${range.from}&to=${range.to}`);

  const voids: any[]         = data?.voids          ?? [];
  const discountByType: any[] = data?.discountByType ?? [];
  const discounts = data?.discounts ?? { count: 0, totalDiscount: 0, avgDiscount: 0 };
  const loyalty   = data?.loyalty   ?? { count: 0, totalPoints: 0, totalValue: 0 };

  const handleExport = () => {
    downloadCsv(`discounts-voids-${range.from}-to-${range.to}.csv`,
      ["Type", "Order #", "Amount (JMD)", "Staff", "Reason / Type", "Date"],
      [
        ...voids.map(v => ["VOID", v.orderNumber, v.total, v.staffName, v.voidReason, v.createdAt]),
        ...Array(discounts.count).fill(["DISCOUNT", "", discounts.avgDiscount, "", "", ""]),
      ]
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex justify-end"><ExportBtn onClick={handleExport} /></div>
      {isLoading ? <Loading /> : (
        <>
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            <StatCard title="Voided Orders"        value={voids.length.toString()}           icon={XCircle}      loading={false} color="text-red-400" />
            <StatCard title="Voided Value"         value={fc(voids.reduce((s,v)=>s+v.total,0))} icon={DollarSign} loading={false} color="text-red-400" />
            <StatCard title="Discounted Orders"    value={discounts.count.toString()}        icon={Tag}          loading={false} color="text-amber-400" />
            <StatCard title="Total Discounts Given" value={fc(discounts.totalDiscount)}      icon={Percent}      loading={false} color="text-amber-400" sub={`Avg: ${fc(discounts.avgDiscount)}`} />
          </div>

          {discountByType.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Discount Breakdown by Type</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow><TableHead>Discount Type</TableHead><TableHead className="text-right">Orders</TableHead><TableHead className="text-right">Total Discounted</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {discountByType.map((d, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium capitalize">{d.discountType}</TableCell>
                        <TableCell className="text-right">{d.count}</TableCell>
                        <TableCell className="text-right font-mono text-amber-400">{fc(d.totalDiscount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {loyalty.count > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Star className="h-4 w-4 text-yellow-400" />Loyalty Redemptions</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-3 gap-4 text-center">
                <div><p className="text-2xl font-bold">{loyalty.count}</p><p className="text-xs text-muted-foreground">Redemptions</p></div>
                <div><p className="text-2xl font-bold">{loyalty.totalPoints.toLocaleString()}</p><p className="text-xs text-muted-foreground">Points Used</p></div>
                <div><p className="text-2xl font-bold">{fc(loyalty.totalValue)}</p><p className="text-xs text-muted-foreground">Value Off</p></div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Voided Orders</CardTitle>
              <CardDescription>{voids.length === 0 ? "No voids this period" : `${voids.length} voided order${voids.length !== 1 ? "s" : ""}`}</CardDescription>
            </CardHeader>
            <CardContent>
              {voids.length === 0 ? (
                <div className="flex flex-col items-center py-8 text-muted-foreground gap-2">
                  <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                  <p className="text-sm">No voids this period — great!</p>
                </div>
              ) : (
                <Table>
                  <TableHeader><TableRow><TableHead>Order #</TableHead><TableHead>Staff</TableHead><TableHead className="text-right">Total</TableHead><TableHead>Reason</TableHead><TableHead>Date/Time</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {voids.map(v => (
                      <TableRow key={v.id}>
                        <TableCell className="font-mono text-sm">{v.orderNumber}</TableCell>
                        <TableCell className="text-sm">{v.staffName}</TableCell>
                        <TableCell className="text-right font-mono text-red-400">{fc(v.total)}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{v.voidReason}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{format(new Date(v.createdAt), "MMM d, HH:mm")}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 7. CATEGORY SALES REPORT
// ═══════════════════════════════════════════════════════════════════════════════

function CategorySalesTab({ range }: { range: { from: string; to: string } }) {
  const { data, isLoading } = useReport<any>(["prod-mix-cat", range.from, range.to], `/api/reports/product-mix?from=${range.from}&to=${range.to}`);
  const cats: any[] = data?.categories ?? [];

  const handleExport = () => {
    downloadCsv(`category-sales-${range.from}-to-${range.to}.csv`,
      ["Category", "Revenue (JMD)", "Units Sold", "Orders", "Revenue %"],
      cats.map(c => [c.category, c.revenue, c.quantity, c.orders, c.percentage])
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex justify-end"><ExportBtn onClick={handleExport} /></div>
      {isLoading ? <Loading /> : (
        <>
          <div className="grid gap-4 grid-cols-3">
            <StatCard title="Categories" value={cats.length.toString()} icon={Layers} loading={false} />
            <StatCard title="Total Units" value={cats.reduce((s,c)=>s+c.quantity,0).toLocaleString()} icon={ShoppingBag} loading={false} />
            <StatCard title="Category Revenue" value={fc(cats.reduce((s,c)=>s+c.revenue,0))} icon={DollarSign} loading={false} color="text-blue-400" />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Revenue by Category</CardTitle></CardHeader>
              <CardContent>
                {cats.length === 0 ? <Empty /> : (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={cats.map(c=>({name:c.category,value:c.revenue}))} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`} labelLine={false} fontSize={11}>
                        {cats.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v:any) => fc(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Units Sold by Category</CardTitle></CardHeader>
              <CardContent>
                {cats.length === 0 ? <Empty /> : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={cats} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 9, fill: "#6b7280" }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="category" tick={{ fontSize: 10, fill: "#6b7280" }} axisLine={false} tickLine={false} width={80} />
                      <Tooltip content={<CT />} />
                      <Bar dataKey="quantity" name="Units" radius={[0,3,3,0]}>
                        {cats.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Category Detail</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>#</TableHead><TableHead>Category</TableHead><TableHead className="text-right">Units</TableHead><TableHead className="text-right">Orders</TableHead><TableHead className="text-right">Revenue</TableHead><TableHead className="text-right">Share</TableHead></TableRow></TableHeader>
                <TableBody>
                  {cats.map((c, i) => (
                    <TableRow key={c.category}>
                      <TableCell className="text-xs text-muted-foreground font-mono">{i+1}</TableCell>
                      <TableCell className="font-medium">{c.category}</TableCell>
                      <TableCell className="text-right">{c.quantity}</TableCell>
                      <TableCell className="text-right">{c.orders}</TableCell>
                      <TableCell className="text-right font-mono">{fc(c.revenue)}</TableCell>
                      <TableCell className="text-right"><div className="flex items-center justify-end gap-2"><Progress value={c.percentage} className="h-1.5 w-16" /><span className="text-xs text-muted-foreground w-8">{c.percentage}%</span></div></TableCell>
                    </TableRow>
                  ))}
                  {cats.length === 0 && <TableRow><TableCell colSpan={6}><Empty /></TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 8. HOURLY SALES REPORT
// ═══════════════════════════════════════════════════════════════════════════════

function HourlySalesTab({ range, preset }: { range: { from: string; to: string }; preset: Preset }) {
  const [selectedDate, setSelectedDate] = useState(
    preset === "yesterday" ? format(new Date(Date.now() - 86400000), "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd")
  );
  const { data: hourly, isLoading } = useGetHourlySales({ date: selectedDate });

  const chartData = (hourly ?? []).map((h, i) => ({ hour: HOUR_LABELS[i], Revenue: h.revenue, Orders: h.orders, active: h.orders > 0 }));
  const peakHour  = chartData.reduce((max, h) => h.Revenue > max.Revenue ? h : max, chartData[0] ?? { hour: "—", Revenue: 0, Orders: 0 });
  const totalRev  = chartData.reduce((s, h) => s + h.Revenue, 0);
  const totalOrd  = chartData.reduce((s, h) => s + h.Orders, 0);

  const handleExport = () => {
    downloadCsv(`hourly-sales-${selectedDate}.csv`,
      ["Hour", "Revenue (JMD)", "Orders"],
      chartData.map(h => [h.hour, h.Revenue, h.Orders])
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-4">
        <div className="grid gap-1">
          <Label className="text-xs">Report Date</Label>
          <Input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="h-8 w-44 text-sm" max={format(new Date(), "yyyy-MM-dd")} />
        </div>
        <ExportBtn onClick={handleExport} />
      </div>

      {isLoading ? <Loading /> : (
        <>
          <div className="grid gap-4 grid-cols-3">
            <StatCard title="Total Revenue"   value={fc(totalRev)}             icon={DollarSign}  loading={false} color="text-blue-400" />
            <StatCard title="Total Orders"    value={totalOrd.toString()}       icon={ShoppingBag} loading={false} />
            <StatCard title="Peak Hour"       value={peakHour.hour ?? "—"}     icon={Activity}    loading={false} sub={totalOrd > 0 ? `${fc(peakHour.Revenue)} · ${peakHour.Orders} orders` : "No sales yet"} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Revenue by Hour — {format(new Date(selectedDate + "T12:00:00"), "EEEE, MMMM d, yyyy")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="hour" tick={{ fontSize: 9, fill: "#6b7280" }} axisLine={false} tickLine={false} interval={1} />
                  <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
                  <Tooltip content={<CT />} />
                  <Bar dataKey="Revenue" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry, i) => <Cell key={i} fill={entry.active ? "#3b82f6" : "rgba(59,130,246,0.12)"} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Hour-by-Hour Breakdown</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Hour</TableHead><TableHead className="text-right">Orders</TableHead><TableHead className="text-right">Revenue</TableHead><TableHead className="text-right">Avg Order</TableHead><TableHead>Activity</TableHead></TableRow></TableHeader>
                <TableBody>
                  {chartData.filter(h => h.Orders > 0).map(h => (
                    <TableRow key={h.hour}>
                      <TableCell className="font-mono">{h.hour}</TableCell>
                      <TableCell className="text-right">{h.Orders}</TableCell>
                      <TableCell className="text-right font-mono">{fc(h.Revenue)}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">{h.Orders > 0 ? fc(h.Revenue / h.Orders) : "—"}</TableCell>
                      <TableCell><Progress value={totalRev > 0 ? (h.Revenue / totalRev) * 100 : 0} className="h-1.5 w-24" /></TableCell>
                    </TableRow>
                  ))}
                  {totalOrd === 0 && <TableRow><TableCell colSpan={5}><Empty message="No sales on this date" /></TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 9. TABLE TURNOVER REPORT
// ═══════════════════════════════════════════════════════════════════════════════

function TableTurnoverTab({ range }: { range: { from: string; to: string } }) {
  const { data, isLoading } = useReport<any>(["table-turnover", range.from, range.to], `/api/reports/table-turnover?from=${range.from}&to=${range.to}`);

  const tables: any[]  = data?.tables      ?? [];
  const byType: any[]  = data?.byOrderType ?? [];

  const handleExport = () => {
    downloadCsv(`table-turnover-${range.from}-to-${range.to}.csv`,
      ["Table", "Capacity", "Turns", "Total Revenue (JMD)", "Avg Revenue/Turn", "Avg Duration (min)"],
      tables.map(t => [t.tableName, t.capacity, t.turns, t.revenue, t.avgRevenue, t.avgDurationMin ?? "—"])
    );
  };

  const typeChartData = byType.map(t => ({ name: TYPE_LABELS[t.orderType] ?? t.orderType, Revenue: t.revenue, Orders: t.count }));

  return (
    <div className="space-y-5">
      <div className="flex justify-end"><ExportBtn onClick={handleExport} /></div>
      {isLoading ? <Loading /> : (
        <>
          <div className="grid gap-4 grid-cols-3">
            <StatCard title="Tables Used"       value={tables.length.toString()} icon={Table2}     loading={false} />
            <StatCard title="Total Dine-in Turns" value={tables.reduce((s,t)=>s+t.turns,0).toString()} icon={UtensilsCrossed} loading={false} />
            <StatCard title="Dine-in Revenue"   value={fc(tables.reduce((s,t)=>s+t.revenue,0))} icon={DollarSign} loading={false} color="text-blue-400" />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Revenue by Order Channel</CardTitle></CardHeader>
              <CardContent>
                {typeChartData.length === 0 ? <Empty /> : (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={typeChartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
                      <Tooltip content={<CT />} />
                      <Bar dataKey="Revenue" radius={[4,4,0,0]}>
                        {typeChartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Order Channel Breakdown</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow><TableHead>Channel</TableHead><TableHead className="text-right">Orders</TableHead><TableHead className="text-right">Revenue</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {byType.map((t, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium capitalize">{TYPE_LABELS[t.orderType] ?? t.orderType}</TableCell>
                        <TableCell className="text-right">{t.count}</TableCell>
                        <TableCell className="text-right font-mono">{fc(t.revenue)}</TableCell>
                      </TableRow>
                    ))}
                    {byType.length === 0 && <TableRow><TableCell colSpan={3}><Empty /></TableCell></TableRow>}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Table Performance</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Table</TableHead><TableHead className="text-right">Capacity</TableHead>
                    <TableHead className="text-right">Turns</TableHead><TableHead className="text-right">Total Revenue</TableHead>
                    <TableHead className="text-right">Avg / Turn</TableHead><TableHead className="text-right">Avg Duration</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tables.map(t => (
                    <TableRow key={t.tableId}>
                      <TableCell className="font-medium">{t.tableName}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{t.capacity}</TableCell>
                      <TableCell className="text-right font-bold">{t.turns}</TableCell>
                      <TableCell className="text-right font-mono">{fc(t.revenue)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{fc(t.avgRevenue)}</TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">{t.avgDurationMin != null ? `${t.avgDurationMin} min` : "—"}</TableCell>
                    </TableRow>
                  ))}
                  {tables.length === 0 && <TableRow><TableCell colSpan={6}><Empty message="No table orders in this period" /></TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 10. PROFIT SNAPSHOT REPORT
// ═══════════════════════════════════════════════════════════════════════════════

function ProfitSnapshotTab({ range }: { range: { from: string; to: string } }) {
  const { data, isLoading } = useReport<any>(["profit-snapshot", range.from, range.to], `/api/reports/profit-snapshot?from=${range.from}&to=${range.to}`);

  const prods: any[] = data?.productProfits ?? [];
  const byCat: any[] = data?.byCategory     ?? [];

  const handleExport = () => {
    downloadCsv(`profit-snapshot-${range.from}-to-${range.to}.csv`,
      ["Product", "Category", "Sell Price", "Avg Cost", "Qty", "Revenue (JMD)", "COGS (JMD)", "Gross Profit (JMD)", "Margin %"],
      prods.map(p => [p.productName, p.category, p.sellPrice, p.avgCost, p.quantity, p.revenue, p.cogs, p.grossProfit, p.margin])
    );
  };

  const marginColor = (m: number) => m >= 60 ? "text-emerald-400" : m >= 30 ? "text-blue-400" : m > 0 ? "text-amber-400" : "text-red-400";

  const waterfallData = data ? [
    { name: "Revenue",    value: data.revenue,    fill: "#3b82f6" },
    { name: "Discounts",  value: -data.discount,  fill: "#f59e0b" },
    { name: "COGS",       value: -data.cogs,       fill: "#ef4444" },
    { name: "Tax",        value: -data.tax,        fill: "#8b5cf6" },
    { name: "Gross Profit", value: data.grossProfit, fill: "#10b981" },
  ] : [];

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-muted-foreground">
            Profit is estimated using average purchase cost per product from your purchase records.
            Products without purchase history show 0 COGS.
          </p>
        </div>
        <ExportBtn onClick={handleExport} />
      </div>

      {isLoading ? <Loading /> : (
        <>
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-3">
            <StatCard title="Gross Revenue"   value={fc(data?.revenue     ?? 0)} icon={DollarSign}  loading={false} color="text-blue-400" />
            <StatCard title="Est. COGS"       value={fc(data?.cogs        ?? 0)} icon={TrendingDown} loading={false} color="text-red-400"  sub="Cost of goods sold" />
            <StatCard title="Gross Profit"    value={fc(data?.grossProfit ?? 0)} icon={TrendingUp}   loading={false} color="text-emerald-400" />
            <StatCard title="Gross Margin"    value={`${data?.grossMargin ?? 0}%`} icon={Percent}   loading={false} color={marginColor(data?.grossMargin ?? 0)} />
            <StatCard title="Total Discounts" value={fc(data?.discount    ?? 0)} icon={Tag}          loading={false} color="text-amber-400" />
            <StatCard title="Net Revenue"     value={fc(data?.netRevenue  ?? 0)} icon={Receipt}      loading={false} sub="After discounts" />
          </div>

          {waterfallData.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Profit Waterfall</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={waterfallData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#6b7280" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
                    <Tooltip formatter={(v: any) => fc(Math.abs(v))} />
                    <Bar dataKey="value" radius={[4,4,0,0]}>
                      {waterfallData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {byCat.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Profit by Category</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow><TableHead>Category</TableHead><TableHead className="text-right">Revenue</TableHead><TableHead className="text-right">COGS</TableHead><TableHead className="text-right">Gross Profit</TableHead><TableHead className="text-right">Margin</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {byCat.map(c => (
                      <TableRow key={c.category}>
                        <TableCell className="font-medium">{c.category}</TableCell>
                        <TableCell className="text-right font-mono">{fc(c.revenue)}</TableCell>
                        <TableCell className="text-right font-mono text-red-400">{fc(c.cogs)}</TableCell>
                        <TableCell className="text-right font-mono text-emerald-400">{fc(c.grossProfit)}</TableCell>
                        <TableCell className="text-right"><Badge variant="secondary" className={marginColor(c.margin)}>{c.margin}%</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle className="text-base">Product Profit Breakdown</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead><TableHead>Product</TableHead><TableHead>Category</TableHead>
                    <TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">COGS</TableHead><TableHead className="text-right">Gross Profit</TableHead>
                    <TableHead className="text-right">Margin</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {prods.map((p, i) => (
                    <TableRow key={p.productId}>
                      <TableCell className="text-xs text-muted-foreground font-mono">{i+1}</TableCell>
                      <TableCell className="font-medium">{p.productName}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{p.category}</TableCell>
                      <TableCell className="text-right">{p.quantity}</TableCell>
                      <TableCell className="text-right font-mono">{fc(p.revenue)}</TableCell>
                      <TableCell className="text-right font-mono text-red-400/80">{p.cogs > 0 ? fc(p.cogs) : "—"}</TableCell>
                      <TableCell className="text-right font-mono text-emerald-400">{fc(p.grossProfit)}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant="secondary" className={`${marginColor(p.margin)} text-xs`}>{p.margin}%</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {prods.length === 0 && <TableRow><TableCell colSpan={8}><Empty /></TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN REPORTS PAGE
// ═══════════════════════════════════════════════════════════════════════════════

const TABS = [
  { value: "daily-sales",    label: "Daily Sales",    icon: Calendar,        num: "01" },
  { value: "payment",        label: "Payment Methods",icon: CreditCard,      num: "02" },
  { value: "product-sales",  label: "Product Sales",  icon: ShoppingBag,     num: "03" },
  { value: "inventory",      label: "Inventory",      icon: Package,         num: "04" },
  { value: "staff",          label: "Staff",          icon: UserCheck,       num: "05" },
  { value: "discount-void",  label: "Discounts & Voids", icon: Tag,          num: "06" },
  { value: "category",       label: "Category Sales", icon: BarChart2,       num: "07" },
  { value: "hourly",         label: "Hourly Sales",   icon: Activity,        num: "08" },
  { value: "table-turnover", label: "Table Turnover", icon: UtensilsCrossed, num: "09" },
  { value: "profit",         label: "Profit Snapshot",icon: TrendingUp,      num: "10" },
];

const TABS_WITH_OWN_DATE = new Set(["hourly"]);
const TABS_WITH_RANGE    = new Set(["daily-sales","payment","product-sales","inventory","staff","discount-void","category","table-turnover","profit"]);

export function Reports() {
  const [preset,    setPreset]    = useState<Preset>("today");
  const [customFrom, setCustomFrom] = useState(format(subDays(new Date(), 7), "yyyy-MM-dd"));
  const [customTo,   setCustomTo]   = useState(format(new Date(), "yyyy-MM-dd"));
  const [activeTab, setActiveTab]   = useState("daily-sales");

  const range = getRange(preset, customFrom, customTo);

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-6 space-y-5">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Reports</h2>
        <p className="text-muted-foreground mt-1">10 comprehensive reports across all areas of your business.</p>
      </div>

      {TABS_WITH_RANGE.has(activeTab) && (
        <DateRangeBar preset={preset} setPreset={setPreset} cf={customFrom} setCf={setCustomFrom} ct={customTo} setCt={setCustomTo} />
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex flex-wrap h-auto gap-1 p-1">
          {TABS.map(t => (
            <TabsTrigger key={t.value} value={t.value} className="flex items-center gap-1.5 text-xs px-3 py-1.5">
              <t.icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t.label}</span>
              <span className="sm:hidden">{t.num}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="mt-4">
          <TabsContent value="daily-sales">    <DailySalesTab range={range} /></TabsContent>
          <TabsContent value="payment">        <PaymentMethodTab range={range} /></TabsContent>
          <TabsContent value="product-sales">  <ProductSalesTab range={range} /></TabsContent>
          <TabsContent value="inventory">      <InventoryTab range={range} /></TabsContent>
          <TabsContent value="staff">          <StaffPerformanceTab range={range} /></TabsContent>
          <TabsContent value="discount-void">  <DiscountVoidTab range={range} /></TabsContent>
          <TabsContent value="category">       <CategorySalesTab range={range} /></TabsContent>
          <TabsContent value="hourly">         <HourlySalesTab range={range} preset={preset} /></TabsContent>
          <TabsContent value="table-turnover"> <TableTurnoverTab range={range} /></TabsContent>
          <TabsContent value="profit">         <ProfitSnapshotTab range={range} /></TabsContent>
        </div>
      </Tabs>
    </motion.div>
  );
}
