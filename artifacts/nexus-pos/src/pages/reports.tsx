import React, { useState } from "react";
import { motion } from "framer-motion";
import { useGetReportSummary, useGetHourlySales } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts";
import {
  DollarSign,
  ShoppingBag,
  TrendingUp,
  Users,
  Package,
  XCircle,
  Download,
} from "lucide-react";
import { format, subDays, startOfDay, endOfDay } from "date-fns";

function formatCurrency(v: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);
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
    case "today":
      return { from: format(startOfDay(now), "yyyy-MM-dd"), to: format(endOfDay(now), "yyyy-MM-dd") };
    case "yesterday": {
      const y = subDays(now, 1);
      return { from: format(startOfDay(y), "yyyy-MM-dd"), to: format(endOfDay(y), "yyyy-MM-dd") };
    }
    case "week":
      return { from: format(subDays(now, 6), "yyyy-MM-dd"), to: format(now, "yyyy-MM-dd") };
    case "month":
      return { from: format(subDays(now, 29), "yyyy-MM-dd"), to: format(now, "yyyy-MM-dd") };
    case "custom":
      return { from: customFrom, to: customTo };
  }
}

function StatCard({ title, value, icon: Icon, loading, sub }: { title: string; value: string; icon: React.ElementType; loading: boolean; sub?: string }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
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
          {p.name === "Revenue" ? formatCurrency(p.value) : `${p.value} orders`}
        </p>
      ))}
    </div>
  );
};

export function Reports() {
  const [preset, setPreset] = useState<Preset>("today");
  const [customFrom, setCustomFrom] = useState(format(subDays(new Date(), 7), "yyyy-MM-dd"));
  const [customTo, setCustomTo] = useState(format(new Date(), "yyyy-MM-dd"));

  const range = getRange(preset, customFrom, customTo);

  const { data: summary, isLoading: loadingSummary } = useGetReportSummary(range);

  const hourlyDate = preset === "today" ? format(new Date(), "yyyy-MM-dd")
    : preset === "yesterday" ? format(subDays(new Date(), 1), "yyyy-MM-dd")
    : range.to;

  const { data: hourly, isLoading: loadingHourly } = useGetHourlySales({ date: hourlyDate });

  const hourlyChartData = (hourly ?? []).map((h, i) => ({
    hour: HOUR_LABELS[i],
    Revenue: h.revenue,
    Orders: h.orders,
    active: h.orders > 0,
  }));

  const handleExport = () => {
    const url = `/api/reports/export?from=${range.from}&to=${range.to}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = `nexus-report-${range.from}-to-${range.to}.csv`;
    a.click();
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Reports</h2>
          <p className="text-muted-foreground mt-1">Analyse your business performance by period.</p>
        </div>
        <Button variant="outline" onClick={handleExport} className="gap-2">
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {/* Preset buttons */}
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <Button
            key={p.value}
            size="sm"
            variant={preset === p.value ? "default" : "outline"}
            onClick={() => setPreset(p.value)}
          >
            {p.label}
          </Button>
        ))}
      </div>

      {/* Custom date range */}
      {preset === "custom" && (
        <Card>
          <CardContent className="pt-4 flex items-end gap-4">
            <div className="grid gap-1.5">
              <Label>From</Label>
              <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="w-40" />
            </div>
            <div className="grid gap-1.5">
              <Label>To</Label>
              <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="w-40" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary KPIs */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-3">
        <StatCard title="Revenue" value={summary ? formatCurrency(summary.revenue) : ""} icon={DollarSign} loading={loadingSummary} />
        <StatCard title="Orders" value={summary?.orders.toString() ?? ""} icon={ShoppingBag} loading={loadingSummary} />
        <StatCard title="Avg Order Value" value={summary ? formatCurrency(summary.avgOrderValue) : ""} icon={TrendingUp} loading={loadingSummary} />
        <StatCard title="New Customers" value={summary?.newCustomers.toString() ?? ""} icon={Users} loading={loadingSummary} />
        <StatCard
          title="Top Product"
          value={summary?.topProduct ?? "—"}
          icon={Package}
          loading={loadingSummary}
          sub="By units sold"
        />
        <StatCard
          title="Voided Orders"
          value={summary?.voidedOrders.toString() ?? ""}
          icon={XCircle}
          loading={loadingSummary}
        />
      </div>

      {/* Hourly sales chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Hourly Sales — {format(new Date(hourlyDate + "T12:00:00"), "MMMM d, yyyy")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingHourly ? (
            <Skeleton className="h-56 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={hourlyChartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis
                  dataKey="hour"
                  tick={{ fontSize: 10, fill: "#6b7280" }}
                  axisLine={false}
                  tickLine={false}
                  interval={1}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "#6b7280" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `$${v}`}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="Revenue" radius={[4, 4, 0, 0]}>
                  {hourlyChartData.map((entry, i) => (
                    <Cell key={i} fill={entry.active ? "#3b82f6" : "rgba(59,130,246,0.15)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Period summary text */}
      {!loadingSummary && summary && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Period Summary</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>
              <span className="text-foreground font-medium">{summary.orders}</span> completed order{summary.orders !== 1 ? "s" : ""} generated{" "}
              <span className="text-primary font-semibold font-mono">{formatCurrency(summary.revenue)}</span> in revenue
              {summary.orders > 0 && (
                <> with an average value of <span className="text-foreground font-medium">{formatCurrency(summary.avgOrderValue)}</span></>
              )}.
            </p>
            {summary.topProduct && (
              <p>
                Best-selling item: <span className="text-foreground font-medium">{summary.topProduct}</span>.
              </p>
            )}
            {summary.newCustomers > 0 && (
              <p>
                <span className="text-foreground font-medium">{summary.newCustomers}</span> new customer{summary.newCustomers !== 1 ? "s" : ""} joined during this period.
              </p>
            )}
            {summary.voidedOrders > 0 && (
              <p className="text-amber-400">
                <span className="font-medium">{summary.voidedOrders}</span> order{summary.voidedOrders !== 1 ? "s were" : " was"} voided.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </motion.div>
  );
}
