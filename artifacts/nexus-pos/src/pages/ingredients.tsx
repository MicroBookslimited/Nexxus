import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  useListIngredients, useCreateIngredient, useUpdateIngredient,
  useDeleteIngredient, useAdjustIngredientStock,
  type Ingredient,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Plus, Pencil, Trash2, PackagePlus, TrendingDown, AlertTriangle, FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";

const UNITS = ["pcs", "g", "kg", "ml", "l"] as const;

function formatCost(val: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(val);
}

function formatQty(val: number, unit: string) {
  return `${Number.isInteger(val) ? val : val.toFixed(2)} ${unit}`;
}

const EMPTY: Partial<Ingredient> = { name: "", unit: "pcs", costPerUnit: 0, stockQuantity: 0, minStockLevel: 0, category: "", notes: "" };

export function Ingredients() {
  const { data: ingredients = [], isLoading } = useListIngredients();
  const createIngredient = useCreateIngredient();
  const updateIngredient = useUpdateIngredient();
  const deleteIngredient = useDeleteIngredient();
  const adjustStock = useAdjustIngredientStock();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Ingredient> | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustTarget, setAdjustTarget] = useState<Ingredient | null>(null);
  const [adjustQty, setAdjustQty] = useState<string>("");
  const [adjustReason, setAdjustReason] = useState("");

  const filtered = useMemo(() =>
    ingredients.filter(i =>
      i.name.toLowerCase().includes(search.toLowerCase()) ||
      (i.category || "").toLowerCase().includes(search.toLowerCase())
    ), [ingredients, search]);

  const lowStock = ingredients.filter(i => i.minStockLevel > 0 && i.stockQuantity <= i.minStockLevel);

  function openNew() {
    setEditing({ ...EMPTY });
    setIsNew(true);
    setEditOpen(true);
  }

  function openEdit(i: Ingredient) {
    setEditing({ ...i });
    setIsNew(false);
    setEditOpen(true);
  }

  function openAdjust(i: Ingredient) {
    setAdjustTarget(i);
    setAdjustQty("");
    setAdjustReason("");
    setAdjustOpen(true);
  }

  async function handleSave() {
    if (!editing?.name?.trim()) return;
    const payload = {
      name: editing.name!,
      unit: editing.unit as Ingredient["unit"],
      costPerUnit: editing.costPerUnit ?? 0,
      stockQuantity: editing.stockQuantity ?? 0,
      minStockLevel: editing.minStockLevel ?? 0,
      category: editing.category || undefined,
      notes: editing.notes || undefined,
    };
    if (isNew) {
      await createIngredient.mutateAsync(payload);
      toast({ title: "Ingredient created" });
    } else {
      await updateIngredient.mutateAsync({ id: editing.id!, data: payload });
      toast({ title: "Ingredient updated" });
    }
    setEditOpen(false);
  }

  async function handleDelete() {
    if (!deleteId) return;
    await deleteIngredient.mutateAsync(deleteId);
    toast({ title: "Ingredient deleted" });
    setDeleteId(null);
  }

  async function handleAdjust() {
    if (!adjustTarget) return;
    const qty = parseFloat(adjustQty);
    if (isNaN(qty)) return;
    await adjustStock.mutateAsync({ id: adjustTarget.id, quantity: qty, reason: adjustReason || undefined });
    toast({ title: "Stock adjusted", description: `${adjustTarget.name}: ${qty > 0 ? "+" : ""}${qty} ${adjustTarget.unit}` });
    setAdjustOpen(false);
  }

  return (
    <div className="p-6 space-y-6 h-full overflow-y-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FlaskConical className="h-6 w-6 text-primary" /> Ingredients
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Manage raw materials and components with stock tracking</p>
        </div>
        <Button onClick={openNew} size="sm">
          <Plus className="h-4 w-4 mr-1.5" /> New Ingredient
        </Button>
      </div>

      {lowStock.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-400">Low Stock Alert</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                {lowStock.map(i => `${i.name} (${formatQty(i.stockQuantity, i.unit)})`).join(" · ")}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search ingredients..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground">
              <FlaskConical className="h-10 w-10 opacity-20" />
              <p className="text-sm">{search ? "No ingredients match your search" : "No ingredients yet — add one to get started"}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="text-right">Min Level</TableHead>
                  <TableHead className="text-right">Cost/Unit</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <AnimatePresence>
                  {filtered.map(ing => {
                    const isLow = ing.minStockLevel > 0 && ing.stockQuantity <= ing.minStockLevel;
                    return (
                      <motion.tr
                        key={ing.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="border-b border-border last:border-0"
                      >
                        <TableCell className="font-medium">{ing.name}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{ing.category || "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{ing.unit}</Badge>
                        </TableCell>
                        <TableCell className={cn("text-right font-mono text-sm", isLow && "text-amber-400 font-semibold")}>
                          {isLow && <AlertTriangle className="h-3 w-3 inline mr-1" />}
                          {formatQty(ing.stockQuantity, ing.unit)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground text-sm font-mono">
                          {ing.minStockLevel > 0 ? formatQty(ing.minStockLevel, ing.unit) : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">{formatCost(ing.costPerUnit)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" className="h-7 px-2" title="Adjust stock" onClick={() => openAdjust(ing)}>
                              <PackagePlus className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => openEdit(ing)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive hover:text-destructive" onClick={() => setDeleteId(ing.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit/Create Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{isNew ? "New Ingredient" : "Edit Ingredient"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label>Name *</Label>
                <Input value={editing?.name ?? ""} onChange={e => setEditing(p => ({ ...p, name: e.target.value }))} placeholder="e.g. All-purpose flour" />
              </div>
              <div className="space-y-1.5">
                <Label>Unit *</Label>
                <Select value={editing?.unit ?? "pcs"} onValueChange={v => setEditing(p => ({ ...p, unit: v as Ingredient["unit"] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Input value={editing?.category ?? ""} onChange={e => setEditing(p => ({ ...p, category: e.target.value }))} placeholder="e.g. Dry goods" />
              </div>
              <div className="space-y-1.5">
                <Label>Cost per {editing?.unit ?? "unit"} ($)</Label>
                <Input type="number" min="0" step="0.01" value={editing?.costPerUnit ?? ""} onChange={e => setEditing(p => ({ ...p, costPerUnit: parseFloat(e.target.value) || 0 }))} placeholder="0.00" />
              </div>
              <div className="space-y-1.5">
                <Label>Current Stock</Label>
                <Input type="number" min="0" step="0.001" value={editing?.stockQuantity ?? ""} onChange={e => setEditing(p => ({ ...p, stockQuantity: parseFloat(e.target.value) || 0 }))} placeholder="0" />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Min Stock Level (low-stock alert)</Label>
                <Input type="number" min="0" step="0.001" value={editing?.minStockLevel ?? ""} onChange={e => setEditing(p => ({ ...p, minStockLevel: parseFloat(e.target.value) || 0 }))} placeholder="0" />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Notes</Label>
                <Textarea rows={2} value={editing?.notes ?? ""} onChange={e => setEditing(p => ({ ...p, notes: e.target.value }))} placeholder="Optional notes…" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!editing?.name?.trim() || createIngredient.isPending || updateIngredient.isPending}>
              {isNew ? "Create" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Adjust Stock Dialog */}
      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Adjust Stock — {adjustTarget?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted">
              <TrendingDown className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Current:</span>
              <span className="text-sm font-semibold">{adjustTarget ? formatQty(adjustTarget.stockQuantity, adjustTarget.unit) : ""}</span>
            </div>
            <div className="space-y-1.5">
              <Label>Adjustment Quantity ({adjustTarget?.unit})</Label>
              <Input
                type="number"
                step="0.001"
                value={adjustQty}
                onChange={e => setAdjustQty(e.target.value)}
                placeholder="e.g. +500 to add, -100 to deduct"
              />
              <p className="text-xs text-muted-foreground">Use a positive number to add stock, negative to deduct</p>
            </div>
            <div className="space-y-1.5">
              <Label>Reason</Label>
              <Input value={adjustReason} onChange={e => setAdjustReason(e.target.value)} placeholder="e.g. Received delivery, spoilage…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustOpen(false)}>Cancel</Button>
            <Button onClick={handleAdjust} disabled={!adjustQty || isNaN(parseFloat(adjustQty)) || adjustStock.isPending}>
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Ingredient?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove the ingredient. Any recipes using it must be updated first.</AlertDialogDescription>
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
