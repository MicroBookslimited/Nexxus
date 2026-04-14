import React, { useState, useMemo, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  useListProductionBatches, useCreateProductionBatch, useCompleteProductionBatch,
  useDeleteProductionBatch, useUpdateBatchItemQty,
  type CreateBatchInput,
  useGetProductStockHistory,
} from "@workspace/api-client-react";
import { useListProducts } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Search, Plus, Trash2, Factory, CheckCircle2, Clock, ChevronDown, ChevronUp, X, ChevronsUpDown, FlaskConical, BookOpen, ShoppingCart, History, ArrowDownLeft, ArrowUpRight, RefreshCw, Printer } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Ingredients } from "./ingredients";
import { Recipes } from "./recipes";
import { RawMaterialPurchases } from "./raw-material-purchases";

type Tab = "ingredients" | "recipes" | "batches" | "purchases" | "history";

const TABS: { id: Tab; label: string; icon: React.ElementType; color: string }[] = [
  { id: "ingredients", label: "Ingredients",  icon: FlaskConical, color: "text-lime-400" },
  { id: "recipes",     label: "Recipes",      icon: BookOpen,     color: "text-green-400" },
  { id: "batches",     label: "Batches",      icon: Factory,      color: "text-teal-400" },
  { id: "purchases",   label: "Purchases",    icon: ShoppingCart, color: "text-violet-400" },
  { id: "history",     label: "Item History", icon: History,      color: "text-sky-400" },
];

/* ─── type config for movement badges ─── */
const MOVE_TYPE: Record<string, { label: string; cls: string; dir: "in" | "out" | "adj" }> = {
  sale:          { label: "Sale",        cls: "border-red-400/30 bg-red-400/10 text-red-400",       dir: "out" },
  restock:       { label: "Restock",     cls: "border-green-400/30 bg-green-400/10 text-green-400", dir: "in"  },
  purchase_bill: { label: "Purchase",    cls: "border-blue-400/30 bg-blue-400/10 text-blue-400",    dir: "in"  },
  refund:        { label: "Refund",      cls: "border-teal-400/30 bg-teal-400/10 text-teal-400",    dir: "in"  },
  void:          { label: "Void",        cls: "border-orange-400/30 bg-orange-400/10 text-orange-400", dir: "out" },
  adjustment:    { label: "Adjustment",  cls: "border-amber-400/30 bg-amber-400/10 text-amber-400", dir: "adj" },
  production:    { label: "Production",  cls: "border-purple-400/30 bg-purple-400/10 text-purple-400", dir: "in" },
};

function moveCfg(type: string) {
  return MOVE_TYPE[type] ?? { label: type, cls: "border-border bg-muted text-muted-foreground", dir: "adj" as const };
}

/* ─── InventoryHistory component ─── */
function InventoryHistory({ products }: { products: Array<{ id: number; name: string; barcode?: string | null }> }) {
  const [productId, setProductId] = useState<number | null>(null);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [search, setSearch] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, refetch } = useGetProductStockHistory(productId, { from: fromDate, to: toDate });

  const movements = data?.movements ?? [];
  const openingBalance = movements.length > 0
    ? movements[0].balanceAfter - movements[0].quantity
    : (data?.product.currentStock ?? 0);
  const totalIn  = movements.filter(m => m.quantity > 0).reduce((s, m) => s + m.quantity, 0);
  const totalOut = Math.abs(movements.filter(m => m.quantity < 0).reduce((s, m) => s + m.quantity, 0));
  const closingBalance = movements.length > 0 ? movements[movements.length - 1].balanceAfter : openingBalance;

  const filteredProducts = useMemo(() => {
    const q = search.toLowerCase();
    return products.filter(p => p.name.toLowerCase().includes(q) || (p.barcode ?? "").toLowerCase().includes(q)).slice(0, 60);
  }, [products, search]);

  const selectedProduct = products.find(p => p.id === productId);

  useEffect(() => {
    if (!pickerOpen) return;
    const h = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [pickerOpen]);

  function handlePrint() {
    if (!data) return;
    const rows = movements.map((m, i) => {
      const cfg = moveCfg(m.type);
      const qty = m.quantity;
      const inQty  = qty > 0 ? qty.toString()  : "";
      const outQty = qty < 0 ? Math.abs(qty).toString() : "";
      const ref = [m.referenceType, m.referenceId].filter(Boolean).join(" #") || "—";
      return `<tr style="border-bottom:1px solid #e5e7eb;">
        <td style="padding:4px 8px;font-size:11px">${format(new Date(m.createdAt), "dd/MM/yyyy HH:mm")}</td>
        <td style="padding:4px 8px;font-size:11px">${cfg.label}</td>
        <td style="padding:4px 8px;font-size:11px">${ref}</td>
        <td style="padding:4px 8px;font-size:11px;color:#e5e7eb">${m.notes ?? ""}</td>
        <td style="padding:4px 8px;font-size:11px;text-align:right;color:${inQty ? "#16a34a" : "#6b7280"}">${inQty}</td>
        <td style="padding:4px 8px;font-size:11px;text-align:right;color:${outQty ? "#dc2626" : "#6b7280"}">${outQty}</td>
        <td style="padding:4px 8px;font-size:11px;text-align:right;font-weight:600">${m.balanceAfter}</td>
      </tr>`;
    }).join("");

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Inventory Movement History</title>
    <style>body{font-family:Arial,sans-serif;margin:20px}h1{font-size:18px;margin:0}h2{font-size:14px;margin:4px 0 0}
    .meta{font-size:11px;color:#6b7280;margin:4px 0 16px}table{width:100%;border-collapse:collapse}
    th{background:#f3f4f6;padding:6px 8px;font-size:11px;text-align:left;border-bottom:2px solid #d1d5db}
    .summary{display:flex;gap:24px;margin-bottom:16px;padding:12px;background:#f9fafb;border-radius:6px}
    .s-card{text-align:center}.s-val{font-size:20px;font-weight:700}.s-lbl{font-size:10px;color:#6b7280}
    </style></head><body>
    <h1>Inventory Movement History</h1>
    <h2>${data.product.name}</h2>
    <div class="meta">
      ${fromDate || toDate ? `Date Range: ${fromDate || "start"} → ${toDate || "today"}` : "All dates"}
      &nbsp;|&nbsp; Run Date: ${format(new Date(), "dd/MM/yyyy h:mm a")}
    </div>
    <div class="summary">
      <div class="s-card"><div class="s-val">${openingBalance}</div><div class="s-lbl">Opening Balance</div></div>
      <div class="s-card"><div class="s-val" style="color:#16a34a">+${totalIn}</div><div class="s-lbl">Total In</div></div>
      <div class="s-card"><div class="s-val" style="color:#dc2626">-${totalOut}</div><div class="s-lbl">Total Out</div></div>
      <div class="s-card"><div class="s-val">${closingBalance}</div><div class="s-lbl">Closing Balance</div></div>
    </div>
    <table><thead><tr>
      <th>Date</th><th>Type</th><th>Reference</th><th>Notes</th><th style="text-align:right">In</th><th style="text-align:right">Out</th><th style="text-align:right">Balance</th>
    </tr></thead><tbody>${rows}</tbody></table>
    <script>window.onload=function(){window.print();window.onafterprint=function(){window.close();};};<\/script>
    </body></html>`;

    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
  }

  return (
    <div className="h-full flex flex-col gap-4 p-4 overflow-auto">
      {/* Controls bar */}
      <div className="flex flex-wrap gap-3 items-end">
        {/* Product picker */}
        <div className="flex-1 min-w-[220px] max-w-xs">
          <Label className="text-xs text-muted-foreground mb-1 block">Product</Label>
          <div className="relative" ref={pickerRef}>
            <button
              onClick={() => setPickerOpen(o => !o)}
              className="w-full flex items-center justify-between gap-2 h-9 px-3 rounded-md border border-border bg-background text-sm text-left hover:bg-secondary/40 transition-colors"
            >
              <span className={selectedProduct ? "text-foreground" : "text-muted-foreground"}>
                {selectedProduct?.name ?? "Select a product…"}
              </span>
              <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </button>
            {pickerOpen && (
              <div className="absolute z-50 top-full left-0 mt-1 w-full rounded-md border border-border bg-card shadow-xl">
                <div className="p-2 border-b border-border">
                  <input
                    autoFocus
                    placeholder="Search product…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full text-sm bg-transparent outline-none placeholder:text-muted-foreground"
                  />
                </div>
                <div className="max-h-56 overflow-y-auto">
                  {filteredProducts.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-4">No products found</p>
                  )}
                  {filteredProducts.map(p => (
                    <button
                      key={p.id}
                      onClick={() => { setProductId(p.id); setPickerOpen(false); setSearch(""); }}
                      className={cn(
                        "w-full text-left px-3 py-2 text-sm hover:bg-secondary/60 transition-colors",
                        p.id === productId && "bg-primary/10 text-primary"
                      )}
                    >
                      <span className="font-medium">{p.name}</span>
                      {p.barcode && <span className="ml-2 text-xs text-muted-foreground font-mono">{p.barcode}</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* From date */}
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">From</Label>
          <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="h-9 w-36 text-sm" />
        </div>

        {/* To date */}
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">To</Label>
          <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="h-9 w-36 text-sm" />
        </div>

        <div className="flex gap-2 pb-0.5">
          <Button variant="outline" size="sm" onClick={() => refetch()} className="h-9 gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
          {data && movements.length > 0 && (
            <Button variant="outline" size="sm" onClick={handlePrint} className="h-9 gap-1.5">
              <Printer className="h-3.5 w-3.5" /> Print
            </Button>
          )}
        </div>
      </div>

      {/* Prompt to select product */}
      {!productId && (
        <div className="flex-1 flex flex-col items-center justify-center text-center text-muted-foreground gap-3">
          <History className="h-12 w-12 opacity-20" />
          <p className="text-sm">Select a product above to view its inventory movement history.</p>
        </div>
      )}

      {/* Loading */}
      {productId && isLoading && (
        <div className="flex-1 flex items-center justify-center">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Content */}
      {productId && !isLoading && data && (
        <>
          {/* Product header */}
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-bold text-foreground">{data.product.name}</h2>
              {(data.product as { sku?: string | null }).sku && (
                <p className="text-xs text-muted-foreground font-mono">SKU: {(data.product as { sku?: string | null }).sku}</p>
              )}
              <p className="text-xs text-muted-foreground mt-0.5">
                {fromDate || toDate
                  ? `${fromDate || "start"} → ${toDate || "today"}`
                  : "All dates"} · {movements.length} movement{movements.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Opening Balance", value: openingBalance, cls: "text-foreground" },
              { label: "Total In",  value: `+${totalIn}`,  cls: "text-green-400" },
              { label: "Total Out", value: `-${totalOut}`, cls: "text-red-400" },
              { label: "Closing Balance", value: closingBalance, cls: "text-primary font-bold" },
            ].map(c => (
              <div key={c.label} className="rounded-lg border border-border bg-card p-3 text-center">
                <p className={cn("text-2xl font-bold tabular-nums", c.cls)}>{c.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{c.label}</p>
              </div>
            ))}
          </div>

          {/* Movements table */}
          {movements.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center text-muted-foreground gap-2 py-12">
              <History className="h-8 w-8 opacity-20" />
              <p className="text-sm">No movements found for this date range.</p>
            </div>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/50 border-b border-border">
                      <th className="text-left font-semibold text-muted-foreground py-2.5 px-3 whitespace-nowrap">Date & Time</th>
                      <th className="text-left font-semibold text-muted-foreground py-2.5 px-3">Type</th>
                      <th className="text-left font-semibold text-muted-foreground py-2.5 px-3">Reference</th>
                      <th className="text-left font-semibold text-muted-foreground py-2.5 px-3">Notes</th>
                      <th className="text-right font-semibold text-muted-foreground py-2.5 px-3">In</th>
                      <th className="text-right font-semibold text-muted-foreground py-2.5 px-3">Out</th>
                      <th className="text-right font-semibold text-muted-foreground py-2.5 px-3 whitespace-nowrap">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Opening balance row */}
                    <tr className="border-b border-border/40 bg-muted/20">
                      <td className="py-2 px-3 text-muted-foreground italic">
                        {movements.length > 0 ? format(new Date(movements[0].createdAt), "dd/MM/yyyy") : "—"}
                      </td>
                      <td className="py-2 px-3">
                        <span className="inline-flex items-center border rounded px-1.5 py-0.5 text-[10px] font-medium border-border bg-muted text-muted-foreground">
                          Opening
                        </span>
                      </td>
                      <td colSpan={3} className="py-2 px-3 text-muted-foreground italic">Beginning balance</td>
                      <td></td>
                      <td className="py-2 px-3 text-right font-semibold tabular-nums text-foreground">{openingBalance}</td>
                    </tr>

                    {movements.map(m => {
                      const cfg = moveCfg(m.type);
                      const inQty  = m.quantity > 0 ? m.quantity  : null;
                      const outQty = m.quantity < 0 ? Math.abs(m.quantity) : null;
                      const ref = [m.referenceType, m.referenceId].filter(Boolean).join(" #") || null;
                      return (
                        <tr key={m.id} className="border-b border-border/30 hover:bg-secondary/20 transition-colors">
                          <td className="py-2 px-3 text-muted-foreground whitespace-nowrap">
                            {format(new Date(m.createdAt), "dd/MM/yyyy HH:mm")}
                          </td>
                          <td className="py-2 px-3">
                            <span className={cn("inline-flex items-center gap-1 border rounded px-1.5 py-0.5 text-[10px] font-medium", cfg.cls)}>
                              {cfg.dir === "in"  && <ArrowDownLeft className="h-2.5 w-2.5" />}
                              {cfg.dir === "out" && <ArrowUpRight   className="h-2.5 w-2.5" />}
                              {cfg.label}
                            </span>
                          </td>
                          <td className="py-2 px-3 font-mono text-muted-foreground">{ref ?? "—"}</td>
                          <td className="py-2 px-3 text-muted-foreground max-w-[180px] truncate">{m.notes ?? ""}</td>
                          <td className="py-2 px-3 text-right tabular-nums font-medium text-green-400">
                            {inQty !== null ? `+${inQty}` : ""}
                          </td>
                          <td className="py-2 px-3 text-right tabular-nums font-medium text-red-400">
                            {outQty !== null ? `-${outQty}` : ""}
                          </td>
                          <td className="py-2 px-3 text-right tabular-nums font-semibold text-foreground">{m.balanceAfter}</td>
                        </tr>
                      );
                    })}

                    {/* Totals row */}
                    <tr className="border-t-2 border-border bg-muted/30 font-semibold">
                      <td colSpan={4} className="py-2.5 px-3 text-muted-foreground text-right">Totals</td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-green-400">+{totalIn}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-red-400">-{totalOut}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-primary">{closingBalance}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

type Product = { id: number; name: string };

function ProductCombobox({ value, onChange, products }: {
  value: number | null;
  onChange: (id: number) => void;
  products: Product[];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return products.filter(p => p.name.toLowerCase().includes(q)).slice(0, 50);
  }, [products, search]);

  const selected = products.find(p => p.id === value);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => { setOpen(o => !o); setSearch(""); }}
        className="flex w-full items-center justify-between h-8 rounded-md border border-input bg-background px-2 text-sm text-left transition-colors hover:bg-accent focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <span className={cn("truncate", !selected && "text-muted-foreground")}>
          {selected ? selected.name : "Select product…"}
        </span>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground ml-1" />
      </button>
      {open && (
        <div className="absolute z-[9999] top-full mt-1 w-full min-w-[220px] rounded-md border border-border bg-popover shadow-lg overflow-hidden">
          <div className="p-1.5 border-b border-border">
            <input
              autoFocus
              className="w-full h-7 rounded px-2 text-xs bg-background border border-input focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="Search products…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-xs text-muted-foreground text-center">No products found</p>
            ) : filtered.map(p => (
              <button
                key={p.id}
                type="button"
                className={cn(
                  "w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors",
                  p.id === value && "bg-primary/10 text-primary font-medium",
                )}
                onMouseDown={e => {
                  e.preventDefault();
                  onChange(p.id);
                  setOpen(false);
                  setSearch("");
                }}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function formatCost(val: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(val);
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  draft:     { label: "Draft",     color: "bg-secondary text-secondary-foreground",   icon: Clock },
  completed: { label: "Completed", color: "bg-emerald-500/20 text-emerald-400",       icon: CheckCircle2 },
  cancelled: { label: "Cancelled", color: "bg-destructive/20 text-destructive",       icon: X },
};

function BatchesTab() {
  const { data: batches = [], isLoading } = useListProductionBatches();
  const { data: products = [] } = useListProducts();
  const createBatch = useCreateProductionBatch();
  const completeBatch = useCompleteProductionBatch();
  const deleteBatch = useDeleteProductionBatch();
  const updateItemQty = useUpdateBatchItemQty();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [newBatch, setNewBatch] = useState<{ notes: string; items: Array<{ productId: number | null; quantityPlanned: number; unit: string }> }>({
    notes: "",
    items: [{ productId: null, quantityPlanned: 1, unit: "pcs" }],
  });
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [completeId, setCompleteId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const filtered = useMemo(() =>
    batches.filter(b => b.batchNumber.toLowerCase().includes(search.toLowerCase())),
    [batches, search]);

  function addItem() {
    setNewBatch(p => ({ ...p, items: [...p.items, { productId: null, quantityPlanned: 1, unit: "pcs" }] }));
  }

  function removeItem(idx: number) {
    setNewBatch(p => ({ ...p, items: p.items.filter((_, i) => i !== idx) }));
  }

  function updateItem(idx: number, field: string, value: unknown) {
    setNewBatch(p => ({ ...p, items: p.items.map((item, i) => i === idx ? { ...item, [field]: value } : item) }));
  }

  async function handleCreate() {
    const validItems = newBatch.items.filter(i => i.productId !== null && i.quantityPlanned > 0);
    if (validItems.length === 0) return;
    const payload: CreateBatchInput = {
      notes: newBatch.notes || undefined,
      items: validItems.map(i => ({ productId: i.productId!, quantityPlanned: i.quantityPlanned, unit: i.unit })),
    };
    await createBatch.mutateAsync(payload);
    toast({ title: "Production batch created" });
    setCreateOpen(false);
    setNewBatch({ notes: "", items: [{ productId: null, quantityPlanned: 1, unit: "pcs" }] });
  }

  async function handleComplete() {
    if (!completeId) return;
    await completeBatch.mutateAsync(completeId);
    toast({ title: "Batch completed", description: "Ingredients have been deducted from stock" });
    setCompleteId(null);
  }

  async function handleDelete() {
    if (!deleteId) return;
    await deleteBatch.mutateAsync(deleteId);
    toast({ title: "Batch deleted" });
    setDeleteId(null);
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 h-full overflow-y-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Factory className="h-5 w-5 text-teal-400" /> Production Batches
          </h2>
          <p className="text-muted-foreground text-sm mt-0.5">Create batch production runs to manufacture finished products</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} size="sm">
          <Plus className="h-4 w-4 mr-1.5" /> New Batch
        </Button>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search batches…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-60 gap-3 text-muted-foreground">
          <Factory className="h-12 w-12 opacity-20" />
          <p className="text-sm text-center">
            {search ? "No batches match your search" : "No production batches yet. Create one to get started."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence>
            {filtered.map(batch => {
              const cfg = STATUS_CONFIG[batch.status] ?? STATUS_CONFIG.draft;
              const expanded = expandedId === batch.id;
              return (
                <motion.div key={batch.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <Card>
                    <CardContent className="p-0">
                      <div
                        className="flex items-center justify-between gap-4 p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                        onClick={() => setExpandedId(expanded ? null : batch.id)}
                      >
                        <div className="flex items-center gap-3">
                          <div>
                            <p className="font-medium text-sm font-mono">{batch.batchNumber}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {batch.items.length} product{batch.items.length !== 1 ? "s" : ""}
                              {batch.completedAt ? ` · Completed ${format(new Date(batch.completedAt), "dd/MM/yyyy")}` : ""}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <Badge className={cn("text-xs", cfg.color)}>{cfg.label}</Badge>
                          {batch.totalCost != null && (
                            <span className="text-sm font-semibold text-primary">{formatCost(batch.totalCost)}</span>
                          )}
                          <div className="flex gap-1">
                            {batch.status === "draft" && (
                              <>
                                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={e => { e.stopPropagation(); setCompleteId(batch.id); }}>
                                  <CheckCircle2 className="h-3 w-3 mr-1" /> Complete
                                </Button>
                                <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive hover:text-destructive" onClick={e => { e.stopPropagation(); setDeleteId(batch.id); }}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            )}
                          </div>
                          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                        </div>
                      </div>

                      <AnimatePresence>
                        {expanded && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden">
                            <Separator />
                            <div className="p-4 space-y-3">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="text-xs text-muted-foreground">
                                    <th className="text-left font-medium pb-2">Product</th>
                                    <th className="text-right font-medium pb-2">Planned</th>
                                    <th className="text-right font-medium pb-2">Produced</th>
                                    <th className="text-right font-medium pb-2">Cost</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {batch.items.map(item => (
                                    <tr key={item.id} className="border-t border-border/50">
                                      <td className="py-1.5">{item.productName}</td>
                                      <td className="text-right py-1.5 font-mono">{item.quantityPlanned} {item.unit}</td>
                                      <td className="text-right py-1.5 font-mono">
                                        {batch.status === "draft" ? (
                                          <Input
                                            className="h-6 w-20 text-xs text-right ml-auto"
                                            type="number"
                                            min="0"
                                            step="0.001"
                                            defaultValue={item.quantityProduced ?? item.quantityPlanned}
                                            onBlur={e => {
                                              const v = parseFloat(e.target.value);
                                              if (!isNaN(v) && v !== (item.quantityProduced ?? item.quantityPlanned)) {
                                                updateItemQty.mutate({ batchId: batch.id, itemId: item.id, quantityProduced: v });
                                              }
                                            }}
                                            onClick={e => e.stopPropagation()}
                                          />
                                        ) : (
                                          <>{item.quantityProduced ?? item.quantityPlanned} {item.unit}</>
                                        )}
                                      </td>
                                      <td className="text-right py-1.5 font-mono">
                                        {item.costCalculated != null ? formatCost(item.costCalculated) : "—"}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                                {batch.totalCost != null && (
                                  <tfoot>
                                    <tr className="border-t-2 border-border font-semibold">
                                      <td colSpan={3} className="pt-2 text-xs text-muted-foreground">Total batch cost</td>
                                      <td className="text-right pt-2 text-primary">{formatCost(batch.totalCost)}</td>
                                    </tr>
                                  </tfoot>
                                )}
                              </table>
                              {batch.notes && <p className="text-xs text-muted-foreground italic">{batch.notes}</p>}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Production Batch</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea rows={2} value={newBatch.notes} onChange={e => setNewBatch(p => ({ ...p, notes: e.target.value }))} placeholder="Optional batch notes…" />
            </div>
            <Separator />
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base">Products to Produce</Label>
                <Button size="sm" variant="outline" onClick={addItem}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Product
                </Button>
              </div>
              {newBatch.items.map((item, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_100px_auto] gap-2 items-end">
                  <div className="space-y-1">
                    {idx === 0 && <Label className="text-xs text-muted-foreground">Product</Label>}
                    <ProductCombobox
                      value={item.productId}
                      onChange={id => updateItem(idx, "productId", id)}
                      products={products}
                    />
                  </div>
                  <div className="space-y-1">
                    {idx === 0 && <Label className="text-xs text-muted-foreground">Quantity</Label>}
                    <Input
                      className="h-8 text-sm"
                      type="number"
                      min="0.001"
                      step="0.001"
                      value={item.quantityPlanned}
                      onChange={e => updateItem(idx, "quantityPlanned", parseFloat(e.target.value) || 1)}
                    />
                  </div>
                  <div>
                    {idx === 0 && <div className="text-xs text-transparent select-none">X</div>}
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground" onClick={() => removeItem(idx)} disabled={newBatch.items.length === 1}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={newBatch.items.every(i => !i.productId) || createBatch.isPending}>
              Create Batch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!completeId} onOpenChange={open => !open && setCompleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Complete Batch?</AlertDialogTitle>
            <AlertDialogDescription>
              This will deduct ingredients from stock based on the recipes for each product and mark the batch as completed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleComplete}>Complete & Deduct</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Batch?</AlertDialogTitle>
            <AlertDialogDescription>This draft batch will be permanently deleted.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function Production() {
  const [activeTab, setActiveTab] = useState<Tab>("ingredients");
  const { data: allProducts = [] } = useListProducts();

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="shrink-0 flex items-center gap-1 px-4 sm:px-6 pt-4 border-b border-border pb-0">
        <div className="flex items-center gap-1 -mb-px">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium rounded-t-md border-b-2 transition-all",
                  active
                    ? "border-primary text-foreground bg-primary/5"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:bg-secondary/40",
                )}
              >
                <Icon className={cn("h-4 w-4", active ? tab.color : "text-muted-foreground")} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "ingredients" && <Ingredients />}
        {activeTab === "recipes"     && <Recipes />}
        {activeTab === "batches"     && <BatchesTab />}
        {activeTab === "purchases"   && <RawMaterialPurchases />}
        {activeTab === "history"     && <InventoryHistory products={allProducts} />}
      </div>
    </div>
  );
}
