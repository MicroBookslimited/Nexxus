import React, { useState, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  useListRecipes, useCreateRecipe, useUpdateRecipe, useDeleteRecipe,
  useListIngredients, type Recipe, type RecipeIngredient, type CreateRecipeInput,
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Search, Plus, Pencil, Trash2, BookOpen, ChevronDown, ChevronUp, X, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";

const UNITS = ["pcs", "g", "kg", "ml", "l"];

function formatCost(val: number) {
  return `$${val.toFixed(2)}`;
}

type IngredientLine = { ingredientId: number; quantity: number; unit: string; notes: string };

export function Recipes() {
  const { data: recipes = [], isLoading } = useListRecipes();
  const { data: products = [] } = useListProducts();
  const { data: ingredients = [] } = useListIngredients();
  const createRecipe = useCreateRecipe();
  const updateRecipe = useUpdateRecipe();
  const deleteRecipe = useDeleteRecipe();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<{
    recipeId?: number;
    productId: number | null;
    name: string;
    notes: string;
    yieldQuantity: number;
    ingredients: IngredientLine[];
  } | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const filteredRecipes = useMemo(() =>
    recipes.filter(r => {
      const product = products.find(p => p.id === r.productId);
      return (product?.name ?? r.name ?? "").toLowerCase().includes(search.toLowerCase());
    }), [recipes, products, search]);

  const productsWithoutRecipe = useMemo(() =>
    products.filter(p => !recipes.some(r => r.productId === p.id)),
    [products, recipes]);

  function openNew() {
    setEditing({ productId: null, name: "", notes: "", yieldQuantity: 1, ingredients: [] });
    setEditOpen(true);
  }

  function openEdit(r: Recipe) {
    setEditing({
      recipeId: r.id,
      productId: r.productId,
      name: r.name ?? "",
      notes: r.notes ?? "",
      yieldQuantity: r.yieldQuantity,
      ingredients: r.ingredients.map(i => ({
        ingredientId: i.ingredientId,
        quantity: i.quantity,
        unit: i.unit,
        notes: i.notes ?? "",
      })),
    });
    setEditOpen(true);
  }

  function addIngredientLine() {
    setEditing(prev => prev ? {
      ...prev,
      ingredients: [...prev.ingredients, { ingredientId: 0, quantity: 1, unit: "g", notes: "" }],
    } : prev);
  }

  function removeIngredientLine(idx: number) {
    setEditing(prev => prev ? {
      ...prev,
      ingredients: prev.ingredients.filter((_, i) => i !== idx),
    } : prev);
  }

  function updateIngredientLine(idx: number, field: keyof IngredientLine, value: string | number) {
    setEditing(prev => prev ? {
      ...prev,
      ingredients: prev.ingredients.map((ing, i) => i === idx ? { ...ing, [field]: value } : ing),
    } : prev);
  }

  async function handleSave() {
    if (!editing || !editing.productId) return;
    const validIngredients = editing.ingredients.filter(i => i.ingredientId > 0 && i.quantity > 0);

    const payload: CreateRecipeInput = {
      productId: editing.productId,
      name: editing.name || undefined,
      notes: editing.notes || undefined,
      yieldQuantity: editing.yieldQuantity,
      ingredients: validIngredients.map(i => ({
        ingredientId: i.ingredientId,
        quantity: i.quantity,
        unit: i.unit,
        notes: i.notes || undefined,
      })),
    };

    if (editing.recipeId) {
      await updateRecipe.mutateAsync({ id: editing.recipeId, data: payload });
      toast({ title: "Recipe updated" });
    } else {
      await createRecipe.mutateAsync(payload);
      toast({ title: "Recipe created" });
    }
    setEditOpen(false);
  }

  async function handleDelete() {
    if (!deleteId) return;
    await deleteRecipe.mutateAsync(deleteId);
    toast({ title: "Recipe deleted" });
    setDeleteId(null);
  }

  function calcCost(r: Recipe) {
    return r.costPerUnit;
  }

  return (
    <div className="p-6 space-y-6 h-full overflow-y-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-primary" /> Recipes (BOM)
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Define what ingredients are needed to produce each product</p>
        </div>
        <Button onClick={openNew} size="sm">
          <Plus className="h-4 w-4 mr-1.5" /> New Recipe
        </Button>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search recipes…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">Loading…</div>
      ) : filteredRecipes.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-60 gap-3 text-muted-foreground">
          <BookOpen className="h-12 w-12 opacity-20" />
          <p className="text-sm text-center">
            {search ? "No recipes match your search" : "No recipes yet. Create one to link ingredients to a product."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence>
            {filteredRecipes.map(recipe => {
              const product = products.find(p => p.id === recipe.productId);
              const expanded = expandedId === recipe.id;
              return (
                <motion.div key={recipe.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <Card>
                    <CardContent className="p-0">
                      <div
                        className="flex items-center justify-between gap-4 p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                        onClick={() => setExpandedId(expanded ? null : recipe.id)}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm">{product?.name ?? recipe.name ?? `Recipe #${recipe.id}`}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {recipe.ingredients.length} ingredient{recipe.ingredients.length !== 1 ? "s" : ""} · Yield: {recipe.yieldQuantity} pcs
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right">
                            <div className="flex items-center gap-1 text-sm font-semibold text-primary">
                              <DollarSign className="h-3.5 w-3.5" />
                              {formatCost(calcCost(recipe))}/unit
                            </div>
                          </div>
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={e => { e.stopPropagation(); openEdit(recipe); }}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive hover:text-destructive" onClick={e => { e.stopPropagation(); setDeleteId(recipe.id); }}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                        </div>
                      </div>

                      <AnimatePresence>
                        {expanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.18 }}
                            className="overflow-hidden"
                          >
                            <Separator />
                            <div className="p-4">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="text-xs text-muted-foreground">
                                    <th className="text-left font-medium pb-2">Ingredient</th>
                                    <th className="text-right font-medium pb-2">Qty / Unit</th>
                                    <th className="text-right font-medium pb-2">Cost/Unit</th>
                                    <th className="text-right font-medium pb-2">Line Cost</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {recipe.ingredients.map(ri => (
                                    <tr key={ri.id} className="border-t border-border/50">
                                      <td className="py-1.5">{ri.ingredientName}</td>
                                      <td className="text-right py-1.5 font-mono">{ri.quantity} {ri.unit}</td>
                                      <td className="text-right py-1.5 font-mono text-muted-foreground">{formatCost(ri.costPerUnit)}</td>
                                      <td className="text-right py-1.5 font-mono">{formatCost((ri.quantity / recipe.yieldQuantity) * ri.costPerUnit)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                                <tfoot>
                                  <tr className="border-t-2 border-border font-semibold">
                                    <td colSpan={3} className="pt-2 text-xs text-muted-foreground">Total cost per unit (yield: {recipe.yieldQuantity})</td>
                                    <td className="text-right pt-2 text-primary">{formatCost(calcCost(recipe))}</td>
                                  </tr>
                                </tfoot>
                              </table>
                              {recipe.notes && <p className="text-xs text-muted-foreground mt-3 italic">{recipe.notes}</p>}
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

      {/* Edit/Create Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.recipeId ? "Edit Recipe" : "New Recipe"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label>Product *</Label>
                {editing?.recipeId ? (
                  <Input value={products.find(p => p.id === editing?.productId)?.name ?? ""} disabled />
                ) : (
                  <Select value={String(editing?.productId ?? "")} onValueChange={v => setEditing(p => p ? { ...p, productId: parseInt(v) } : p)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select product…" />
                    </SelectTrigger>
                    <SelectContent>
                      {productsWithoutRecipe.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Yield Quantity</Label>
                <Input type="number" min="0.001" step="0.001" value={editing?.yieldQuantity ?? 1} onChange={e => setEditing(p => p ? { ...p, yieldQuantity: parseFloat(e.target.value) || 1 } : p)} />
                <p className="text-xs text-muted-foreground">How many units this recipe produces</p>
              </div>
              <div className="space-y-1.5">
                <Label>Recipe Name (optional)</Label>
                <Input value={editing?.name ?? ""} onChange={e => setEditing(p => p ? { ...p, name: e.target.value } : p)} placeholder="Defaults to product name" />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Notes</Label>
                <Textarea rows={2} value={editing?.notes ?? ""} onChange={e => setEditing(p => p ? { ...p, notes: e.target.value } : p)} placeholder="Optional notes…" />
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base">Ingredients</Label>
                <Button size="sm" variant="outline" onClick={addIngredientLine}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Ingredient
                </Button>
              </div>

              {(editing?.ingredients ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No ingredients added yet</p>
              ) : (
                <div className="space-y-2">
                  {(editing?.ingredients ?? []).map((line, idx) => (
                    <div key={idx} className="grid grid-cols-[1fr_100px_80px_auto] gap-2 items-end">
                      <div className="space-y-1">
                        {idx === 0 && <Label className="text-xs text-muted-foreground">Ingredient</Label>}
                        <Select value={String(line.ingredientId || "")} onValueChange={v => updateIngredientLine(idx, "ingredientId", parseInt(v))}>
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue placeholder="Select…" />
                          </SelectTrigger>
                          <SelectContent>
                            {ingredients.map(i => <SelectItem key={i.id} value={String(i.id)}>{i.name} ({i.unit})</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        {idx === 0 && <Label className="text-xs text-muted-foreground">Quantity</Label>}
                        <Input
                          className="h-8 text-sm"
                          type="number"
                          min="0.001"
                          step="0.001"
                          value={line.quantity}
                          onChange={e => updateIngredientLine(idx, "quantity", parseFloat(e.target.value) || 0)}
                        />
                      </div>
                      <div className="space-y-1">
                        {idx === 0 && <Label className="text-xs text-muted-foreground">Unit</Label>}
                        <Select value={line.unit} onValueChange={v => updateIngredientLine(idx, "unit", v)}>
                          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        {idx === 0 && <div className="text-xs text-transparent select-none">X</div>}
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground" onClick={() => removeIngredientLine(idx)}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!editing?.productId || createRecipe.isPending || updateRecipe.isPending}>
              {editing?.recipeId ? "Save Changes" : "Create Recipe"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Recipe?</AlertDialogTitle>
            <AlertDialogDescription>This will remove the recipe and its ingredient list. The product will no longer have ingredients deducted on sale.</AlertDialogDescription>
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
