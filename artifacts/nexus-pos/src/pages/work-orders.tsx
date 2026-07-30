import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import {
  useListWorkOrders,
  useGetSettings,
  useWorkOrderStats,
  useUpdateWorkOrder,
} from "@workspace/api-client-react";
import type { WorkOrder, WorkOrderStatus } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Wrench, Search, Plus, Eye, ShoppingCart, LayoutGrid, List,
  Clock, CheckCircle2, Package, Pause, AlertTriangle, TrendingUp,
} from "lucide-react";
import { CreateWorkOrderDialog } from "@/components/work-orders/CreateWorkOrderDialog";

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
  const [view, setView] = useState<"list" | "kanban">("list");
  const [showCreate, setShowCreate] = useState(false);

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
            <button
              className={`px-3 py-1.5 text-xs font-medium ${view === "list" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              onClick={() => setView("list")}
              title="List view"
            >
              <List className="h-4 w-4" />
            </button>
            <button
              className={`px-3 py-1.5 text-xs font-medium ${view === "kanban" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              onClick={() => setView("kanban")}
              title="Board view"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
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
      ) : (
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
            {wo.assignedStaffName ? ` · ${wo.assignedStaffName}` : ""}
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
