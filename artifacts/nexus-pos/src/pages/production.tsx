import React, { useState, useMemo, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  useListProductionBatches, useCreateProductionBatch, useCompleteProductionBatch,
  useDeleteProductionBatch, useUpdateBatchItemQty,
  type ProductionBatch, type CreateBatchInput,
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
import { Search, Plus, Trash2, Factory, CheckCircle2, Clock, ChevronDown, ChevronUp, X, ChevronsUpDown } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

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
  draft: { label: "Draft", color: "bg-secondary text-secondary-foreground", icon: Clock },
  completed: { label: "Completed", color: "bg-emerald-500/20 text-emerald-400", icon: CheckCircle2 },
  cancelled: { label: "Cancelled", color: "bg-destructive/20 text-destructive", icon: X },
};

export function Production() {
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
      items: validItems.map(i => ({
        productId: i.productId!,
        quantityPlanned: i.quantityPlanned,
        unit: i.unit,
      })),
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
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Factory className="h-6 w-6 text-primary" /> Production
          </h1>
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

      {/* Complete confirm */}
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

      {/* Delete confirm */}
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
