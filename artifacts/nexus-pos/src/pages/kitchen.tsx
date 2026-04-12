import { useState, useEffect } from "react";
import {
  useListKitchenOrders,
  useUpdateKitchenOrderStatus,
  useListKdsScreens,
  useCreateKdsScreen,
  useUpdateKdsScreen,
  useDeleteKdsScreen,
} from "@workspace/api-client-react";
import type { KitchenOrder as KitchenOrderBase, KdsScreen } from "@workspace/api-zod";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  ChefHat, Clock, CheckCircle2, AlertCircle, RefreshCw, UtensilsCrossed,
  Monitor, Plus, Trash2, Settings, X, GripVertical, AlertTriangle,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { TENANT_TOKEN_KEY } from "@/lib/saas-api";

type KitchenOrder = KitchenOrderBase & { orderStatus?: string };

const TARGET_MINUTES = 15;

function useCountdown(createdAt: string) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const startMs = new Date(createdAt).getTime();
  const targetMs = startMs + TARGET_MINUTES * 60 * 1000;
  const remainingMs = targetMs - now;
  const isOverdue = remainingMs < 0;
  const absMs = Math.abs(remainingMs);
  const mins = Math.floor(absMs / 60000);
  const secs = Math.floor((absMs % 60000) / 1000);
  const display = `${isOverdue ? "+" : ""}${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  const isWarning = !isOverdue && remainingMs < 5 * 60 * 1000;
  return { display, isOverdue, isWarning };
}

const STATUS_CONFIG: Record<string, { label: string; next: string; nextLabel: string; color: string; headerColor: string }> = {
  pending: {
    label: "Pending",
    next: "preparing",
    nextLabel: "Start Preparing",
    color: "bg-amber-500/10 border-amber-500/30 text-amber-400",
    headerColor: "border-l-4 border-amber-500",
  },
  preparing: {
    label: "Preparing",
    next: "ready",
    nextLabel: "Mark Ready",
    color: "bg-blue-500/10 border-blue-500/30 text-blue-400",
    headerColor: "border-l-4 border-blue-500",
  },
  ready: {
    label: "Ready",
    next: "completed",
    nextLabel: "Complete",
    color: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400",
    headerColor: "border-l-4 border-emerald-500",
  },
};

function KitchenCard({
  order,
  onStatusChange,
  filteredItems,
}: {
  order: KitchenOrder;
  onStatusChange: (id: number, status: string) => void;
  filteredItems?: KitchenOrder["items"];
}) {
  const config = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.pending;
  const { display: countdown, isOverdue, isWarning } = useCountdown(order.createdAt);
  const items = filteredItems ?? order.items;
  const isCompleted = order.status === "ready";
  const isVoided = order.orderStatus === "voided";
  const isRefunded = order.orderStatus === "refunded";
  const isCancelled = isVoided || isRefunded;

  return (
    <div className={cn("relative rounded-xl bg-card border flex flex-col shadow-sm transition-all",
      isCancelled ? "border-red-500/50 opacity-80" : "border-border",
      isCancelled ? "" : config.headerColor,
    )}>
      {/* Cancelled stamp overlay */}
      {isCancelled && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl pointer-events-none overflow-hidden">
          <div className={cn(
            "rotate-[-30deg] text-center select-none",
          )}>
            <p className={cn(
              "text-5xl font-black tracking-widest uppercase border-4 px-4 py-2 rounded-lg",
              isVoided ? "text-orange-500 border-orange-500/70" : "text-red-500 border-red-500/70",
            )}>
              {isVoided ? "VOID" : "REFUNDED"}
            </p>
          </div>
        </div>
      )}

      <div className="p-4 border-b border-border shrink-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-bold text-base">{order.orderNumber}</p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Badge variant="outline" className={cn("text-xs", config.color)}>
                {config.label}
              </Badge>
              {order.tableId && (
                <Badge variant="outline" className="text-xs text-muted-foreground">
                  <UtensilsCrossed className="h-2.5 w-2.5 mr-1" />
                  {order.tableName ?? `Table #${order.tableId}`}
                </Badge>
              )}
              {order.orderType && order.orderType !== "counter" && (
                <Badge variant="outline" className="text-xs capitalize text-muted-foreground">
                  {order.orderType}
                </Badge>
              )}
            </div>
          </div>
          {!isCompleted && (
            <div className={cn(
              "flex flex-col items-end gap-0.5",
            )}>
              <div className={cn(
                "flex items-center gap-1 text-sm font-mono font-bold tabular-nums",
                isOverdue ? "text-red-400" : isWarning ? "text-amber-400" : "text-emerald-400",
              )}>
                {isOverdue ? <AlertCircle className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
                {countdown}
              </div>
              <p className="text-[10px] text-muted-foreground/60">
                {isOverdue ? "overdue" : "remaining"}
              </p>
            </div>
          )}
        </div>
        {order.notes && (
          <p className="mt-2 text-xs bg-amber-500/10 text-amber-400 rounded px-2 py-1 border border-amber-500/20">
            📝 {order.notes}
          </p>
        )}
      </div>

      <div className="p-4 overflow-y-auto max-h-64 space-y-2">
        {items.map((item) => (
          <div key={item.id} className="flex items-start gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-primary/20 text-primary text-xs font-bold">
              {item.quantity}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium leading-snug">{item.productName}</p>
              {item.category && (
                <p className="text-[10px] text-muted-foreground/60">{item.category}</p>
              )}
              {Array.isArray(item.variantChoices) && item.variantChoices.length > 0 && (
                <p className="text-xs text-primary/70 mt-0.5">
                  {(item.variantChoices as Array<{ optionName: string }>).map((c) => c.optionName).join(", ")}
                </p>
              )}
              {Array.isArray(item.modifierChoices) && item.modifierChoices.length > 0 && (
                <p className="text-xs text-amber-400/80 mt-0.5">
                  + {(item.modifierChoices as Array<{ optionName: string }>).map((c) => c.optionName).join(", ")}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {config.next && !isCancelled && (
        <div className="p-3 border-t border-border">
          <Button
            className="w-full h-9 text-sm"
            variant={order.status === "ready" ? "default" : "outline"}
            onClick={() => onStatusChange(order.id, config.next)}
          >
            {order.status === "ready" ? <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> : null}
            {config.nextLabel}
          </Button>
        </div>
      )}
    </div>
  );
}

/* ─── KDS Settings Dialog ─── */
const ALL_CATEGORIES = ["Beverages", "Food", "Bakery", "Merchandise"];

function KdsSettingsDialog({
  open,
  onClose,
  screens,
  onRefresh,
}: {
  open: boolean;
  onClose: () => void;
  screens: KdsScreen[];
  onRefresh: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createScreen = useCreateKdsScreen();
  const updateScreen = useUpdateKdsScreen();
  const deleteScreen = useDeleteKdsScreen();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/kds-screens"] });

  const handleCreate = () => {
    if (!newName.trim()) return;
    createScreen.mutate(
      { data: { name: newName.trim(), categories: [] } },
      {
        onSuccess: () => { setNewName(""); invalidate(); onRefresh(); },
        onError: () => toast({ title: "Error", description: "Could not create screen", variant: "destructive" }),
      },
    );
  };

  const handleToggleCategory = (screen: KdsScreen, cat: string) => {
    const current = screen.categories ?? [];
    const next = current.includes(cat) ? current.filter((c) => c !== cat) : [...current, cat];
    updateScreen.mutate(
      { id: screen.id, data: { categories: next } },
      { onSuccess: () => { invalidate(); onRefresh(); } },
    );
  };

  const handleRename = (screen: KdsScreen) => {
    if (!editName.trim()) return;
    updateScreen.mutate(
      { id: screen.id, data: { name: editName.trim() } },
      {
        onSuccess: () => { setEditingId(null); invalidate(); onRefresh(); },
        onError: () => toast({ title: "Error", description: "Could not rename screen", variant: "destructive" }),
      },
    );
  };

  const handleDelete = (id: number) => {
    deleteScreen.mutate(
      { id },
      {
        onSuccess: () => { invalidate(); onRefresh(); },
        onError: () => toast({ title: "Error", description: "Could not delete screen", variant: "destructive" }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Monitor className="h-4 w-4 text-primary" />
            Configure KDS Screens
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Each screen shows only orders containing items from its assigned categories. Open a screen in a new browser tab for a dedicated display.
          </p>

          {/* Add new screen */}
          <div className="flex gap-2">
            <Input
              placeholder="Screen name (e.g. Bar, Kitchen, Bakery)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              className="h-8 text-sm"
            />
            <Button size="sm" onClick={handleCreate} disabled={!newName.trim() || createScreen.isPending}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add
            </Button>
          </div>

          {/* Screen list */}
          {screens.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No screens configured yet.</p>
          ) : (
            <div className="space-y-3">
              {screens.map((screen) => (
                <div key={screen.id} className="rounded-lg border border-border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    {editingId === screen.id ? (
                      <div className="flex gap-2 flex-1 mr-2">
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleRename(screen)}
                          className="h-7 text-sm"
                          autoFocus
                        />
                        <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => handleRename(screen)}>Save</Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditingId(null)}><X className="h-3 w-3" /></Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <GripVertical className="h-4 w-4 text-muted-foreground/40" />
                        <p className="font-semibold text-sm">{screen.name}</p>
                        <Button size="sm" variant="ghost" className="h-6 px-1.5 text-xs text-muted-foreground" onClick={() => { setEditingId(screen.id); setEditName(screen.name); }}>
                          Rename
                        </Button>
                      </div>
                    )}
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => handleDelete(screen.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <p className="text-[10px] text-muted-foreground w-full">Categories shown on this screen:</p>
                    {ALL_CATEGORIES.map((cat) => {
                      const active = (screen.categories ?? []).includes(cat);
                      return (
                        <button
                          key={cat}
                          onClick={() => handleToggleCategory(screen, cat)}
                          className={cn(
                            "px-2 py-0.5 rounded text-xs font-medium border transition-all",
                            active
                              ? "bg-primary/20 border-primary text-primary"
                              : "border-border text-muted-foreground hover:border-primary/50",
                          )}
                        >
                          {cat}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Main Kitchen Component ─── */
export function Kitchen() {
  const { data: orders, isLoading, refetch } = useListKitchenOrders({ query: { refetchInterval: 10000 } });
  const { data: screens = [], refetch: refetchScreens } = useListKdsScreens();
  const updateStatus = useUpdateKitchenOrderStatus();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [activeScreen, setActiveScreen] = useState<number | "all">("all");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/kitchen"] });

  const handleClearAll = async () => {
    setClearing(true);
    try {
      const token = localStorage.getItem(TENANT_TOKEN_KEY) ?? "";
      const res = await fetch("/api/kitchen/clear-all", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to clear orders");
      const { cleared } = await res.json() as { cleared: number };
      setClearConfirmOpen(false);
      await invalidate();
      refetch();
      toast({
        title: "Kitchen cleared",
        description: cleared > 0
          ? `${cleared} order${cleared === 1 ? "" : "s"} marked as completed.`
          : "No active orders to clear.",
      });
    } catch {
      toast({ title: "Error", description: "Could not clear orders. Please try again.", variant: "destructive" });
    } finally {
      setClearing(false);
    }
  };

  const handleStatusChange = (id: number, status: string) => {
    updateStatus.mutate(
      { id, data: { status } },
      {
        onSuccess: () => { invalidate(); },
        onError: () => toast({ title: "Error", description: "Could not update order status", variant: "destructive" }),
      },
    );
  };

  /* Filter orders by active KDS screen */
  const getFilteredOrders = () => {
    if (activeScreen === "all" || !orders) return orders ?? [];
    const screen = screens.find((s) => s.id === activeScreen);
    if (!screen || !screen.categories?.length) return orders ?? [];
    const cats = new Set(screen.categories);
    return orders
      .map((order) => {
        const relevantItems = order.items.filter((item) => cats.has((item as any).category ?? ""));
        return relevantItems.length > 0 ? { ...order, _filteredItems: relevantItems } : null;
      })
      .filter(Boolean) as (KitchenOrder & { _filteredItems?: KitchenOrder["items"] })[];
  };

  const visibleOrders = getFilteredOrders() as (KitchenOrder & { _filteredItems?: KitchenOrder["items"] })[];

  const pending = visibleOrders.filter((o) => o.status === "pending");
  const preparing = visibleOrders.filter((o) => o.status === "preparing");
  const ready = visibleOrders.filter((o) => o.status === "ready");

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b border-border px-6 py-3 flex items-center justify-between bg-card shrink-0">
        <div className="flex items-center gap-3">
          <ChefHat className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-lg font-bold">Kitchen Display</h1>
            <p className="text-xs text-muted-foreground">Auto-refreshes every 10 seconds</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-3 text-xs">
            <span className="text-amber-400 font-medium">{pending.length} Pending</span>
            <span className="text-blue-400 font-medium">{preparing.length} Preparing</span>
            <span className="text-emerald-400 font-medium">{ready.length} Ready</span>
          </div>
          <Button size="sm" variant="outline" onClick={() => setSettingsOpen(true)}>
            <Settings className="h-3.5 w-3.5 mr-1" /> Screens
          </Button>
          <Button size="sm" variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
          </Button>
          <Button
            size="sm"
            variant="destructive"
            className="bg-red-600/20 hover:bg-red-600 border border-red-500/40 text-red-400 hover:text-white transition-colors"
            onClick={() => setClearConfirmOpen(true)}
            disabled={!visibleOrders.length}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Clear All
          </Button>
        </div>
      </div>

      {/* Screen tabs */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-border bg-card/50 overflow-x-auto shrink-0">
        <button
          onClick={() => setActiveScreen("all")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap",
            activeScreen === "all"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-secondary",
          )}
        >
          <Monitor className="h-3.5 w-3.5" />
          All Orders
        </button>
        {screens.filter((s) => s.isActive).map((screen) => (
          <button
            key={screen.id}
            onClick={() => setActiveScreen(screen.id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap",
              activeScreen === screen.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary",
            )}
          >
            <Monitor className="h-3.5 w-3.5" />
            {screen.name}
            {screen.categories?.length ? (
              <span className="opacity-60">({screen.categories.join(", ")})</span>
            ) : null}
          </button>
        ))}
        <button
          onClick={() => setSettingsOpen(true)}
          className="ml-1 flex items-center gap-1 px-2 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Order board */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-60 text-muted-foreground text-sm">Loading orders…</div>
        ) : !visibleOrders.length ? (
          <div className="flex flex-col items-center justify-center h-60 gap-3 text-muted-foreground">
            <ChefHat className="h-12 w-12 opacity-20" />
            <div className="text-center">
              <p className="font-medium">
                {activeScreen === "all" ? "Kitchen is clear" : `No orders for this screen`}
              </p>
              <p className="text-sm mt-1">
                {activeScreen === "all"
                  ? "No pending orders at this time"
                  : "No active orders match this screen's categories"}
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-0 h-full">
            {/* Pending */}
            <div className="border-r border-border flex flex-col overflow-hidden">
              <div className="px-4 py-3 bg-amber-500/5 border-b border-amber-500/20 shrink-0">
                <p className="text-sm font-semibold text-amber-400 flex items-center gap-2">
                  <Clock className="h-4 w-4" /> Pending ({pending.length})
                </p>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {pending.map((o) => (
                  <KitchenCard key={o.id} order={o} onStatusChange={handleStatusChange} filteredItems={(o as any)._filteredItems} />
                ))}
              </div>
            </div>

            {/* Preparing */}
            <div className="border-r border-border flex flex-col overflow-hidden">
              <div className="px-4 py-3 bg-blue-500/5 border-b border-blue-500/20 shrink-0">
                <p className="text-sm font-semibold text-blue-400 flex items-center gap-2">
                  <ChefHat className="h-4 w-4" /> Preparing ({preparing.length})
                </p>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {preparing.map((o) => (
                  <KitchenCard key={o.id} order={o} onStatusChange={handleStatusChange} filteredItems={(o as any)._filteredItems} />
                ))}
              </div>
            </div>

            {/* Ready */}
            <div className="flex flex-col overflow-hidden">
              <div className="px-4 py-3 bg-emerald-500/5 border-b border-emerald-500/20 shrink-0">
                <p className="text-sm font-semibold text-emerald-400 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" /> Ready ({ready.length})
                </p>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {ready.map((o) => (
                  <KitchenCard key={o.id} order={o} onStatusChange={handleStatusChange} filteredItems={(o as any)._filteredItems} />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <KdsSettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        screens={screens}
        onRefresh={refetchScreens}
      />

      {/* ── Clear All Confirmation ─────────────────────────── */}
      <Dialog open={clearConfirmOpen} onOpenChange={setClearConfirmOpen}>
        <DialogContent className="max-w-sm" style={{ background: "#0f1729", border: "1px solid rgba(239,68,68,0.25)" }}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <AlertTriangle className="h-5 w-5 text-red-400" />
              Clear All Kitchen Orders?
            </DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <p className="text-slate-400 text-sm leading-relaxed">
              This will mark all <span className="text-white font-semibold">{visibleOrders.length} active order{visibleOrders.length === 1 ? "" : "s"}</span> as completed and remove them from the display.
            </p>
            <p className="text-slate-500 text-xs mt-2">
              Orders are also cleared automatically after 48 hours.
            </p>
          </div>
          <div className="flex gap-3 mt-2">
            <Button
              variant="outline"
              className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-700"
              onClick={() => setClearConfirmOpen(false)}
              disabled={clearing}
            >
              Cancel
            </Button>
            <Button
              className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold"
              onClick={handleClearAll}
              disabled={clearing}
            >
              {clearing ? (
                <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Clearing…</>
              ) : (
                <><Trash2 className="h-4 w-4 mr-2" />Clear All Orders</>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
