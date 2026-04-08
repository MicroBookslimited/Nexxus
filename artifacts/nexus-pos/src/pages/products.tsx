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
  useListPurchases,
  useCreatePurchase,
  useListPurchaseBills,
  useCreatePurchaseBill,
  useGetPurchaseBill,
  useConfirmPurchaseBill,
  useDeletePurchaseBill,
} from "@workspace/api-client-react";
import type { GetProductResponse } from "@workspace/api-zod";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
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
import { Plus, Pencil, Trash2, Search, Package, X, Settings2, Layers, LayoutGrid, List, AlertTriangle, PackagePlus, ShoppingCart, Clock, FileText, CheckCircle2, Eye, ArrowLeft, Truck, ChevronRight, MapPin } from "lucide-react";
import { TENANT_TOKEN_KEY } from "@/lib/saas-api";

const CATEGORIES = ["Beverages", "Food", "Bakery", "Merchandise", "Other"];
const LOW_STOCK_THRESHOLD = 10;

type RestockForm = { quantity: string; unitCost: string; notes: string };
const emptyRestockForm = (): RestockForm => ({ quantity: "", unitCost: "", notes: "" });

type BillLineItem = { tempId: string; productId: string; quantity: string; unitCost: string };
type BillForm = { billNumber: string; supplier: string; notes: string; items: BillLineItem[] };

function generateBillNumber() {
  const d = new Date();
  const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = Math.floor(Math.random() * 900 + 100);
  return `PO-${dateStr}-${rand}`;
}
function emptyLineItem(): BillLineItem {
  return { tempId: makeId(), productId: "", quantity: "", unitCost: "" };
}
function emptyBillForm(): BillForm {
  return { billNumber: generateBillNumber(), supplier: "", notes: "", items: [emptyLineItem()] };
}

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

/* ─── Locations editor ─── */
type ProductLocationRow = {
  locationId: number;
  locationName: string;
  isAvailable: boolean;
  priceOverride: number | null;
};

function authHeaders() {
  const token = localStorage.getItem(TENANT_TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
}

function LocationsEditor({ productId }: { productId: number }) {
  const { toast } = useToast();
  const queryKey = [`/api/products/${productId}/locations`];

  const { data: rows, isLoading } = useQuery<ProductLocationRow[]>({
    queryKey,
    queryFn: async () => {
      const r = await fetch(`/api/products/${productId}/locations`, { headers: authHeaders() });
      if (!r.ok) throw new Error("Failed to load locations");
      return r.json();
    },
  });

  const [draft, setDraft] = useState<Record<number, { isAvailable: boolean; priceOverride: string }>>({});

  useEffect(() => {
    if (!rows) return;
    const initial: Record<number, { isAvailable: boolean; priceOverride: string }> = {};
    rows.forEach((r) => {
      initial[r.locationId] = {
        isAvailable: r.isAvailable,
        priceOverride: r.priceOverride != null ? String(r.priceOverride) : "",
      };
    });
    setDraft(initial);
  }, [rows]);

  const saveMutation = useMutation({
    mutationFn: async ({ locationId, isAvailable, priceOverride }: { locationId: number; isAvailable: boolean; priceOverride: number | null }) => {
      const r = await fetch(`/api/products/${productId}/locations/${locationId}`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ isAvailable, priceOverride }),
      });
      if (!r.ok) throw new Error("Save failed");
      return r.json();
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  const handleSaveAll = async () => {
    if (!rows) return;
    try {
      await Promise.all(
        rows.map((row) => {
          const d = draft[row.locationId];
          if (!d) return Promise.resolve();
          const priceOverride = d.priceOverride !== "" ? parseFloat(d.priceOverride) : null;
          return saveMutation.mutateAsync({ locationId: row.locationId, isAvailable: d.isAvailable, priceOverride: Number.isFinite(priceOverride as number) ? priceOverride : null });
        }),
      );
      toast({ title: "Location settings saved" });
    } catch {
      // errors handled per-mutation
    }
  };

  if (isLoading) {
    return <div className="space-y-2 py-2">{[...Array(3)].map((_, i) => <div key={i} className="h-12 rounded bg-secondary/40 animate-pulse" />)}</div>;
  }

  if (!rows || rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
        <MapPin className="h-8 w-8 opacity-30" />
        <p className="text-sm">No locations configured.</p>
        <p className="text-xs">Add locations in the Locations page to manage per-location availability and pricing.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">Control whether this product is available at each location, and optionally set a location-specific price override.</p>
      {rows.map((row) => {
        const d = draft[row.locationId] ?? { isAvailable: row.isAvailable, priceOverride: "" };
        return (
          <Card key={row.locationId} className="border-border/50">
            <CardContent className="pt-3 pb-3">
              <div className="flex items-center gap-3">
                <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="flex-1 text-sm font-medium">{row.locationName}</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-xs text-muted-foreground">{d.isAvailable ? "Available" : "Unavailable"}</span>
                  <Switch
                    checked={d.isAvailable}
                    onCheckedChange={(v) => setDraft((prev) => ({ ...prev, [row.locationId]: { ...d, isAvailable: v } }))}
                  />
                </div>
                <div className="relative w-24 shrink-0">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Base"
                    value={d.priceOverride}
                    onChange={(e) => setDraft((prev) => ({ ...prev, [row.locationId]: { ...d, priceOverride: e.target.value } }))}
                    className="h-8 text-xs pl-5"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
      <Button onClick={handleSaveAll} disabled={saveMutation.isPending} className="w-full">
        {saveMutation.isPending ? "Saving…" : "Save Location Settings"}
      </Button>
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

  const createPurchase = useCreatePurchase();
  const { data: purchases } = useListPurchases();
  const { data: bills, refetch: refetchBills } = useListPurchaseBills();
  const createBill = useCreatePurchaseBill();
  const confirmBill = useConfirmPurchaseBill();
  const deleteBill = useDeletePurchaseBill();

  const [pageTab, setPageTab] = useState<"products" | "purchases">("products");
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogTab, setDialogTab] = useState("details");
  const [editingProduct, setEditingProduct] = useState<GetProductResponse | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm());
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [restockProduct, setRestockProduct] = useState<GetProductResponse | null>(null);
  const [restockForm, setRestockForm] = useState<RestockForm>(emptyRestockForm());
  const [billView, setBillView] = useState<"list" | "new">("list");
  const [viewBillId, setViewBillId] = useState<number | null>(null);
  const [billForm, setBillForm] = useState<BillForm>(emptyBillForm());
  const { data: viewBillDetail } = useGetPurchaseBill(
    viewBillId ?? 0,
    { query: { enabled: !!viewBillId } },
  );

  const filteredProducts = products?.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const lowStockProducts = products?.filter(
    (p) => p.inStock && p.stockCount > 0 && p.stockCount <= LOW_STOCK_THRESHOLD,
  ) ?? [];
  const outOfStockProducts = products?.filter((p) => !p.inStock || p.stockCount === 0) ?? [];

  const openRestock = (p: GetProductResponse) => {
    setRestockProduct(p);
    setRestockForm(emptyRestockForm());
  };

  const handleRestock = () => {
    if (!restockProduct) return;
    const qty = parseInt(restockForm.quantity);
    if (!qty || qty <= 0) {
      toast({ title: "Enter a valid quantity", variant: "destructive" });
      return;
    }
    createPurchase.mutate(
      {
        data: {
          productId: restockProduct.id,
          quantity: qty,
          unitCost: parseFloat(restockForm.unitCost) || 0,
          notes: restockForm.notes || undefined,
        },
      },
      {
        onSuccess: () => {
          toast({ title: `Restocked ${qty} units of ${restockProduct.name}` });
          queryClient.invalidateQueries({ queryKey: ["/api/products"] });
          queryClient.invalidateQueries({ queryKey: ["/api/purchases"] });
          setRestockProduct(null);
        },
        onError: () => toast({ title: "Restock failed", variant: "destructive" }),
      },
    );
  };

  const billLineTotal = (item: BillLineItem) =>
    (parseFloat(item.quantity) || 0) * (parseFloat(item.unitCost) || 0);

  const billGrandTotal = billForm.items.reduce((s, item) => s + billLineTotal(item), 0);

  const addLineItem = () =>
    setBillForm((f) => ({ ...f, items: [...f.items, emptyLineItem()] }));

  const removeLineItem = (tempId: string) =>
    setBillForm((f) => ({ ...f, items: f.items.filter((i) => i.tempId !== tempId) }));

  const updateLineItem = (tempId: string, patch: Partial<BillLineItem>) =>
    setBillForm((f) => ({
      ...f,
      items: f.items.map((i) => (i.tempId === tempId ? { ...i, ...patch } : i)),
    }));

  const handleSaveBill = (status: "draft" | "confirmed") => {
    if (!billForm.billNumber.trim()) {
      toast({ title: "Bill number is required", variant: "destructive" });
      return;
    }
    const validItems = billForm.items.filter((i) => i.productId && parseInt(i.quantity) > 0);
    if (!validItems.length) {
      toast({ title: "Add at least one item with a product and quantity", variant: "destructive" });
      return;
    }
    createBill.mutate(
      {
        data: {
          billNumber: billForm.billNumber.trim(),
          supplier: billForm.supplier || undefined,
          notes: billForm.notes || undefined,
          status,
          items: validItems.map((i) => ({
            productId: parseInt(i.productId),
            quantity: parseInt(i.quantity),
            unitCost: parseFloat(i.unitCost) || 0,
          })),
        },
      },
      {
        onSuccess: () => {
          toast({
            title: status === "confirmed"
              ? "Purchase bill confirmed — inventory updated!"
              : "Purchase bill saved as draft",
          });
          queryClient.invalidateQueries({ queryKey: ["/api/products"] });
          queryClient.invalidateQueries({ queryKey: ["/api/purchase-bills"] });
          setBillView("list");
          setBillForm(emptyBillForm());
          refetchBills();
        },
        onError: () => toast({ title: "Failed to save bill", variant: "destructive" }),
      },
    );
  };

  const handleConfirmBill = (id: number) => {
    confirmBill.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Bill confirmed — inventory updated!" });
          queryClient.invalidateQueries({ queryKey: ["/api/products"] });
          queryClient.invalidateQueries({ queryKey: ["/api/purchase-bills"] });
          setViewBillId(null);
          refetchBills();
        },
        onError: () => toast({ title: "Confirm failed", variant: "destructive" }),
      },
    );
  };

  const handleDeleteBill = (id: number) => {
    deleteBill.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Bill deleted" });
          queryClient.invalidateQueries({ queryKey: ["/api/purchase-bills"] });
          setViewBillId(null);
          refetchBills();
        },
        onError: () => toast({ title: "Delete failed", variant: "destructive" }),
      },
    );
  };

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
          <p className="text-muted-foreground mt-1">Manage your product catalog, variants, and stock purchases.</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Page tab toggle */}
          <div className="flex items-center rounded-md border border-border overflow-hidden">
            <button
              onClick={() => setPageTab("products")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${pageTab === "products" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"}`}
            >
              <Package className="h-3.5 w-3.5" />Products
            </button>
            <button
              onClick={() => setPageTab("purchases")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${pageTab === "purchases" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"}`}
            >
              <ShoppingCart className="h-3.5 w-3.5" />Purchases
              {purchases && purchases.length > 0 && (
                <span className="ml-0.5 bg-primary/20 text-primary rounded-full px-1.5 text-[10px] font-bold">{purchases.length}</span>
              )}
            </button>
          </div>
          {pageTab === "products" && (
            <Button onClick={openAdd} className="gap-2">
              <Plus className="h-4 w-4" />Add Product
            </Button>
          )}
        </div>
      </div>

      {/* Low stock / out of stock alert banner */}
      {pageTab === "products" && !isLoading && (lowStockProducts.length > 0 || outOfStockProducts.length > 0) && (
        <div className="flex flex-wrap gap-3">
          {outOfStockProducts.length > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm">
              <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
              <span className="font-medium text-destructive">{outOfStockProducts.length} product{outOfStockProducts.length > 1 ? "s" : ""} out of stock</span>
              <span className="text-muted-foreground text-xs">{outOfStockProducts.map(p => p.name).join(", ")}</span>
            </div>
          )}
          {lowStockProducts.length > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-4 py-2.5 text-sm">
              <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0" />
              <span className="font-medium text-yellow-500">{lowStockProducts.length} product{lowStockProducts.length > 1 ? "s" : ""} running low</span>
              <span className="text-muted-foreground text-xs">({lowStockProducts.map(p => `${p.name} (${p.stockCount})`).join(", ")})</span>
            </div>
          )}
        </div>
      )}

      {pageTab === "products" && (
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
      )}

      {/* ── PRODUCTS TAB ── */}
      {pageTab === "products" && (isLoading ? (
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
            {filteredProducts.map((product) => {
              const isLow = product.inStock && product.stockCount > 0 && product.stockCount <= LOW_STOCK_THRESHOLD;
              const isOut = !product.inStock || product.stockCount === 0;
              return (
              <motion.div key={product.id} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}>
                <Card className={`group hover:border-primary/50 transition-colors ${isOut ? "border-destructive/30" : isLow ? "border-yellow-500/30" : ""}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-sm font-semibold leading-snug flex-1 truncate">{product.name}</CardTitle>
                      <Badge variant="outline" className="text-[10px] shrink-0">{product.category}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xl font-bold font-mono text-primary">{formatCurrency(product.price)}</p>
                      <div className="flex items-center gap-1.5 flex-wrap justify-end">
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
                        {isOut ? (
                          <Badge variant="destructive" className="text-[10px] h-4 gap-0.5 px-1">
                            <AlertTriangle className="h-2.5 w-2.5" />Out
                          </Badge>
                        ) : isLow ? (
                          <Badge className="text-[10px] h-4 gap-0.5 px-1 bg-yellow-500/20 text-yellow-400 border-yellow-500/40 hover:bg-yellow-500/30">
                            <AlertTriangle className="h-2.5 w-2.5" />{product.stockCount} left
                          </Badge>
                        ) : (
                          <Badge variant="default" className="text-[10px] h-4">
                            {product.stockCount} in stock
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button size="sm" variant="outline" className="h-7 text-xs px-2 text-blue-400 border-blue-400/40 hover:bg-blue-400/10" onClick={() => openRestock(product)}>
                        <PackagePlus className="h-3 w-3 mr-1" />Restock
                      </Button>
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
            );
            })}
          </AnimatePresence>
        </div>
      ) : (
        /* ── LIST VIEW ── */
        <div className="rounded-xl border border-border overflow-hidden">
          {/* Header row */}
          <div className="grid grid-cols-[1fr_120px_100px_140px_100px_120px] gap-4 px-4 py-2.5 bg-secondary/40 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            <span>Product</span>
            <span>Category</span>
            <span className="text-right">Price</span>
            <span>Stock</span>
            <span>Add-ons</span>
            <span className="text-right">Actions</span>
          </div>
          <AnimatePresence initial={false}>
            {filteredProducts.map((product, i) => {
              const isLow = product.inStock && product.stockCount > 0 && product.stockCount <= LOW_STOCK_THRESHOLD;
              const isOut = !product.inStock || product.stockCount === 0;
              return (
              <motion.div
                key={product.id}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ delay: i * 0.02 }}
                className={`grid grid-cols-[1fr_120px_100px_140px_100px_120px] gap-4 px-4 py-3 items-center border-b border-border/50 last:border-0 hover:bg-secondary/20 transition-colors group`}
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
                  {isOut ? (
                    <Badge variant="destructive" className="text-[10px] gap-0.5">
                      <AlertTriangle className="h-2.5 w-2.5" />Out of stock
                    </Badge>
                  ) : isLow ? (
                    <Badge className="text-[10px] gap-0.5 bg-yellow-500/20 text-yellow-400 border-yellow-500/40 hover:bg-yellow-500/30">
                      <AlertTriangle className="h-2.5 w-2.5" />{product.stockCount} left — low
                    </Badge>
                  ) : (
                    <Badge variant="default" className="text-[10px]">
                      {product.stockCount} in stock
                    </Badge>
                  )}
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
                <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button size="icon" variant="outline" className="h-7 w-7 text-blue-400 border-blue-400/40 hover:bg-blue-400/10" title="Restock" onClick={() => openRestock(product)}>
                    <PackagePlus className="h-3 w-3" />
                  </Button>
                  <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => openEdit(product)}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button size="icon" variant="outline" className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:border-destructive" onClick={() => setDeleteId(product.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </motion.div>
            );
            })}
          </AnimatePresence>
        </div>
      ))}

      {/* ── PURCHASES TAB ── */}
      {pageTab === "purchases" && (
        <div className="space-y-5">
          {billView === "list" ? (
            <>
              {/* Stats */}
              <div className="grid grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-4 pb-4">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Total Bills</p>
                    <p className="text-2xl font-bold mt-1">{bills?.length ?? 0}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-4">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Draft Bills</p>
                    <p className="text-2xl font-bold mt-1 text-yellow-400">{bills?.filter(b => b.status === "draft").length ?? 0}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-4">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Total Items Ordered</p>
                    <p className="text-2xl font-bold mt-1">{bills?.reduce((s, b) => s + b.itemCount, 0) ?? 0}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-4">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Total Cost</p>
                    <p className="text-2xl font-bold mt-1">{formatCurrency(bills?.reduce((s, b) => s + b.totalCost, 0) ?? 0)}</p>
                  </CardContent>
                </Card>
              </div>

              {/* Header + action */}
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Purchase Bills</h3>
                <Button className="gap-2" onClick={() => { setBillForm(emptyBillForm()); setBillView("new"); }}>
                  <Plus className="h-4 w-4" />New Purchase Bill
                </Button>
              </div>

              {/* Bills table */}
              {!bills?.length ? (
                <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
                  <Truck className="h-12 w-12 opacity-30" />
                  <p className="text-lg">No purchase bills yet</p>
                  <p className="text-sm">Create a purchase bill to record deliveries and update inventory for multiple products at once.</p>
                  <Button variant="outline" className="mt-2 gap-2" onClick={() => { setBillForm(emptyBillForm()); setBillView("new"); }}>
                    <Plus className="h-4 w-4" />New Purchase Bill
                  </Button>
                </div>
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <div className="grid grid-cols-[1fr_160px_80px_100px_120px_120px_100px] gap-3 px-4 py-2.5 bg-secondary/40 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    <span>Bill #</span>
                    <span>Supplier</span>
                    <span className="text-center">Items</span>
                    <span className="text-right">Total</span>
                    <span>Status</span>
                    <span>Date</span>
                    <span className="text-right">Actions</span>
                  </div>
                  <AnimatePresence initial={false}>
                    {bills.map((bill, i) => (
                      <motion.div
                        key={bill.id}
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ delay: i * 0.02 }}
                        className="grid grid-cols-[1fr_160px_80px_100px_120px_120px_100px] gap-3 px-4 py-3 items-center border-b border-border/50 last:border-0 hover:bg-secondary/20 transition-colors group"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
                          <p className="text-sm font-semibold font-mono truncate">{bill.billNumber}</p>
                        </div>
                        <p className="text-sm text-muted-foreground truncate">{bill.supplier ?? "—"}</p>
                        <p className="text-sm font-bold text-center">{bill.itemCount}</p>
                        <p className="text-sm font-bold font-mono text-right">{formatCurrency(bill.totalCost)}</p>
                        <div>
                          {bill.status === "draft" ? (
                            <Badge className="text-[10px] bg-yellow-500/20 text-yellow-400 border-yellow-500/40 hover:bg-yellow-500/30 gap-0.5">
                              <Clock className="h-2.5 w-2.5" />Draft
                            </Badge>
                          ) : (
                            <Badge className="text-[10px] bg-green-500/20 text-green-400 border-green-500/40 hover:bg-green-500/30 gap-0.5">
                              <CheckCircle2 className="h-2.5 w-2.5" />Received
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {new Date(bill.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </p>
                        <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button size="icon" variant="outline" className="h-7 w-7" title="View" onClick={() => setViewBillId(bill.id)}>
                            <Eye className="h-3 w-3" />
                          </Button>
                          {bill.status === "draft" && (
                            <>
                              <Button size="icon" variant="outline" className="h-7 w-7 text-green-400 border-green-500/40 hover:bg-green-500/10" title="Confirm & Receive" onClick={() => handleConfirmBill(bill.id)}>
                                <CheckCircle2 className="h-3 w-3" />
                              </Button>
                              <Button size="icon" variant="outline" className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:border-destructive" title="Delete" onClick={() => handleDeleteBill(bill.id)}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </>
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </>
          ) : (
            /* ── NEW BILL FORM ── */
            <div className="space-y-5">
              {/* Form header */}
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground" onClick={() => setBillView("list")}>
                  <ArrowLeft className="h-3.5 w-3.5" />Bills
                </Button>
                <span className="text-muted-foreground">/</span>
                <h3 className="text-lg font-semibold">New Purchase Bill</h3>
              </div>

              {/* Bill Info */}
              <Card>
                <CardContent className="pt-4 pb-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="grid gap-1.5">
                      <Label className="text-xs text-muted-foreground uppercase tracking-wide">Bill Number *</Label>
                      <Input
                        value={billForm.billNumber}
                        onChange={(e) => setBillForm((f) => ({ ...f, billNumber: e.target.value }))}
                        placeholder="PO-20260404-001"
                        className="font-mono"
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label className="text-xs text-muted-foreground uppercase tracking-wide">Supplier</Label>
                      <Input
                        value={billForm.supplier}
                        onChange={(e) => setBillForm((f) => ({ ...f, supplier: e.target.value }))}
                        placeholder="Supplier name"
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label className="text-xs text-muted-foreground uppercase tracking-wide">Notes</Label>
                      <Input
                        value={billForm.notes}
                        onChange={(e) => setBillForm((f) => ({ ...f, notes: e.target.value }))}
                        placeholder="Optional notes"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Line Items */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold">Line Items</h4>
                  <span className="text-xs text-muted-foreground">{billForm.items.length} item{billForm.items.length !== 1 ? "s" : ""}</span>
                </div>

                <div className="rounded-xl border border-border overflow-hidden">
                  {/* Header row */}
                  <div className="grid grid-cols-[2fr_100px_130px_120px_40px] gap-3 px-4 py-2.5 bg-secondary/40 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    <span>Product</span>
                    <span className="text-right">Qty</span>
                    <span className="text-right">Unit Cost</span>
                    <span className="text-right">Line Total</span>
                    <span />
                  </div>

                  {/* Item rows */}
                  {billForm.items.map((item, idx) => (
                    <div
                      key={item.tempId}
                      className="grid grid-cols-[2fr_100px_130px_120px_40px] gap-3 px-4 py-2 items-center border-b border-border/40 last:border-0"
                    >
                      {/* Product select */}
                      <Select
                        value={item.productId}
                        onValueChange={(v) => updateLineItem(item.tempId, { productId: v })}
                      >
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue placeholder="Select product…" />
                        </SelectTrigger>
                        <SelectContent>
                          {products?.map((p) => (
                            <SelectItem key={p.id} value={String(p.id)}>
                              <span className="flex items-center gap-2">
                                {p.name}
                                <span className="text-muted-foreground text-xs">({p.stockCount} in stock)</span>
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {/* Qty */}
                      <Input
                        type="number"
                        min="1"
                        placeholder="0"
                        value={item.quantity}
                        onChange={(e) => updateLineItem(item.tempId, { quantity: e.target.value })}
                        className="h-8 text-sm text-right"
                      />

                      {/* Unit cost */}
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          value={item.unitCost}
                          onChange={(e) => updateLineItem(item.tempId, { unitCost: e.target.value })}
                          className="h-8 text-sm pl-6 text-right"
                        />
                      </div>

                      {/* Line total */}
                      <p className="text-sm font-bold font-mono text-right text-primary">
                        {billLineTotal(item) > 0 ? formatCurrency(billLineTotal(item)) : "—"}
                      </p>

                      {/* Delete row */}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                        onClick={() => removeLineItem(item.tempId)}
                        disabled={billForm.items.length === 1}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}

                  {/* Add item row */}
                  <div className="px-4 py-2.5 border-t border-border/40 bg-secondary/20">
                    <Button size="sm" variant="ghost" className="gap-1.5 text-sm text-primary hover:text-primary" onClick={addLineItem}>
                      <Plus className="h-3.5 w-3.5" />Add Item
                    </Button>
                  </div>
                </div>

                {/* Grand total row */}
                <div className="flex items-center justify-end gap-4 px-4 py-2">
                  <span className="text-sm text-muted-foreground">
                    {billForm.items.filter((i) => i.productId && parseInt(i.quantity) > 0).length} valid items
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">Grand Total:</span>
                    <span className="text-xl font-bold font-mono text-primary">{formatCurrency(billGrandTotal)}</span>
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-3 justify-end pt-2 border-t border-border">
                <Button variant="outline" onClick={() => setBillView("list")}>Cancel</Button>
                <Button
                  variant="outline"
                  className="gap-2 border-yellow-500/40 text-yellow-400 hover:bg-yellow-500/10"
                  onClick={() => handleSaveBill("draft")}
                  disabled={createBill.isPending}
                >
                  <Clock className="h-4 w-4" />Save as Draft
                </Button>
                <Button
                  className="gap-2 bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => handleSaveBill("confirmed")}
                  disabled={createBill.isPending}
                >
                  <CheckCircle2 className="h-4 w-4" />Confirm & Receive Inventory
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bill Detail dialog */}
      <Dialog open={!!viewBillId} onOpenChange={(o) => !o && setViewBillId(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              Purchase Bill: {viewBillDetail?.billNumber}
              {viewBillDetail && (
                <span className="ml-2">
                  {viewBillDetail.status === "draft" ? (
                    <Badge className="text-[10px] bg-yellow-500/20 text-yellow-400 border-yellow-500/40 gap-0.5">
                      <Clock className="h-2.5 w-2.5" />Draft
                    </Badge>
                  ) : (
                    <Badge className="text-[10px] bg-green-500/20 text-green-400 border-green-500/40 gap-0.5">
                      <CheckCircle2 className="h-2.5 w-2.5" />Received
                    </Badge>
                  )}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          {viewBillDetail && (
            <div className="flex-1 overflow-y-auto space-y-4 py-2">
              {/* Bill info */}
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-0.5">Supplier</p>
                  <p className="font-medium">{viewBillDetail.supplier ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-0.5">Date</p>
                  <p className="font-medium">{new Date(viewBillDetail.createdAt).toLocaleDateString("en-US", { dateStyle: "medium" })}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-0.5">Notes</p>
                  <p className="font-medium">{viewBillDetail.notes ?? "—"}</p>
                </div>
              </div>

              {/* Items table */}
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="grid grid-cols-[2fr_80px_100px_100px] gap-3 px-4 py-2 bg-secondary/40 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  <span>Product</span>
                  <span className="text-right">Qty</span>
                  <span className="text-right">Unit Cost</span>
                  <span className="text-right">Total</span>
                </div>
                {viewBillDetail.items.map((item, i) => (
                  <div key={item.id} className={`grid grid-cols-[2fr_80px_100px_100px] gap-3 px-4 py-2.5 items-center ${i < viewBillDetail.items.length - 1 ? "border-b border-border/50" : ""}`}>
                    <div className="flex items-center gap-2">
                      <Package className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <p className="text-sm font-semibold">{item.productName}</p>
                    </div>
                    <p className="text-sm font-bold font-mono text-right text-green-400">+{item.quantity}</p>
                    <p className="text-sm font-mono text-right">{item.unitCost > 0 ? formatCurrency(item.unitCost) : "—"}</p>
                    <p className="text-sm font-bold font-mono text-right">{item.totalCost > 0 ? formatCurrency(item.totalCost) : "—"}</p>
                  </div>
                ))}
                <div className="grid grid-cols-[2fr_80px_100px_100px] gap-3 px-4 py-2.5 border-t border-border bg-secondary/20">
                  <span className="text-xs font-semibold text-muted-foreground uppercase col-span-3 text-right">Grand Total</span>
                  <p className="text-base font-bold font-mono text-right text-primary">{formatCurrency(viewBillDetail.totalCost)}</p>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewBillId(null)}>Close</Button>
            {viewBillDetail?.status === "draft" && (
              <>
                <Button
                  variant="outline"
                  className="text-destructive hover:bg-destructive/10 border-destructive/40"
                  onClick={() => handleDeleteBill(viewBillDetail.id)}
                  disabled={deleteBill.isPending}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />Delete Draft
                </Button>
                <Button
                  className="gap-2 bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => handleConfirmBill(viewBillDetail.id)}
                  disabled={confirmBill.isPending}
                >
                  <CheckCircle2 className="h-4 w-4" />Confirm & Receive Inventory
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restock dialog */}
      <Dialog open={!!restockProduct} onOpenChange={(o) => !o && setRestockProduct(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PackagePlus className="h-4 w-4 text-blue-400" />
              Restock: {restockProduct?.name}
            </DialogTitle>
          </DialogHeader>
          {restockProduct && (
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-3 rounded-lg border border-border bg-secondary/30 px-3 py-2 text-sm">
                <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">Current stock:</span>
                <span className="font-bold ml-auto">{restockProduct.stockCount} units</span>
              </div>
              <div className="grid gap-1.5">
                <Label>Quantity to receive *</Label>
                <Input
                  type="number"
                  min="1"
                  placeholder="e.g. 50"
                  value={restockForm.quantity}
                  onChange={(e) => setRestockForm((f) => ({ ...f, quantity: e.target.value }))}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Unit cost <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={restockForm.unitCost}
                  onChange={(e) => setRestockForm((f) => ({ ...f, unitCost: e.target.value }))}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Notes <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Input
                  placeholder="e.g. Supplier: ABC Foods"
                  value={restockForm.notes}
                  onChange={(e) => setRestockForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>
              {restockForm.quantity && parseInt(restockForm.quantity) > 0 && (
                <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm flex items-center justify-between">
                  <span className="text-muted-foreground">New stock level:</span>
                  <span className="font-bold text-green-400">{restockProduct.stockCount + parseInt(restockForm.quantity)} units</span>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRestockProduct(null)}>Cancel</Button>
            <Button onClick={handleRestock} disabled={createPurchase.isPending} className="gap-2">
              <PackagePlus className="h-4 w-4" />Confirm Restock
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              <TabsTrigger value="locations" disabled={!editingProduct}>Locations</TabsTrigger>
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

              <TabsContent value="locations" className="mt-0">
                {editingProduct && <LocationsEditor productId={editingProduct.id} />}
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
