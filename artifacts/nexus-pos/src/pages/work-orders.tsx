import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import {
  useListWorkOrders,
  useGetSettings,
  useWorkOrderStats,
  useUpdateWorkOrder,
  useWorkOrderCalendar,
  useWorkOrderReports,
} from "@workspace/api-client-react";
import type { WorkOrder, WorkOrderStatus, WorkOrderCalendarEntry } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Wrench, Search, Plus, Eye, ShoppingCart, LayoutGrid, List,
  Clock, CheckCircle2, Package, Pause, AlertTriangle, TrendingUp,
  CalendarDays, BarChart2, ChevronLeft, ChevronRight,
} from "lucide-react";
import { CreateWorkOrderDialog } from "@/components/work-orders/CreateWorkOrderDialog";
import { useStaff } from "@/contexts/StaffContext";
import { PinPad } from "@/components/PinPad";
import { useBusinessProfile } from "@/hooks/useBusinessProfile";

/** Key used to hand a work order from this page to the POS cart loader. */
export const PENDING_WORK_ORDER_KEY = "nexxus_pending_work_order";

function formatCurrency(n: number, currency = "JMD") {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
    }).format(n || 0);
  } catch {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n || 0);
  }
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export const STATUS_LABEL: Record<WorkOrderStatus, string> = {
  received: "Received",
  in_progress: "In Progress",
  awaiting_parts: "Awaiting Parts",
  on_hold: "On Hold",
  ready: "Ready",
  collected: "Collected",
  cancelled: "Cancelled",
};

export const STATUS_STYLES: Record<WorkOrderStatus, string> = {
  received: "bg-sky-500/15 text-sky-600 border-sky-500/30",
  in_progress: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  awaiting_parts: "bg-orange-500/15 text-orange-600 border-orange-500/30",
  on_hold: "bg-slate-500/15 text-slate-500 border-slate-500/30",
  ready: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  collected: "bg-violet-500/15 text-violet-600 border-violet-500/30",
  cancelled: "bg-rose-500/15 text-rose-600 border-rose-500/30",
};

const PRIORITY_STYLES: Record<string, string> = {
  low: "text-slate-400",
  normal: "text-slate-400",
  high: "text-amber-500",
  urgent: "text-orange-500",
  emergency: "text-rose-500 font-bold",
};

const PRIORITY_LABEL: Record<string, string> = {
  low: "Low",
  normal: "",
  high: "High",
  urgent: "URGENT",
  emergency: "EMERGENCY",
};

const KANBAN_COLUMNS: { status: WorkOrderStatus; label: string; icon: React.ElementType; color: string }[] = [
  { status: "received", label: "Received", icon: Clock, color: "text-sky-500" },
  { status: "in_progress", label: "In Progress", icon: Wrench, color: "text-amber-500" },
  { status: "awaiting_parts", label: "Awaiting Parts", icon: Package, color: "text-orange-500" },
  { status: "on_hold", label: "On Hold", icon: Pause, color: "text-slate-400" },
  { status: "ready", label: "Ready", icon: CheckCircle2, color: "text-emerald-500" },
];

export default function WorkOrdersPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: workOrders, isLoading } = useListWorkOrders();
  const { data: settings } = useGetSettings();
  const { data: stats } = useWorkOrderStats();
  const updateWO = useUpdateWorkOrder();

  const currency = settings?.base_currency || "JMD";

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | WorkOrderStatus>("all");
  const [view, setView] = useState<"list" | "kanban" | "calendar" | "reports">("list");
  const [showCreate, setShowCreate] = useState(false);

  const { staff: sessionStaff, setStaff } = useStaff();
  const { profile } = useBusinessProfile();
  const [locked, setLocked] = useState(() => !sessionStaff);

  const filtered = useMemo(() => {
    const list = workOrders ?? [];
    const q = search.trim().toLowerCase();
    return list.filter((wo) => {
      if (statusFilter !== "all" && wo.status !== statusFilter) return false;
      if (!q) return true;
      const name = wo.customerName || wo.contactName || "";
      return (
        wo.workOrderNumber.toLowerCase().includes(q) ||
        name.toLowerCase().includes(q) ||
        wo.itemDescription.toLowerCase().includes(q) ||
        (wo.brand ?? "").toLowerCase().includes(q) ||
        (wo.model ?? "").toLowerCase().includes(q) ||
        (wo.serialNumber ?? "").toLowerCase().includes(q)
      );
    });
  }, [workOrders, search, statusFilter]);

  const openDetail = (id: number) => setLocation(`/work-orders/${id}`);

  const quickMove = (wo: WorkOrder, status: WorkOrderStatus) => {
    updateWO.mutate(
      { id: wo.id, status },
      {
        onSuccess: () => toast({ title: `Moved to ${STATUS_LABEL[status]}` }),
        onError: (e: any) =>
          toast({ title: "Could not update status", description: e?.message, variant: "destructive" }),
      },
    );
  };

  const handleChargeInPos = (wo: WorkOrder) => {
    if (wo.items.length === 0) {
      toast({ title: "Add parts or labor first", variant: "destructive" });
      return;
    }
    sessionStorage.setItem(
      PENDING_WORK_ORDER_KEY,
      JSON.stringify({
        id: wo.id,
        workOrderNumber: wo.workOrderNumber,
        items: wo.items,
        discountAmount: wo.discountAmount ?? 0,
        customerId: wo.customerId ?? null,
        notes: `Work order ${wo.workOrderNumber}: ${wo.itemDescription}`,
      }),
    );
    setLocation("/pos");
  };

  if (locked) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-6 w-full max-w-xs px-4">
          <div className="text-center space-y-1 mb-2">
            <h2 className="text-xl font-bold flex items-center gap-2 justify-center">
              <Wrench className="h-5 w-5 text-amber-500" /> Work Orders
            </h2>
            {profile?.businessName && (
              <p className="text-sm font-medium text-foreground/70">{profile.businessName}</p>
            )}
            <p className="text-sm text-muted-foreground">Enter your PIN to access this module</p>
          </div>
          <PinPad
            onSuccess={(s) => { setStaff(s); setLocked(false); }}
            title="Staff PIN Required"
            pinLength={4}
          />
        </div>
      </div>
    );
  }

  // Route-level module gate
  if (settings && settings.work_orders_enabled !== "true") {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <p className="font-medium">Work Orders module is disabled</p>
        <p className="text-sm mt-1">Enable it in Settings → Optional Modules.</p>
      </div>
    );
  }

  const activeCount = stats?.activeCount ?? 0;
  const byStatus = stats?.byStatus ?? {};

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 text-amber-500">
            <Wrench className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Work Orders</h1>
            <p className="text-sm text-muted-foreground">
              {activeCount} active job{activeCount !== 1 ? "s" : ""} ·{" "}
              {formatCurrency(stats?.revenueThisMonth ?? 0, currency)} collected this month
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <div className="flex border rounded-md overflow-hidden">
            {([
              { id: "list",     icon: List,         title: "List view" },
              { id: "kanban",   icon: LayoutGrid,   title: "Board view" },
              { id: "calendar", icon: CalendarDays, title: "Calendar view" },
              { id: "reports",  icon: BarChart2,    title: "Reports" },
            ] as const).map(({ id, icon: Icon, title }) => (
              <button
                key={id}
                className={`px-3 py-1.5 text-xs font-medium ${view === id ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                onClick={() => setView(id)}
                title={title}
              >
                <Icon className="h-4 w-4" />
              </button>
            ))}
          </div>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-1" /> New Work Order
          </Button>
        </div>
      </div>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { status: "received" as WorkOrderStatus, label: "Received", icon: Clock, color: "text-sky-500 bg-sky-500/10" },
          { status: "in_progress" as WorkOrderStatus, label: "In Progress", icon: Wrench, color: "text-amber-500 bg-amber-500/10" },
          { status: "awaiting_parts" as WorkOrderStatus, label: "Awaiting Parts", icon: Package, color: "text-orange-500 bg-orange-500/10" },
          { status: "ready" as WorkOrderStatus, label: "Ready", icon: CheckCircle2, color: "text-emerald-500 bg-emerald-500/10" },
        ].map(({ status, label, icon: Icon, color }) => (
          <button
            key={status}
            className="rounded-lg border p-3 text-left hover:border-primary/40 transition-colors"
            onClick={() => setStatusFilter((p) => (p === status ? "all" : status))}
          >
            <div className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${color} mb-2`}>
              <Icon className="h-4 w-4" />
            </div>
            <p className="text-2xl font-bold">{byStatus[status] ?? 0}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </button>
        ))}
      </div>

      {view === "list" ? (
        <>
          {/* ── Search / filters ── */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by number, customer, item, serial…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {(["all", "received", "in_progress", "awaiting_parts", "on_hold", "ready", "collected", "cancelled"] as const).map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={statusFilter === s ? "default" : "outline"}
                  onClick={() => setStatusFilter(s)}
                  className="text-xs"
                >
                  {s === "all" ? "All" : STATUS_LABEL[s as WorkOrderStatus]}
                </Button>
              ))}
            </div>
          </div>

          {/* ── List ── */}
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-12 text-center">Loading work orders…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-12 text-center">No work orders found.</p>
          ) : (
            <div className="grid gap-2">
              {filtered.map((wo) => (
                <WorkOrderRow
                  key={wo.id}
                  wo={wo}
                  currency={currency}
                  onOpen={openDetail}
                  onCharge={handleChargeInPos}
                />
              ))}
            </div>
          )}
        </>
      ) : view === "kanban" ? (
        /* ── Kanban Board ── */
        <KanbanBoard
          workOrders={workOrders ?? []}
          currency={currency}
          onOpen={openDetail}
          onMove={quickMove}
          onCharge={handleChargeInPos}
          isMoving={updateWO.isPending}
          search={search}
          onSearchChange={setSearch}
        />
      ) : view === "calendar" ? (
        <CalendarView currency={currency} onOpen={openDetail} />
      ) : (
        <ReportsView currency={currency} />
      )}

      <CreateWorkOrderDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={(wo) => {
          setShowCreate(false);
          setLocation(`/work-orders/${wo.id}`);
        }}
      />
    </div>
  );
}

/* ── Calendar View ── */
const APPT_COLORS: Record<string, string> = {
  assessment:   "bg-blue-500/15 text-blue-700 border-blue-500/30",
  repair:       "bg-amber-500/15 text-amber-700 border-amber-500/30",
  installation: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  site_visit:   "bg-violet-500/15 text-violet-700 border-violet-500/30",
  pickup:       "bg-sky-500/15 text-sky-700 border-sky-500/30",
  delivery:     "bg-orange-500/15 text-orange-700 border-orange-500/30",
  follow_up:    "bg-slate-500/15 text-slate-600 border-slate-500/30",
};

function CalendarView({ onOpen }: { currency: string; onOpen: (id: number) => void }) {
  const [weekOffset, setWeekOffset] = useState(0);

  const { weekStart, weekEnd, days } = useMemo(() => {
    const now = new Date();
    const dow = now.getDay(); // 0=Sun
    const diffToMon = dow === 0 ? -6 : 1 - dow;
    const start = new Date(now);
    start.setDate(now.getDate() + diffToMon + weekOffset * 7);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    return {
      weekStart: start,
      weekEnd: end,
      days: Array.from({ length: 7 }, (_, i) => {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        return d;
      }),
    };
  }, [weekOffset]);

  const { data: appointments, isLoading } = useWorkOrderCalendar(
    weekStart.toISOString(),
    weekEnd.toISOString(),
  );

  const byDay = useMemo(() => {
    const map = new Map<string, WorkOrderCalendarEntry[]>();
    for (const a of appointments ?? []) {
      const key = new Date(a.startTime).toDateString();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    return map;
  }, [appointments]);

  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });

  const today = new Date().toDateString();
  const weekLabel = `${days[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${days[6].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

  return (
    <div className="space-y-3">
      {/* Navigation */}
      <div className="flex items-center gap-3">
        <Button size="sm" variant="outline" onClick={() => setWeekOffset((w) => w - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="flex-1 text-center text-sm font-medium">{weekLabel}</span>
        {weekOffset !== 0 && (
          <Button size="sm" variant="outline" onClick={() => setWeekOffset(0)}>Today</Button>
        )}
        <Button size="sm" variant="outline" onClick={() => setWeekOffset((w) => w + 1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {isLoading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Loading appointments…</p>
      ) : (
        <div className="grid grid-cols-7 gap-1 min-w-[600px] overflow-x-auto">
          {days.map((day, i) => {
            const key = day.toDateString();
            const dayAppts = byDay.get(key) ?? [];
            const isToday = key === today;
            return (
              <div key={i} className="min-h-[140px] rounded-lg border overflow-hidden">
                <div className={`px-2 py-1.5 text-center border-b ${isToday ? "bg-primary text-primary-foreground" : "bg-muted/40"}`}>
                  <p className="text-xs font-semibold">
                    {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i]}
                  </p>
                  <p className="text-base font-bold leading-tight">{day.getDate()}</p>
                </div>
                <div className="p-1 space-y-1">
                  {dayAppts.length === 0 && (
                    <p className="text-center text-xs text-muted-foreground/50 py-2">—</p>
                  )}
                  {dayAppts.map((a) => {
                    const color = APPT_COLORS[a.appointmentType] ?? APPT_COLORS["follow_up"];
                    return (
                      <button
                        key={a.id}
                        onClick={() => onOpen(a.workOrderId)}
                        className={`w-full text-left rounded px-1.5 py-1 border text-xs ${color} hover:opacity-80 transition-opacity`}
                      >
                        <p className="font-semibold font-mono truncate">{a.workOrderNumber}</p>
                        <p className="truncate opacity-80">{a.itemDescription}</p>
                        <p className="opacity-70">{fmtTime(a.startTime)}</p>
                        <p className="capitalize opacity-60">{a.appointmentType.replace("_", " ")}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!isLoading && (appointments?.length ?? 0) === 0 && (
        <p className="text-center text-sm text-muted-foreground pb-4">
          No appointments scheduled this week.
          <br />
          <span className="text-xs">Add appointments from any work order's Appointments tab.</span>
        </p>
      )}
    </div>
  );
}

/* ── Reports View ── */
function ReportsView({ currency }: { currency: string }) {
  const { data: reports, isLoading } = useWorkOrderReports();

  if (isLoading) return <p className="py-12 text-center text-sm text-muted-foreground">Loading reports…</p>;
  if (!reports) return null;

  const maxRevenue = Math.max(...reports.monthly.map((m) => m.revenue), 1);
  const totalTypes = reports.byServiceType.reduce((s, t) => s + t.count, 0) || 1;

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: "Jobs collected (all time)", value: reports.totalCompleted.toString() },
          { label: "Avg job value", value: formatCurrency(reports.avgJobValue, currency) },
          { label: "Total revenue (all time)", value: formatCurrency(reports.totalRevenue, currency) },
        ].map(({ label, value }) => (
          <Card key={label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1">{label}</p>
              <p className="text-2xl font-bold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Monthly revenue bar chart */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Monthly Revenue (Collected)</CardTitle>
        </CardHeader>
        <CardContent>
          {reports.monthly.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No collected jobs yet.</p>
          ) : (
            <div className="flex items-end gap-2 h-36">
              {reports.monthly.map((m) => (
                <div key={m.monthSort} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                  <div className="w-full relative group">
                    <div
                      className="w-full bg-primary/80 rounded-t-sm hover:bg-primary transition-colors"
                      style={{ height: `${Math.max(4, (m.revenue / maxRevenue) * 120)}px` }}
                    />
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-popover border rounded px-2 py-1 text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none shadow z-10">
                      {formatCurrency(m.revenue, currency)} · {m.count} job{m.count !== 1 ? "s" : ""}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground truncate w-full text-center">{m.month}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* By service type */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Jobs by Service Type</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2.5">
          {reports.byServiceType.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No data yet.</p>
          ) : (
            reports.byServiceType
              .sort((a, b) => b.count - a.count)
              .map((t) => {
                const label = t.serviceType ?? "Unspecified";
                const pct = Math.round((t.count / totalTypes) * 100);
                return (
                  <div key={label} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="font-medium">{t.count} <span className="text-muted-foreground text-xs">({pct}%)</span></span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-primary/70 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ── Work Order Row ── */
function WorkOrderRow({
  wo,
  currency,
  onOpen,
  onCharge,
}: {
  wo: WorkOrder;
  currency: string;
  onOpen: (id: number) => void;
  onCharge: (wo: WorkOrder) => void;
}) {
  const name = wo.customerName || wo.contactName || "Walk-in";
  const isTerminal = wo.status === "collected" || wo.status === "cancelled";
  const pLabel = PRIORITY_LABEL[wo.priority ?? "normal"];

  return (
    <Card className="hover:border-primary/40 transition-colors">
      <CardContent className="p-3 flex flex-wrap items-center gap-3">
        <div className="min-w-[130px]">
          <p className="font-semibold text-sm">{wo.workOrderNumber}</p>
          <p className="text-xs text-muted-foreground">{fmtDate(wo.createdAt)}</p>
        </div>
        <div className="flex-1 min-w-[160px]">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium truncate">{wo.itemDescription}</p>
            {wo.brand && <span className="text-xs text-muted-foreground truncate">· {wo.brand}{wo.model ? ` ${wo.model}` : ""}</span>}
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {name}
            {wo.assignedStaffNames && wo.assignedStaffNames.length > 0 ? ` · ${wo.assignedStaffNames.join(", ")}` : wo.assignedStaffName ? ` · ${wo.assignedStaffName}` : ""}
            {wo.promisedDate ? ` · due ${fmtDate(wo.promisedDate)}` : ""}
          </p>
        </div>
        <div className="text-right min-w-[90px]">
          <p className="font-semibold text-sm">{formatCurrency(wo.total, currency)}</p>
          <p className="text-xs text-muted-foreground">{wo.items.length} line{wo.items.length === 1 ? "" : "s"}</p>
        </div>
        {pLabel && (
          <span className={`text-xs font-semibold ${PRIORITY_STYLES[wo.priority ?? "normal"]}`}>
            {pLabel}
          </span>
        )}
        <Badge variant="outline" className={`${STATUS_STYLES[wo.status as WorkOrderStatus]} text-xs shrink-0`}>
          {STATUS_LABEL[wo.status as WorkOrderStatus] ?? wo.status}
        </Badge>
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" onClick={() => onOpen(wo.id)}>
            <Eye className="h-3.5 w-3.5" />
          </Button>
          {wo.status === "ready" && !wo.convertedOrderId && !isTerminal && (
            <Button size="sm" onClick={() => onCharge(wo)}>
              <ShoppingCart className="h-3.5 w-3.5 mr-1" /> Charge
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* ── Kanban Board ── */
const NEXT_STATUS_MAP: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  received: ["in_progress", "on_hold", "cancelled"],
  in_progress: ["ready", "awaiting_parts", "on_hold", "cancelled"],
  awaiting_parts: ["in_progress", "on_hold", "cancelled"],
  on_hold: ["in_progress", "awaiting_parts", "cancelled"],
  ready: ["collected", "in_progress", "cancelled"],
  collected: [],
  cancelled: [],
};

function KanbanBoard({
  workOrders,
  currency,
  onOpen,
  onMove,
  onCharge,
  isMoving,
  search,
  onSearchChange,
}: {
  workOrders: WorkOrder[];
  currency: string;
  onOpen: (id: number) => void;
  onMove: (wo: WorkOrder, status: WorkOrderStatus) => void;
  onCharge: (wo: WorkOrder) => void;
  isMoving: boolean;
  search: string;
  onSearchChange: (s: string) => void;
}) {
  const q = search.trim().toLowerCase();
  const filtered = workOrders.filter((wo) => {
    if (!q) return true;
    const name = wo.customerName || wo.contactName || "";
    return (
      wo.workOrderNumber.toLowerCase().includes(q) ||
      name.toLowerCase().includes(q) ||
      wo.itemDescription.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-3">
      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="flex gap-3 overflow-x-auto pb-4">
        {KANBAN_COLUMNS.map(({ status, label, icon: Icon, color }) => {
          const cards = filtered.filter((wo) => wo.status === status);
          return (
            <div key={status} className="flex-shrink-0 w-64">
              <div className="flex items-center gap-2 mb-2 px-1">
                <Icon className={`h-4 w-4 ${color}`} />
                <span className="text-sm font-semibold">{label}</span>
                <Badge variant="secondary" className="ml-auto text-xs">{cards.length}</Badge>
              </div>
              <div className="space-y-2 min-h-20">
                {cards.length === 0 && (
                  <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                    Empty
                  </div>
                )}
                {cards.map((wo) => (
                  <KanbanCard
                    key={wo.id}
                    wo={wo}
                    currency={currency}
                    onOpen={onOpen}
                    onMove={onMove}
                    onCharge={onCharge}
                    isMoving={isMoving}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function KanbanCard({
  wo,
  currency,
  onOpen,
  onMove,
  onCharge,
  isMoving,
}: {
  wo: WorkOrder;
  currency: string;
  onOpen: (id: number) => void;
  onMove: (wo: WorkOrder, status: WorkOrderStatus) => void;
  onCharge: (wo: WorkOrder) => void;
  isMoving: boolean;
}) {
  const name = wo.customerName || wo.contactName || "Walk-in";
  const nextStatuses = NEXT_STATUS_MAP[wo.status as WorkOrderStatus] ?? [];
  const pLabel = PRIORITY_LABEL[wo.priority ?? "normal"];

  return (
    <div
      className="rounded-lg border bg-card p-3 cursor-pointer hover:border-primary/40 hover:shadow-sm transition-all space-y-2"
      onClick={() => onOpen(wo.id)}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-mono font-semibold text-muted-foreground">{wo.workOrderNumber}</p>
          <p className="text-sm font-medium leading-snug">{wo.itemDescription}</p>
          {wo.brand && <p className="text-xs text-muted-foreground">{wo.brand}{wo.model ? ` ${wo.model}` : ""}</p>}
        </div>
        {pLabel && (
          <span className={`text-xs font-bold shrink-0 ${PRIORITY_STYLES[wo.priority ?? "normal"]}`}>{pLabel}</span>
        )}
      </div>

      <div className="text-xs text-muted-foreground flex items-center justify-between">
        <span className="truncate">{name}</span>
        <span className="font-medium text-foreground shrink-0 ml-2">{formatCurrency(wo.total, currency)}</span>
      </div>

      {wo.promisedDate && (
        <p className="text-xs text-muted-foreground">Due {fmtDate(wo.promisedDate)}</p>
      )}

      {nextStatuses.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1 border-t" onClick={(e) => e.stopPropagation()}>
          {nextStatuses.slice(0, 3).map((next) => (
            <button
              key={next}
              disabled={isMoving}
              onClick={() => {
                if (next === "collected" && wo.items.length > 0) {
                  onCharge(wo);
                } else {
                  onMove(wo, next);
                }
              }}
              className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                next === "cancelled"
                  ? "text-rose-500 border-rose-500/30 hover:bg-rose-500/10"
                  : "text-muted-foreground border-border hover:bg-muted"
              }`}
            >
              → {STATUS_LABEL[next]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
