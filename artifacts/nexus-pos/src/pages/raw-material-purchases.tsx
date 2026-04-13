import React, { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  useListRawMaterialPurchases, useCreateRawMaterialPurchase, useConfirmRawMaterialPurchase,
  useDeleteRawMaterialPurchase, useListUnits, useListVendors, useListIngredients,
  type RawMaterialPurchase, type CreatePurchaseItemInput, type UnitOfMeasurement, type Ingredient,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Plus, Trash2, ShoppingCart, CheckCircle2, Clock, ChevronDown, ChevronUp, ArrowRight, Info } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

function fmtCurrency(n: number) {
  return new Intl.NumberFormat("en-JM", { style: "currency", currency: "JMD", minimumFractionDigits: 2 }).format(n);
}

function fmtQty(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(4).replace(/\.?0+$/, "");
}

/* ─── Unit selector grouped by base unit ─────────── */
function UnitSelect({ value, onChange, units }: {
  value: string;
  onChange: (symbol: string, factor: number, base: "pcs" | "g" | "ml") => void;
  units: UnitOfMeasurement[];
}) {
  const grouped = useMemo(() => {
    const map: Record<string, UnitOfMeasurement[]> = { pcs: [], g: [], ml: [] };
    units.forEach(u => { (map[u.baseUnit] ?? []).push(u); });
    return map;
  }, [units]);

  const BASE_LABELS: Record<string, string> = { pcs: "Count / Pieces", g: "Weight", ml: "Volume" };

  return (
    <Select value={value} onValueChange={sym => {
      const u = units.find(u => u.symbol === sym);
      if (u) onChange(u.symbol, u.conversionFactor, u.baseUnit as "pcs" | "g" | "ml");
    }}>
      <SelectTrigger className="h-9 bg-secondary/40 border-border">
        <SelectValue placeholder="Purchase unit" />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(grouped).map(([base, list]) =>
          list.length > 0 ? (
            <React.Fragment key={base}>
              <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{BASE_LABELS[base]}</div>
              {list.map(u => (
                <SelectItem key={u.symbol} value={u.symbol}>
                  {u.name} ({u.symbol}) — {fmtQty(u.conversionFactor)} {u.baseUnit}
                </SelectItem>
              ))}
              <Separator className="my-1" />
            </React.Fragment>
          ) : null
        )}
      </SelectContent>
    </Select>
  );
}

/* ─── Purchase row form item ─────────── */
type DraftItem = {
  ingredientId: number;
  ingredientName: string;
  ingredientBaseUnit: string;
  purchaseUnit: string;
  purchaseQty: string;
  conversionFactor: number;
  baseUnit: "pcs" | "g" | "ml";
  unitCost: string;
};

function emptyItem(): DraftItem {
  return { ingredientId: 0, ingredientName: "", ingredientBaseUnit: "pcs", purchaseUnit: "pcs", purchaseQty: "", conversionFactor: 1, baseUnit: "pcs", unitCost: "" };
}

/* ─── Main component ─────────────────── */
export function RawMaterialPurchases() {
  const { data: purchases = [], isLoading } = useListRawMaterialPurchases();
  const { data: units = [] } = useListUnits();
  const { data: vendors = [] } = useListVendors();
  const { data: ingredients = [] } = useListIngredients();
  const createPurchase = useCreateRawMaterialPurchase();
  const confirmPurchase = useConfirmRawMaterialPurchase();
  const deletePurchase = useDeleteRawMaterialPurchase();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  // New purchase form state
  const [vendorId, setVendorId] = useState<string>("none");
  const [invoiceRef, setInvoiceRef] = useState("");
  const [purchaseDate, setPurchaseDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<DraftItem[]>([emptyItem()]);

  const filtered = useMemo(() =>
    purchases.filter(p =>
      p.purchaseNumber.toLowerCase().includes(search.toLowerCase()) ||
      (p.vendorName || "").toLowerCase().includes(search.toLowerCase()) ||
      (p.invoiceRef || "").toLowerCase().includes(search.toLowerCase())
    ), [purchases, search]);

  function resetForm() {
    setVendorId("none");
    setInvoiceRef("");
    setPurchaseDate(format(new Date(), "yyyy-MM-dd"));
    setNotes("");
    setItems([emptyItem()]);
  }

  function addItem() { setItems(p => [...p, emptyItem()]); }
  function removeItem(i: number) { setItems(p => p.filter((_, idx) => idx !== i)); }

  function updateItem(i: number, patch: Partial<DraftItem>) {
    setItems(p => p.map((item, idx) => idx === i ? { ...item, ...patch } : item));
  }

  function selectIngredient(i: number, ing: Ingredient) {
    updateItem(i, {
      ingredientId: ing.id,
      ingredientName: ing.name,
      ingredientBaseUnit: ing.unit,
    });
  }

  const totalCost = useMemo(() =>
    items.reduce((s, it) => {
      const qty = parseFloat(it.purchaseQty) || 0;
      const cost = parseFloat(it.unitCost) || 0;
      return s + qty * cost;
    }, 0), [items]);

  async function handleCreate() {
    const validItems = items.filter(it => it.ingredientId > 0 && parseFloat(it.purchaseQty) > 0);
    if (validItems.length === 0) {
      toast({ title: "Add at least one item", variant: "destructive" });
      return;
    }

    const payload: CreatePurchaseItemInput[] = validItems.map(it => ({
      ingredientId: it.ingredientId,
      purchaseUnit: it.purchaseUnit,
      purchaseQty: parseFloat(it.purchaseQty),
      conversionFactor: it.conversionFactor,
      baseUnit: it.baseUnit,
      unitCost: parseFloat(it.unitCost) || 0,
    }));

    try {
      await createPurchase.mutateAsync({
        vendorId: vendorId !== "none" ? parseInt(vendorId) : undefined,
        purchaseDate,
        invoiceRef: invoiceRef || undefined,
        notes: notes || undefined,
        items: payload,
      });
      toast({ title: "Purchase order created (Draft)" });
      setCreateOpen(false);
      resetForm();
    } catch {
      toast({ title: "Failed to create purchase", variant: "destructive" });
    }
  }

  async function handleConfirm(id: number) {
    try {
      await confirmPurchase.mutateAsync(id);
      toast({ title: "Purchase confirmed — stock updated!" });
    } catch (e: any) {
      toast({ title: e?.message || "Failed to confirm", variant: "destructive" });
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    try {
      await deletePurchase.mutateAsync(deleteId);
      toast({ title: "Purchase deleted" });
    } catch {
      toast({ title: "Failed to delete", variant: "destructive" });
    }
    setDeleteId(null);
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="shrink-0 flex flex-wrap items-center gap-3 px-4 sm:px-6 py-4 border-b border-border">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search purchases…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9 bg-secondary/40 border-border"
          />
        </div>
        <Button size="sm" onClick={() => { resetForm(); setCreateOpen(true); }} className="gap-1.5 bg-primary hover:bg-primary/90">
          <Plus className="h-4 w-4" />
          New Purchase
        </Button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-3">
        {isLoading ? (
          <div className="text-center text-muted-foreground text-sm py-20">Loading purchases…</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
            <ShoppingCart className="h-12 w-12 opacity-20" />
            <p className="text-sm">{search ? "No matching purchases." : "No purchases yet."}</p>
            {!search && <Button size="sm" variant="outline" onClick={() => { resetForm(); setCreateOpen(true); }}>Create First Purchase</Button>}
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {filtered.map(p => {
              const isExpanded = expandedId === p.id;
              return (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.15 }}
                >
                  <Card className={cn("bg-secondary/30 border-border", p.status === "confirmed" && "border-emerald-500/30")}>
                    <CardContent className="p-0">
                      {/* Header row */}
                      <div
                        className="flex items-center gap-3 p-4 cursor-pointer select-none"
                        onClick={() => setExpandedId(isExpanded ? null : p.id)}
                      >
                        <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <ShoppingCart className="h-4 w-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm">{p.purchaseNumber}</span>
                            {p.invoiceRef && <span className="text-xs text-muted-foreground">#{p.invoiceRef}</span>}
                            <Badge variant="outline" className={cn("text-xs", p.status === "confirmed" ? "border-emerald-500 text-emerald-400" : "border-amber-500 text-amber-400")}>
                              {p.status === "confirmed" ? <CheckCircle2 className="h-3 w-3 mr-1" /> : <Clock className="h-3 w-3 mr-1" />}
                              {p.status}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
                            <span>{format(new Date(p.purchaseDate), "dd/MM/yyyy")}</span>
                            {p.vendorName && <span>· {p.vendorName}</span>}
                            <span>· {p.items.length} item{p.items.length !== 1 ? "s" : ""}</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-bold text-sm">{fmtCurrency(p.totalCost)}</p>
                          <p className="text-xs text-muted-foreground">total cost</p>
                        </div>
                        {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
                      </div>

                      {/* Expanded detail */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <Separator />
                            <div className="p-4">
                              <Table>
                                <TableHeader>
                                  <TableRow className="border-border hover:bg-transparent">
                                    <TableHead className="text-xs">Ingredient</TableHead>
                                    <TableHead className="text-xs text-right">Purchased</TableHead>
                                    <TableHead className="text-xs text-center">→</TableHead>
                                    <TableHead className="text-xs text-right">Stock Added</TableHead>
                                    <TableHead className="text-xs text-right">Unit Cost</TableHead>
                                    <TableHead className="text-xs text-right">Total</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {p.items.map(item => (
                                    <TableRow key={item.id} className="border-border">
                                      <TableCell className="text-sm font-medium">{item.ingredientName}</TableCell>
                                      <TableCell className="text-sm text-right text-blue-400">
                                        {fmtQty(item.purchaseQty)} <span className="text-muted-foreground">{item.purchaseUnit}</span>
                                      </TableCell>
                                      <TableCell className="text-center">
                                        <ArrowRight className="h-3 w-3 text-muted-foreground mx-auto" />
                                      </TableCell>
                                      <TableCell className="text-sm text-right text-emerald-400">
                                        {fmtQty(item.baseQty)} <span className="text-muted-foreground">{item.baseUnit}</span>
                                      </TableCell>
                                      <TableCell className="text-sm text-right">{fmtCurrency(item.unitCost)}</TableCell>
                                      <TableCell className="text-sm text-right font-medium">{fmtCurrency(item.totalCost)}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>

                              {p.notes && (
                                <p className="text-xs text-muted-foreground mt-3 italic">Note: {p.notes}</p>
                              )}

                              {/* Conversion summary */}
                              <div className="mt-3 rounded-md bg-blue-500/5 border border-blue-500/20 p-3">
                                <div className="flex items-center gap-1.5 text-xs text-blue-400 font-medium mb-1.5">
                                  <Info className="h-3.5 w-3.5" />
                                  Unit Conversion Summary
                                </div>
                                <div className="space-y-1">
                                  {p.items.map(item => (
                                    <div key={item.id} className="text-xs text-muted-foreground flex items-center gap-1.5">
                                      <span className="font-medium text-foreground">{item.ingredientName}:</span>
                                      <span className="text-blue-400">{fmtQty(item.purchaseQty)} {item.purchaseUnit}</span>
                                      <ArrowRight className="h-3 w-3" />
                                      <span className="text-emerald-400">{fmtQty(item.baseQty)} {item.baseUnit}</span>
                                      <span className="text-muted-foreground/60">(×{item.conversionFactor})</span>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              <div className="flex justify-end gap-2 mt-4">
                                {p.status === "draft" && (
                                  <>
                                    <Button
                                      size="sm" variant="outline"
                                      className="text-destructive border-destructive/50 hover:bg-destructive/10"
                                      onClick={() => setDeleteId(p.id)}
                                    >
                                      <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete Draft
                                    </Button>
                                    <Button
                                      size="sm"
                                      className="bg-emerald-600 hover:bg-emerald-700"
                                      onClick={() => handleConfirm(p.id)}
                                      disabled={confirmPurchase.isPending}
                                    >
                                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Confirm & Update Stock
                                    </Button>
                                  </>
                                )}
                              </div>
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
        )}
      </div>

      {/* Create Purchase Dialog */}
      <Dialog open={createOpen} onOpenChange={o => { setCreateOpen(o); if (!o) resetForm(); }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Raw Material Purchase</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            {/* Vendor, date, invoice */}
            <div className="grid sm:grid-cols-3 gap-3">
              <div className="grid gap-1.5">
                <Label>Vendor</Label>
                <Select value={vendorId} onValueChange={setVendorId}>
                  <SelectTrigger className="h-9 bg-secondary/40 border-border">
                    <SelectValue placeholder="Select vendor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No vendor</SelectItem>
                    {vendors.map(v => <SelectItem key={v.id} value={String(v.id)}>{v.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Purchase Date</Label>
                <Input type="date" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} className="h-9 bg-secondary/40 border-border" />
              </div>
              <div className="grid gap-1.5">
                <Label>Invoice / Ref #</Label>
                <Input value={invoiceRef} onChange={e => setInvoiceRef(e.target.value)} placeholder="INV-001" className="h-9 bg-secondary/40 border-border" />
              </div>
            </div>

            <Separator />

            {/* Items */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <Label className="text-sm font-semibold">Purchase Items</Label>
                <Button size="sm" variant="outline" onClick={addItem} className="gap-1 h-7">
                  <Plus className="h-3.5 w-3.5" /> Add Item
                </Button>
              </div>

              <div className="space-y-4">
                {items.map((item, i) => {
                  const qty = parseFloat(item.purchaseQty) || 0;
                  const factor = item.conversionFactor;
                  const baseQty = qty * factor;

                  return (
                    <div key={i} className="rounded-lg border border-border bg-secondary/20 p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Item {i + 1}</span>
                        {items.length > 1 && (
                          <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive/70 hover:text-destructive" onClick={() => removeItem(i)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>

                      {/* Ingredient select */}
                      <div className="grid gap-1.5 mb-2">
                        <Label className="text-xs">Ingredient <span className="text-destructive">*</span></Label>
                        <Select
                          value={item.ingredientId ? String(item.ingredientId) : ""}
                          onValueChange={id => {
                            const ing = ingredients.find(x => x.id === parseInt(id));
                            if (ing) selectIngredient(i, ing);
                          }}
                        >
                          <SelectTrigger className="h-9 bg-secondary/40 border-border">
                            <SelectValue placeholder="Select ingredient" />
                          </SelectTrigger>
                          <SelectContent>
                            {ingredients.map(ing => (
                              <SelectItem key={ing.id} value={String(ing.id)}>
                                {ing.name} <span className="text-muted-foreground text-xs">({ing.unit})</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {/* Purchase unit */}
                        <div className="grid gap-1.5 col-span-2 sm:col-span-1">
                          <Label className="text-xs">Purchase Unit</Label>
                          <UnitSelect
                            value={item.purchaseUnit}
                            units={units}
                            onChange={(sym, factor, base) => updateItem(i, { purchaseUnit: sym, conversionFactor: factor, baseUnit: base })}
                          />
                        </div>

                        {/* Qty purchased */}
                        <div className="grid gap-1.5">
                          <Label className="text-xs">Qty Purchased</Label>
                          <Input
                            type="number" min={0} step="any"
                            value={item.purchaseQty}
                            onChange={e => updateItem(i, { purchaseQty: e.target.value })}
                            placeholder="0"
                            className="h-9 bg-secondary/40 border-border"
                          />
                        </div>

                        {/* Unit cost */}
                        <div className="grid gap-1.5">
                          <Label className="text-xs">Cost / Unit (JMD)</Label>
                          <Input
                            type="number" min={0} step="any"
                            value={item.unitCost}
                            onChange={e => updateItem(i, { unitCost: e.target.value })}
                            placeholder="0.00"
                            className="h-9 bg-secondary/40 border-border"
                          />
                        </div>

                        {/* Converted qty — read only */}
                        <div className="grid gap-1.5">
                          <Label className="text-xs">Stock to Add</Label>
                          <div className="h-9 rounded-md bg-emerald-500/10 border border-emerald-500/30 flex items-center px-3 text-sm text-emerald-400 font-medium">
                            {qty > 0 ? `${fmtQty(baseQty)} ${item.baseUnit}` : "—"}
                          </div>
                        </div>
                      </div>

                      {/* Conversion hint */}
                      {qty > 0 && (
                        <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Info className="h-3 w-3 shrink-0" />
                          <span>
                            {fmtQty(qty)} {item.purchaseUnit} × {fmtQty(factor)} = {" "}
                            <span className="text-emerald-400 font-medium">{fmtQty(baseQty)} {item.baseUnit}</span> will be added to stock
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <Separator />

            <div className="grid gap-1.5">
              <Label>Notes</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Delivery notes, terms…" rows={2} />
            </div>

            {/* Total */}
            <div className="flex items-center justify-between rounded-lg bg-primary/10 border border-primary/20 px-4 py-3">
              <span className="font-medium text-sm">Total Purchase Cost</span>
              <span className="font-bold text-lg text-primary">{fmtCurrency(totalCost)}</span>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setCreateOpen(false); resetForm(); }}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createPurchase.isPending}>
              Save as Draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Purchase Draft?</AlertDialogTitle>
            <AlertDialogDescription>This draft purchase order will be permanently deleted. Stock has not been updated.</AlertDialogDescription>
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
