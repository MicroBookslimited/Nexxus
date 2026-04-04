import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  useListProducts,
  useCreateProduct,
  useUpdateProduct,
  useDeleteProduct,
  useGetProductVariants,
  useSaveProductVariants,
  useGetProductModifiers,
  useSaveProductModifiers,
} from "@workspace/api-client-react";
import type { GetProductResponse } from "@workspace/api-zod";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Plus, Pencil, Trash2, Search, Package, X, Settings2, Layers, LayoutGrid, List } from "lucide-react";

const CATEGORIES = ["Beverages", "Food", "Bakery", "Merchandise", "Other"];

/* ─── Product form types ─── */
type ProductForm = {
  name: string;
  description: string;
  price: string;
  category: string;
  barcode: string;
  inStock: boolean;
  stockCount: string;
};

const emptyForm = (): ProductForm => ({
  name: "",
  description: "",
  price: "",
  category: "Beverages",
  barcode: "",
  inStock: true,
  stockCount: "0",
});

/* ─── Variant/modifier editor types ─── */
type DraftOption = { tempId: string; name: string; priceAdjustment: string };
type DraftVariantGroup = { tempId: string; name: string; required: boolean; options: DraftOption[] };
type DraftModifierGroup = { tempId: string; name: string; required: boolean; minSelections: string; maxSelections: string; options: DraftOption[] };

function makeId() { return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }
function emptyOption(): DraftOption { return { tempId: makeId(), name: "", priceAdjustment: "0" }; }
function emptyVariantGroup(): DraftVariantGroup { return { tempId: makeId(), name: "", required: true, options: [emptyOption()] }; }
function emptyModifierGroup(): DraftModifierGroup { return { tempId: makeId(), name: "", required: false, minSelections: "0", maxSelections: "0", options: [emptyOption()] }; }

function formatCurrency(v: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);
}

/* ─── Variant editor ─── */
function VariantEditor({ productId }: { productId: number }) {
  const { data: serverGroups } = useGetProductVariants({ id: productId });
  const saveVariants = useSaveProductVariants();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [groups, setGroups] = useState<DraftVariantGroup[]>([]);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!serverGroups) return;
    setGroups(
      serverGroups.map((g) => ({
        tempId: makeId(),
        name: g.name,
        required: g.required,
        options: g.options.map((o) => ({
          tempId: makeId(),
          name: o.name,
          priceAdjustment: o.priceAdjustment.toString(),
        })),
      })),
    );
    setDirty(false);
  }, [serverGroups]);

  const addGroup = () => { setGroups((g) => [...g, emptyVariantGroup()]); setDirty(true); };
  const removeGroup = (tempId: string) => { setGroups((g) => g.filter((x) => x.tempId !== tempId)); setDirty(true); };
  const updateGroup = (tempId: string, patch: Partial<DraftVariantGroup>) => {
    setGroups((g) => g.map((x) => x.tempId === tempId ? { ...x, ...patch } : x));
    setDirty(true);
  };
  const addOption = (groupTempId: string) => {
    setGroups((g) => g.map((x) => x.tempId === groupTempId ? { ...x, options: [...x.options, emptyOption()] } : x));
    setDirty(true);
  };
  const removeOption = (groupTempId: string, optTempId: string) => {
    setGroups((g) => g.map((x) => x.tempId === groupTempId ? { ...x, options: x.options.filter((o) => o.tempId !== optTempId) } : x));
    setDirty(true);
  };
  const updateOption = (groupTempId: string, optTempId: string, patch: Partial<DraftOption>) => {
    setGroups((g) => g.map((x) => x.tempId === groupTempId ? {
      ...x,
      options: x.options.map((o) => o.tempId === optTempId ? { ...o, ...patch } : o),
    } : x));
    setDirty(true);
  };

  const handleSave = () => {
    saveVariants.mutate(
      {
        id: productId,
        data: {
          groups: groups.map((g) => ({
            name: g.name,
            required: g.required,
            options: g.options.filter((o) => o.name.trim()).map((o) => ({
              name: o.name,
              priceAdjustment: parseFloat(o.priceAdjustment) || 0,
            })),
          })).filter((g) => g.name.trim()),
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Variants saved" });
          queryClient.invalidateQueries({ queryKey: [`/api/products/${productId}/variants`] });
          queryClient.invalidateQueries({ queryKey: ["/api/products"] });
          setDirty(false);
        },
        onError: () => toast({ title: "Save failed", variant: "destructive" }),
      },
    );
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">Variant groups let customers choose between options (e.g., Size: Small / Medium / Large). Each product can only have one option selected per group.</p>
      {groups.map((group) => (
        <Card key={group.tempId} className="border-border/50">
          <CardContent className="pt-3 pb-3 space-y-3">
            <div className="flex items-center gap-2">
              <Input
                placeholder="Group name (e.g. Size)"
                value={group.name}
                onChange={(e) => updateGroup(group.tempId, { name: e.target.value })}
                className="flex-1 h-8 text-sm"
              />
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-xs text-muted-foreground">Required</span>
                <Switch checked={group.required} onCheckedChange={(v) => updateGroup(group.tempId, { required: v })} />
              </div>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => removeGroup(group.tempId)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="space-y-2 pl-2 border-l-2 border-border/40">
              {group.options.map((opt) => (
                <div key={opt.tempId} className="flex items-center gap-2">
                  <Input
                    placeholder="Option name (e.g. Large)"
                    value={opt.name}
                    onChange={(e) => updateOption(group.tempId, opt.tempId, { name: e.target.value })}
                    className="flex-1 h-7 text-xs"
                  />
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                    <Input
                      type="number"
                      placeholder="0"
                      value={opt.priceAdjustment}
                      onChange={(e) => updateOption(group.tempId, opt.tempId, { priceAdjustment: e.target.value })}
                      className="w-20 h-7 text-xs pl-5"
                    />
                  </div>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeOption(group.tempId, opt.tempId)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              <Button size="sm" variant="ghost" className="h-6 text-xs gap-1 text-muted-foreground" onClick={() => addOption(group.tempId)}>
                <Plus className="h-3 w-3" />Add option
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
      <Button size="sm" variant="outline" className="gap-1.5 w-full" onClick={addGroup}>
        <Plus className="h-3.5 w-3.5" />Add variant group
      </Button>
      {dirty && (
        <Button onClick={handleSave} disabled={saveVariants.isPending} className="w-full">
          {saveVariants.isPending ? "Saving…" : "Save Variants"}
        </Button>
      )}
    </div>
  );
}

/* ─── Modifier editor ─── */
function ModifierEditor({ productId }: { productId: number }) {
  const { data: serverGroups } = useGetProductModifiers({ id: productId });
  const saveModifiers = useSaveProductModifiers();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [groups, setGroups] = useState<DraftModifierGroup[]>([]);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!serverGroups) return;
    setGroups(
      serverGroups.map((g) => ({
        tempId: makeId(),
        name: g.name,
        required: g.required,
        minSelections: g.minSelections.toString(),
        maxSelections: g.maxSelections.toString(),
        options: g.options.map((o) => ({
          tempId: makeId(),
          name: o.name,
          priceAdjustment: o.priceAdjustment.toString(),
        })),
      })),
    );
    setDirty(false);
  }, [serverGroups]);

  const addGroup = () => { setGroups((g) => [...g, emptyModifierGroup()]); setDirty(true); };
  const removeGroup = (tempId: string) => { setGroups((g) => g.filter((x) => x.tempId !== tempId)); setDirty(true); };
  const updateGroup = (tempId: string, patch: Partial<DraftModifierGroup>) => {
    setGroups((g) => g.map((x) => x.tempId === tempId ? { ...x, ...patch } : x));
    setDirty(true);
  };
  const addOption = (groupTempId: string) => {
    setGroups((g) => g.map((x) => x.tempId === groupTempId ? { ...x, options: [...x.options, emptyOption()] } : x));
    setDirty(true);
  };
  const removeOption = (groupTempId: string, optTempId: string) => {
    setGroups((g) => g.map((x) => x.tempId === groupTempId ? { ...x, options: x.options.filter((o) => o.tempId !== optTempId) } : x));
    setDirty(true);
  };
  const updateOption = (groupTempId: string, optTempId: string, patch: Partial<DraftOption>) => {
    setGroups((g) => g.map((x) => x.tempId === groupTempId ? {
      ...x,
      options: x.options.map((o) => o.tempId === optTempId ? { ...o, ...patch } : o),
    } : x));
    setDirty(true);
  };

  const handleSave = () => {
    saveModifiers.mutate(
      {
        id: productId,
        data: {
          groups: groups.map((g) => ({
            name: g.name,
            required: g.required,
            minSelections: parseInt(g.minSelections) || 0,
            maxSelections: parseInt(g.maxSelections) || 0,
            options: g.options.filter((o) => o.name.trim()).map((o) => ({
              name: o.name,
              priceAdjustment: parseFloat(o.priceAdjustment) || 0,
            })),
          })).filter((g) => g.name.trim()),
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Modifiers saved" });
          queryClient.invalidateQueries({ queryKey: [`/api/products/${productId}/modifiers`] });
          queryClient.invalidateQueries({ queryKey: ["/api/products"] });
          setDirty(false);
        },
        onError: () => toast({ title: "Save failed", variant: "destructive" }),
      },
    );
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">Modifier groups let customers add optional customizations (e.g., Extras: Extra Shot, Oat Milk). Multiple can be selected per group.</p>
      {groups.map((group) => (
        <Card key={group.tempId} className="border-border/50">
          <CardContent className="pt-3 pb-3 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Input
                placeholder="Group name (e.g. Extras)"
                value={group.name}
                onChange={(e) => updateGroup(group.tempId, { name: e.target.value })}
                className="flex-1 h-8 text-sm min-w-[120px]"
              />
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-xs text-muted-foreground">Required</span>
                <Switch checked={group.required} onCheckedChange={(v) => updateGroup(group.tempId, { required: v })} />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">Min</span>
                <Input type="number" min={0} value={group.minSelections} onChange={(e) => updateGroup(group.tempId, { minSelections: e.target.value })} className="w-12 h-7 text-xs text-center" />
                <span className="text-xs text-muted-foreground">Max</span>
                <Input type="number" min={0} value={group.maxSelections} onChange={(e) => updateGroup(group.tempId, { maxSelections: e.target.value })} className="w-12 h-7 text-xs text-center" />
                <span className="text-xs text-muted-foreground">(0=unlimited)</span>
              </div>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => removeGroup(group.tempId)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="space-y-2 pl-2 border-l-2 border-border/40">
              {group.options.map((opt) => (
                <div key={opt.tempId} className="flex items-center gap-2">
                  <Input
                    placeholder="Option name (e.g. Extra Shot)"
                    value={opt.name}
                    onChange={(e) => updateOption(group.tempId, opt.tempId, { name: e.target.value })}
                    className="flex-1 h-7 text-xs"
                  />
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                    <Input
                      type="number"
                      placeholder="0"
                      value={opt.priceAdjustment}
                      onChange={(e) => updateOption(group.tempId, opt.tempId, { priceAdjustment: e.target.value })}
                      className="w-20 h-7 text-xs pl-5"
                    />
                  </div>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeOption(group.tempId, opt.tempId)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              <Button size="sm" variant="ghost" className="h-6 text-xs gap-1 text-muted-foreground" onClick={() => addOption(group.tempId)}>
                <Plus className="h-3 w-3" />Add option
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
      <Button size="sm" variant="outline" className="gap-1.5 w-full" onClick={addGroup}>
        <Plus className="h-3.5 w-3.5" />Add modifier group
      </Button>
      {dirty && (
        <Button onClick={handleSave} disabled={saveModifiers.isPending} className="w-full">
          {saveModifiers.isPending ? "Saving…" : "Save Modifiers"}
        </Button>
      )}
    </div>
  );
}

/* ─── Main Products page ─── */
export function Products() {
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  const { data: products, isLoading } = useListProducts(
    categoryFilter ? { category: categoryFilter } : {},
  );

  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogTab, setDialogTab] = useState("details");
  const [editingProduct, setEditingProduct] = useState<GetProductResponse | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm());
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const filteredProducts = products?.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const openAdd = () => {
    setEditingProduct(null);
    setForm(emptyForm());
    setDialogTab("details");
    setDialogOpen(true);
  };

  const openEdit = (p: GetProductResponse) => {
    setEditingProduct(p);
    setForm({
      name: p.name,
      description: p.description ?? "",
      price: p.price.toString(),
      category: p.category,
      barcode: p.barcode ?? "",
      inStock: p.inStock,
      stockCount: p.stockCount.toString(),
    });
    setDialogTab("details");
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.name.trim() || !form.price || !form.category) {
      toast({ title: "Name, price and category are required.", variant: "destructive" });
      return;
    }
    const payload = {
      name: form.name.trim(),
      description: form.description || undefined,
      price: parseFloat(form.price),
      category: form.category,
      barcode: form.barcode || undefined,
      inStock: form.inStock,
      stockCount: parseInt(form.stockCount) || 0,
    };

    if (editingProduct) {
      updateProduct.mutate(
        { id: editingProduct.id, data: payload },
        {
          onSuccess: () => {
            toast({ title: "Product updated" });
            queryClient.invalidateQueries({ queryKey: ["/api/products"] });
          },
          onError: () => toast({ title: "Update failed", variant: "destructive" }),
        },
      );
    } else {
      createProduct.mutate(
        { data: payload },
        {
          onSuccess: (newProduct) => {
            toast({ title: "Product created" });
            queryClient.invalidateQueries({ queryKey: ["/api/products"] });
            setEditingProduct(newProduct);
            setDialogTab("variants");
          },
          onError: () => toast({ title: "Create failed", variant: "destructive" }),
        },
      );
    }
  };

  const handleDelete = () => {
    if (!deleteId) return;
    deleteProduct.mutate(
      { id: deleteId },
      {
        onSuccess: () => {
          toast({ title: "Product deleted" });
          queryClient.invalidateQueries({ queryKey: ["/api/products"] });
          setDeleteId(null);
        },
        onError: () => toast({ title: "Delete failed", variant: "destructive" }),
      },
    );
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Products</h2>
          <p className="text-muted-foreground mt-1">Manage your product catalog, variants, and modifiers.</p>
        </div>
        <Button onClick={openAdd} className="gap-2">
          <Plus className="h-4 w-4" />Add Product
        </Button>
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search products…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        </div>
        <div className="flex gap-2 flex-wrap flex-1">
          <Button size="sm" variant={!categoryFilter ? "default" : "outline"} onClick={() => setCategoryFilter(null)}>All</Button>
          {CATEGORIES.map((c) => (
            <Button key={c} size="sm" variant={categoryFilter === c ? "default" : "outline"} onClick={() => setCategoryFilter(c)}>{c}</Button>
          ))}
        </div>
        {/* View toggle */}
        <div className="flex items-center rounded-md border border-border overflow-hidden shrink-0">
          <button
            onClick={() => setViewMode("grid")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === "grid" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"}`}
          >
            <LayoutGrid className="h-3.5 w-3.5" />Grid
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"}`}
          >
            <List className="h-3.5 w-3.5" />List
          </button>
        </div>
      </div>

      {isLoading ? (
        viewMode === "grid" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
          </div>
        ) : (
          <div className="space-y-2">
            {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
          </div>
        )
      ) : !filteredProducts?.length ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
          <Package className="h-12 w-12 opacity-30" />
          <p className="text-lg">No products found</p>
          <Button variant="outline" onClick={openAdd}>Add your first product</Button>
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <AnimatePresence>
            {filteredProducts.map((product) => (
              <motion.div key={product.id} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}>
                <Card className="group hover:border-primary/50 transition-colors">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-sm font-semibold leading-snug flex-1 truncate">{product.name}</CardTitle>
                      <Badge variant="outline" className="text-[10px] shrink-0">{product.category}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xl font-bold font-mono text-primary">{formatCurrency(product.price)}</p>
                      <div className="flex items-center gap-1.5">
                        {product.hasVariants && (
                          <Badge variant="secondary" className="text-[10px] h-4 gap-0.5 px-1">
                            <Layers className="h-2.5 w-2.5" />V
                          </Badge>
                        )}
                        {product.hasModifiers && (
                          <Badge variant="secondary" className="text-[10px] h-4 gap-0.5 px-1">
                            <Settings2 className="h-2.5 w-2.5" />M
                          </Badge>
                        )}
                        <Badge variant={product.inStock ? "default" : "destructive"} className="text-[10px] h-4">
                          {product.inStock ? `${product.stockCount} in stock` : "Out"}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button size="sm" variant="outline" className="flex-1 h-7 text-xs" onClick={() => openEdit(product)}>
                        <Pencil className="h-3 w-3 mr-1" />Edit
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 px-2 text-destructive hover:bg-destructive/10 hover:border-destructive" onClick={() => setDeleteId(product.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      ) : (
        /* ── LIST VIEW ── */
        <div className="rounded-xl border border-border overflow-hidden">
          {/* Header row */}
          <div className="grid grid-cols-[1fr_120px_100px_120px_100px_96px] gap-4 px-4 py-2.5 bg-secondary/40 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            <span>Product</span>
            <span>Category</span>
            <span className="text-right">Price</span>
            <span>Stock</span>
            <span>Add-ons</span>
            <span className="text-right">Actions</span>
          </div>
          <AnimatePresence initial={false}>
            {filteredProducts.map((product, i) => (
              <motion.div
                key={product.id}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ delay: i * 0.02 }}
                className={`grid grid-cols-[1fr_120px_100px_120px_100px_96px] gap-4 px-4 py-3 items-center border-b border-border/50 last:border-0 hover:bg-secondary/20 transition-colors group`}
              >
                {/* Name + description */}
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{product.name}</p>
                  {product.description && <p className="text-xs text-muted-foreground truncate mt-0.5">{product.description}</p>}
                </div>

                {/* Category */}
                <Badge variant="outline" className="text-[10px] w-fit">{product.category}</Badge>

                {/* Price */}
                <p className="text-sm font-bold font-mono text-primary text-right">{formatCurrency(product.price)}</p>

                {/* Stock */}
                <div>
                  <Badge variant={product.inStock ? "default" : "destructive"} className="text-[10px]">
                    {product.inStock ? `${product.stockCount} in stock` : "Out of stock"}
                  </Badge>
                </div>

                {/* Add-ons */}
                <div className="flex gap-1">
                  {product.hasVariants && (
                    <Badge variant="secondary" className="text-[10px] h-5 gap-0.5 px-1.5">
                      <Layers className="h-2.5 w-2.5" />Variants
                    </Badge>
                  )}
                  {product.hasModifiers && (
                    <Badge variant="secondary" className="text-[10px] h-5 gap-0.5 px-1.5">
                      <Settings2 className="h-2.5 w-2.5" />Mods
                    </Badge>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-1.5 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => openEdit(product)}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button size="icon" variant="outline" className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:border-destructive" onClick={() => setDeleteId(product.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{editingProduct ? "Edit Product" : "Add Product"}</DialogTitle>
          </DialogHeader>

          <Tabs value={dialogTab} onValueChange={setDialogTab} className="flex-1 overflow-hidden flex flex-col">
            <TabsList className="shrink-0">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="variants" disabled={!editingProduct}>Variants</TabsTrigger>
              <TabsTrigger value="modifiers" disabled={!editingProduct}>Modifiers</TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-y-auto mt-2 pr-1">
              <TabsContent value="details" className="mt-0 space-y-4">
                <div className="grid gap-1.5">
                  <Label>Name *</Label>
                  <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Cappuccino" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label>Price *</Label>
                    <Input type="number" step="0.01" min="0" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} placeholder="0.00" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Category *</Label>
                    <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label>Description</Label>
                  <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Optional description" />
                </div>
                <div className="grid gap-1.5">
                  <Label>Barcode</Label>
                  <Input value={form.barcode} onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))} placeholder="EAN / UPC" />
                </div>
                <Separator />
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label>Stock count</Label>
                    <Input type="number" min="0" value={form.stockCount} onChange={(e) => setForm((f) => ({ ...f, stockCount: e.target.value }))} />
                  </div>
                  <div className="flex items-end gap-2 pb-0.5">
                    <Switch id="inStock" checked={form.inStock} onCheckedChange={(v) => setForm((f) => ({ ...f, inStock: v }))} />
                    <Label htmlFor="inStock">In stock</Label>
                  </div>
                </div>
                <DialogFooter className="pt-2">
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                  <Button onClick={handleSave} disabled={createProduct.isPending || updateProduct.isPending}>
                    {editingProduct ? "Save Changes" : "Create & Continue"}
                  </Button>
                </DialogFooter>
              </TabsContent>

              <TabsContent value="variants" className="mt-0">
                {editingProduct && <VariantEditor productId={editingProduct.id} />}
              </TabsContent>

              <TabsContent value="modifiers" className="mt-0">
                {editingProduct && <ModifierEditor productId={editingProduct.id} />}
              </TabsContent>
            </div>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete product?</AlertDialogTitle>
            <AlertDialogDescription>
              This product will be permanently removed from the catalog along with all its variants and modifiers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90 text-destructive-foreground" onClick={handleDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}
