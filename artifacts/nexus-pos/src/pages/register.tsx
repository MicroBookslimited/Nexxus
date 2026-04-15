import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCloseCashSession } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, Legend, AreaChart, Area,
} from "recharts";
import {
  Banknote, CreditCard, TrendingUp, CheckCircle2, Clock,
  AlertTriangle, DollarSign, ShoppingBag, SplitSquareHorizontal,
  BookOpen, MapPin, RefreshCw, ShieldOff, Printer, Download, FileDown,
} from "lucide-react";
import { format, subDays, startOfWeek, startOfMonth, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useStaff } from "@/contexts/StaffContext";

const TENANT_TOKEN_KEY = "nexus_tenant_token";

type RegisterRow = {
  id: number;
  openedAt: string;
  closedAt: string | null;
  status: string;
  staffId: number | null;
  staffName: string;
  locationName: string | null;
  openingCash: number;
  actualCash: number | null;
  actualCard: number | null;
  cashSales: number;
  cardSales: number;
  creditSales: number;
  splitSales: number;
  totalSales: number;
  refunds: number;
  orderCount: number;
  voidedCount: number;
  totalPayouts: number;
  expectedCash: number;
};

async function authFetch<T>(path: string): Promise<T> {
  const token = localStorage.getItem(TENANT_TOKEN_KEY);
  const res = await fetch(path, {
    cache: "no-store",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

function fc(v: number) {
  return new Intl.NumberFormat("en-JM", { style: "currency", currency: "JMD" }).format(v);
}

function fdt(v: string | null | undefined) {
  if (!v) return "—";
  try { return format(new Date(v), "dd/MM/yy, h:mm a"); }
  catch { return String(v); }
}

type DatePreset = "today" | "yesterday" | "week" | "month" | "custom";

// Returns { from, to } as local date strings (used for display + query cache key)
// and { fromISO, toISO } as UTC-aware ISO datetime strings (used for the API call).
// This ensures sessions opened at e.g. 8 PM Jamaica time (= next UTC day) are correctly
// included for the local "today" filter, regardless of the server's UTC clock.
function getRange(preset: DatePreset, customFrom: string, customTo: string): {
  from: string; to: string; fromISO: string; toISO: string;
} {
  const now = new Date();
  const fmtDate = (d: Date) => format(d, "yyyy-MM-dd");

  // Compute start/end of a local calendar day as UTC ISO strings
  function localDayStart(d: Date): string {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).toISOString();
  }
  function localDayEnd(d: Date): string {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).toISOString();
  }

  if (preset === "today") {
    return { from: fmtDate(now), to: fmtDate(now), fromISO: localDayStart(now), toISO: localDayEnd(now) };
  }
  if (preset === "yesterday") {
    const y = subDays(now, 1);
    return { from: fmtDate(y), to: fmtDate(y), fromISO: localDayStart(y), toISO: localDayEnd(y) };
  }
  if (preset === "week") {
    const ws = startOfWeek(now, { weekStartsOn: 1 });
    return { from: fmtDate(ws), to: fmtDate(now), fromISO: localDayStart(ws), toISO: localDayEnd(now) };
  }
  if (preset === "month") {
    const ms = startOfMonth(now);
    return { from: fmtDate(ms), to: fmtDate(now), fromISO: localDayStart(ms), toISO: localDayEnd(now) };
  }
  // Custom: use raw date strings from picker, interpret as local time
  const fromD = customFrom ? new Date(customFrom + "T00:00:00") : subDays(now, 30);
  const toD   = customTo   ? new Date(customTo   + "T23:59:59") : now;
  return {
    from: customFrom || fmtDate(subDays(now, 30)),
    to:   customTo   || fmtDate(now),
    fromISO: fromD.toISOString(),
    toISO:   toD.toISOString(),
  };
}

const PILL_PRESETS: { key: DatePreset; label: string }[] = [
  { key: "today",     label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "week",      label: "This Week" },
  { key: "month",     label: "This Month" },
  { key: "custom",    label: "Custom" },
];

const COLORS = {
  cash:   "#22c55e",
  card:   "#3b82f6",
  credit: "#f59e0b",
  split:  "#a855f7",
  refund: "#ef4444",
};

function KpiCard({ title, value, icon: Icon, color, sub, loading }: {
  title: string; value: string; icon: React.ElementType; color: string; sub?: string; loading: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        {loading ? (
          <div className="space-y-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-7 w-32" /></div>
        ) : (
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs text-muted-foreground mb-1">{title}</p>
              <p className={cn("text-xl font-bold font-mono", color)}>{value}</p>
              {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
            </div>
            <div className={cn("p-2 rounded-lg bg-current/10", color)}>
              <Icon className={cn("h-4 w-4", color)} />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function VariancePill({ actual, expected }: { actual: number | null; expected: number }) {
  if (actual === null) return <span className="text-muted-foreground text-xs">—</span>;
  const v = actual - expected;
  if (v === 0) return <span className="text-xs font-mono text-emerald-400">✓ Balanced</span>;
  return (
    <span className={cn("text-xs font-mono", v > 0 ? "text-blue-400" : "text-red-400")}>
      {v > 0 ? "+" : ""}{fc(v)} {v > 0 ? "over" : "short"}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "open") {
    return (
      <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px] gap-1">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />Open
      </Badge>
    );
  }
  return <Badge variant="secondary" className="text-[10px]">Closed</Badge>;
}

function CloseSessionDialog({ row, onClose, onClosed }: {
  row: RegisterRow;
  onClose: () => void;
  onClosed: () => void;
}) {
  const [actualCash, setActualCash] = useState("");
  const [notes, setNotes] = useState("");
  const closeSession = useCloseCashSession();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const parsedCash = parseFloat(actualCash) || 0;
  const cashVariance = actualCash !== "" ? parsedCash - row.expectedCash : null;

  const handleSubmit = () => {
    if (!actualCash) return;
    closeSession.mutate(
      {
        id: row.id,
        data: {
          actualCash: parsedCash,
          actualCard: row.cardSales,
          closingNotes: notes || undefined,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Shift closed", description: `${row.staffName}'s shift has been closed.` });
          queryClient.invalidateQueries({ queryKey: ["register-report"] });
          queryClient.invalidateQueries({ queryKey: [`/api/cash/sessions/${row.id}`] });
          queryClient.invalidateQueries({ queryKey: ["/api/cash/sessions"] });
          onClosed();
        },
        onError: () => toast({ title: "Error", description: "Could not close session", variant: "destructive" }),
      }
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            Close Shift — {row.staffName}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="rounded-lg bg-muted/30 border border-border p-3 space-y-1.5 text-sm">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Expected Cash Calculation</p>
            <div className="flex justify-between"><span className="text-muted-foreground">Opening float</span><span className="font-mono">{fc(row.openingCash)}</span></div>
            {row.cashSales > 0 && <div className="flex justify-between"><span className="text-muted-foreground">+ Cash sales</span><span className="font-mono">{fc(row.cashSales)}</span></div>}
            {row.totalPayouts > 0 && <div className="flex justify-between text-amber-400"><span>− Payouts</span><span className="font-mono">−{fc(row.totalPayouts)}</span></div>}
            <Separator className="my-1" />
            <div className="flex justify-between font-semibold"><span>Expected in drawer</span><span className="font-mono text-primary">{fc(row.expectedCash)}</span></div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1.5">
              <Banknote className="h-3.5 w-3.5 text-emerald-400" />Actual Cash Counted
            </Label>
            <p className="text-[11px] text-muted-foreground">Total cash in drawer including opening float + cash received</p>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="number" min="0" step="0.01" className="pl-8 font-mono"
                value={actualCash} onChange={(e) => setActualCash(e.target.value)} placeholder="0.00"
              />
            </div>
            {cashVariance !== null && (
              <div className={cn(
                "rounded-md px-3 py-2 text-sm flex items-center justify-between font-mono",
                cashVariance === 0 ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400"
                  : cashVariance > 0 ? "bg-blue-500/10 border border-blue-500/30 text-blue-400"
                  : "bg-red-500/10 border border-red-500/30 text-red-400"
              )}>
                <span className="text-xs font-sans font-medium">
                  {cashVariance === 0 ? "Cash balanced ✓" : cashVariance > 0 ? "Cash over" : "Cash short"}
                </span>
                <span className="font-bold">{cashVariance >= 0 ? "+" : ""}{fc(cashVariance)}</span>
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Notes (optional)</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Manager notes…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={!actualCash || closeSession.isPending}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <CheckCircle2 className="h-4 w-4 mr-2" />
            {closeSession.isPending ? "Closing…" : "Close Shift"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function Register() {
  const { can } = useStaff();
  const [preset, setPreset] = useState<DatePreset>("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [closingRow, setClosingRow] = useState<RegisterRow | null>(null);

  const range = getRange(preset, customFrom, customTo);

  const { data: rows = [], isLoading, refetch } = useQuery<RegisterRow[]>({
    queryKey: ["register-report", range.from, range.to],
    queryFn: () => authFetch<RegisterRow[]>(`/api/cash/register-report?from=${encodeURIComponent(range.fromISO)}&to=${encodeURIComponent(range.toISO)}`),
    refetchInterval: 30_000,
    staleTime: 0,
    refetchOnMount: "always" as const,
  });

  if (!can("reports.view")) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
        <ShieldOff className="h-10 w-10 opacity-30" />
        <p className="font-medium">Access Restricted</p>
        <p className="text-xs">Manager or Admin role required</p>
      </div>
    );
  }

  const openSessions   = rows.filter(r => r.status === "open");
  const closedSessions = rows.filter(r => r.status === "closed");
  const n = (v: unknown) => (isFinite(Number(v)) ? Number(v) : 0);
  const totals = {
    totalSales:   rows.reduce((s, r) => s + n(r.totalSales), 0),
    cashSales:    rows.reduce((s, r) => s + n(r.cashSales), 0),
    cardSales:    rows.reduce((s, r) => s + n(r.cardSales), 0),
    creditSales:  rows.reduce((s, r) => s + n(r.creditSales), 0),
    splitSales:   rows.reduce((s, r) => s + n(r.splitSales), 0),
    refunds:      rows.reduce((s, r) => s + n(r.refunds), 0),
    orderCount:   rows.reduce((s, r) => s + n(r.orderCount), 0),
    voidedCount:  rows.reduce((s, r) => s + n(r.voidedCount), 0),
    openingCash:  rows.reduce((s, r) => s + n(r.openingCash), 0),
    totalPayouts: rows.reduce((s, r) => s + n(r.totalPayouts), 0),
  };

  const dailyData = useMemo(() => {
    const byDay: Record<string, { day: string; cash: number; card: number; credit: number; split: number; total: number }> = {};
    for (const r of rows) {
      const day = format(new Date(r.openedAt), "MM/dd");
      if (!byDay[day]) byDay[day] = { day, cash: 0, card: 0, credit: 0, split: 0, total: 0 };
      byDay[day].cash   += r.cashSales;
      byDay[day].card   += r.cardSales;
      byDay[day].credit += r.creditSales;
      byDay[day].split  += r.splitSales;
      byDay[day].total  += r.totalSales;
    }
    return Object.values(byDay).sort((a, b) => a.day.localeCompare(b.day));
  }, [rows]);

  const pieData = useMemo(() => {
    const d = [];
    if (totals.cashSales   > 0) d.push({ name: "Cash",   value: totals.cashSales,   fill: COLORS.cash });
    if (totals.cardSales   > 0) d.push({ name: "Card",   value: totals.cardSales,   fill: COLORS.card });
    if (totals.creditSales > 0) d.push({ name: "Credit", value: totals.creditSales, fill: COLORS.credit });
    if (totals.splitSales  > 0) d.push({ name: "Split",  value: totals.splitSales,  fill: COLORS.split });
    return d;
  }, [totals]);

  const byStaffData = useMemo(() => {
    const map: Record<string, { name: string; total: number; cash: number; card: number; credit: number }> = {};
    for (const r of rows) {
      const k = r.staffName;
      if (!map[k]) map[k] = { name: k, total: 0, cash: 0, card: 0, credit: 0 };
      map[k].total  += r.totalSales;
      map[k].cash   += r.cashSales;
      map[k].card   += r.cardSales;
      map[k].credit += r.creditSales;
    }
    return Object.values(map).sort((a, b) => b.total - a.total).slice(0, 10);
  }, [rows]);

  const tooltipStyle = {
    contentStyle: { backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: 8, fontSize: 11 },
    labelStyle: { color: "#94a3b8" },
  };

  function handlePrint() { window.print(); }

  function handleExportCsv() {
    const headers = [
      "Cashier", "Location", "Status", "Opened", "Closed",
      "Cash Sales", "Card Sales", "Credit (A/R)", "Split", "Refunds", "Total Sales",
      "Opening Cash", "Payouts", "Expected Cash", "Actual Cash", "Variance", "Orders", "Voids",
    ];
    const csvRows = rows.map(r => {
      const variance = r.actualCash != null ? n(r.actualCash) - n(r.expectedCash) : "";
      return [
        r.staffName,
        r.locationName ?? "",
        r.status,
        r.openedAt ? format(new Date(r.openedAt), "yyyy-MM-dd HH:mm") : "",
        r.closedAt ? format(new Date(r.closedAt), "yyyy-MM-dd HH:mm") : "",
        n(r.cashSales).toFixed(2),
        n(r.cardSales).toFixed(2),
        n(r.creditSales).toFixed(2),
        n(r.splitSales).toFixed(2),
        n(r.refunds).toFixed(2),
        n(r.totalSales).toFixed(2),
        n(r.openingCash).toFixed(2),
        n(r.totalPayouts).toFixed(2),
        n(r.expectedCash).toFixed(2),
        r.actualCash != null ? n(r.actualCash).toFixed(2) : "",
        variance !== "" ? (variance as number).toFixed(2) : "",
        r.orderCount,
        r.voidedCount,
      ].map(v => `"${String(v ?? "").replace(/"/g, '""')}"`);
    });
    // Totals row
    csvRows.push([
      `"TOTALS (${rows.length} shifts)"`, `""`, `""`, `""`, `""`,
      `"${totals.cashSales.toFixed(2)}"`, `"${totals.cardSales.toFixed(2)}"`,
      `"${totals.creditSales.toFixed(2)}"`, `"${totals.splitSales.toFixed(2)}"`,
      `"${totals.refunds.toFixed(2)}"`, `"${totals.totalSales.toFixed(2)}"`,
      `"${totals.openingCash.toFixed(2)}"`, `"${totals.totalPayouts.toFixed(2)}"`,
      `""`, `""`, `""`, `"${totals.orderCount}"`, `"${totals.voidedCount}"`,
    ]);
    const csv = [headers.map(h => `"${h}"`).join(","), ...csvRows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `register-report-${range.from}-to-${range.to}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-4 space-y-5">
        {/* ── Header ── */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-foreground">Register</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Cash session overview for all cashiers</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap print:hidden">
            {/* Preset pills */}
            <div className="flex items-center gap-1 bg-muted/40 rounded-lg p-1 border border-border">
              {PILL_PRESETS.map(p => (
                <button
                  key={p.key}
                  onClick={() => setPreset(p.key)}
                  className={cn(
                    "rounded-md px-3 py-1 text-xs font-medium transition-all",
                    preset === p.key
                      ? "bg-primary text-primary-foreground shadow"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {preset === "custom" && (
              <div className="flex items-center gap-1.5">
                <Input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="h-8 text-xs w-36" />
                <span className="text-muted-foreground text-xs">→</span>
                <Input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="h-8 text-xs w-36" />
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="outline" onClick={() => refetch()} className="h-8 px-2 gap-1.5" title="Refresh">
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm" variant="outline"
                onClick={handleExportCsv}
                disabled={rows.length === 0}
                className="h-8 px-3 gap-1.5 text-xs"
                title="Export CSV"
              >
                <FileDown className="h-3.5 w-3.5" />
                CSV
              </Button>
              <Button
                size="sm" variant="outline"
                onClick={handlePrint}
                disabled={rows.length === 0}
                className="h-8 px-3 gap-1.5 text-xs"
                title="Print"
              >
                <Printer className="h-3.5 w-3.5" />
                Print
              </Button>
            </div>
          </div>
        </div>

        {/* ── KPI cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          <KpiCard loading={isLoading} title="Total Shifts"  value={String(rows.length)}         icon={Clock}              color="text-foreground"  sub={`${openSessions.length} open`} />
          <KpiCard loading={isLoading} title="Total Revenue" value={fc(totals.totalSales)}        icon={TrendingUp}         color="text-blue-400"    sub={`${totals.orderCount} orders`} />
          <KpiCard loading={isLoading} title="Cash Sales"    value={fc(totals.cashSales)}         icon={Banknote}           color="text-emerald-400" />
          <KpiCard loading={isLoading} title="Card Sales"    value={fc(totals.cardSales)}         icon={CreditCard}         color="text-blue-400" />
          <KpiCard loading={isLoading} title="Credit (A/R)"  value={fc(totals.creditSales)}       icon={BookOpen}           color="text-amber-400" />
          <KpiCard loading={isLoading} title="Split Sales"   value={fc(totals.splitSales)}        icon={SplitSquareHorizontal} color="text-purple-400" />
          <KpiCard loading={isLoading} title="Refunds"       value={fc(totals.refunds)}           icon={AlertTriangle}      color="text-red-400"     sub={`${totals.voidedCount} voids`} />
          <KpiCard loading={isLoading} title="Total Payouts" value={fc(totals.totalPayouts)}      icon={ShoppingBag}        color="text-orange-400" />
        </div>

        {/* ── Charts ── */}
        {!isLoading && rows.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Daily revenue */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Daily Revenue Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={dailyData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                    <defs>
                      {Object.entries(COLORS).map(([k, c]) => (
                        <linearGradient key={k} id={`g-${k}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor={c} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={c} stopOpacity={0.02} />
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="day" tick={{ fontSize: 10 }} stroke="#475569" />
                    <YAxis tick={{ fontSize: 10 }} stroke="#475569" tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                    <Tooltip {...tooltipStyle} formatter={(v: number) => fc(v)} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Area type="monotone" dataKey="cash"   name="Cash"   stroke={COLORS.cash}   fill={`url(#g-cash)`}   strokeWidth={2} />
                    <Area type="monotone" dataKey="card"   name="Card"   stroke={COLORS.card}   fill={`url(#g-card)`}   strokeWidth={2} />
                    <Area type="monotone" dataKey="credit" name="Credit" stroke={COLORS.credit} fill={`url(#g-credit)`} strokeWidth={2} />
                    {totals.splitSales > 0 && <Area type="monotone" dataKey="split" name="Split" stroke={COLORS.split} fill={`url(#g-split)`} strokeWidth={2} />}
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Payment method pie */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Payment Methods</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} dataKey="value" paddingAngle={3}>
                      {pieData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                    </Pie>
                    <Tooltip {...tooltipStyle} formatter={(v: number) => fc(v)} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Sales by cashier */}
            {byStaffData.length > 1 && (
              <Card className="lg:col-span-3">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Sales by Cashier</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={byStaffData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="#475569" />
                      <YAxis tick={{ fontSize: 10 }} stroke="#475569" tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                      <Tooltip {...tooltipStyle} formatter={(v: number) => fc(v)} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="cash"   name="Cash"   stackId="a" fill={COLORS.cash}   radius={[0,0,0,0]} />
                      <Bar dataKey="card"   name="Card"   stackId="a" fill={COLORS.card}   radius={[0,0,0,0]} />
                      <Bar dataKey="credit" name="Credit" stackId="a" fill={COLORS.credit} radius={[4,4,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* ── Sessions Table ── */}
        <Card className="overflow-hidden">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold">
              Shifts ({rows.length})
              {openSessions.length > 0 && (
                <Badge className="ml-2 bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]">
                  {openSessions.length} open
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="text-xs bg-muted/20">
                  <TableHead className="whitespace-nowrap">Cashier</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="whitespace-nowrap">Opened</TableHead>
                  <TableHead className="whitespace-nowrap">Closed</TableHead>
                  <TableHead className="text-right whitespace-nowrap">Cash Sales</TableHead>
                  <TableHead className="text-right whitespace-nowrap">Card Sales</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                  <TableHead className="text-right">Split</TableHead>
                  <TableHead className="text-right">Refunds</TableHead>
                  <TableHead className="text-right font-semibold">Total</TableHead>
                  <TableHead className="text-right whitespace-nowrap">Opening</TableHead>
                  <TableHead className="text-right whitespace-nowrap">Payouts</TableHead>
                  <TableHead className="text-right whitespace-nowrap">Expected</TableHead>
                  <TableHead className="text-right whitespace-nowrap">Actual</TableHead>
                  <TableHead className="text-right">Variance</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && [...Array(4)].map((_, i) => (
                  <TableRow key={i}>
                    {[...Array(18)].map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}
                  </TableRow>
                ))}
                {!isLoading && rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={18} className="text-center py-12 text-muted-foreground">
                      No sessions found for this period
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && rows.map((r) => (
                  <TableRow key={r.id} className={cn("text-sm", r.status === "open" && "bg-emerald-500/5")}>
                    <TableCell className="font-medium whitespace-nowrap">{r.staffName}</TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {r.locationName ? (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3 shrink-0" />{r.locationName}
                        </span>
                      ) : "—"}
                    </TableCell>
                    <TableCell><StatusBadge status={r.status} /></TableCell>
                    <TableCell className="text-xs font-mono whitespace-nowrap text-muted-foreground">{fdt(r.openedAt)}</TableCell>
                    <TableCell className="text-xs font-mono whitespace-nowrap text-muted-foreground">{fdt(r.closedAt)}</TableCell>
                    <TableCell className="text-right font-mono text-emerald-400">{r.cashSales > 0 ? fc(r.cashSales) : <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-right font-mono text-blue-400">{r.cardSales > 0 ? fc(r.cardSales) : <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-right font-mono text-amber-400">{r.creditSales > 0 ? fc(r.creditSales) : <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-right font-mono text-purple-400">{r.splitSales > 0 ? fc(r.splitSales) : <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-right font-mono text-red-400">{r.refunds > 0 ? fc(r.refunds) : <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-right font-mono font-bold text-foreground">{fc(r.totalSales)}</TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">{fc(r.openingCash)}</TableCell>
                    <TableCell className="text-right font-mono text-xs text-orange-400">{r.totalPayouts > 0 ? fc(r.totalPayouts) : "—"}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{fc(r.expectedCash)}</TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {r.actualCash !== null ? fc(r.actualCash) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      <VariancePill actual={r.actualCash} expected={r.expectedCash} />
                    </TableCell>
                    <TableCell className="text-right text-xs">{r.orderCount}</TableCell>
                    <TableCell className="text-right">
                      {r.status === "open" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 gap-1 text-xs border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/20"
                          onClick={() => setClosingRow(r)}
                        >
                          <CheckCircle2 className="h-3 w-3" /> Close
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}

                {/* Totals footer */}
                {!isLoading && rows.length > 0 && (
                  <TableRow className="bg-primary/5 border-t-2 border-primary/20 font-semibold text-sm">
                    <TableCell colSpan={5} className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Totals — {rows.length} shift{rows.length !== 1 ? "s" : ""} · {totals.orderCount} orders
                    </TableCell>
                    <TableCell className="text-right font-mono text-emerald-400">{fc(totals.cashSales)}</TableCell>
                    <TableCell className="text-right font-mono text-blue-400">{fc(totals.cardSales)}</TableCell>
                    <TableCell className="text-right font-mono text-amber-400">{fc(totals.creditSales)}</TableCell>
                    <TableCell className="text-right font-mono text-purple-400">{fc(totals.splitSales)}</TableCell>
                    <TableCell className="text-right font-mono text-red-400">{totals.refunds > 0 ? fc(totals.refunds) : "—"}</TableCell>
                    <TableCell className="text-right font-mono font-bold text-primary">{fc(totals.totalSales)}</TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">{fc(totals.openingCash)}</TableCell>
                    <TableCell className="text-right font-mono text-xs text-orange-400">{totals.totalPayouts > 0 ? fc(totals.totalPayouts) : "—"}</TableCell>
                    <TableCell colSpan={4} />
                    <TableCell className="text-right text-xs">{totals.orderCount}</TableCell>
                    <TableCell />
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>

      {/* Close shift dialog */}
      {closingRow && (
        <CloseSessionDialog
          row={closingRow}
          onClose={() => setClosingRow(null)}
          onClosed={() => setClosingRow(null)}
        />
      )}
    </div>
  );
}
