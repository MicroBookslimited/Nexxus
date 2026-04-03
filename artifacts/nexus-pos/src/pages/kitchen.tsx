import { useListKitchenOrders, useUpdateKitchenOrderStatus } from "@workspace/api-client-react";
import type { KitchenOrder } from "@workspace/api-zod";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { ChefHat, Clock, CheckCircle2, AlertCircle, RefreshCw, UtensilsCrossed } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

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

function KitchenCard({ order, onStatusChange }: { order: KitchenOrder; onStatusChange: (id: number, status: string) => void }) {
  const config = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.pending;
  const age = formatDistanceToNow(new Date(order.createdAt), { addSuffix: false });
  const ageMinutes = Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 60000);
  const isUrgent = ageMinutes >= 10;

  return (
    <div className={cn("rounded-xl bg-card border border-border flex flex-col shadow-sm transition-all", config.headerColor)}>
      <div className="p-4 border-b border-border">
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
                  Table #{order.tableId}
                </Badge>
              )}
              {order.orderType && order.orderType !== "counter" && (
                <Badge variant="outline" className="text-xs capitalize text-muted-foreground">
                  {order.orderType}
                </Badge>
              )}
            </div>
          </div>
          <div className={cn("flex items-center gap-1 text-xs font-mono", isUrgent ? "text-red-400" : "text-muted-foreground")}>
            {isUrgent ? <AlertCircle className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
            {age}
          </div>
        </div>
        {order.notes && (
          <p className="mt-2 text-xs bg-amber-500/10 text-amber-400 rounded px-2 py-1 border border-amber-500/20">
            📝 {order.notes}
          </p>
        )}
      </div>

      <div className="p-4 flex-1 space-y-2">
        {order.items.map((item) => (
          <div key={item.id} className="flex items-start gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-primary/20 text-primary text-xs font-bold">
              {item.quantity}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium leading-snug">{item.productName}</p>
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

      {config.next && (
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

export function Kitchen() {
  const { data: orders, isLoading, refetch } = useListKitchenOrders({ query: { refetchInterval: 15000 } });
  const updateStatus = useUpdateKitchenOrderStatus();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/kitchen"] });

  const handleStatusChange = (id: number, status: string) => {
    updateStatus.mutate(
      { id, data: { status } },
      {
        onSuccess: () => { invalidate(); },
        onError: () => toast({ title: "Error", description: "Could not update order status", variant: "destructive" }),
      },
    );
  };

  const pending = orders?.filter((o) => o.status === "pending") ?? [];
  const preparing = orders?.filter((o) => o.status === "preparing") ?? [];
  const ready = orders?.filter((o) => o.status === "ready") ?? [];

  return (
    <div className="h-full flex flex-col">
      <div className="border-b border-border px-6 py-4 flex items-center justify-between bg-card shrink-0">
        <div className="flex items-center gap-3">
          <ChefHat className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-lg font-bold">Kitchen Display</h1>
            <p className="text-xs text-muted-foreground">Auto-refreshes every 15 seconds</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-3 text-xs">
            <span className="text-amber-400 font-medium">{pending.length} Pending</span>
            <span className="text-blue-400 font-medium">{preparing.length} Preparing</span>
            <span className="text-emerald-400 font-medium">{ready.length} Ready</span>
          </div>
          <Button size="sm" variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-60 text-muted-foreground text-sm">Loading orders…</div>
        ) : !orders?.length ? (
          <div className="flex flex-col items-center justify-center h-60 gap-3 text-muted-foreground">
            <ChefHat className="h-12 w-12 opacity-20" />
            <div className="text-center">
              <p className="font-medium">Kitchen is clear</p>
              <p className="text-sm mt-1">No pending orders at this time</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-0 h-full">
            {/* Pending column */}
            <div className="border-r border-border flex flex-col">
              <div className="px-4 py-3 bg-amber-500/5 border-b border-amber-500/20">
                <p className="text-sm font-semibold text-amber-400 flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Pending ({pending.length})
                </p>
              </div>
              <div className="flex-1 overflow-auto p-4 space-y-3">
                {pending.map((o) => (
                  <KitchenCard key={o.id} order={o} onStatusChange={handleStatusChange} />
                ))}
              </div>
            </div>

            {/* Preparing column */}
            <div className="border-r border-border flex flex-col">
              <div className="px-4 py-3 bg-blue-500/5 border-b border-blue-500/20">
                <p className="text-sm font-semibold text-blue-400 flex items-center gap-2">
                  <ChefHat className="h-4 w-4" />
                  Preparing ({preparing.length})
                </p>
              </div>
              <div className="flex-1 overflow-auto p-4 space-y-3">
                {preparing.map((o) => (
                  <KitchenCard key={o.id} order={o} onStatusChange={handleStatusChange} />
                ))}
              </div>
            </div>

            {/* Ready column */}
            <div className="flex flex-col">
              <div className="px-4 py-3 bg-emerald-500/5 border-b border-emerald-500/20">
                <p className="text-sm font-semibold text-emerald-400 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  Ready ({ready.length})
                </p>
              </div>
              <div className="flex-1 overflow-auto p-4 space-y-3">
                {ready.map((o) => (
                  <KitchenCard key={o.id} order={o} onStatusChange={handleStatusChange} />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
