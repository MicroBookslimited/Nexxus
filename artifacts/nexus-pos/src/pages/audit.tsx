import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, RefreshCw, Search, Filter, X } from "lucide-react";
import { fetchAuditLogs, type AuditLog } from "@/lib/saas-api";

const ACTION_LABELS: Record<string, string> = {
  "order.sale":        "Sale",
  "order.void":        "Order Void",
  "order.refund":      "Refund",
  "cash.open":         "Cash Open",
  "cash.close":        "Cash Close",
  "cash.payout":       "Cash Payout",
  "product.create":    "Product Created",
  "product.update":    "Product Updated",
  "product.delete":    "Product Deleted",
  "staff.create":      "Staff Created",
  "staff.update":      "Staff Updated",
  "staff.delete":      "Staff Deleted",
};

const ENTITY_COLORS: Record<string, string> = {
  order:   "bg-emerald-500/10 text-emerald-400",
  cash:    "bg-yellow-500/10 text-yellow-400",
  product: "bg-teal-500/10 text-teal-400",
  staff:   "bg-indigo-500/10 text-indigo-400",
};

const ACTION_OPTIONS = [
  { value: "", label: "All Actions" },
  { value: "order.sale",     label: "Sales" },
  { value: "order.void",     label: "Voids" },
  { value: "order.refund",   label: "Refunds" },
  { value: "cash.open",      label: "Cash Open" },
  { value: "cash.close",     label: "Cash Close" },
  { value: "cash.payout",    label: "Payouts" },
  { value: "product.create", label: "Product Create" },
  { value: "product.update", label: "Product Update" },
  { value: "product.delete", label: "Product Delete" },
  { value: "staff.create",   label: "Staff Create" },
  { value: "staff.update",   label: "Staff Update" },
  { value: "staff.delete",   label: "Staff Delete" },
];

export function AuditTrail() {
  const [action, setAction]       = useState("");
  const [q, setQ]                 = useState("");
  const [from, setFrom]           = useState("");
  const [to, setTo]               = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const params = { action: action || undefined, q: q || undefined, from: from || undefined, to: to || undefined };

  const { data: logs = [], isLoading, refetch } = useQuery<AuditLog[]>({
    queryKey: ["audit-logs", params],
    queryFn:  () => fetchAuditLogs(params),
    staleTime: 0,
    refetchOnMount: "always",
  });

  const clearFilters = () => { setAction(""); setQ(""); setFrom(""); setTo(""); };
  const hasFilters = action || q || from || to;

  return (
    <div className="h-full flex flex-col bg-background text-foreground overflow-hidden">

      {/* Header */}
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <ClipboardList size={18} className="text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold">Audit Trail</h1>
            <p className="text-xs text-muted-foreground">{logs.length} event{logs.length !== 1 ? "s" : ""}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFiltersOpen(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
              filtersOpen || hasFilters
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground hover:border-border"
            }`}
          >
            <Filter size={13} />
            Filters
            {hasFilters && (
              <span className="ml-1 text-[10px] bg-primary text-primary-foreground rounded-full w-4 h-4 flex items-center justify-center">!</span>
            )}
          </button>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw size={13} className={isLoading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Filters panel */}
      {filtersOpen && (
        <div className="shrink-0 flex flex-wrap items-end gap-3 px-4 sm:px-6 py-3 bg-card border-b border-border">
          {/* Search */}
          <div className="flex items-center gap-2 flex-1 min-w-36 bg-background border border-border rounded-lg px-3 py-1.5">
            <Search size={13} className="text-muted-foreground shrink-0" />
            <input
              className="bg-transparent text-sm flex-1 outline-none placeholder:text-muted-foreground"
              placeholder="Search…"
              value={q}
              onChange={e => setQ(e.target.value)}
            />
          </div>
          {/* Action */}
          <select
            value={action}
            onChange={e => setAction(e.target.value)}
            className="bg-background border border-border rounded-lg px-3 py-1.5 text-sm text-foreground"
          >
            {ACTION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {/* Date range */}
          <input
            type="date"
            value={from}
            onChange={e => setFrom(e.target.value)}
            className="bg-background border border-border rounded-lg px-3 py-1.5 text-sm text-foreground"
          />
          <span className="text-muted-foreground text-xs">to</span>
          <input
            type="date"
            value={to}
            onChange={e => setTo(e.target.value)}
            className="bg-background border border-border rounded-lg px-3 py-1.5 text-sm text-foreground"
          />
          {hasFilters && (
            <button onClick={clearFilters} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors">
              <X size={12} /> Clear
            </button>
          )}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground gap-2">
            <RefreshCw size={16} className="animate-spin" /> Loading…
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
            <ClipboardList size={32} className="opacity-30" />
            <p className="text-sm">No audit events found</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {logs.map(log => {
              const entityColor = ENTITY_COLORS[log.entityType ?? ""] ?? "bg-secondary text-secondary-foreground";
              const label = ACTION_LABELS[log.action] ?? log.action;
              const detailStr = log.details
                ? Object.entries(log.details)
                    .slice(0, 3)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(" · ")
                : "";
              return (
                <div key={log.id} className="flex items-start gap-3 px-4 sm:px-6 py-3 hover:bg-card transition-colors">
                  {/* Entity badge */}
                  <span className={`mt-0.5 shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded ${entityColor}`}>
                    {log.entityType ?? "sys"}
                  </span>
                  {/* Main info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="text-sm font-medium text-foreground">{label}</span>
                      {log.staffName && (
                        <span className="text-xs text-muted-foreground">by {log.staffName}</span>
                      )}
                      {log.entityId && (
                        <span className="text-xs text-muted-foreground">#{log.entityId}</span>
                      )}
                    </div>
                    {detailStr && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{detailStr}</p>
                    )}
                  </div>
                  {/* Timestamp */}
                  <span className="shrink-0 text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString()}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
