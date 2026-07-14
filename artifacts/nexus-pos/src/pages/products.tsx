import React, { useState, useEffect, useMemo, useDeferredValue, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useStaff } from "@/contexts/StaffContext";
import { motion, AnimatePresence } from "framer-motion";
import {
  useListProducts,
  useCreateProduct,
  useUpdateProduct,
  useDeleteProduct,
  useDeleteProductPermanent,
  useBulkArchiveProducts,
  useBulkRestoreProducts,
  useBulkPermanentDeleteProducts,
  useListProductCategories,
  useFindDuplicateProducts,
  getFindDuplicateProductsQueryKey,
  useMergeProducts,
  type DuplicateGroup,
  useGetProductVariants,
  useSaveProductVariants,
  useGetProductModifiers,
  useSaveProductModifiers,
  useListPurchases,
  useCreatePurchase,
  useListPurchaseBills,
  useCreatePurchaseBill,
  useGetPurchaseBill,
  useUpdatePurchaseBill,
  useConfirmPurchaseBill,
  useDeletePurchaseBill,
  useListPurchaseOrders,
  useCreatePurchaseOrder,
  useGetPurchaseOrder,
  useUpdatePurchaseOrder,
  useDeletePurchaseOrder,
  useGetSettings,
  useUpdateSettings,
  useGetProductStockHistory,
  useListVendors,
  useGetCompositeComponents,
  useSaveCompositeComponents,
  useGetCompositeCost,
  useGetAvailableComposite,
} from "@workspace/api-client-react";
import type { GetProductResponse } from "@workspace/api-zod";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { PricingUnitsEditor } from "@/components/PricingUnitsEditor";
import { SubscriptionExpiredDialog } from "@/components/SubscriptionExpiredDialog";
import { ProductUnitsManager } from "@/components/ProductUnitsManager";
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
  DialogDescription,
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
import { Plus, Pencil, Trash2, Search, Package, X, Settings2, Layers, LayoutGrid, List, AlertTriangle, PackagePlus, ShoppingCart, Clock, FileText, CheckCircle2, Eye, ArrowLeft, Truck, ChevronRight, ChevronUp, ChevronDown, MapPin, FileSpreadsheet, Upload, FileDown, Printer, TrendingUp, TrendingDown, History, ChevronsUpDown, Check, Archive, RotateCcw, Copy, GitMerge, ClipboardList, Send, Ban, ArrowRight, Ruler } from "lucide-react";
import { TENANT_TOKEN_KEY, getPlanLimitStatus, type PlanLimitStatus } from "@/lib/saas-api";
import { useLocation } from "wouter";
import { printPurchaseOrder } from "@/lib/purchase-order-doc";
import { csvDownload, parseSpreadsheet, type ImportResult } from "@/lib/spreadsheet-import";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandItem } from "@/components/ui/command";

const DEFAULT_CATEGORIES = ["Beverages", "Food", "Bakery", "Merchandise", "Other"];

function parseCategorySetting(raw: string | undefined): string[] {
  if (!raw) return DEFAULT_CATEGORIES;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed as string[];
    return DEFAULT_CATEGORIES;
  } catch { return DEFAULT_CATEGORIES; }
}

/* ─── Category Manager Dialog ─── */
function CategoryManagerDialog({ open, onClose, categories, onSave }: {
  open: boolean;
  onClose: () => void;
  categories: string[];
  onSave: (updated: string[]) => void;
}) {
  const [list, setList] = useState<string[]>([]);
  const [newCat, setNewCat] = useState("");
  const { toast } = useToast();
  const listRef = React.useRef<HTMLDivElement>(null);

  // Reset local state and scroll position whenever dialog opens
  useEffect(() => {
    if (open) {
      setList([...categories]);
      setNewCat("");
      // Reset scroll so the first category is always visible on open
      if (listRef.current) listRef.current.scrollTop = 0;
    }
  }, [open, categories]);

  const addCategory = () => {
    const name = newCat.trim();
    if (!name) return;
    if (list.some(c => c.toLowerCase() === name.toLowerCase())) {
      toast({ title: "Category already exists", variant: "destructive" }); return;
    }
    setList(prev => [...prev, name]);
    setNewCat("");
    // Scroll the list to the bottom after React flushes so the new item is visible
    setTimeout(() => {
      if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
    }, 0);
  };

  const removeCategory = (cat: string) => {
    setList(prev => prev.filter(c => c !== cat));
  };

  const moveUp = (i: number) => {
    if (i === 0) return;
    setList(prev => { const a = [...prev]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; return a; });
  };

  const moveDown = (i: number) => {
    setList(prev => { if (i >= prev.length - 1) return prev; const a = [...prev]; [a[i], a[i + 1]] = [a[i + 1], a[i]]; return a; });
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-primary" />
            Manage Product Categories
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Add new */}
          <div className="flex gap-2">
            <Input
              placeholder="New category name…"
              value={newCat}
              onChange={e => setNewCat(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCategory(); } }}
              className="flex-1"
            />
            <Button onClick={addCategory} disabled={!newCat.trim()} className="gap-1.5 shrink-0">
              <Plus className="h-4 w-4" />Add
            </Button>
          </div>

          {/* List */}
          <div ref={listRef} className="rounded-lg border border-border divide-y divide-border/60 max-h-72 overflow-y-auto">
            {list.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">No categories yet</p>
            )}
            {list.map((cat, i) => (
              <div key={cat} className="flex items-center gap-2 px-3 py-2.5">
                <span className="flex-1 text-sm font-medium">{cat}</span>
                <div className="flex items-center gap-0.5">
                  <button onClick={() => moveUp(i)} disabled={i === 0} className="p-1 rounded hover:bg-secondary/60 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors">
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => moveDown(i)} disabled={i === list.length - 1} className="p-1 rounded hover:bg-secondary/60 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors">
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => removeCategory(cat)} className="p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors ml-1">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Drag order affects both filter buttons and product form dropdown.</p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { onSave(list); onClose(); }} disabled={list.length === 0}>
            Save Categories
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
const LOW_STOCK_THRESHOLD = 10;

type RestockForm = {
  quantity: string;
  unitCost: string;
  notes: string;
  // Case-cost calculator: enter cost per case + units per case to derive unitCost.
  casePrice: string;
  unitsPerCase: string;
  // When the new unit cost is higher than the current cost, keep the existing
  // markup % by raising the selling price (instead of letting markup erode).
  keepMarkup: boolean;
};
const emptyRestockForm = (): RestockForm => ({ quantity: "", unitCost: "", notes: "", casePrice: "", unitsPerCase: "", keepMarkup: true });

// taxRate is a string so an empty value means "inherit bill default".
// Anything else parses as a percentage.
type BillLineItem = { tempId: string; productId: string; quantity: string; unitCost: string; taxRate: string; batchNumber: string; expiryDate: string };
type BillForm = { billNumber: string; supplier: string; notes: string; defaultTaxRate: string; taxMode: "exclusive" | "inclusive"; items: BillLineItem[] };

// Purchase Order form. POs are an ordering document with NO batch/expiry and no
// stock/accounting side effects. The PO number is generated server-side, so it
// is not part of the create form. taxRate empty = inherit PO default.
type PoLineItem = { tempId: string; productId: string; quantity: string; unitCost: string; taxRate: string };
type PoForm = { supplier: string; expectedDate: string; notes: string; defaultTaxRate: string; taxMode: "exclusive" | "inclusive"; items: PoLineItem[] };

// One row in the post-confirm "review cost changes" dialog. The user can
// edit `newPrice` before applying.
type CostChangeRow = {
  productId: number;
  productName: string;
  oldCost: number | null;
  newCost: number;
  currentPrice: number;
  // Markup % on the new cost, kept in sync with newPrice (UI-only).
  markup: string;
  newPrice: string;
  apply: boolean;
};

function generateBillNumber() {
  const d = new Date();
  const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = Math.floor(Math.random() * 900 + 100);
  return `PO-${dateStr}-${rand}`;
}
function emptyLineItem(): BillLineItem {
  return { tempId: makeId(), productId: "", quantity: "", unitCost: "", taxRate: "", batchNumber: "", expiryDate: "" };
}
function emptyBillForm(): BillForm {
  return { billNumber: generateBillNumber(), supplier: "", notes: "", defaultTaxRate: "", taxMode: "exclusive", items: [emptyLineItem()] };
}
function emptyPoLineItem(): PoLineItem {
  return { tempId: makeId(), productId: "", quantity: "", unitCost: "", taxRate: "" };
}
function emptyPoForm(): PoForm {
  return { supplier: "", expectedDate: "", notes: "", defaultTaxRate: "", taxMode: "exclusive", items: [emptyPoLineItem()] };
}

/* ─── Product form types ─── */
type WeightUnit = "kg" | "lb" | "oz" | "g";
type StructureType = "simple" | "composite";
type ProductForm = {
  name: string;
  description: string;
  price: string;
  category: string;
  barcode: string;
  sku: string;
  // Optional free-text size label (e.g. "12 inch", "Large", "500ml"). Empty
  // string = "not set". Gated behind the show_product_size tenant setting.
  size: string;
  inStock: boolean;
  stockCount: string;
  soldByWeight: boolean;
  unitOfMeasure: WeightUnit;
  // Optional free-text selling unit / UOM label (e.g. "each", "case",
  // "pieces"). Empty string = "not set". Display-only on POS + receipts.
  sellingUnit: string;
  // Cost basis for COGS / margin reports. Empty string = "not set" — we
  // send null to the API in that case so the column stays NULL.
  costPrice: string;
  // Simple = standard SKU. Composite = bundle whose stock and cost are
  // derived from its child components (see CompositeEditor).
  structureType: StructureType;
  // When false, sales tax is not applied to this product at checkout.
  isTaxable: boolean;
  // When true, stock is tracked per-batch with batch/lot + expiry on receipt.
  trackBatches: boolean;
  // Per-product FIFO/LIFO override; "" = inherit tenant setting.
  stockMethodOverride: "" | "fifo" | "lifo";
  // Markup % on cost (UI-only helper, never persisted to the DB/OpenAPI).
  // Keeps Cost / Markup / Selling Price in sync; pre-filled from the tenant
  // default_markup_percentage setting. price = cost * (1 + markup/100).
  markup: string;
  // Optional brand / manufacturer name. Empty string = "not set" — sent as
  // null to the API so the column stays NULL.
  brand: string;
};

const emptyForm = (): ProductForm => ({
  name: "",
  description: "",
  price: "",
  category: "Beverages",
  barcode: "",
  sku: "",
  brand: "",
  size: "",
  inStock: true,
  stockCount: "0",
  soldByWeight: false,
  unitOfMeasure: "kg",
  sellingUnit: "",
  costPrice: "",
  structureType: "simple",
  isTaxable: true,
  trackBatches: false,
  stockMethodOverride: "",
  markup: "",
});

// ─── Markup math (markup is ON COST) ───────────────────────────────────────
// price = cost * (1 + markup/100); markup = (price - cost)/cost * 100;
// cost = price / (1 + markup/100). Markup is a UI-only convenience value used
// to keep the Cost / Markup% / Selling Price trio in sync — it is never sent
// to or stored by the API.
const round2 = (n: number): string => (Math.round(n * 100) / 100).toFixed(2);
const calcPriceFromMarkup = (cost: number, markup: number): number => cost * (1 + markup / 100);
const calcMarkupFromPrice = (cost: number, price: number): number =>
  cost > 0 ? ((price - cost) / cost) * 100 : 0;
const calcCostFromPrice = (price: number, markup: number): number => price / (1 + markup / 100);

/* ─── Variant/modifier editor types ─── */
type DraftOption = { tempId: string; name: string; priceAdjustment: string; stockCount: string; optionId: number | null; sku: string };
type DraftVariantGroup = { tempId: string; name: string; required: boolean; options: DraftOption[]; groupId: number | null };
type DraftCombination = { label: string; optionNames: string[]; combinationId: number | null; price: string; stockCount: string; sku: string };
type DraftModifierGroup = { tempId: string; name: string; required: boolean; minSelections: string; maxSelections: string; options: DraftOption[] };

function makeId() { return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }
function emptyOption(): DraftOption { return { tempId: makeId(), name: "", priceAdjustment: "0", stockCount: "", optionId: null, sku: "" }; }
function emptyVariantGroup(): DraftVariantGroup { return { tempId: makeId(), name: "", required: true, options: [emptyOption()], groupId: null }; }
function emptyModifierGroup(): DraftModifierGroup { return { tempId: makeId(), name: "", required: false, minSelections: "0", maxSelections: "0", options: [emptyOption()] }; }

function formatCurrency(v: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);
}

/* ─── Variant editor ─── */
function cartesian<T>(arrays: T[][]): T[][] {
  return arrays.reduce<T[][]>(
    (acc, arr) => acc.flatMap((combo) => arr.map((item) => [...combo, item])),
    [[]],
  );
}

function VariantEditor({ productId }: { productId: number }) {
  const { data: serverData } = useGetProductVariants(productId);
  const saveVariants = useSaveProductVariants();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [groups, setGroups] = useState<DraftVariantGroup[]>([]);
  // keyed by label (e.g. "Med/Red") → override values entered by the user
  const [comboOverrides, setComboOverrides] = useState<Map<string, { combinationId: number | null; price: string; stockCount: string; sku: string }>>(new Map());
  const [dirty, setDirty] = useState(false);

  // Hydrate from server
  useEffect(() => {
    if (!serverData) return;
    // The API now returns {groups, combinations}
    const payload = serverData as unknown as { groups: Array<{ id: number; name: string; required: boolean; options: Array<{ id: number; name: string; priceAdjustment: number; stockCount: number | null; sku: string | null }> }>; combinations: Array<{ id: number; label: string; stockCount: number | null; sku: string | null }> };
    const serverGroups = Array.isArray(payload?.groups) ? payload.groups : [];
    const serverCombinations = Array.isArray(payload?.combinations) ? payload.combinations : [];

    setGroups(
      serverGroups.map((g) => ({
        tempId: makeId(),
        name: g.name,
        required: g.required,
        groupId: g.id,
        options: g.options.map((o) => ({
          tempId: makeId(),
          name: o.name,
          priceAdjustment: o.priceAdjustment.toString(),
          stockCount: o.stockCount != null ? String(o.stockCount) : "",
          optionId: o.id,
          sku: o.sku ?? "",
        })),
      })),
    );

    const newOverrides = new Map<string, { combinationId: number | null; price: string; stockCount: string; sku: string }>();
    for (const c of serverCombinations) {
      newOverrides.set(c.label, {
        combinationId: c.id,
        price: (c as { price?: number | null }).price != null ? String((c as { price: number }).price) : "",
        stockCount: c.stockCount != null ? String(c.stockCount) : "",
        sku: c.sku ?? "",
      });
    }
    setComboOverrides(newOverrides);
    setDirty(false);
  }, [serverData]);

  const activeGroups = groups.filter((g) => g.name.trim());
  const isMultiGroup = activeGroups.length >= 2;

  // Compute live cross-product for the combination matrix
  const combinations: DraftCombination[] = useMemo(() => {
    if (!isMultiGroup) return [];
    const optArrays = activeGroups.map((g) => g.options.filter((o) => o.name.trim()).map((o) => o.name.trim()));
    if (optArrays.some((a) => a.length === 0)) return [];
    return cartesian(optArrays).map((names) => {
      const label = names.join("/");
      const ov = comboOverrides.get(label);
      return { label, optionNames: names, combinationId: ov?.combinationId ?? null, price: ov?.price ?? "", stockCount: ov?.stockCount ?? "", sku: ov?.sku ?? "" };
    });
  }, [activeGroups, isMultiGroup, comboOverrides]);

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
  const updateCombo = (label: string, patch: { price?: string; stockCount?: string; sku?: string }) => {
    setComboOverrides((prev) => {
      const next = new Map(prev);
      const cur = next.get(label) ?? { combinationId: null, price: "", stockCount: "", sku: "" };
      next.set(label, { ...cur, ...patch });
      return next;
    });
    setDirty(true);
  };

  const handleSave = () => {
    saveVariants.mutate(
      {
        id: productId,
        data: {
          groups: groups.filter((g) => g.name.trim()).map((g) => ({
            groupId: g.groupId ?? undefined,
            name: g.name,
            required: g.required,
            options: g.options.filter((o) => o.name.trim()).map((o) => ({
              optionId: o.optionId ?? undefined,
              name: o.name,
              priceAdjustment: parseFloat(o.priceAdjustment) || 0,
              // Multi-group: stock is tracked at combination level, not option level
              stockCount: isMultiGroup ? null : (o.stockCount.trim() !== "" ? parseFloat(o.stockCount) : null),
              sku: o.sku.trim() || undefined,
            })),
          })),
          combinations: isMultiGroup
            ? combinations.map((c) => ({
                combinationId: c.combinationId ?? undefined,
                optionNames: c.optionNames,
                price: c.price.trim() !== "" ? parseFloat(c.price) : null,
                stockCount: c.stockCount.trim() !== "" ? parseFloat(c.stockCount) : null,
                sku: c.sku.trim() || undefined,
              }))
            : undefined,
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
      <p className="text-xs text-muted-foreground">
        Variant groups let customers choose between options (e.g., Size: Small / Medium / Large).
        {isMultiGroup && " With 2+ groups, stock is tracked per combination (e.g. Med/Red)."}
      </p>

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
              <div className="flex items-center gap-2 pb-0.5">
                <span className="flex-1 text-[10px] text-muted-foreground/60">Option</span>
                {!isMultiGroup && <span className="w-20 text-[10px] text-muted-foreground/60 text-center">Price (total)</span>}
                {!isMultiGroup && <span className="w-16 text-[10px] text-muted-foreground/60 text-center">Qty</span>}
                <span className="w-7" />
              </div>
              {group.options.map((opt) => (
                <div key={opt.tempId} className="flex items-center gap-2">
                  <Input
                    placeholder="Option name (e.g. Large)"
                    value={opt.name}
                    onChange={(e) => updateOption(group.tempId, opt.tempId, { name: e.target.value })}
                    className="flex-1 h-7 text-xs"
                  />
                  {!isMultiGroup && (
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                    <Input
                      type="number"
                      min="0"
                      placeholder="—"
                      value={opt.priceAdjustment}
                      onChange={(e) => updateOption(group.tempId, opt.tempId, { priceAdjustment: e.target.value })}
                      className="w-20 h-7 text-xs pl-5"
                      title="Total price for this variant. Leave blank to use the product base price."
                    />
                  </div>
                  )}
                  {!isMultiGroup && (
                    <Input
                      type="number"
                      min="0"
                      placeholder="—"
                      value={opt.stockCount}
                      onChange={(e) => updateOption(group.tempId, opt.tempId, { stockCount: e.target.value })}
                      className="w-16 h-7 text-xs text-center"
                      title="Stock quantity for this variant. Leave blank to use product-level stock."
                    />
                  )}
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

      {/* ── Combination stock matrix (shown when 2+ groups) ── */}
      {isMultiGroup && combinations.length > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="pt-3 pb-3 space-y-2">
            <p className="text-xs font-medium text-foreground/80 mb-1">Combination matrix — set price, qty and SKU per combination</p>
            <div className="flex items-center gap-2 pb-0.5">
              <span className="flex-1 text-[10px] text-muted-foreground/60">Combination</span>
              <span className="w-20 text-[10px] text-muted-foreground/60 text-center">Price ($)</span>
              <span className="w-16 text-[10px] text-muted-foreground/60 text-center">Qty</span>
              <span className="w-24 text-[10px] text-muted-foreground/60">SKU</span>
            </div>
            <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
              {combinations.map((combo) => (
                <div key={combo.label} className="flex items-center gap-2">
                  <span className="flex-1 text-xs text-foreground/80 font-mono truncate">{combo.label}</span>
                  <div className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">$</span>
                    <Input
                      type="number"
                      min="0"
                      placeholder="—"
                      value={combo.price}
                      onChange={(e) => updateCombo(combo.label, { price: e.target.value })}
                      className="w-20 h-7 text-xs pl-4 text-center"
                      title="Total product price for this combination. Leave blank to use base price."
                    />
                  </div>
                  <Input
                    type="number"
                    min="0"
                    placeholder="—"
                    value={combo.stockCount}
                    onChange={(e) => updateCombo(combo.label, { stockCount: e.target.value })}
                    className="w-16 h-7 text-xs text-center"
                  />
                  <Input
                    placeholder="SKU"
                    value={combo.sku}
                    onChange={(e) => updateCombo(combo.label, { sku: e.target.value })}
                    className="w-24 h-7 text-xs"
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

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
  const { data: serverGroups } = useGetProductModifiers(productId);
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
          stockCount: "",
          optionId: null,
          sku: "",
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
  markupOverride: number | null;
  stockCount: number | null;
};

function authHeaders() {
  const token = localStorage.getItem(TENANT_TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
}

function LocationsEditor({ productId, productCost, defaultMarkup }: { productId: number; productCost: number | null; defaultMarkup: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const queryKey = [`/api/products/${productId}/locations`];

  const { data: rows, isLoading } = useQuery<ProductLocationRow[]>({
    queryKey,
    queryFn: async () => {
      const r = await fetch(`/api/products/${productId}/locations`, { headers: authHeaders() });
      if (!r.ok) throw new Error("Failed to load locations");
      return r.json();
    },
  });

  const [draft, setDraft] = useState<Record<number, { isAvailable: boolean; priceOverride: string; markup: string; stockCount: string }>>({});
  // Tracks rows whose markup/price the user actually edited. Only these become
  // explicit per-location overrides on save; untouched rows keep their original
  // (possibly null = inherit product price) values so the pre-filled default
  // markup never silently converts an inherited location into an override.
  const [dirty, setDirty] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (!rows) return;
    const initial: Record<number, { isAvailable: boolean; priceOverride: string; markup: string; stockCount: string }> = {};
    rows.forEach((r) => {
      const markup = r.markupOverride != null ? String(r.markupOverride) : defaultMarkup;
      let priceOverride = r.priceOverride != null ? String(r.priceOverride) : "";
      // Pre-fill a suggested price from the effective markup when none is set.
      if (r.priceOverride == null && productCost != null && productCost >= 0) {
        const m = parseFloat(markup);
        if (Number.isFinite(m)) priceOverride = round2(productCost * (1 + m / 100));
      }
      initial[r.locationId] = {
        isAvailable: r.isAvailable,
        priceOverride,
        markup,
        stockCount: r.stockCount != null ? String(r.stockCount) : "",
      };
    });
    setDraft(initial);
    setDirty({});
    // productCost intentionally excluded: pre-fill is a one-time suggestion at
    // load; live edits recompute via the onChange handlers using the latest cost.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, defaultMarkup]);

  const [isSaving, setIsSaving] = useState(false);

  const handleSaveAll = async () => {
    if (!rows) return;
    setIsSaving(true);
    try {
      await Promise.all(
        rows.map(async (row) => {
          const d = draft[row.locationId];
          if (!d) return;
          // Only persist markup/price as an override when the user edited them;
          // otherwise keep the original values so inherited rows stay inherited.
          const edited = !!dirty[row.locationId];
          const parsedPrice = d.priceOverride !== "" ? parseFloat(d.priceOverride) : null;
          const parsedMarkup = d.markup !== "" ? parseFloat(d.markup) : null;
          const priceOverride = edited
            ? (Number.isFinite(parsedPrice as number) ? parsedPrice : null)
            : row.priceOverride;
          const markupOverride = edited
            ? (Number.isFinite(parsedMarkup as number) ? parsedMarkup : null)
            : row.markupOverride;

          await fetch(`/api/products/${productId}/locations/${row.locationId}`, {
            method: "PUT",
            headers: authHeaders(),
            body: JSON.stringify({
              isAvailable: d.isAvailable,
              priceOverride,
              markupOverride,
            }),
          });

          if (d.stockCount !== "") {
            const sc = parseFloat(d.stockCount);
            if (!isNaN(sc) && sc >= 0) {
              await fetch(`/api/locations/${row.locationId}/inventory/${productId}`, {
                method: "PUT",
                headers: authHeaders(),
                body: JSON.stringify({ stockCount: sc }),
              });
            }
          }
        }),
      );
      await queryClient.invalidateQueries({ queryKey });
      toast({ title: "Location settings saved" });
    } catch {
      toast({ title: "Save failed", variant: "destructive" });
    } finally {
      setIsSaving(false);
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
      <p className="text-xs text-muted-foreground">Control availability, price, and stock level of this product at each location.</p>
      {rows.map((row) => {
        const d = draft[row.locationId] ?? { isAvailable: row.isAvailable, priceOverride: "", markup: defaultMarkup, stockCount: "" };
        const canMarkupToPrice = productCost != null && productCost >= 0;
        const canPriceToMarkup = productCost != null && productCost > 0;
        return (
          <Card key={row.locationId} className="border-border/50">
            <CardContent className="pt-3 pb-3 space-y-2">
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
              </div>
              <div className="flex items-center gap-2 pl-6">
                <div className="relative flex-1">
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Markup"
                    value={d.markup}
                    onChange={(e) => {
                      const mk = e.target.value;
                      const m = parseFloat(mk);
                      const nextPrice = canMarkupToPrice && Number.isFinite(m)
                        ? round2((productCost as number) * (1 + m / 100))
                        : d.priceOverride;
                      setDirty((prev) => ({ ...prev, [row.locationId]: true }));
                      setDraft((prev) => ({ ...prev, [row.locationId]: { ...d, markup: mk, priceOverride: nextPrice } }));
                    }}
                    className="h-8 text-xs pr-6"
                  />
                </div>
                <div className="relative flex-1">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Price"
                    value={d.priceOverride}
                    onChange={(e) => {
                      const pv = e.target.value;
                      const p = parseFloat(pv);
                      const nextMarkup = canPriceToMarkup && Number.isFinite(p)
                        ? round2(((p / (productCost as number)) - 1) * 100)
                        : d.markup;
                      setDirty((prev) => ({ ...prev, [row.locationId]: true }));
                      setDraft((prev) => ({ ...prev, [row.locationId]: { ...d, priceOverride: pv, markup: nextMarkup } }));
                    }}
                    className="h-8 text-xs pl-5"
                  />
                </div>
                <div className="relative flex-1">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">📦</span>
                  <Input
                    type="number"
                    min="0"
                    placeholder={row.stockCount != null ? `${row.stockCount} in stock` : "Stock"}
                    value={d.stockCount}
                    onChange={(e) => setDraft((prev) => ({ ...prev, [row.locationId]: { ...d, stockCount: e.target.value } }))}
                    className="h-8 text-xs pl-7"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
      <Button onClick={handleSaveAll} disabled={isSaving} className="w-full">
        {isSaving ? "Saving…" : "Save Location Settings"}
      </Button>
    </div>
  );
}

/* ─── Print Label Dialog ─── */
type LabelSize = "small" | "medium" | "large";
type LabelProduct = Pick<GetProductResponse, "id" | "name" | "price" | "barcode" | "category">;

const LABEL_SIZES: { key: LabelSize; label: string; previewW: number; previewH: number; printMmW: number; printMmH: number }[] = [
  { key: "small",  label: 'Small  (2" × 1")',    previewW: 192, previewH:  96, printMmW:  51, printMmH: 25 },
  { key: "medium", label: 'Medium (3" × 1.5")',  previewW: 288, previewH: 144, printMmW:  76, printMmH: 38 },
  { key: "large",  label: 'Large  (4" × 2")',    previewW: 384, previewH: 192, printMmW: 101, printMmH: 51 },
];

function PrintLabelDialog({ product, onClose, businessName }: { product: LabelProduct | null; onClose: () => void; businessName: string }) {
  const svgRef = React.useRef<SVGSVGElement>(null);

  const [size,            setSize]            = useState<LabelSize>("medium");
  const [qty,             setQty]             = useState(1);
  const [showStoreName,   setShowStoreName]   = useState(true);
  const [showPrice,       setShowPrice]       = useState(true);
  const [showCategory,    setShowCategory]    = useState(false);
  const [showBarcodeText, setShowBarcodeText] = useState(true);

  const barcodeValue = product
    ? (product.barcode?.trim() || `PROD${String(product.id).padStart(6, "0")}`)
    : "";

  const sizeConf = LABEL_SIZES.find(s => s.key === size)!;
  const barcodeH = size === "small" ? 26 : size === "medium" ? 40 : 54;

  useEffect(() => {
    if (!product || !svgRef.current) return;
    import("jsbarcode").then(({ default: JsBarcode }) => {
      try {
        JsBarcode(svgRef.current!, barcodeValue, {
          format: "CODE128",
          width: 1.5,
          height: barcodeH,
          displayValue: showBarcodeText,
          fontSize: 8,
          margin: 2,
          background: "transparent",
          lineColor: "#000000",
        });
      } catch { /* invalid barcode value */ }
    });
  }, [product, barcodeValue, size, showBarcodeText, barcodeH]);

  const handlePrint = async () => {
    if (!product || !svgRef.current) return;
    const { default: JsBarcode } = await import("jsbarcode");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    try {
      JsBarcode(svg, barcodeValue, {
        format: "CODE128",
        width: 2,
        height: barcodeH,
        displayValue: showBarcodeText,
        fontSize: 8,
        margin: 2,
        background: "#ffffff",
        lineColor: "#000000",
      });
    } catch { /* skip barcode if invalid */ }
    const svgStr = new XMLSerializer().serializeToString(svg);
    const svgB64 = btoa(unescape(encodeURIComponent(svgStr)));

    const labelCss = `
      .label {
        width:${sizeConf.printMmW}mm; height:${sizeConf.printMmH}mm;
        border:0.5pt solid #bbb; display:flex; flex-direction:column;
        align-items:center; justify-content:center; padding:2mm;
        font-family:Arial,sans-serif; overflow:hidden; box-sizing:border-box;
        page-break-inside:avoid;
      }
      .store  { font-size:5.5pt; color:#666; text-transform:uppercase; letter-spacing:.4px; margin-bottom:1mm; }
      .name   { font-size:${size==="small"?"7":"8"}pt; font-weight:700; text-align:center; max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .cat    { font-size:5.5pt; color:#888; margin-top:.5mm; }
      .bc     { max-width:100%; height:auto; margin:1mm 0; }
      .price  { font-size:${size==="small"?"10":"13"}pt; font-weight:700; margin-top:1mm; }
    `;

    const oneLabelHtml = `
      <div class="label">
        ${showStoreName ? `<p class="store">${businessName}</p>` : ""}
        <p class="name">${product.name}</p>
        ${showCategory ? `<p class="cat">${product.category}</p>` : ""}
        <img class="bc" src="data:image/svg+xml;base64,${svgB64}" alt="" />
        ${showPrice ? `<p class="price">${formatCurrency(product.price)}</p>` : ""}
      </div>`;

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Label — ${product.name}</title>
      <style>*{margin:0;padding:0;box-sizing:border-box;}body{background:#fff;}
      .page{display:flex;flex-wrap:wrap;padding:4mm;gap:2mm;}${labelCss}
      @media print{body{margin:0;}.page{padding:4mm;gap:2mm;}}</style></head>
      <body><div class="page">${Array.from({length:qty}).map(()=>oneLabelHtml).join("")}</div>
      <script>window.onload=function(){window.onafterprint=function(){window.close();};if(window.matchMedia){var mql=window.matchMedia('print');var h=function(m){if(!m.matches){mql.removeListener(h);window.close();}};mql.addListener(h);}window.print();};<\/script>
      </body></html>`;

    const win = window.open("", "_blank", "width=900,height=700");
    if (win) { win.document.write(html); win.document.close(); }
  };

  const textSm = size === "small" ? "8px" : size === "medium" ? "10px" : "12px";
  const priceSm = size === "small" ? "11px" : size === "medium" ? "14px" : "18px";

  return (
    <Dialog open={!!product} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5 text-primary" />
            Print Barcode Label
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Live preview */}
          <div className="flex items-center justify-center rounded-xl bg-white border border-border p-6 min-h-[200px]">
            <div
              className="flex flex-col items-center justify-center bg-white border border-gray-300 overflow-hidden"
              style={{ width: sizeConf.previewW, height: sizeConf.previewH, padding: "6px" }}
            >
              {showStoreName && (
                <p style={{ fontSize: "6px", color: "#666", textTransform: "uppercase", letterSpacing: ".4px", marginBottom: "2px" }}>
                  {businessName}
                </p>
              )}
              <p style={{ fontSize: textSm, fontWeight: 700, textAlign: "center", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#000" }}>
                {product?.name}
              </p>
              {showCategory && (
                <p style={{ fontSize: "7px", color: "#888", marginTop: "1px" }}>{product?.category}</p>
              )}
              <svg ref={svgRef} style={{ maxWidth: "100%", height: "auto", margin: "2px 0" }} />
              {showPrice && (
                <p style={{ fontSize: priceSm, fontWeight: 700, color: "#000", marginTop: "2px" }}>
                  {product ? formatCurrency(product.price) : ""}
                </p>
              )}
            </div>
          </div>

          {/* Size + Copies */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs mb-1.5 block text-muted-foreground">Label Size</Label>
              <Select value={size} onValueChange={v => setSize(v as LabelSize)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LABEL_SIZES.map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1.5 block text-muted-foreground">Copies</Label>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => setQty(q => Math.max(1, q - 1))}>−</Button>
                <Input
                  type="number" min={1} max={100}
                  value={qty}
                  onChange={e => setQty(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
                  className="h-8 text-center text-sm"
                />
                <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => setQty(q => Math.min(100, q + 1))}>+</Button>
              </div>
            </div>
          </div>

          {/* Toggle options */}
          <div className="grid grid-cols-2 gap-2.5">
            {([ ["Store Name", showStoreName, setShowStoreName], ["Price", showPrice, setShowPrice],
                ["Category",  showCategory,  setShowCategory],  ["Barcode Text", showBarcodeText, setShowBarcodeText],
              ] as [string, boolean, (v: boolean) => void][]).map(([label, val, set]) => (
              <div key={label} className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
                <span className="text-sm">{label}</span>
                <Switch checked={val} onCheckedChange={set} />
              </div>
            ))}
          </div>

          {/* Barcode source note */}
          {product && !product.barcode && (
            <p className="text-xs text-muted-foreground bg-secondary/30 rounded-lg px-3 py-2">
              This product has no barcode. A generated code <span className="font-mono text-foreground">{barcodeValue}</span> will be used.
              Add a barcode to the product to use a custom value.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handlePrint} className="gap-2">
            <Printer className="h-4 w-4" />
            Print {qty} Label{qty !== 1 ? "s" : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Import Products Dialog ─── */
const IMPORT_FIELDS = [
  { key: "name",        label: "Product Name",                   required: true  },
  { key: "price",       label: "Selling Price",                  required: true  },
  { key: "costPrice",   label: "Cost / Purchase Price",          required: false },
  { key: "category",    label: "Category",                       required: false },
  { key: "description", label: "Description",                    required: false },
  { key: "barcode",     label: "Barcode",                        required: false },
  { key: "sku",         label: "SKU",                            required: false },
  { key: "brand",       label: "Brand",                          required: false },
  { key: "stockCount",  label: "Stock Quantity",                 required: false },
  { key: "inStock",     label: "In Stock (yes/no/1/0)",          required: false },
  { key: "sellingUnit", label: "Unit of Measure (each/case/...)",required: false },
  { key: "imageUrl",    label: "Image URL",                      required: false },
];

const TEMPLATE_ROWS = [
  ["Name", "Selling Price", "Cost / Purchase Price", "Category", "Description", "Barcode", "SKU", "Brand", "Stock Quantity", "In Stock", "Unit of Measure", "Size"],
  ["Jerk Chicken",   "850.00", "450.00", "Food",       "Seasoned jerk chicken",   "1234567890123", "JC001", "Island Grill", "50",  "yes", "each", "Large"],
  ["Ting Soda",      "120.00", "60.00",  "Beverages",  "Grapefruit flavour soda", "1234567890124", "TS001", "D&G",          "100", "yes", "case", "500ml"],
  ["Rum Cake Slice", "350.00", "180.00", "Bakery",     "Moist spiced rum cake",   "1234567890125", "RC001", "",             "30",  "yes", "each", "12 inch"],
];

/**
 * Loyverse product export format (matches columns produced by Loyverse's
 * "Export items" feature). A user can re-export from Loyverse and import the
 * file here without touching it — auto-mapping below recognises every column.
 * Empty/blank cells are normal for a real Loyverse export.
 */
const LOYVERSE_TEMPLATE_ROWS = [
  [
    "Handle", "SKU", "Name", "Category", "Description", "Default price", "Cost",
    "Barcode", "Sold by weight", "Track stock", "In stock", "Tax - VAT (15%)",
    "Option 1 name", "Option 1 value", "Image URL",
  ],
  [
    "jerk-chicken", "JC001", "Jerk Chicken", "Food", "Seasoned jerk chicken",
    "850.00", "450.00", "0123456789012", "N", "Y", "50", "Y", "", "", "",
  ],
  [
    "ting-soda", "TS001", "Ting Soda", "Beverages", "Grapefruit flavour soda",
    "120.00", "60.00", "0987654321098", "N", "Y", "100", "Y", "", "", "",
  ],
  [
    "rum-cake-slice", "RC001", "Rum Cake Slice", "Bakery", "Moist spiced rum cake",
    "350.00", "180.00", "0567891234567", "N", "Y", "30", "Y", "", "", "",
  ],
];

/**
 * QuickBooks Desktop Point of Sale item-list export format. A user can export
 * their item list from QuickBooks POS and import the file here as-is —
 * auto-mapping below recognises the QuickBooks column names (Department → Category,
 * Item Number → SKU, UPC → Barcode, On Hand Quantity → Stock, Regular Price → Price).
 */
const QUICKBOOKS_TEMPLATE_ROWS = [
  [
    "Item Name", "Department", "Item Number", "UPC", "Regular Price",
    "Average Unit Cost", "On Hand Quantity", "Attribute", "Size",
  ],
  ["Jerk Chicken",   "Food",      "JC001", "1234567890123", "850.00", "450.00", "50",  "", ""],
  ["Ting Soda",      "Beverages", "TS001", "1234567890124", "120.00", "60.00",  "100", "", ""],
  ["Rum Cake Slice", "Bakery",    "RC001", "1234567890125", "350.00", "180.00", "30",  "", ""],
];

function downloadTemplate()           { csvDownload(TEMPLATE_ROWS,            "NEXUS_Product_Import_Template.csv"); }
function downloadLoyverseTemplate()   { csvDownload(LOYVERSE_TEMPLATE_ROWS,   "NEXUS_Loyverse_Import_Template.csv"); }
function downloadQuickbooksTemplate() { csvDownload(QUICKBOOKS_TEMPLATE_ROWS, "NEXUS_QuickBooks_POS_Import_Template.csv"); }

function ImportProductsDialog({ open, onClose, onImported }: {
  open: boolean;
  onClose: () => void;
  onImported: (count: number) => void;
}) {
  const createProduct = useCreateProduct();
  const { toast } = useToast();
  const fileRef = React.useRef<HTMLInputElement>(null);
  // Size is always mappable/importable so data from a QuickBooks (or other)
  // export can be brought in regardless of whether the tenant has turned on the
  // Size display feature — it simply shows up once they enable it.
  const importFields = [...IMPORT_FIELDS, { key: "size", label: "Size", required: false }];

  const [step, setStep]         = useState<"upload" | "map" | "done">("upload");
  const [headers, setHeaders]   = useState<string[]>([]);
  const [rows, setRows]         = useState<string[][]>([]);
  const [mapping, setMapping]   = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults]   = useState<ImportResult[]>([]);

  const reset = () => { setStep("upload"); setHeaders([]); setRows([]); setMapping({}); setImporting(false); setProgress(0); setResults([]); };
  const handleClose = () => { reset(); onClose(); };

  const parseFile = async (file: File) => {
    try {
      const data = await parseSpreadsheet(file) as string[][];
      if (!data.length) { toast({ title: "Empty file", variant: "destructive" }); return; }
      const [hdr, ...body] = data;
      const clean = hdr.map(h => String(h).trim());
      setHeaders(clean);
      setRows(body.filter(r => r.some(c => c !== null && c !== undefined && String(c).trim() !== "")));
      // Auto-map by column name similarity.
      // Loyverse multi-store exports use bracketed per-store columns like
      // "Price [Store Name]", "In stock [Store Name]", "Available for sale
      // [Store Name]". Strip the bracketed suffix before matching so any
      // store name works without user edits. Single-store Loyverse exports
      // ("Default price", "In stock", "Track stock") and the simple NEXUS
      // template are both handled by the same rules.
      const auto: Record<string, string> = {};
      clean.forEach(h => {
        // Lowercase + strip "[…]" suffix (e.g. "Price [Miss Peart's Kitchen]")
        const l = h.toLowerCase().replace(/\s*\[[^\]]*\]\s*$/, "").trim();
        // ── Loyverse / NEXUS exact-header matches ──
        if      (l === "name")                                          auto[h] = "name";
        else if (l === "default price" || l === "price" || l === "selling price" || l === "sale price") auto[h] = "price";
        else if (l === "cost" || l === "cost price" || l === "cost / purchase price" || l === "purchase price" || l === "purchase cost" || l === "buying price" || l === "buy price") auto[h] = "costPrice";
        else if (l === "category")                                      auto[h] = "category";
        else if (l === "description")                                   auto[h] = "description";
        else if (l === "barcode")                                       auto[h] = "barcode";
        else if (l === "sku")                                           auto[h] = "sku";
        else if (l === "brand" || l === "manufacturer" || l === "make" || l === "vendor brand") auto[h] = "brand";
        else if (l === "stock quantity" || l === "quantity" || l === "qty") auto[h] = "stockCount"; // numeric qty
        else if (l === "in stock" || l === "track stock" || l === "available for sale") auto[h] = "inStock"; // boolean Y/N
        else if (l === "unit of measure" || l === "uom" || l === "selling unit" || l === "sold as" || l === "sell by" || l === "unit") auto[h] = "sellingUnit"; // free-text UOM
        else if (l === "size" || l === "item size" || l === "product size") auto[h] = "size"; // optional size label
        // ── QuickBooks POS exact-header matches ──
        else if (l === "department")                                    auto[h] = "category";     // QBPOS category
        else if (l === "regular price" || l === "list price")           auto[h] = "price";        // QBPOS price
        else if (l === "item name" || l === "item description")         auto[h] = "name";         // QBPOS item label
        else if (l === "upc")                                           auto[h] = "barcode";      // QBPOS barcode
        else if (l === "item number" || l === "item #" || l === "item no" || l === "alternate lookup") auto[h] = "sku"; // QBPOS sku/lookup
        else if (l === "on hand quantity" || l === "on hand qty" || l === "qty on hand" || l === "on hand") auto[h] = "stockCount"; // QBPOS stock
        else if (l === "average unit cost" || l === "unit cost")        auto[h] = "costPrice";    // QBPOS cost
        else if (l === "image url" || l === "image" || l === "photo url" || l === "photo") auto[h] = "imageUrl";
        // ── Generic fuzzy fallbacks ──
        else if (/name|product/i.test(l))                               auto[h] = "name";
        else if (/\bcost\b|purchase.?price|buy.?price/i.test(l) && !/sell|sale/i.test(l)) auto[h] = "costPrice";
        else if (/price|amount/i.test(l) && !/cost/i.test(l))           auto[h] = "price";
        else if (/categ/i.test(l))                                      auto[h] = "category";
        else if (/desc/i.test(l))                                       auto[h] = "description";
        else if (/barcode/i.test(l))                                    auto[h] = "barcode";
        else if (/sku/i.test(l))                                        auto[h] = "sku";
        else if (/brand|manufacturer|make\b/i.test(l))                  auto[h] = "brand";
        // "code" historically meant the scannable barcode — keep it mapping
        // to barcode for backward compatibility with older import files.
        else if (/code/i.test(l))                                       auto[h] = "barcode";
        else if (/stock.*qty|qty.*stock|quantity|stock.count/i.test(l)) auto[h] = "stockCount";
        else if (/in.?stock|available/i.test(l))                        auto[h] = "inStock";
        else if (/unit.*measure|^uom$|selling.*unit|sold.*as|sell.*by/i.test(l)) auto[h] = "sellingUnit";
      });
      setMapping(auto);
      setStep("map");
    } catch {
      toast({ title: "Could not read file", description: "Please use a valid CSV or Excel file.", variant: "destructive" });
    }
  };

  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) parseFile(f); };

  const getMapped = (header: string) => mapping[header] ?? "__skip__";
  const setMapped = (header: string, val: string) => setMapping(m => ({ ...m, [header]: val }));

  const extractRow = (row: string[]) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { const f = mapping[h]; if (f && f !== "__skip__") obj[f] = String(row[i] ?? "").trim(); });
    return obj;
  };

  const hasName  = Object.values(mapping).includes("name");
  const hasPrice = Object.values(mapping).includes("price");

  const handleImport = async () => {
    setImporting(true);
    const out: ImportResult[] = [];
    for (let i = 0; i < rows.length; i++) {
      const d = extractRow(rows[i]);
      setProgress(i + 1);
      if (!d.name?.trim()) { out.push({ row: i + 2, name: d.name || `Row ${i + 2}`, status: "error", error: "Name is required" }); continue; }
      if (!d.price?.trim()) { out.push({ row: i + 2, name: d.name, status: "error", error: "Price is required" }); continue; }
      const price = parseFloat(d.price.replace(/[^0-9.-]/g, ""));
      if (isNaN(price) || price < 0) { out.push({ row: i + 2, name: d.name, status: "error", error: "Invalid price" }); continue; }
      const stockCount = parseFloat(d.stockCount ?? "0") || 0;
      const inStockRaw = (d.inStock ?? "yes").toLowerCase().trim();
      const inStock    = ["yes", "y", "true", "1"].includes(inStockRaw);
      const category   = d.category?.trim() || "General";
      const costPriceStr = d.costPrice?.replace(/[^0-9.-]/g, "");
      const costPrice = costPriceStr ? parseFloat(costPriceStr) : undefined;
      try {
        await new Promise<void>((resolve, reject) => {
          createProduct.mutate({
            data: {
              name: d.name.trim(),
              price,
              category,
              description: d.description?.trim() || undefined,
              barcode: d.barcode?.trim() || undefined,
              sku: d.sku?.trim() || undefined,
              brand: d.brand?.trim() || undefined,
              size: d.size?.trim() || undefined,
              stockCount,
              inStock: stockCount > 0 ? inStock : false,
              sellingUnit: d.sellingUnit?.trim() || undefined,
              costPrice: costPrice !== undefined && !isNaN(costPrice) && costPrice >= 0 ? costPrice : undefined,
              imageUrl: d.imageUrl?.trim() || undefined,
            },
          }, { onSuccess: () => resolve(), onError: (e) => reject(e) });
        });
        out.push({ row: i + 2, name: d.name, status: "ok" });
      } catch { out.push({ row: i + 2, name: d.name, status: "error", error: "Server error" }); }
    }
    setResults(out);
    setImporting(false);
    setStep("done");
    const ok = out.filter(r => r.status === "ok").length;
    if (ok > 0) onImported(ok);
  };

  const previewRows = rows.slice(0, 5);
  const okCount    = results.filter(r => r.status === "ok").length;
  const errCount   = results.filter(r => r.status === "error").length;

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Import Products
          </DialogTitle>
          {/* Step breadcrumb */}
          <div className="flex items-center gap-1.5 text-xs pt-2">
            {(["upload","map","done"] as const).map((s, i) => (
              <React.Fragment key={s}>
                <span className={`flex items-center gap-1.5 ${step === s ? "text-primary font-semibold" : "text-muted-foreground"}`}>
                  <span className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${step === s ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>{i + 1}</span>
                  {s === "upload" ? "Upload File" : s === "map" ? "Map Columns" : "Results"}
                </span>
                {i < 2 && <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />}
              </React.Fragment>
            ))}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* ── Step 1: Upload ── */}
          {step === "upload" && (
            <div className="space-y-4">
              <div
                onDrop={handleDrop} onDragOver={e => e.preventDefault()}
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-border rounded-xl p-14 flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-primary/60 hover:bg-primary/5 transition-all text-center"
              >
                <Upload className="h-10 w-10 text-muted-foreground" />
                <div>
                  <p className="font-semibold">Drop your file here, or click to browse</p>
                  <p className="text-xs text-muted-foreground mt-1">Supports CSV (.csv) and Excel (.xlsx, .xls)</p>
                </div>
                <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) parseFile(f); }} />
              </div>

              <div className="flex items-center gap-4 rounded-lg border border-border bg-secondary/20 p-4">
                <FileDown className="h-8 w-8 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Download the import template</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Pre-filled with example rows and the exact column layout expected.</p>
                </div>
                <Button variant="outline" size="sm" onClick={e => { e.stopPropagation(); downloadTemplate(); }} className="shrink-0">
                  <FileDown className="h-3.5 w-3.5 mr-1.5" />Template
                </Button>
              </div>

              <div className="flex items-center gap-4 rounded-lg border border-teal-500/30 bg-teal-500/5 p-4">
                <FileDown className="h-8 w-8 text-teal-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Migrating from Loyverse?</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Download the Loyverse-format template, or export items from your Loyverse back office and upload that file as-is — columns are auto-detected.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={e => { e.stopPropagation(); downloadLoyverseTemplate(); }} className="shrink-0 border-teal-500/40 hover:bg-teal-500/10">
                  <FileDown className="h-3.5 w-3.5 mr-1.5" />Loyverse Template
                </Button>
              </div>

              <div className="flex items-center gap-4 rounded-lg border border-indigo-500/30 bg-indigo-500/5 p-4">
                <FileDown className="h-8 w-8 text-indigo-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Migrating from QuickBooks POS?</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Download the QuickBooks-format template, or export your item list from QuickBooks Point of Sale and upload that file as-is — columns are auto-detected.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={e => { e.stopPropagation(); downloadQuickbooksTemplate(); }} className="shrink-0 border-indigo-500/40 hover:bg-indigo-500/10">
                  <FileDown className="h-3.5 w-3.5 mr-1.5" />QuickBooks Template
                </Button>
              </div>

              <div className="rounded-lg border border-border bg-secondary/10 p-4 text-xs text-muted-foreground space-y-1">
                <p className="font-semibold text-foreground text-sm mb-2">Expected columns</p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                  {importFields.map(f => (
                    <span key={f.key}><span className="font-medium text-foreground">{f.label}</span>{f.required ? <span className="text-red-400 ml-0.5">*</span> : <span className="text-muted-foreground"> (optional)</span>}</span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Step 2: Map columns ── */}
          {step === "map" && (
            <div className="space-y-5">
              <p className="text-sm text-muted-foreground">
                Found <span className="font-semibold text-foreground">{rows.length} product row{rows.length !== 1 ? "s" : ""}</span>.
                Match each spreadsheet column to the correct product field.
              </p>

              <div className="rounded-lg border border-border overflow-hidden">
                <div className="grid grid-cols-[1fr_24px_1fr] gap-x-3 px-4 py-2.5 bg-secondary/40 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  <span>Spreadsheet Column</span><span />
                  <span>Product Field</span>
                </div>
                <div className="divide-y divide-border/60">
                  {headers.map(h => (
                    <div key={h} className="grid grid-cols-[1fr_24px_1fr] items-center gap-x-3 px-4 py-2.5">
                      <p className="text-sm font-medium truncate">{h}</p>
                      <span className="text-muted-foreground text-center text-xs">→</span>
                      <Select value={getMapped(h)} onValueChange={v => setMapped(h, v)}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__skip__">— Skip this column —</SelectItem>
                          {importFields.map(f => (
                            <SelectItem key={f.key} value={f.key}>
                              {f.label}{f.required ? " *" : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>

              {previewRows.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Data Preview — first {previewRows.length} row{previewRows.length !== 1 ? "s" : ""}</p>
                  <div className="rounded-lg border border-border overflow-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-secondary/40 border-b border-border">
                          {headers.map(h => (
                            <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">
                              {h}
                              {mapping[h] && mapping[h] !== "__skip__" && (
                                <span className="ml-1 text-[10px] text-primary font-normal">→ {importFields.find(f => f.key === mapping[h])?.label}</span>
                              )}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((row, i) => (
                          <tr key={i} className="border-b border-border/40 last:border-0 hover:bg-secondary/20">
                            {headers.map((_, j) => (
                              <td key={j} className="px-3 py-1.5 text-muted-foreground whitespace-nowrap max-w-[160px] truncate">{row[j]}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {(!hasName || !hasPrice) && (
                <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 px-4 py-2.5 text-sm">
                  <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                  <span className="text-amber-400">
                    {!hasName && !hasPrice ? "Map both Product Name and Price before importing." : !hasName ? "Map the Product Name field." : "Map the Price field."}
                  </span>
                </div>
              )}

              {importing && (
                <div className="space-y-2">
                  <div className="h-2 rounded-full bg-secondary overflow-hidden">
                    <div className="h-full bg-primary transition-all duration-300 rounded-full" style={{ width: `${(progress / rows.length) * 100}%` }} />
                  </div>
                  <p className="text-xs text-muted-foreground text-center">Importing {progress} of {rows.length}…</p>
                </div>
              )}
            </div>
          )}

          {/* ── Step 3: Results ── */}
          {step === "done" && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-5 text-center">
                  <p className="text-3xl font-bold text-emerald-400">{okCount}</p>
                  <p className="text-xs text-muted-foreground mt-1">Products imported</p>
                </div>
                <div className={`rounded-lg border p-5 text-center ${errCount > 0 ? "border-red-500/30 bg-red-500/5" : "border-border bg-secondary/10"}`}>
                  <p className={`text-3xl font-bold ${errCount > 0 ? "text-red-400" : "text-muted-foreground"}`}>{errCount}</p>
                  <p className="text-xs text-muted-foreground mt-1">Failed rows</p>
                </div>
              </div>

              <div className="rounded-lg border border-border overflow-hidden">
                <div className="grid grid-cols-[3rem_1fr_7rem_1fr] gap-0 px-4 py-2.5 bg-secondary/40 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  <span>Row</span><span>Name</span><span>Status</span><span>Note</span>
                </div>
                <div className="divide-y divide-border/60 max-h-64 overflow-y-auto">
                  {results.map((r, i) => (
                    <div key={i} className="grid grid-cols-[3rem_1fr_7rem_1fr] items-center gap-0 px-4 py-2 text-sm">
                      <span className="text-muted-foreground text-xs">{r.row}</span>
                      <span className="font-medium truncate pr-3">{r.name}</span>
                      <span>
                        {r.status === "ok"
                          ? <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs">Imported</Badge>
                          : <Badge variant="destructive" className="text-xs">Failed</Badge>}
                      </span>
                      <span className="text-xs text-muted-foreground truncate pl-3">{r.error ?? ""}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border shrink-0">
          {step === "upload" && <Button variant="outline" onClick={handleClose}>Cancel</Button>}
          {step === "map" && (
            <>
              <Button variant="outline" onClick={() => { setStep("upload"); setHeaders([]); setRows([]); }} disabled={importing}>Back</Button>
              <Button onClick={handleImport} disabled={importing || !hasName || !hasPrice || rows.length === 0}>
                {importing ? `Importing… (${progress}/${rows.length})` : `Import ${rows.length} Product${rows.length !== 1 ? "s" : ""}`}
              </Button>
            </>
          )}
          {step === "done" && (
            <>
              {errCount > 0 && <Button variant="outline" onClick={reset}>Import Another File</Button>}
              <Button onClick={handleClose}>Done</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── MBPOS → NEXXUS Import Dialog ─── */

// Fixed MBPOS column indices (0-based)
const MBPOS_COL = {
  name:          0,   // Product Name
  brand:         1,   // Brand
  unit:          2,   // Unit (selling unit / UOM)
  category:      3,   // Category
  sku:           5,   // SKU
  manageStock:   7,   // Manage Stock (1/0)
  purchasePrice: 18,  // Purchase Price (Excluding Tax)
  sellingPrice:  20,  // Selling Price
  openingStock:  21,  // Opening Stock
  imageUrl:      29,  // Image
  description:   30,  // Product Description
} as const;

const MBPOS_TEMPLATE_HEADERS = [
  "Product Name",
  "Brand",
  "Unit",
  "Category",
  "Sub Category",
  "SKU",
  "Barcode Type",
  "Manage Stock",
  "Alert Quantity",
  "Expires In",
  "Expiry Period Unit",
  "Applicable Tax",
  "Selling Price Tax Type",
  "Product Type",
  "Variation Name",
  "Variation Values",
  "Variation SKUs",
  "Purchase Price (Including Tax)",
  "Purchase Price (Excluding Tax)",
  "Profit Margin %",
  "Selling Price",
  "Opening Stock",
  "Opening Stock Location",
  "Expiry Date",
  "Enable IMEI/Serial",
  "Weight",
  "Rack",
  "Row",
  "Position",
  "Image",
  "Product Description",
  "Custom Field1",
  "Custom Field2",
  "Custom Field3",
  "Custom Field4",
  "Not For Selling",
  "Product Locations",
];

const MBPOS_TEMPLATE_SAMPLE = [
  "Jerk Chicken",   // Product Name
  "",               // Brand
  "Each",           // Unit
  "Food",           // Category
  "",               // Sub Category
  "JC-001",         // SKU
  "C128",           // Barcode Type
  "1",              // Manage Stock
  "",               // Alert Quantity
  "",               // Expires In
  "",               // Expiry Period Unit
  "",               // Applicable Tax
  "exclusive",      // Selling Price Tax Type
  "single",         // Product Type
  "",               // Variation Name
  "",               // Variation Values
  "",               // Variation SKUs
  "",               // Purchase Price (Including Tax)
  "400.00",         // Purchase Price (Excluding Tax)
  "",               // Profit Margin %
  "850.00",         // Selling Price
  "50",             // Opening Stock
  "",               // Opening Stock Location
  "",               // Expiry Date
  "0",              // Enable IMEI/Serial
  "",               // Weight
  "",               // Rack
  "",               // Row
  "",               // Position
  "",               // Image
  "Seasoned jerk chicken with festival",  // Product Description
  "", "", "", "",   // Custom Fields
  "0",              // Not For Selling
  "",               // Product Locations
];

function downloadMBPOSTemplate() {
  const rows = [MBPOS_TEMPLATE_HEADERS, MBPOS_TEMPLATE_SAMPLE];
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: "MBPOS_Import_Template.csv" });
  a.click();
  URL.revokeObjectURL(url);
}

type MBPOSPreviewRow = {
  rowNum: number;
  name: string;
  category: string;
  sku: string;
  brand: string;
  sellingUnit: string;
  price: number | null;
  costPrice: number | null;
  stockCount: number;
  inStock: boolean;
  imageUrl: string;
  description: string;
  valid: boolean;
  errors: string[];
};

function parseMBPOSRow(raw: (string | number | boolean | null | undefined)[], rowNum: number): MBPOSPreviewRow {
  const get = (i: number) => String(raw[i] ?? "").trim();
  const errors: string[] = [];

  const name        = get(MBPOS_COL.name);
  const category    = get(MBPOS_COL.category) || "General";
  const sku         = get(MBPOS_COL.sku);
  const brand       = get(MBPOS_COL.brand);
  const sellingUnit = get(MBPOS_COL.unit);
  const manageStock = get(MBPOS_COL.manageStock);
  const priceStr    = get(MBPOS_COL.sellingPrice);
  const costStr     = get(MBPOS_COL.purchasePrice);
  const stockStr    = get(MBPOS_COL.openingStock);
  const imageUrl    = get(MBPOS_COL.imageUrl);
  const description = get(MBPOS_COL.description);

  if (!name) errors.push("Product Name is required");

  const price = parseFloat(priceStr.replace(/[^0-9.-]/g, ""));
  if (!priceStr || isNaN(price) || price < 0) {
    if (!priceStr) errors.push("Selling Price is required");
    else errors.push("Selling Price must be a valid number");
  }

  const costPriceRaw = costStr ? parseFloat(costStr.replace(/[^0-9.-]/g, "")) : NaN;
  const costPrice = !isNaN(costPriceRaw) && costPriceRaw >= 0 ? costPriceRaw : null;

  const stockCount = parseInt(stockStr) || 0;
  const inStock = manageStock === "1" ? stockCount > 0 : true;

  return {
    rowNum, name, category, sku, brand, sellingUnit,
    price: isNaN(price) ? null : price,
    costPrice,
    stockCount, inStock,
    imageUrl: imageUrl.startsWith("http") ? imageUrl : "",
    description,
    valid: errors.length === 0,
    errors,
  };
}

function MBPOSImportDialog({ open, onClose, onImported }: {
  open: boolean;
  onClose: () => void;
  onImported: (count: number) => void;
}) {
  const createProduct = useCreateProduct();
  const { toast } = useToast();
  const fileRef = React.useRef<HTMLInputElement>(null);

  const [step, setStep]         = useState<"upload" | "preview" | "done">("upload");
  const [fileName, setFileName] = useState("");
  const [preview, setPreview]   = useState<MBPOSPreviewRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults]   = useState<{ ok: number; failed: number; errors: { row: number; name: string; error: string }[] }>({ ok: 0, failed: 0, errors: [] });

  const reset = () => { setStep("upload"); setFileName(""); setPreview([]); setImporting(false); setProgress(0); setResults({ ok: 0, failed: 0, errors: [] }); };
  const handleClose = () => { reset(); onClose(); };

  const parseFile = async (file: File) => {
    try {
      const data = await parseSpreadsheet(file);
      if (!data.length) { toast({ title: "Empty file", variant: "destructive" }); return; }

      // Find the true header row (the one that contains "Product Name" / "product name" in col 0,
      // or fall back to the first non-empty row). Skip it plus any additional sub-header rows
      // (MBPOS exports often add a second row of location-column sub-headers such as
      // "Add to location", "Remove from location", "WooCommerce Sync").
      const SUB_HEADER_PATTERNS = /^(add to|remove from|woocommerce|location|product location)/i;

      let headerIdx = data.findIndex(r => /^product\s*name/i.test(String(r[0] ?? "").trim()));
      if (headerIdx < 0) headerIdx = 0; // fallback: treat row 0 as the header

      // Collect body rows: everything after the header, filtering out sub-header rows and blanks
      const bodyRaw = data.slice(headerIdx + 1);
      const body = bodyRaw.filter(r => {
        const col0 = String(r[0] ?? "").trim();
        if (!col0) return false;                        // blank first cell
        if (SUB_HEADER_PATTERNS.test(col0)) return false; // sub-header row
        return true;
      });
      const rows = body.map((r, i) => parseMBPOSRow(r, headerIdx + 2 + i));

      if (!rows.length) { toast({ title: "No data rows found", description: "The file appears to be empty after the header.", variant: "destructive" }); return; }

      setFileName(file.name);
      setPreview(rows);
      setStep("preview");
    } catch {
      toast({ title: "Could not read file", description: "Please use a valid CSV or Excel file.", variant: "destructive" });
    }
  };

  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) parseFile(f); };

  const validRows = preview.filter(r => r.valid);
  const invalidRows = preview.filter(r => !r.valid);

  const handleImport = async () => {
    setImporting(true);
    let ok = 0; let failed = 0;
    const errors: { row: number; name: string; error: string }[] = [];

    for (let i = 0; i < validRows.length; i++) {
      const r = validRows[i];
      setProgress(i + 1);
      try {
        await new Promise<void>((resolve, reject) => {
          createProduct.mutate({
            data: {
              name: r.name,
              price: r.price!,
              category: r.category,
              description: r.description || undefined,
              barcode: r.sku || undefined,
              brand: r.brand || undefined,
              sellingUnit: r.sellingUnit || undefined,
              stockCount: r.stockCount,
              inStock: r.inStock,
              imageUrl: r.imageUrl || undefined,
              costPrice: r.costPrice !== null ? r.costPrice : undefined,
            },
          }, { onSuccess: () => resolve(), onError: (e) => reject(e) });
        });
        ok++;
      } catch {
        failed++;
        errors.push({ row: r.rowNum, name: r.name, error: "Server error" });
      }
    }

    // Also count skipped invalid rows
    invalidRows.forEach(r => {
      failed++;
      errors.push({ row: r.rowNum, name: r.name || `Row ${r.rowNum}`, error: r.errors.join("; ") });
    });

    setResults({ ok, failed, errors });
    setImporting(false);
    setStep("done");
    if (ok > 0) onImported(ok);
  };

  const MAPPED_FIELDS = [
    { col: "1 — Product Name",                 maps: "Name",             required: true  },
    { col: "2 — Brand",                        maps: "Brand",            required: false },
    { col: "3 — Unit",                         maps: "Unit of Measure",  required: false },
    { col: "4 — Category",                     maps: "Category",         required: false },
    { col: "6 — SKU",                          maps: "Barcode / SKU",    required: false },
    { col: "8 — Manage Stock (1/0)",           maps: "In Stock",         required: false },
    { col: "19 — Purchase Price (Excl. Tax)",  maps: "Cost Price",       required: false },
    { col: "21 — Selling Price",               maps: "Selling Price",    required: true  },
    { col: "22 — Opening Stock",               maps: "Stock Quantity",   required: false },
    { col: "30 — Image (URL)",                 maps: "Image URL",        required: false },
    { col: "31 — Product Description",         maps: "Description",      required: false },
  ];

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-4xl max-h-[92vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileSpreadsheet className="h-5 w-5 text-sky-400" />
            MBPOS → NEXXUS Inventory Import
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-0.5">Import products from MicroBooks POS format directly into NEXXUS</p>
          {/* Steps */}
          <div className="flex items-center gap-1.5 text-xs pt-2">
            {(["upload","preview","done"] as const).map((s, i) => (
              <React.Fragment key={s}>
                <span className={`flex items-center gap-1.5 ${step === s ? "text-primary font-semibold" : "text-muted-foreground"}`}>
                  <span className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${step === s ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>{i + 1}</span>
                  {s === "upload" ? "Upload File" : s === "preview" ? "Review & Import" : "Results"}
                </span>
                {i < 2 && <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />}
              </React.Fragment>
            ))}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* ── Step 1: Upload ── */}
          {step === "upload" && (
            <div className="space-y-4">
              {/* Drop zone */}
              <div
                onDrop={handleDrop} onDragOver={e => e.preventDefault()}
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-sky-500/40 rounded-xl p-12 flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-sky-400/70 hover:bg-sky-500/5 transition-all text-center"
              >
                <Upload className="h-10 w-10 text-sky-400/60" />
                <div>
                  <p className="font-semibold">Drop your MBPOS export file here, or click to browse</p>
                  <p className="text-xs text-muted-foreground mt-1">Accepts CSV (.csv) and Excel (.xlsx, .xls)</p>
                </div>
                <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) parseFile(f); }} />
              </div>

              {/* Template download */}
              <div className="flex items-center gap-4 rounded-lg border border-sky-500/20 bg-sky-500/5 p-4">
                <FileDown className="h-8 w-8 text-sky-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Don't have an MBPOS file?</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Download the template with the correct 37-column layout and a sample row.</p>
                </div>
                <Button variant="outline" size="sm" className="shrink-0 border-sky-500/30 text-sky-400 hover:text-sky-300"
                  onClick={e => { e.stopPropagation(); downloadMBPOSTemplate(); }}>
                  <FileDown className="h-3.5 w-3.5 mr-1.5" />Template
                </Button>
              </div>

              {/* Column mapping reference */}
              <div className="rounded-lg border border-border bg-secondary/10 p-4 space-y-3">
                <p className="text-sm font-semibold">Columns used from MBPOS format</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {MAPPED_FIELDS.map(f => (
                    <div key={f.col} className="flex items-center gap-2 text-xs">
                      <span className="font-mono text-muted-foreground bg-secondary/60 rounded px-1.5 py-0.5 shrink-0">{f.col}</span>
                      <span className="text-muted-foreground">→</span>
                      <span className="font-medium text-foreground">{f.maps}</span>
                      {f.required && <span className="text-red-400 text-[10px]">Required</span>}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground border-t border-border pt-2 mt-1">
                  All other columns (Brand, Unit, Barcode Type, Tax, Variations, etc.) are read and ignored — your file does not need to be trimmed.
                </p>
              </div>
            </div>
          )}

          {/* ── Step 2: Preview ── */}
          {step === "preview" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">{fileName}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    <span className="text-green-400 font-medium">{validRows.length} valid</span>
                    {invalidRows.length > 0 && <span className="text-red-400 font-medium ml-2">{invalidRows.length} will be skipped</span>}
                    <span className="ml-2 text-muted-foreground">({preview.length} rows total)</span>
                  </p>
                </div>
              </div>

              {/* Invalid rows warning */}
              {invalidRows.length > 0 && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 space-y-1.5">
                  <p className="text-xs font-semibold text-red-400 flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {invalidRows.length} row{invalidRows.length !== 1 ? "s" : ""} will be skipped due to errors
                  </p>
                  {invalidRows.slice(0, 5).map(r => (
                    <p key={r.rowNum} className="text-xs text-muted-foreground pl-5">
                      Row {r.rowNum}: <span className="font-medium text-foreground">{r.name || "(blank)"}</span> — {r.errors.join(", ")}
                    </p>
                  ))}
                  {invalidRows.length > 5 && <p className="text-xs text-muted-foreground pl-5">…and {invalidRows.length - 5} more</p>}
                </div>
              )}

              {/* Preview table */}
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-secondary/40 border-b border-border">
                        <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground whitespace-nowrap">Product Name</th>
                        <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground">Category</th>
                        <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground">SKU</th>
                        <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground">Price</th>
                        <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground">Stock</th>
                        <th className="px-3 py-2.5 text-left font-semibold text-muted-foreground">Description</th>
                        <th className="px-3 py-2.5 text-center font-semibold text-muted-foreground">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.slice(0, 20).map(r => (
                        <tr key={r.rowNum} className={`border-b border-border/30 ${!r.valid ? "opacity-50 bg-red-500/5" : "hover:bg-secondary/20"}`}>
                          <td className="px-3 py-2 font-medium text-foreground max-w-[180px] truncate">{r.name || <span className="text-muted-foreground italic">blank</span>}</td>
                          <td className="px-3 py-2 text-muted-foreground">{r.category}</td>
                          <td className="px-3 py-2 font-mono text-muted-foreground">{r.sku || "—"}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium">
                            {r.price !== null ? `J$\u00a0${r.price.toLocaleString("en-JM", { minimumFractionDigits: 2 })}` : <span className="text-red-400">—</span>}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{r.stockCount}</td>
                          <td className="px-3 py-2 text-muted-foreground max-w-[160px] truncate">{r.description || ""}</td>
                          <td className="px-3 py-2 text-center">
                            {r.valid
                              ? <span className="inline-block w-2 h-2 rounded-full bg-green-400" title="Will import" />
                              : <span className="inline-block w-2 h-2 rounded-full bg-red-400" title={r.errors.join("; ")} />}
                          </td>
                        </tr>
                      ))}
                      {preview.length > 20 && (
                        <tr>
                          <td colSpan={7} className="px-3 py-2 text-center text-xs text-muted-foreground italic">
                            …and {preview.length - 20} more rows not shown
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {importing && (
                <div className="space-y-2">
                  <div className="h-2 rounded-full bg-secondary overflow-hidden">
                    <div className="h-full bg-sky-500 transition-all duration-300 rounded-full" style={{ width: `${(progress / Math.max(validRows.length, 1)) * 100}%` }} />
                  </div>
                  <p className="text-xs text-muted-foreground text-center">Importing {progress} of {validRows.length}…</p>
                </div>
              )}
            </div>
          )}

          {/* ── Step 3: Results ── */}
          {step === "done" && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-5 text-center">
                  <p className="text-3xl font-bold text-emerald-400">{results.ok}</p>
                  <p className="text-xs text-muted-foreground mt-1">Products imported</p>
                </div>
                <div className={`rounded-lg border p-5 text-center ${results.failed > 0 ? "border-red-500/30 bg-red-500/5" : "border-border bg-secondary/10"}`}>
                  <p className={`text-3xl font-bold ${results.failed > 0 ? "text-red-400" : "text-muted-foreground"}`}>{results.failed}</p>
                  <p className="text-xs text-muted-foreground mt-1">Skipped / failed</p>
                </div>
              </div>

              {results.errors.length > 0 && (
                <div className="rounded-lg border border-border overflow-hidden">
                  <div className="grid grid-cols-[3rem_1fr_1fr] px-4 py-2.5 bg-secondary/40 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    <span>Row</span><span>Name</span><span>Reason</span>
                  </div>
                  <div className="divide-y divide-border/60 max-h-48 overflow-y-auto">
                    {results.errors.map((e, i) => (
                      <div key={i} className="grid grid-cols-[3rem_1fr_1fr] px-4 py-2 text-xs items-center">
                        <span className="text-muted-foreground">{e.row}</span>
                        <span className="font-medium truncate pr-2">{e.name}</span>
                        <span className="text-red-400 truncate">{e.error}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border shrink-0">
          {step === "upload" && <Button variant="outline" onClick={handleClose}>Cancel</Button>}
          {step === "preview" && (
            <>
              <Button variant="outline" onClick={() => { setStep("upload"); setPreview([]); setFileName(""); }} disabled={importing}>Back</Button>
              <Button
                className="bg-sky-600 hover:bg-sky-500 text-white"
                onClick={handleImport}
                disabled={importing || validRows.length === 0}
              >
                {importing ? `Importing… (${progress}/${validRows.length})` : `Import ${validRows.length} Product${validRows.length !== 1 ? "s" : ""}`}
              </Button>
            </>
          )}
          {step === "done" && (
            <>
              {results.failed > 0 && <Button variant="outline" onClick={reset}>Import Another File</Button>}
              <Button onClick={handleClose}>Done</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Stock History Panel ─── */
/* ─── Composite (bundle) editor ─── */
type DraftComponent = {
  tempId: string;
  childProductId: number;
  childName: string;
  childCostPrice: number | null;
  quantityRequired: string;
};

function CompositeEditor({
  productId,
  parentName,
  sellingPrice,
  allProducts,
}: {
  productId: number;
  parentName: string;
  sellingPrice: number;
  allProducts: GetProductResponse[];
}) {
  const { data: serverComponents, queryKey: componentsQueryKey } = useGetCompositeComponents(productId);
  const { data: cost } = useGetCompositeCost(productId);
  const { data: available } = useGetAvailableComposite(productId);
  const saveComponents = useSaveCompositeComponents();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [draft, setDraft] = useState<DraftComponent[]>([]);
  const [dirty, setDirty] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");

  // Hydrate the editor from the server response. Resets the dirty flag
  // so the Save button doesn't appear when nothing has changed yet.
  useEffect(() => {
    if (!serverComponents) return;
    setDraft(serverComponents.map((c) => ({
      tempId: makeId(),
      childProductId: c.childProductId,
      childName: c.childName,
      childCostPrice: c.childCostPrice ?? null,
      quantityRequired: String(c.quantityRequired),
    })));
    setDirty(false);
  }, [serverComponents]);

  const addedIds = new Set(draft.map(d => d.childProductId));
  // Candidate children: any *other* product the user can pick. We hide
  // composites here too — nesting bundles is allowed by the schema but
  // the UI keeps it flat to prevent accidental loops in the common case.
  const candidates = allProducts.filter((p) => {
    if (p.id === productId) return false;
    if (addedIds.has(p.id)) return false;
    const pp = p as GetProductResponse & { structureType?: string };
    if (pp.structureType === "composite") return false;
    if (!pickerQuery.trim()) return true;
    const q = pickerQuery.toLowerCase();
    return p.name.toLowerCase().includes(q) || (p.barcode ?? "").toLowerCase().includes(q) || ((p as { sku?: string | null }).sku ?? "").toLowerCase().includes(q);
  }).slice(0, 50);

  const addComponent = (p: GetProductResponse) => {
    const pp = p as GetProductResponse & { costPrice?: number | null };
    setDraft((d) => [...d, {
      tempId: makeId(),
      childProductId: p.id,
      childName: p.name,
      childCostPrice: pp.costPrice ?? null,
      quantityRequired: "1",
    }]);
    setDirty(true);
    setPickerQuery("");
    setPickerOpen(false);
  };

  const updateQty = (tempId: string, qty: string) => {
    setDraft((d) => d.map((x) => x.tempId === tempId ? { ...x, quantityRequired: qty } : x));
    setDirty(true);
  };

  const removeComponent = (tempId: string) => {
    setDraft((d) => d.filter((x) => x.tempId !== tempId));
    setDirty(true);
  };

  // Live derived cost from the unsaved draft so the user sees the
  // impact of their edits immediately (server-side cost only updates
  // after a save succeeds).
  const draftDerivedCost = draft.reduce((s, c) => {
    const qty = parseFloat(c.quantityRequired) || 0;
    return s + ((c.childCostPrice ?? 0) * qty);
  }, 0);
  const draftGrossProfit = sellingPrice - draftDerivedCost;
  const draftMarginPct = sellingPrice > 0 ? (draftGrossProfit / sellingPrice) * 100 : 0;

  const handleSave = () => {
    // Reject obviously invalid quantities client-side so the user gets
    // immediate feedback before the round-trip.
    const cleaned = draft.map(c => ({
      childProductId: c.childProductId,
      quantityRequired: parseFloat(c.quantityRequired) || 0,
    }));
    if (cleaned.some(c => c.quantityRequired <= 0)) {
      toast({ title: "All component quantities must be greater than 0", variant: "destructive" });
      return;
    }
    saveComponents.mutate(
      { id: productId, data: { components: cleaned } },
      {
        onSuccess: (rows) => {
          toast({ title: "Components saved" });
          // Mirror the pricing-tier fix: write straight into the cache
          // and refetch derived endpoints. invalidateQueries here would
          // race the offline-queue logic and make the just-saved rows
          // disappear briefly.
          queryClient.setQueryData(componentsQueryKey, rows);
          queryClient.refetchQueries({
            queryKey: [`/api/products/${productId}/composite-cost`],
          });
          queryClient.refetchQueries({
            queryKey: [`/api/products/${productId}/available-composite-quantity`],
          });
          setDirty(false);
        },
        onError: (e) => {
          const msg = (e as Error)?.message ?? "Save failed";
          toast({ title: "Save failed", description: msg, variant: "destructive" });
        },
      },
    );
  };

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border/60 bg-secondary/20 p-3">
        <p className="text-xs text-muted-foreground">
          A composite product (bundle) is built from other products. When this bundle
          is sold, stock is deducted from the components below — never from{" "}
          <span className="font-medium">{parentName}</span> itself.
        </p>
      </div>

      {/* Live summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="rounded-md bg-muted/40 p-2.5">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Selling price</div>
          <div className="text-sm font-bold tabular-nums">{formatCurrency(sellingPrice)}</div>
        </div>
        <div className="rounded-md bg-muted/40 p-2.5">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Derived cost</div>
          <div className="text-sm font-bold tabular-nums">{formatCurrency(draftDerivedCost)}</div>
        </div>
        <div className="rounded-md bg-muted/40 p-2.5">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Gross profit</div>
          <div className={`text-sm font-bold tabular-nums ${draftGrossProfit >= 0 ? "text-green-400" : "text-red-400"}`}>
            {formatCurrency(draftGrossProfit)}
          </div>
        </div>
        <div className="rounded-md bg-muted/40 p-2.5">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Margin</div>
          <div className={`text-sm font-bold tabular-nums ${draftMarginPct >= 0 ? "text-green-400" : "text-red-400"}`}>
            {draftMarginPct.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Components table */}
      <div className="rounded-md border border-border/60 overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-muted/40">
            <tr>
              <th className="text-left px-2 py-1.5">Component</th>
              <th className="text-right px-2 py-1.5 w-20">Qty</th>
              <th className="text-right px-2 py-1.5 w-24">Unit cost</th>
              <th className="text-right px-2 py-1.5 w-24">Line cost</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {draft.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center text-muted-foreground py-4">
                  No components yet. Add at least one component below.
                </td>
              </tr>
            ) : draft.map((c) => {
              const qty = parseFloat(c.quantityRequired) || 0;
              const unit = c.childCostPrice ?? 0;
              return (
                <tr key={c.tempId} className="border-t border-border/40">
                  <td className="px-2 py-1.5">{c.childName}</td>
                  <td className="px-2 py-1.5 text-right">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={c.quantityRequired}
                      onChange={(e) => updateQty(c.tempId, e.target.value)}
                      className="h-7 text-xs text-right tabular-nums"
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {c.childCostPrice == null ? <span className="text-muted-foreground">—</span> : formatCurrency(unit)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatCurrency(unit * qty)}</td>
                  <td className="px-1 py-1.5">
                    <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => removeComponent(c.tempId)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Add-component picker */}
      <div className="rounded-md border border-border/60 p-2.5 space-y-2">
        {!pickerOpen ? (
          <Button size="sm" variant="outline" className="w-full gap-1.5" onClick={() => setPickerOpen(true)}>
            <Plus className="h-3.5 w-3.5" />Add component
          </Button>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <Input
                autoFocus
                placeholder="Search products by name or barcode…"
                value={pickerQuery}
                onChange={(e) => setPickerQuery(e.target.value)}
                className="h-8 text-xs"
              />
              <Button size="sm" variant="ghost" onClick={() => { setPickerOpen(false); setPickerQuery(""); }}>
                Cancel
              </Button>
            </div>
            <div className="max-h-48 overflow-y-auto border-t border-border/40">
              {candidates.length === 0 ? (
                <div className="py-3 text-center text-xs text-muted-foreground">No matches.</div>
              ) : candidates.map((p) => {
                const pp = p as GetProductResponse & { costPrice?: number | null };
                return (
                  <button
                    key={p.id}
                    onClick={() => addComponent(p)}
                    className="w-full text-left px-2 py-1.5 text-xs hover:bg-muted/40 flex items-center justify-between gap-2"
                  >
                    <span className="truncate">{p.name}</span>
                    <span className="text-muted-foreground tabular-nums shrink-0">
                      {pp.costPrice != null ? formatCurrency(pp.costPrice) : "no cost"}
                      {" · "}{p.stockCount} in stock
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Available-bundles breakdown */}
      {available && available.components.length > 0 && (
        <div className="rounded-md border border-border/60 bg-secondary/10 p-2.5">
          <div className="text-xs font-medium mb-1.5">
            Available to assemble: <span className={available.available > 0 ? "text-green-400" : "text-red-400"}>{available.available}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[11px] text-muted-foreground">
            {available.components.map((b) => (
              <div key={b.childProductId} className="flex items-center justify-between">
                <span className="truncate">{b.childName}</span>
                <span className="tabular-nums shrink-0">
                  {b.stock} in stock / {b.quantityRequired} per bundle = {b.possibleBundles}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Server-derived cost (sanity check after save). Hidden until at
          least one save has happened so initial state isn't confusing. */}
      {cost && draft.length > 0 && !dirty && (
        <p className="text-[10px] text-muted-foreground text-right">
          Saved cost: {formatCurrency(cost.derivedCost)} · margin {cost.grossMarginPct.toFixed(1)}%
        </p>
      )}

      {dirty && (
        <Button onClick={handleSave} disabled={saveComponents.isPending} className="w-full">
          {saveComponents.isPending ? "Saving…" : "Save Components"}
        </Button>
      )}
    </div>
  );
}

function StockHistoryPanel({ productId }: { productId: number }) {
  const { data, isLoading } = useGetProductStockHistory(productId);

  function formatDate(iso: string) {
    const d = new Date(iso);
    return d.toLocaleDateString("en-JM", { day: "2-digit", month: "short", year: "numeric" }) +
      " " + d.toLocaleTimeString("en-JM", { hour: "2-digit", minute: "2-digit", hour12: true });
  }

  function typeLabel(type: string) {
    switch (type) {
      case "sale": return { label: "Sale", color: "text-red-400", icon: <TrendingDown className="h-3.5 w-3.5" /> };
      case "restock": return { label: "Restock", color: "text-green-400", icon: <TrendingUp className="h-3.5 w-3.5" /> };
      case "refund": return { label: "Refund", color: "text-blue-400", icon: <TrendingUp className="h-3.5 w-3.5" /> };
      case "void": return { label: "Void", color: "text-orange-400", icon: <TrendingUp className="h-3.5 w-3.5" /> };
      case "purchase_bill": return { label: "Purchase", color: "text-green-400", icon: <TrendingUp className="h-3.5 w-3.5" /> };
      case "adjustment": return { label: "Adjustment", color: "text-purple-400", icon: <History className="h-3.5 w-3.5" /> };
      default: return { label: type, color: "text-muted-foreground", icon: <History className="h-3.5 w-3.5" /> };
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-2 py-4">
        {[1,2,3,4].map(i => <Skeleton key={i} className="h-8 w-full" />)}
      </div>
    );
  }

  const movements = data?.movements ?? [];
  const currentStock = data?.product.currentStock ?? 0;
  const totalSold = movements.filter(m => m.type === "sale").reduce((s, m) => s + Math.abs(m.quantity), 0);
  const totalReceived = movements.filter(m => m.type === "restock" || m.type === "purchase_bill").reduce((s, m) => s + m.quantity, 0);

  return (
    <div className="space-y-3">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-muted/40 p-2.5 text-center">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Current Stock</div>
          <div className="text-lg font-bold text-foreground">{currentStock}</div>
        </div>
        <div className="rounded-lg bg-red-500/10 p-2.5 text-center">
          <div className="text-[10px] text-red-400 uppercase tracking-wide">Total Sold</div>
          <div className="text-lg font-bold text-red-400">{totalSold}</div>
        </div>
        <div className="rounded-lg bg-green-500/10 p-2.5 text-center">
          <div className="text-[10px] text-green-400 uppercase tracking-wide">Total Received</div>
          <div className="text-lg font-bold text-green-400">{totalReceived}</div>
        </div>
      </div>

      {/* Movement table */}
      {movements.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          <History className="h-8 w-8 mx-auto mb-2 opacity-40" />
          No stock movements recorded yet.
          <div className="text-xs mt-1 opacity-70">Movements will appear here after sales or restocks.</div>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted/60">
              <tr>
                <th className="text-left px-2.5 py-2 font-medium text-muted-foreground">Date & Time</th>
                <th className="text-left px-2 py-2 font-medium text-muted-foreground">Type</th>
                <th className="text-right px-2 py-2 font-medium text-muted-foreground">Change</th>
                <th className="text-right px-2 py-2 font-medium text-muted-foreground">Balance</th>
                <th className="text-left px-2 py-2 font-medium text-muted-foreground">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {movements.map((m) => {
                const t = typeLabel(m.type);
                const isPositive = m.quantity > 0;
                return (
                  <tr key={m.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-2.5 py-2 text-muted-foreground whitespace-nowrap">{formatDate(m.createdAt)}</td>
                    <td className="px-2 py-2">
                      <span className={`flex items-center gap-1 font-medium ${t.color}`}>
                        {t.icon}{t.label}
                      </span>
                    </td>
                    <td className={`px-2 py-2 text-right font-mono font-semibold ${isPositive ? "text-green-400" : "text-red-400"}`}>
                      {isPositive ? "+" : ""}{m.quantity}
                    </td>
                    <td className="px-2 py-2 text-right font-mono font-medium text-foreground">{m.balanceAfter}</td>
                    <td className="px-2 py-2 text-muted-foreground truncate max-w-[100px]" title={m.notes ?? ""}>{m.notes ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ─── Variant stock panel (lazy-loaded for each expanded product in list) ─── */
function VariantStockPanel({ productId }: { productId: number }) {
  const { data: serverData, isLoading } = useGetProductVariants(productId);
  if (isLoading) {
    return (
      <div className="px-6 py-2 bg-muted/5 border-b border-border/30 text-xs text-muted-foreground">
        Loading variant stock…
      </div>
    );
  }
  const payload = serverData as unknown as {
    groups: Array<{ id: number; name: string; options: Array<{ id: number; name: string; stockCount: number | null; sku: string | null; priceAdjustment: number }> }>;
    combinations: Array<{ id: number; label: string; stockCount: number | null; sku: string | null }>;
  };
  const groups = payload?.groups ?? [];
  const combinations = payload?.combinations ?? [];
  const isMultiGroup = groups.length > 1;

  const stockPill = (stock: number | null, label: string, sub?: string, sku?: string | null) => {
    const s = stock ?? 0;
    const colorClass = s <= 0 ? "text-red-400 bg-red-500/10 border-red-500/20" : s <= 5 ? "text-amber-400 bg-amber-500/10 border-amber-500/20" : "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
    return (
      <div key={label} className={`flex items-center gap-1.5 text-xs border rounded-md px-2 py-1 ${colorClass}`}>
        {sub && <span className="text-muted-foreground font-medium">{sub}</span>}
        <span className="font-medium">{label}</span>
        {sku && <span className="font-mono text-muted-foreground/60 text-[10px]">#{sku}</span>}
        <span className="font-mono font-bold ml-0.5">{s}</span>
      </div>
    );
  };

  if (isMultiGroup) {
    const tracked = combinations.filter(c => c.stockCount !== null);
    if (!tracked.length) return null;
    return (
      <div className="px-6 pb-3 pt-2 bg-muted/5 border-b border-border/30">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground/60 mb-1.5 font-semibold">Combination Stock</p>
        <div className="flex flex-wrap gap-1.5">
          {tracked.map(c => stockPill(c.stockCount, c.label, undefined, c.sku))}
        </div>
      </div>
    );
  }

  const rows = groups.flatMap(g =>
    g.options.filter(o => o.stockCount !== null).map(o => ({ ...o, groupName: g.name }))
  );
  if (!rows.length) return null;
  return (
    <div className="px-6 pb-3 pt-2 bg-muted/5 border-b border-border/30">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground/60 mb-1.5 font-semibold">Variant Stock</p>
      <div className="flex flex-wrap gap-1.5">
        {rows.map(o => stockPill(o.stockCount, o.name, `${o.groupName}:`, o.sku))}
      </div>
    </div>
  );
}

/* ─── Main Products page ─── */
// ─── Searchable product picker used in the Add Purchase Bill form ──────────
// Type-to-search across 1000+ products. cmdk handles fuzzy matching; we add
// a barcode-aware key so scanning works too. Renders a button trigger that
// opens a popover with a search input and a scrollable result list.
function ProductCombobox({
  products,
  value,
  onChange,
}: {
  products: GetProductResponse[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(
    () => products.find((p) => String(p.id) === value),
    [products, value],
  );
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          className="flex h-8 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm text-left hover:bg-accent/40 transition-colors"
        >
          <span className={selected ? "truncate" : "truncate text-muted-foreground"}>
            {selected ? selected.name : "Select product…"}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50 ml-2" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[--radix-popover-trigger-width] min-w-[280px]" align="start">
        <Command
          filter={(itemValue, search) => {
            // itemValue is `${name} ${barcode} ${id}` — cmdk's default
            // contains-based match is fine but we lowercase explicitly to be
            // robust against locale quirks.
            return itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
          }}
        >
          <CommandInput placeholder="Search by name or barcode…" autoFocus />
          <CommandList className="max-h-[280px]">
            <CommandEmpty>No products found.</CommandEmpty>
            {products.map((p) => {
              const itemValue = `${p.name} ${p.barcode ?? ""} ${p.id}`;
              const isSelected = String(p.id) === value;
              return (
                <CommandItem
                  key={p.id}
                  value={itemValue}
                  onSelect={() => {
                    onChange(String(p.id));
                    setOpen(false);
                  }}
                  className="flex items-center gap-2"
                >
                  <Check className={`h-3.5 w-3.5 shrink-0 ${isSelected ? "opacity-100" : "opacity-0"}`} />
                  <span className="flex-1 truncate">{p.name}</span>
                  <span className="text-muted-foreground text-xs shrink-0">{p.stockCount} in stock</span>
                </CommandItem>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function DuplicateGroupCard({ group, onMerged }: { group: DuplicateGroup; onMerged: () => void }) {
  const { toast } = useToast();
  const { staff } = useStaff();
  const queryClient = useQueryClient();
  const mergeProducts = useMergeProducts();

  const mergeable = useMemo(() => group.products.filter((p) => p.mergeable), [group]);
  const nonMergeable = useMemo(() => group.products.filter((p) => !p.mergeable), [group]);

  // Default survivor: most stock, tie-break to the oldest record.
  const defaultSurvivorId = useMemo(() => {
    const sorted = [...mergeable].sort(
      (a, b) => b.stockCount - a.stockCount || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    return sorted[0]?.id;
  }, [mergeable]);

  const [survivorId, setSurvivorId] = useState<number | undefined>(defaultSurvivorId);
  const [checked, setChecked] = useState<Record<number, boolean>>(() =>
    Object.fromEntries(mergeable.map((p) => [p.id, true])),
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [merged, setMerged] = useState(false);

  const survivor = mergeable.find((p) => p.id === survivorId);
  const dupeIds = mergeable.filter((p) => p.id !== survivorId && checked[p.id]).map((p) => p.id);
  const combinedStock =
    (survivor?.stockCount ?? 0) +
    mergeable.filter((p) => dupeIds.includes(p.id)).reduce((s, p) => s + p.stockCount, 0);

  const doMerge = () => {
    if (!survivorId || dupeIds.length === 0 || !staff) return;
    mergeProducts.mutate(
      { data: { survivorId, mergeIds: dupeIds, staffId: staff.id } },
      {
        onSuccess: (res) => {
          toast({
            title: `Merged ${res.mergedCount} duplicate${res.mergedCount === 1 ? "" : "s"}`,
            description: `Stock combined into the survivor (${res.combinedStock} on hand). All sales & purchase history was kept.`,
          });
          queryClient.invalidateQueries({ queryKey: ["/api/products"] });
          setConfirmOpen(false);
          setMerged(true);
          onMerged();
        },
        onError: () => toast({ title: "Merge failed", variant: "destructive" }),
      },
    );
  };

  if (merged) {
    return (
      <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 flex items-center gap-2 text-sm">
        <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
        <span className="font-medium text-emerald-300">Merged “{group.products[0]?.name}” — duplicates archived, history preserved.</span>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card/40">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-semibold truncate">{group.products[0]?.name}</span>
          <Badge
            variant="outline"
            className={`text-[10px] shrink-0 ${group.matchType === "exact" ? "border-primary/50 text-primary" : "border-yellow-500/50 text-yellow-400"}`}
          >
            {group.matchType === "exact" ? "Exact" : "Similar"}
          </Badge>
          <span className="text-xs text-muted-foreground shrink-0">{group.products.length} items</span>
        </div>
      </div>

      <div className="divide-y divide-border/60">
        {mergeable.map((p) => {
          const isSurvivor = p.id === survivorId;
          return (
            <div key={p.id} className="flex items-center gap-3 px-4 py-2 text-sm">
              <label className="flex items-center gap-2 cursor-pointer shrink-0" title="Keep this product">
                <input
                  type="radio"
                  name={`survivor-${group.key}`}
                  checked={isSurvivor}
                  onChange={() => setSurvivorId(p.id)}
                  className="accent-primary h-4 w-4"
                />
                <span className="text-[11px] text-muted-foreground w-10">{isSurvivor ? "Keep" : "Merge"}</span>
              </label>
              <input
                type="checkbox"
                disabled={isSurvivor}
                checked={isSurvivor ? false : !!checked[p.id]}
                onChange={() => setChecked((prev) => ({ ...prev, [p.id]: !prev[p.id] }))}
                className="accent-primary h-4 w-4 disabled:opacity-30 shrink-0"
                title={isSurvivor ? "The survivor cannot merge into itself" : "Include in merge"}
              />
              <div className="flex-1 min-w-0">
                <p className="truncate">{p.name}</p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {p.category}
                  {p.barcode ? ` · ${p.barcode}` : ""} · #{p.id}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-mono text-xs">{formatCurrency(p.price)}</p>
                <p className="text-[11px] text-muted-foreground">{p.stockCount} in stock</p>
              </div>
            </div>
          );
        })}
        {nonMergeable.map((p) => (
          <div key={p.id} className="flex items-center gap-3 px-4 py-2 text-sm opacity-60">
            <AlertTriangle className="h-3.5 w-3.5 text-yellow-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="truncate">{p.name}</p>
              <p className="text-[11px] text-muted-foreground">
                Not mergeable — {p.hasVariants ? "has variants" : p.isComposite ? "composite product" : "composite component"}
              </p>
            </div>
            <p className="font-mono text-xs text-muted-foreground shrink-0">{p.stockCount} in stock</p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-t border-border bg-secondary/30">
        <span className="text-xs text-muted-foreground">
          {dupeIds.length > 0 && survivor
            ? `Merging ${dupeIds.length} into “${survivor.name}” → ${combinedStock} in stock`
            : "Pick a product to keep and at least one to merge"}
        </span>
        <Button
          size="sm"
          className="gap-1.5"
          disabled={!survivorId || dupeIds.length === 0 || mergeProducts.isPending}
          onClick={() => setConfirmOpen(true)}
        >
          <GitMerge className="h-3.5 w-3.5" />Merge
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Merge {dupeIds.length} product{dupeIds.length === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>
              This combines stock and re-attributes <strong>all</strong> past sales, purchases, and stock movements onto “{survivor?.name}”. The other {dupeIds.length} product{dupeIds.length === 1 ? "" : "s"} will be archived. <strong>This cannot be undone.</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={mergeProducts.isPending} onClick={doMerge}>
              Merge &amp; combine
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DuplicateMergeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { staff } = useStaff();
  const { data: groups, isLoading, refetch } = useFindDuplicateProducts(
    { staffId: staff?.id ?? 0 },
    { query: { enabled: open && !!staff?.id, queryKey: getFindDuplicateProductsQueryKey({ staffId: staff?.id ?? 0 }) } },
  );

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-5 w-5" />Find &amp; Merge Duplicate Products
          </DialogTitle>
          <DialogDescription>
            Products grouped by matching names. Keep one survivor per group; the rest merge into it — stock is combined and every past sale, bill, and stock movement is re-attributed to the survivor.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {isLoading ? (
            <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-28 rounded-lg" />)}</div>
          ) : !groups?.length ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
              <CheckCircle2 className="h-12 w-12 opacity-30" />
              <p className="text-lg">No duplicates found</p>
              <p className="text-sm">Your active catalog has no products with matching names.</p>
            </div>
          ) : (
            groups.map((g) => <DuplicateGroupCard key={g.key + g.matchType} group={g} onMerged={() => refetch()} />)
          )}
        </div>
        <DialogFooter className="px-6 py-4 border-t border-border shrink-0">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Build a toast describing why a product create/update failed. Surfaces the
 * server's reason instead of a generic message — most importantly the 402
 * "subscription expired" case, which is a deliberate write-block (not a bug)
 * and was previously shown as a confusing bare "Create failed".
 */
function saveProductErrorToast(
  err: unknown,
  fallbackTitle: string,
): { title: string; description?: string; variant: "destructive" } {
  const apiErr = err as { status?: number; body?: unknown; data?: unknown; message?: string } | undefined;
  const payload = (apiErr?.body ?? apiErr?.data) as { error?: string; message?: string } | undefined;
  return {
    title: fallbackTitle,
    ...(payload?.message ? { description: payload.message } : {}),
    variant: "destructive",
  };
}

/**
 * If the error is the deliberate 402 SUBSCRIPTION_EXPIRED write-block, return
 * the server's message (or a default) so callers can show the renewal dialog
 * instead of a toast. Returns null for any other error.
 */
function subscriptionExpiredMessage(err: unknown): string | null {
  const apiErr = err as { status?: number; body?: unknown; data?: unknown } | undefined;
  const payload = (apiErr?.body ?? apiErr?.data) as { error?: string; message?: string } | undefined;
  if (apiErr?.status === 402 && payload?.error === "SUBSCRIPTION_EXPIRED") {
    return payload.message ?? "Renew your subscription to add or edit products.";
  }
  return null;
}

export function Products() {
  const { can, staff } = useStaff();
  const canManage = can("inventory.manage");

  const [searchQuery, setSearchQuery] = useState("");
  const [subscriptionExpiredMsg, setSubscriptionExpiredMsg] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [showOutOfStock, setShowOutOfStock] = useState(false);
  const [showLowStock, setShowLowStock] = useState(false);

  const { data: products, isLoading, refetch: refetchProducts } = useListProducts(
    {
      ...(categoryFilter ? { category: categoryFilter } : {}),
      // Only send the flag when true — the server coerces any present value
      // to `true`, so it must be omitted (not `false`) to show active only.
      ...(showArchived ? { includeArchived: true } : {}),
    },
  );

  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();
  const deletePermanent = useDeleteProductPermanent();
  const bulkArchive = useBulkArchiveProducts();
  const bulkRestore = useBulkRestoreProducts();
  const bulkPermDelete = useBulkPermanentDeleteProducts();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: settings } = useGetSettings();
  const businessName = settings?.business_name || "My Store";
  const showProductSize = settings?.show_product_size === "true";
  // Tenant default markup % (UI-only; not part of the generated settings type).
  const defaultMarkupSetting =
    (settings as { default_markup_percentage?: string } | undefined)?.default_markup_percentage ?? "";
  const { data: inUseCategories } = useListProductCategories();
  // Curated settings list comes first (preserves the admin's chosen order),
  // then any category actually used by a product that isn't in that list
  // (e.g. introduced via CSV/MBPOS import) is appended, case-insensitively
  // de-duplicated. This keeps the filter bar, Manage dialog, and product-form
  // dropdown showing every real category without a manual sync step.
  const categories = React.useMemo(() => {
    const curated = parseCategorySetting(settings?.product_categories);
    const seen = new Set(curated.map((c) => c.toLowerCase()));
    const merged = [...curated];
    for (const raw of inUseCategories ?? []) {
      const name = raw.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(name);
    }
    return merged;
  }, [settings?.product_categories, inUseCategories]);
  const updateSettings = useUpdateSettings();

  const createPurchase = useCreatePurchase();
  const { data: purchases } = useListPurchases();
  const { data: bills, refetch: refetchBills } = useListPurchaseBills();
  const createBill = useCreatePurchaseBill();
  const updateBill = useUpdatePurchaseBill();
  const confirmBill = useConfirmPurchaseBill();
  const deleteBill = useDeletePurchaseBill();
  const { data: vendors = [] } = useListVendors();

  const [pageTab, setPageTab] = useState<"products" | "purchases" | "orders" | "units">("products");
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogTab, setDialogTab] = useState("details");
  const [, navigate] = useLocation();
  // Plan product-limit posture (banner + upgrade prompts). Refetched whenever
  // the product list changes so counts stay accurate after create/archive.
  const { data: planLimit, refetch: refetchPlanLimit } = useQuery<PlanLimitStatus>({
    queryKey: ["/api/products/plan-limit"],
    queryFn: getPlanLimitStatus,
    staleTime: 30_000,
  });
  // Upgrade prompt shown when a create is blocked by the plan limit.
  const [limitPrompt, setLimitPrompt] = useState<PlanLimitStatus | null>(null);
  const [editingProduct, setEditingProduct] = useState<GetProductResponse | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm());
  // Product-form case-cost calculator (transient, not persisted on the product).
  const [formCasePrice, setFormCasePrice] = useState("");
  const [formUnitsPerCase, setFormUnitsPerCase] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [permDelete, setPermDelete] = useState<{ id: number; name: string } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Record<number, boolean>>({});
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkPermConfirmOpen, setBulkPermConfirmOpen] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ mode: "archive" | "restore" | "permdelete"; done: number; total: number } | null>(null);
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [restockProduct, setRestockProduct] = useState<GetProductResponse | null>(null);
  const [restockForm, setRestockForm] = useState<RestockForm>(emptyRestockForm());
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [mbposDialogOpen, setMbposDialogOpen] = useState(false);
  const [catManagerOpen, setCatManagerOpen] = useState(false);
  const [printProduct, setPrintProduct] = useState<LabelProduct | null>(null);
  const [billView, setBillView] = useState<"list" | "new">("list");
  const [expandedVariants, setExpandedVariants] = useState<Set<number>>(new Set());
  const toggleVariantExpand = (id: number) =>
    setExpandedVariants(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const [viewBillId, setViewBillId] = useState<number | null>(null);
  const [editingBillId, setEditingBillId] = useState<number | null>(null);
  const [billSupplierManual, setBillSupplierManual] = useState(false);
  const [billForm, setBillForm] = useState<BillForm>(emptyBillForm());
  const { data: viewBillDetail } = useGetPurchaseBill(
    viewBillId ?? 0,
    { query: { enabled: !!viewBillId } },
  );
  const { data: editBillDetail } = useGetPurchaseBill(
    editingBillId ?? 0,
    { query: { enabled: !!editingBillId && billView === "new", queryKey: ["purchase-bill-edit", editingBillId] } },
  );

  // Populate the bill form whenever the detail loads for an edit session.
  React.useEffect(() => {
    if (!editBillDetail || !editingBillId) return;
    setBillForm({
      billNumber: editBillDetail.billNumber,
      supplier: editBillDetail.supplier ?? "",
      notes: editBillDetail.notes ?? "",
      defaultTaxRate: editBillDetail.defaultTaxRate ? String(editBillDetail.defaultTaxRate) : "",
      // Items are stored with NET unit costs on the server. Load as exclusive
      // so the preview math is consistent regardless of the original taxMode.
      taxMode: "exclusive",
      items: editBillDetail.items.length > 0
        ? editBillDetail.items.map((it) => ({
            tempId: makeId(),
            productId: String(it.productId),
            quantity: String(it.quantity),
            unitCost: String(it.unitCost),
            taxRate: it.taxRate === null || it.taxRate === undefined ? "" : String(it.taxRate),
            batchNumber: it.batchNumber ?? "",
            expiryDate: it.expiryDate ?? "",
          }))
        : [emptyLineItem()],
    });
    setBillSupplierManual(true);
  }, [editBillDetail, editingBillId]);

  // ── Purchase Orders ──
  const { data: purchaseOrders, refetch: refetchPos } = useListPurchaseOrders();
  const createPo = useCreatePurchaseOrder();
  const updatePo = useUpdatePurchaseOrder();
  const deletePo = useDeletePurchaseOrder();
  const [poView, setPoView] = useState<"list" | "new">("list");
  const [viewPoId, setViewPoId] = useState<number | null>(null);
  const [poSupplierManual, setPoSupplierManual] = useState(false);
  const [poForm, setPoForm] = useState<PoForm>(emptyPoForm());
  // When set, the next saved purchase bill will mark this PO converted.
  const [convertingPoId, setConvertingPoId] = useState<number | null>(null);
  const { data: viewPoDetail } = useGetPurchaseOrder(
    viewPoId ?? 0,
    { query: { enabled: !!viewPoId } },
  );

  // useDeferredValue lets React keep the input responsive while filtering
  // 1200+ products: the typed value updates immediately, the filter runs
  // against the deferred value during idle time.
  const deferredSearch = useDeferredValue(searchQuery);

  const filteredProducts = useMemo(() => {
    if (!products) return undefined;
    const q = deferredSearch.trim().toLowerCase();
    if (!q) return products;
    // Pre-lowercase once per product per filter pass; also search barcode + SKU.
    return products.filter((p) => {
      if (p.name.toLowerCase().includes(q)) return true;
      const bc = p.barcode;
      if (!!bc && bc.toLowerCase().includes(q)) return true;
      const sk = (p as { sku?: string | null }).sku;
      return !!sk && sk.toLowerCase().includes(q);
    });
  }, [products, deferredSearch]);

  const lowStockProducts = useMemo(
    () => products?.filter(
      (p) => p.inStock && p.stockCount > 0 && p.stockCount <= LOW_STOCK_THRESHOLD,
    ) ?? [],
    [products],
  );
  const outOfStockProducts = useMemo(
    () => products?.filter((p) => !p.inStock || p.stockCount === 0) ?? [],
    [products],
  );

  // ── List virtualization ──────────────────────────────────────────────────
  // For large catalogs (1000+ products) we only render the rows currently in
  // view. Rows have variable height (variant expansion panel), so we measure
  // each row dynamically. estimateSize is a guess used until measureElement
  // reports the real height.
  const listScrollRef = useRef<HTMLDivElement | null>(null);
  const virtualizer = useVirtualizer({
    count: filteredProducts?.length ?? 0,
    getScrollElement: () => listScrollRef.current,
    estimateSize: () => 60,
    overscan: 8,
    getItemKey: (i) => filteredProducts?.[i]?.id ?? i,
  });

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
    const enteredCost = parseFloat(restockForm.unitCost);
    const hasCost = !isNaN(enteredCost) && enteredCost > 0;
    const currentCost = Number((restockProduct as { costPrice?: number | null }).costPrice ?? 0);
    const currentPrice = restockProduct.price;
    // Only bump the stored cost when the new cost is higher (matches the
    // purchase-bill flow — a one-off cheap buy shouldn't lower the cost basis).
    const costGoingUp = hasCost && enteredCost > currentCost;
    // Markup-on-cost derived from the current cost/price. When cost rises and
    // "keep markup" is on, raise the selling price so the markup % is preserved
    // instead of silently eroding.
    const currentMarkup = currentCost > 0 ? calcMarkupFromPrice(currentCost, currentPrice) : NaN;
    const newPrice =
      costGoingUp && restockForm.keepMarkup && !isNaN(currentMarkup) && currentMarkup > 0
        ? Number(round2(calcPriceFromMarkup(enteredCost, currentMarkup)))
        : null;
    createPurchase.mutate(
      {
        data: {
          productId: restockProduct.id,
          quantity: qty,
          unitCost: hasCost ? enteredCost : 0,
          notes: restockForm.notes || undefined,
        },
      },
      {
        onSuccess: async () => {
          // The stock was added by the purchase. Now (only when the cost rose)
          // update the product's cost/price. We await this so the success
          // message only claims a cost/price change once it actually persisted.
          let costUpdated = false;
          if (costGoingUp) {
            try {
              // The generated update body type requires name + category, but the
              // server skips undefined fields (Drizzle .set), so only cost/price
              // are actually changed.
              await updateProduct.mutateAsync({
                id: restockProduct.id,
                data: {
                  name: restockProduct.name,
                  category: restockProduct.category,
                  costPrice: enteredCost,
                  price: newPrice != null ? newPrice : currentPrice,
                },
              });
              costUpdated = true;
            } catch {
              toast({
                title: "Stock added, but cost update failed",
                description: "The new units were recorded, but the product cost/price could not be updated. Please update it manually.",
                variant: "destructive",
              });
            }
          }
          toast({
            title: `Restocked ${qty} units of ${restockProduct.name}`,
            description:
              costUpdated && newPrice != null
                ? `Cost updated to ${enteredCost.toFixed(2)}; selling price raised to ${newPrice.toFixed(2)} to keep your markup.`
                : costUpdated
                ? `Cost updated to ${enteredCost.toFixed(2)}.`
                : undefined,
          });
          queryClient.invalidateQueries({ queryKey: ["/api/products"] });
          queryClient.invalidateQueries({ queryKey: ["/api/purchases"] });
          setRestockProduct(null);
        },
        onError: () => toast({ title: "Restock failed", variant: "destructive" }),
      },
    );
  };

  // Per-line breakdown: subtotal (qty*unitCost ex-tax), effective tax rate
  // (line override falls back to bill default), tax amount, and grand total.
  const billLineBreakdown = (item: BillLineItem) => {
    const qty = parseFloat(item.quantity) || 0;
    const cost = parseFloat(item.unitCost) || 0;
    const lineRate = item.taxRate.trim() === "" ? null : parseFloat(item.taxRate);
    const defaultRate = parseFloat(billForm.defaultTaxRate) || 0;
    const rate = lineRate === null || Number.isNaN(lineRate) ? defaultRate : lineRate;
    const cents = (n: number) => Math.round(n * 100) / 100;
    if (billForm.taxMode === "inclusive") {
      // Entered cost includes tax — the gross line total is authoritative.
      // Mirror the server exactly: round gross, back out net, tax = gross - net.
      // `cost` is returned net so margin math stays correct.
      const total = cents(qty * cost);
      const subtotal = rate > 0 ? cents(total / (1 + rate / 100)) : total;
      const tax = cents(total - subtotal);
      const netCost = qty > 0 ? subtotal / qty : cost;
      return { qty, cost: netCost, subtotal, rate, tax, total };
    }
    const subtotal = cents(qty * cost);
    const tax = cents((subtotal * rate) / 100);
    return { qty, cost, subtotal, rate, tax, total: cents(subtotal + tax) };
  };
  const billLineTotal = (item: BillLineItem) => billLineBreakdown(item).total;

  // Margin info derived from the selected product's current selling price
  // vs the entered ex-tax unit cost (input tax is recoverable, so we ignore
  // it for margin math).
  const billLineMargin = (item: BillLineItem) => {
    const product = products?.find((p) => String(p.id) === item.productId);
    if (!product) return null;
    // Use the net (ex-tax) cost so margin is consistent in inclusive mode.
    const cost = billLineBreakdown(item).cost;
    const price = product.price;
    if (!price || cost <= 0) return null;
    const amount = price - cost;
    const pct = (amount / price) * 100;
    return { price, cost, amount, pct };
  };

  const billTotals = billForm.items.reduce(
    (acc, item) => {
      const b = billLineBreakdown(item);
      return { subtotal: acc.subtotal + b.subtotal, tax: acc.tax + b.tax, total: acc.total + b.total };
    },
    { subtotal: 0, tax: 0, total: 0 },
  );

  const addLineItem = () =>
    setBillForm((f) => ({ ...f, items: [...f.items, emptyLineItem()] }));

  const removeLineItem = (tempId: string) =>
    setBillForm((f) => ({ ...f, items: f.items.filter((i) => i.tempId !== tempId) }));

  const updateLineItem = (tempId: string, patch: Partial<BillLineItem>) =>
    setBillForm((f) => ({
      ...f,
      items: f.items.map((i) => (i.tempId === tempId ? { ...i, ...patch } : i)),
    }));

  /* ── Purchase Order line math (mirrors bill math; same server tax rules) ── */
  const poLineBreakdown = (item: PoLineItem) => {
    const qty = parseFloat(item.quantity) || 0;
    const cost = parseFloat(item.unitCost) || 0;
    const lineRate = item.taxRate.trim() === "" ? null : parseFloat(item.taxRate);
    const defaultRate = parseFloat(poForm.defaultTaxRate) || 0;
    const rate = lineRate === null || Number.isNaN(lineRate) ? defaultRate : lineRate;
    const cents = (n: number) => Math.round(n * 100) / 100;
    if (poForm.taxMode === "inclusive") {
      const total = cents(qty * cost);
      const subtotal = rate > 0 ? cents(total / (1 + rate / 100)) : total;
      const tax = cents(total - subtotal);
      const netCost = qty > 0 ? subtotal / qty : cost;
      return { qty, cost: netCost, subtotal, rate, tax, total };
    }
    const subtotal = cents(qty * cost);
    const tax = cents((subtotal * rate) / 100);
    return { qty, cost, subtotal, rate, tax, total: cents(subtotal + tax) };
  };

  const poLineMargin = (item: PoLineItem) => {
    const product = products?.find((p) => String(p.id) === item.productId);
    if (!product) return null;
    const cost = poLineBreakdown(item).cost;
    const price = product.price;
    if (!price || cost <= 0) return null;
    const amount = price - cost;
    const pct = (amount / price) * 100;
    return { price, cost, amount, pct };
  };

  const poTotals = poForm.items.reduce(
    (acc, item) => {
      const b = poLineBreakdown(item);
      return { subtotal: acc.subtotal + b.subtotal, tax: acc.tax + b.tax, total: acc.total + b.total };
    },
    { subtotal: 0, tax: 0, total: 0 },
  );

  const addPoLineItem = () =>
    setPoForm((f) => ({ ...f, items: [...f.items, emptyPoLineItem()] }));
  const removePoLineItem = (tempId: string) =>
    setPoForm((f) => ({ ...f, items: f.items.filter((i) => i.tempId !== tempId) }));
  const updatePoLineItem = (tempId: string, patch: Partial<PoLineItem>) =>
    setPoForm((f) => ({
      ...f,
      items: f.items.map((i) => (i.tempId === tempId ? { ...i, ...patch } : i)),
    }));

  const handleSavePo = (status: "draft" | "sent") => {
    const validItems = poForm.items.filter((i) => i.productId && parseInt(i.quantity) > 0);
    if (!validItems.length) {
      toast({ title: "Add at least one item with a product and quantity", variant: "destructive" });
      return;
    }
    const defaultTaxRate = parseFloat(poForm.defaultTaxRate) || 0;
    createPo.mutate(
      {
        data: {
          supplier: poForm.supplier || undefined,
          expectedDate: poForm.expectedDate || undefined,
          notes: poForm.notes || undefined,
          status,
          defaultTaxRate,
          taxMode: poForm.taxMode,
          items: validItems.map((i) => ({
            productId: parseInt(i.productId),
            quantity: parseInt(i.quantity),
            unitCost: parseFloat(i.unitCost) || 0,
            taxRate: i.taxRate.trim() === "" ? null : (parseFloat(i.taxRate) || 0),
          })),
        },
      },
      {
        onSuccess: () => {
          toast({
            title: status === "sent" ? "Purchase order created & marked sent" : "Purchase order saved as draft",
          });
          queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
          setPoView("list");
          setPoForm(emptyPoForm());
          setPoSupplierManual(false);
          refetchPos();
        },
        onError: (err: unknown) => {
          const e = err as { message?: string; data?: { error?: string } } | null;
          const detail = e?.data?.error ?? e?.message ?? "Please check the form and try again.";
          toast({ title: "Failed to save purchase order", description: detail, variant: "destructive" });
        },
      },
    );
  };

  const handleUpdatePoStatus = (id: number, status: "sent" | "cancelled") => {
    updatePo.mutate(
      { id, data: { status } },
      {
        onSuccess: () => {
          toast({ title: status === "sent" ? "Purchase order marked as sent" : "Purchase order cancelled" });
          queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
          setViewPoId(null);
          refetchPos();
        },
        onError: () => toast({ title: "Update failed", variant: "destructive" }),
      },
    );
  };

  const handleDeletePo = (id: number) => {
    deletePo.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Purchase order deleted" });
          queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
          setViewPoId(null);
          refetchPos();
        },
        onError: (err: unknown) => {
          const e = err as { data?: { error?: string } } | null;
          toast({ title: "Delete failed", description: e?.data?.error, variant: "destructive" });
        },
      },
    );
  };

  // Convert a PO into a new draft purchase bill: prefill the bill form from the
  // PO's lines and jump to the bill creation view. The PO is marked "converted"
  // only once the resulting bill is actually saved (handled in handleSaveBill).
  const handleConvertPoToBill = (po: NonNullable<typeof viewPoDetail>) => {
    setBillForm({
      ...emptyBillForm(),
      supplier: po.supplier ?? "",
      notes: po.notes ? `From ${po.poNumber}: ${po.notes}` : `Converted from ${po.poNumber}`,
      defaultTaxRate: po.defaultTaxRate ? String(po.defaultTaxRate) : "",
      // PO line unit costs are persisted NET (tax already stripped out, even for
      // inclusive POs), so the bill must treat them as exclusive — adding tax on
      // top — to reproduce the same totals. Copying the PO's taxMode verbatim
      // would double-strip tax on an inclusive PO.
      taxMode: "exclusive",
      items: po.items.length
        ? po.items.map((it) => ({
            tempId: makeId(),
            productId: String(it.productId),
            quantity: String(it.quantity),
            unitCost: String(it.unitCost),
            taxRate: it.taxRate === null || it.taxRate === undefined ? "" : String(it.taxRate),
            batchNumber: "",
            expiryDate: "",
          }))
        : [emptyLineItem()],
    });
    setConvertingPoId(po.id);
    setBillSupplierManual(true);
    setViewPoId(null);
    setBillView("new");
    setPageTab("purchases");
    refetchProducts();
  };

  const printPoDoc = (po: NonNullable<typeof viewPoDetail>) => {
    printPurchaseOrder(
      {
        poNumber: po.poNumber,
        supplier: po.supplier,
        status: po.status,
        items: po.items.map((it) => ({
          productName: it.productName,
          quantity: it.quantity,
          unitCost: it.unitCost,
          totalCost: it.totalCost,
        })),
        subtotal: po.subtotal,
        taxTotal: po.taxTotal,
        totalCost: po.totalCost,
        notes: po.notes,
        expectedDate: po.expectedDate,
        createdAt: po.createdAt,
      },
      settings ?? {},
    );
  };

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
    const defaultTaxRate = parseFloat(billForm.defaultTaxRate) || 0;
    createBill.mutate(
      {
        data: {
          billNumber: billForm.billNumber.trim(),
          supplier: billForm.supplier || undefined,
          notes: billForm.notes || undefined,
          status,
          defaultTaxRate,
          taxMode: billForm.taxMode,
          items: validItems.map((i) => ({
            productId: parseInt(i.productId),
            quantity: parseInt(i.quantity),
            unitCost: parseFloat(i.unitCost) || 0,
            // null = inherit bill default on the server
            taxRate: i.taxRate.trim() === "" ? null : (parseFloat(i.taxRate) || 0),
            batchNumber: i.batchNumber.trim() === "" ? null : i.batchNumber.trim(),
            expiryDate: i.expiryDate.trim() === "" ? null : i.expiryDate,
          })),
        },
      } as never,
      {
        onSuccess: (response: unknown) => {
          toast({
            title: status === "confirmed"
              ? "Purchase bill confirmed — inventory updated!"
              : "Purchase bill saved as draft",
          });
          queryClient.invalidateQueries({ queryKey: ["/api/products"] });
          queryClient.invalidateQueries({ queryKey: ["/api/purchase-bills"] });
          setBillView("list");
          setBillForm(emptyBillForm());
          setBillSupplierManual(false);
          refetchBills();
          // If this bill was created by converting a purchase order, mark the
          // PO converted and link it to the new bill now that it actually exists.
          if (convertingPoId !== null) {
            const newBillId = (response as { id?: number } | null)?.id;
            updatePo.mutate(
              { id: convertingPoId, data: { status: "converted", convertedBillId: newBillId ?? null } },
              {
                onSettled: () => {
                  queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
                  refetchPos();
                },
              },
            );
            setConvertingPoId(null);
          }
          // If the server reports cost increases, open the price-adjustment
          // dialog so the user can update selling prices to keep margins.
          maybeOpenCostChangeDialog(response);
        },
        onError: (err: unknown) => {
          // Surface the server's actual reason (e.g. "Product 'X' requires
          // a batch/lot number") instead of a generic toast. The custom
          // fetch mutator stores it on err.message and err.data.error.
          const e = err as { message?: string; data?: { error?: string } } | null;
          const detail =
            e?.data?.error ??
            e?.message ??
            "Please check the form and try again.";
          toast({
            title: "Failed to save bill",
            description: detail,
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleUpdateBill = (action: "save" | "confirm") => {
    if (!editingBillId) return;
    const validItems = billForm.items.filter((i) => i.productId && parseInt(i.quantity) > 0);
    if (!validItems.length) {
      toast({ title: "Add at least one item with a product and quantity", variant: "destructive" });
      return;
    }
    const defaultTaxRate = parseFloat(billForm.defaultTaxRate) || 0;
    updateBill.mutate(
      {
        id: editingBillId,
        data: {
          billNumber: billForm.billNumber.trim(),
          supplier: billForm.supplier || undefined,
          notes: billForm.notes || undefined,
          defaultTaxRate,
          taxMode: billForm.taxMode,
          items: validItems.map((i) => ({
            productId: parseInt(i.productId),
            quantity: parseInt(i.quantity),
            unitCost: parseFloat(i.unitCost) || 0,
            taxRate: i.taxRate.trim() === "" ? null : (parseFloat(i.taxRate) || 0),
            batchNumber: i.batchNumber.trim() === "" ? null : i.batchNumber.trim(),
            expiryDate: i.expiryDate.trim() === "" ? null : i.expiryDate,
          })),
        },
      } as never,
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/purchase-bills"] });
          refetchBills();
          if (action === "confirm") {
            handleConfirmBillById(editingBillId);
          } else {
            toast({ title: "Purchase bill updated" });
          }
          setBillView("list");
          setEditingBillId(null);
          setBillForm(emptyBillForm());
          setBillSupplierManual(false);
        },
        onError: (err: unknown) => {
          const e = err as { message?: string; data?: { error?: string } } | null;
          const detail = e?.data?.error ?? e?.message ?? "Please check the form and try again.";
          toast({ title: "Failed to update bill", description: detail, variant: "destructive" });
        },
      },
    );
  };

  const handleConfirmBillById = (id: number) => {
    confirmBill.mutate(
      { id },
      {
        onSuccess: (response: unknown) => {
          toast({ title: "Bill confirmed — inventory updated!" });
          queryClient.invalidateQueries({ queryKey: ["/api/products"] });
          queryClient.invalidateQueries({ queryKey: ["/api/purchase-bills"] });
          setViewBillId(null);
          refetchBills();
          maybeOpenCostChangeDialog(response);
        },
        onError: () => toast({ title: "Confirm failed", variant: "destructive" }),
      },
    );
  };

  const handleConfirmBill = (id: number) => {
    confirmBill.mutate(
      { id },
      {
        onSuccess: (response: unknown) => {
          toast({ title: "Bill confirmed — inventory updated!" });
          queryClient.invalidateQueries({ queryKey: ["/api/products"] });
          queryClient.invalidateQueries({ queryKey: ["/api/purchase-bills"] });
          setViewBillId(null);
          refetchBills();
          maybeOpenCostChangeDialog(response);
        },
        onError: () => toast({ title: "Confirm failed", variant: "destructive" }),
      },
    );
  };

  // Cost-change adjustment dialog state.
  const [costChangeRows, setCostChangeRows] = useState<CostChangeRow[] | null>(null);
  const [applyingPrices, setApplyingPrices] = useState(false);

  const maybeOpenCostChangeDialog = (response: unknown) => {
    const changes = (response as { costChanges?: unknown[] } | null)?.costChanges;
    if (!Array.isArray(changes) || changes.length === 0) return;
    const rows: CostChangeRow[] = changes.map((c) => {
      const r = c as {
        productId: number;
        productName: string;
        oldCost: number | null;
        newCost: number;
        currentPrice: number;
        suggestedPrice: number;
      };
      return {
        productId: r.productId,
        productName: r.productName,
        oldCost: r.oldCost,
        newCost: r.newCost,
        currentPrice: r.currentPrice,
        markup: r.newCost > 0 ? round2(calcMarkupFromPrice(r.newCost, r.suggestedPrice)) : "",
        newPrice: r.suggestedPrice.toFixed(2),
        apply: true,
      };
    });
    setCostChangeRows(rows);
  };

  const applyPriceAdjustments = async () => {
    if (!costChangeRows) return;
    const toApply = costChangeRows.filter((r) => r.apply && parseFloat(r.newPrice) > 0);
    if (toApply.length === 0) {
      setCostChangeRows(null);
      return;
    }
    setApplyingPrices(true);
    let okCount = 0;
    let failCount = 0;
    for (const row of toApply) {
      try {
        await updateProduct.mutateAsync({
          id: row.productId,
          data: { price: parseFloat(row.newPrice) },
        } as never);
        okCount += 1;
      } catch {
        failCount += 1;
      }
    }
    setApplyingPrices(false);
    queryClient.invalidateQueries({ queryKey: ["/api/products"] });
    toast({
      title: failCount === 0
        ? `Updated ${okCount} selling price${okCount !== 1 ? "s" : ""}`
        : `${okCount} updated, ${failCount} failed`,
      variant: failCount === 0 ? "default" : "destructive",
    });
    setCostChangeRows(null);
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
    // Block the add flow up-front when the tenant is already at/over their
    // plan's product limit — show the upgrade prompt instead of the form.
    if (planLimit?.enforced && planLimit.atLimit) {
      setLimitPrompt(planLimit);
      return;
    }
    setEditingProduct(null);
    setForm({ ...emptyForm(), category: categories[0] ?? "General", markup: defaultMarkupSetting });
    setFormCasePrice("");
    setFormUnitsPerCase("");
    setDialogTab("details");
    setDialogOpen(true);
  };

  const openEdit = (p: GetProductResponse) => {
    setEditingProduct(p);
    // soldByWeight + unitOfMeasure live on the product (added to the
    // OpenAPI Product schema). The cast is here only because the local
    // GetProductResponse type may lag the codegen during dev rebuild;
    // the backend always returns these fields.
    const pp = p as GetProductResponse & {
      soldByWeight?: boolean;
      unitOfMeasure?: WeightUnit | string | null;
      sellingUnit?: string | null;
      costPrice?: number | null;
      structureType?: StructureType | string;
      isTaxable?: boolean;
      trackBatches?: boolean;
      stockMethodOverride?: "fifo" | "lifo" | null;
    };
    const unit: WeightUnit =
      pp.unitOfMeasure === "lb" || pp.unitOfMeasure === "oz" || pp.unitOfMeasure === "g"
        ? pp.unitOfMeasure
        : "kg";
    const struct: StructureType = pp.structureType === "composite" ? "composite" : "simple";
    // Derive markup from the existing cost & price (falls back to the tenant
    // default when there's no cost to compute against).
    const editCost = pp.costPrice != null ? Number(pp.costPrice) : NaN;
    const editMarkup =
      !isNaN(editCost) && editCost > 0 ? round2(calcMarkupFromPrice(editCost, p.price)) : defaultMarkupSetting;
    setForm({
      name: p.name,
      description: p.description ?? "",
      price: p.price.toString(),
      category: p.category,
      barcode: p.barcode ?? "",
      sku: p.sku ?? "",
      size: p.size ?? "",
      inStock: p.inStock,
      stockCount: p.stockCount.toString(),
      soldByWeight: !!pp.soldByWeight,
      unitOfMeasure: unit,
      sellingUnit: pp.sellingUnit ?? "",
      costPrice: pp.costPrice != null ? String(pp.costPrice) : "",
      structureType: struct,
      isTaxable: pp.isTaxable !== false,
      trackBatches: !!pp.trackBatches,
      stockMethodOverride: pp.stockMethodOverride === "fifo" || pp.stockMethodOverride === "lifo" ? pp.stockMethodOverride : "",
      markup: editMarkup,
      brand: (pp as { brand?: string | null }).brand ?? "",
    });
    setFormCasePrice("");
    setFormUnitsPerCase("");
    setDialogTab("details");
    setDialogOpen(true);
  };

  // Clone: open the New Product form pre-filled with an existing product's
  // pricing (cost, markup, selling price), category, units and flags — but
  // with name, barcode, SKU and stock cleared so the clerk only types the new
  // flavour's name + barcode (+ quantity). Same-line-pricing, different
  // flavour/barcode workflow requested by high-volume supermarket users.
  const openClone = (p: GetProductResponse) => {
    const pp = p as GetProductResponse & {
      soldByWeight?: boolean;
      unitOfMeasure?: WeightUnit | string | null;
      sellingUnit?: string | null;
      costPrice?: number | null;
      structureType?: StructureType | string;
      isTaxable?: boolean;
      trackBatches?: boolean;
      stockMethodOverride?: "fifo" | "lifo" | null;
    };
    const unit: WeightUnit =
      pp.unitOfMeasure === "lb" || pp.unitOfMeasure === "oz" || pp.unitOfMeasure === "g"
        ? pp.unitOfMeasure
        : "kg";
    const struct: StructureType = pp.structureType === "composite" ? "composite" : "simple";
    const cloneCost = pp.costPrice != null ? Number(pp.costPrice) : NaN;
    const cloneMarkup =
      !isNaN(cloneCost) && cloneCost > 0 ? round2(calcMarkupFromPrice(cloneCost, p.price)) : defaultMarkupSetting;
    setEditingProduct(null);
    setForm({
      name: "",
      description: p.description ?? "",
      price: p.price.toString(),
      category: p.category,
      barcode: "",
      sku: "",
      size: p.size ?? "",
      inStock: true,
      stockCount: "0",
      soldByWeight: !!pp.soldByWeight,
      unitOfMeasure: unit,
      sellingUnit: pp.sellingUnit ?? "",
      costPrice: pp.costPrice != null ? String(pp.costPrice) : "",
      structureType: struct,
      isTaxable: pp.isTaxable !== false,
      trackBatches: !!pp.trackBatches,
      stockMethodOverride: pp.stockMethodOverride === "fifo" || pp.stockMethodOverride === "lifo" ? pp.stockMethodOverride : "",
      markup: cloneMarkup,
      brand: "",
    });
    setFormCasePrice("");
    setFormUnitsPerCase("");
    setDialogTab("details");
    setDialogOpen(true);
  };

  // ─── Product-form Cost / Markup% / Selling Price sync ───
  // Editing Cost or Markup recomputes Price; editing Price recomputes Markup
  // from the known cost (or back-fills Cost when only a markup is set).
  const handleFormCostChange = (v: string) =>
    setForm((f) => {
      const cost = parseFloat(v);
      const markup = parseFloat(f.markup);
      const next = { ...f, costPrice: v };
      if (!isNaN(cost) && cost > 0 && !isNaN(markup)) next.price = round2(calcPriceFromMarkup(cost, markup));
      return next;
    });
  const handleFormMarkupChange = (v: string) =>
    setForm((f) => {
      const cost = parseFloat(f.costPrice);
      const markup = parseFloat(v);
      const next = { ...f, markup: v };
      if (!isNaN(cost) && cost > 0 && !isNaN(markup)) next.price = round2(calcPriceFromMarkup(cost, markup));
      return next;
    });
  const handleFormPriceChange = (v: string) =>
    setForm((f) => {
      const cost = parseFloat(f.costPrice);
      const price = parseFloat(v);
      const next = { ...f, price: v };
      if (!isNaN(price)) {
        if (!isNaN(cost) && cost > 0) {
          next.markup = round2(calcMarkupFromPrice(cost, price));
        } else {
          // No cost yet: back-fill it from the set markup (markup 0 ⇒ cost = price).
          const markup = parseFloat(f.markup);
          if (!isNaN(markup)) next.costPrice = round2(calcCostFromPrice(price, markup));
        }
      }
      return next;
    });

  const handleSave = (andClose = false) => {
    if (!form.name.trim() || !form.price || !form.category) {
      toast({ title: "Name, price and category are required.", variant: "destructive" });
      return;
    }
    // Composite parents have no inventory of their own — the server
    // forces stockCount=0 and we mirror that here so the UI stays in
    // sync with what gets persisted.
    const isComposite = form.structureType === "composite";
    const payload = {
      name: form.name.trim(),
      description: form.description || undefined,
      price: parseFloat(form.price),
      category: form.category,
      barcode: form.barcode || undefined,
      sku: form.sku || undefined,
      brand: form.brand.trim() === "" ? null : form.brand.trim(),
      // Only send size when the feature is on, so a tenant with it off never
      // overwrites an existing size (undefined = no write on update).
      size: showProductSize ? (form.size.trim() === "" ? null : form.size.trim()) : undefined,
      inStock: isComposite ? true : form.inStock,
      stockCount: isComposite ? 0 : (parseFloat(form.stockCount) || 0),
      soldByWeight: form.soldByWeight,
      unitOfMeasure: form.soldByWeight ? form.unitOfMeasure : undefined,
      sellingUnit: form.sellingUnit.trim() === "" ? null : form.sellingUnit.trim(),
      costPrice: form.costPrice.trim() === "" ? null : parseFloat(form.costPrice),
      structureType: form.structureType,
      isTaxable: form.isTaxable,
      trackBatches: form.trackBatches,
      stockMethodOverride: form.stockMethodOverride === "" ? null : form.stockMethodOverride,
    };

    if (editingProduct) {
      updateProduct.mutate(
        { id: editingProduct.id, data: payload },
        {
          onSuccess: () => {
            toast({ title: "Product updated" });
            queryClient.invalidateQueries({ queryKey: ["/api/products"] });
            if (andClose) { setDialogOpen(false); setEditingProduct(null); setForm(emptyForm()); }
          },
          onError: (err) => {
            const expiredMsg = subscriptionExpiredMessage(err);
            if (expiredMsg) { setSubscriptionExpiredMsg(expiredMsg); return; }
            toast(saveProductErrorToast(err, "Update failed"));
          },
        },
      );
    } else {
      createProduct.mutate(
        { data: payload },
        {
          onSuccess: (newProduct) => {
            toast({ title: "Product created" });
            queryClient.invalidateQueries({ queryKey: ["/api/products"] });
            refetchPlanLimit();
            if (andClose) { setDialogOpen(false); setEditingProduct(null); setForm(emptyForm()); }
            else { setEditingProduct(newProduct); setDialogTab("variants"); }
          },
          onError: (err) => {
            // Plan product-limit block: surface a dedicated upgrade prompt
            // instead of a generic toast.
            const apiErr = err as { status?: number; body?: unknown; data?: unknown } | undefined;
            const payload = (apiErr?.body ?? apiErr?.data) as
              | (PlanLimitStatus & { code?: string })
              | undefined;
            if (apiErr?.status === 403 && payload?.code === "PLAN_PRODUCT_LIMIT_REACHED") {
              setDialogOpen(false);
              setLimitPrompt({
                enforced: true,
                productCount: payload.productCount,
                maxProducts: payload.maxProducts,
                planName: payload.planName,
                planSlug: payload.planSlug ?? null,
                atLimit: true,
                overBy: payload.overBy ?? 0,
                recommendedPlan: payload.recommendedPlan ?? null,
              });
              return;
            }
            const expiredMsg = subscriptionExpiredMessage(err);
            if (expiredMsg) { setSubscriptionExpiredMsg(expiredMsg); return; }
            toast(saveProductErrorToast(err, "Create failed"));
          },
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
          queryClient.invalidateQueries({ queryKey: ["/api/products/plan-limit"] });
          setDeleteId(null);
        },
        onError: () => toast({ title: "Delete failed", variant: "destructive" }),
      },
    );
  };

  // ── Bulk selection / archive / restore ──────────────────────────────────
  const selectedList = useMemo(
    () => Object.entries(selectedIds).filter(([, v]) => v).map(([k]) => Number(k)),
    [selectedIds],
  );
  const selectedCount = selectedList.length;
  // Among the current (archived) selection, which ids are eligible for a
  // permanent hard-delete (archived + zero history → product.deletable).
  const deletableIdSet = useMemo(
    () => new Set((filteredProducts ?? []).filter((p) => p.deletable).map((p) => p.id)),
    [filteredProducts],
  );
  const selectedDeletableList = useMemo(
    () => selectedList.filter((id) => deletableIdSet.has(id)),
    [selectedList, deletableIdSet],
  );
  const selectedDeletableCount = selectedDeletableList.length;
  const visibleIds = useMemo(() => (filteredProducts ?? []).map((p) => p.id), [filteredProducts]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds[id]);
  const toggleSelect = (id: number) =>
    setSelectedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  const toggleSelectAll = () =>
    setSelectedIds((prev) => {
      const n = { ...prev };
      if (allVisibleSelected) visibleIds.forEach((id) => delete n[id]);
      else visibleIds.forEach((id) => { n[id] = true; });
      return n;
    });
  const clearSelection = () => setSelectedIds({});

  // Bulk archive/restore run in client-side batches so very large selections
  // (thousands of products) succeed without a single oversized request timing
  // out, and surface a progress bar like the import flow.
  const BULK_CHUNK = 300;
  const runBatched = async (mode: "archive" | "restore", ids: number[]) => {
    const mutateAsync = mode === "archive" ? bulkArchive.mutateAsync : bulkRestore.mutateAsync;
    setBulkProgress({ mode, done: 0, total: ids.length });
    let affected = 0;
    let failed = 0;
    let consecutiveFailures = 0;
    let aborted = false;
    for (let i = 0; i < ids.length; i += BULK_CHUNK) {
      const chunk = ids.slice(i, i + BULK_CHUNK);
      try {
        const res = await mutateAsync({ data: { ids: chunk } });
        affected += res.count;
        consecutiveFailures = 0;
      } catch {
        failed += chunk.length;
        consecutiveFailures += 1;
      }
      setBulkProgress({ mode, done: Math.min(i + BULK_CHUNK, ids.length), total: ids.length });
      // Stop early if the server is consistently rejecting (e.g. session
      // expiry / permission loss) rather than hammering it with the rest.
      if (consecutiveFailures >= 3) {
        const remaining = ids.length - Math.min(i + BULK_CHUNK, ids.length);
        failed += remaining;
        aborted = true;
        break;
      }
    }
    setBulkProgress(null);
    return { affected, failed, aborted };
  };

  const doBulkArchive = async () => {
    if (selectedList.length === 0 || bulkProgress) return;
    setBulkConfirmOpen(false);
    const { affected, failed, aborted } = await runBatched("archive", selectedList);
    queryClient.invalidateQueries({ queryKey: ["/api/products"] });
    queryClient.invalidateQueries({ queryKey: ["/api/products/plan-limit"] });
    clearSelection();
    if (failed > 0) {
      toast({ title: `${affected} archived, ${failed} failed`, description: aborted ? "Stopped early after repeated errors — check your connection and retry." : "Some products could not be archived. Please retry.", variant: "destructive" });
    } else {
      toast({ title: `${affected} product${affected === 1 ? "" : "s"} archived`, description: "History is preserved. Toggle 'Show archived' to restore." });
    }
  };

  // Permanent (hard) delete for the eligible (deletable) subset of the
  // selection. Runs in client-side chunks like archive/restore; the server
  // re-checks eligibility and silently skips anything that isn't deletable.
  const doBulkPermDelete = async () => {
    setBulkPermConfirmOpen(false);
    if (selectedDeletableList.length === 0 || bulkProgress) return;
    const ids = selectedDeletableList;
    setBulkProgress({ mode: "permdelete", done: 0, total: ids.length });
    let deleted = 0;
    let skipped = 0;
    let consecutiveFailures = 0;
    let aborted = false;
    for (let i = 0; i < ids.length; i += BULK_CHUNK) {
      const chunk = ids.slice(i, i + BULK_CHUNK);
      try {
        const res = await bulkPermDelete.mutateAsync({ data: { ids: chunk, staffId: staff?.id ?? 0 } });
        deleted += res.deleted;
        skipped += res.skipped;
        consecutiveFailures = 0;
      } catch {
        skipped += chunk.length;
        consecutiveFailures += 1;
      }
      setBulkProgress({ mode: "permdelete", done: Math.min(i + BULK_CHUNK, ids.length), total: ids.length });
      if (consecutiveFailures >= 3) {
        skipped += ids.length - Math.min(i + BULK_CHUNK, ids.length);
        aborted = true;
        break;
      }
    }
    setBulkProgress(null);
    queryClient.invalidateQueries({ queryKey: ["/api/products"] });
    queryClient.invalidateQueries({ queryKey: ["/api/products/plan-limit"] });
    clearSelection();
    if (deleted > 0 && skipped === 0) {
      toast({ title: `${deleted} product${deleted === 1 ? "" : "s"} permanently deleted` });
    } else if (deleted > 0) {
      toast({ title: `${deleted} permanently deleted, ${skipped} skipped`, description: aborted ? "Stopped early after repeated errors — check your connection and retry." : "Skipped products have history or couldn't be deleted." });
    } else {
      toast({ title: "Nothing deleted", description: aborted ? "Stopped early after repeated errors — please retry." : "None of the selected products were eligible for permanent delete.", variant: "destructive" });
    }
  };

  const doBulkRestore = async () => {
    if (selectedList.length === 0 || bulkProgress) return;
    const { affected, failed, aborted } = await runBatched("restore", selectedList);
    queryClient.invalidateQueries({ queryKey: ["/api/products"] });
    queryClient.invalidateQueries({ queryKey: ["/api/products/plan-limit"] });
    clearSelection();
    if (failed > 0) {
      toast({ title: `${affected} restored, ${failed} failed`, description: aborted ? "Stopped early after repeated errors — check your connection and retry." : "Some products could not be restored. Please retry.", variant: "destructive" });
    } else {
      toast({ title: `${affected} product${affected === 1 ? "" : "s"} restored` });
    }
  };

  const doRestoreOne = (id: number) => {
    bulkRestore.mutate(
      { data: { ids: [id] } },
      {
        onSuccess: () => {
          toast({ title: "Product restored" });
          queryClient.invalidateQueries({ queryKey: ["/api/products"] });
          queryClient.invalidateQueries({ queryKey: ["/api/products/plan-limit"] });
        },
        onError: () => toast({ title: "Restore failed", variant: "destructive" }),
      },
    );
  };

  // Permanent (hard) delete — only offered for archived products with zero
  // sales/purchase history (server enforces; UI gates on product.deletable).
  const handlePermDelete = () => {
    if (!permDelete) return;
    deletePermanent.mutate(
      { id: permDelete.id, params: { staffId: staff?.id ?? 0 } },
      {
        onSuccess: () => {
          toast({ title: "Product permanently deleted" });
          queryClient.invalidateQueries({ queryKey: ["/api/products"] });
          queryClient.invalidateQueries({ queryKey: ["/api/products/plan-limit"] });
          setPermDelete(null);
        },
        onError: (e: any) => {
          toast({
            title: "Couldn't delete",
            description: e?.data?.error ?? "This product can't be permanently deleted.",
            variant: "destructive",
          });
          setPermDelete(null);
        },
      },
    );
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-4 sm:p-8 space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Products</h2>
          <p className="text-muted-foreground mt-1 text-sm">Manage your product catalog, variants, and stock purchases.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
            <button
              onClick={() => setPageTab("orders")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${pageTab === "orders" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"}`}
            >
              <ClipboardList className="h-3.5 w-3.5" />Orders
              {purchaseOrders && purchaseOrders.length > 0 && (
                <span className="ml-0.5 bg-primary/20 text-primary rounded-full px-1.5 text-[10px] font-bold">{purchaseOrders.length}</span>
              )}
            </button>
            <button
              onClick={() => setPageTab("units")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${pageTab === "units" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"}`}
            >
              <Ruler className="h-3.5 w-3.5" />Units
            </button>
          </div>
          {pageTab === "products" && canManage && (
            <>
              <Button variant="outline" onClick={() => setMbposDialogOpen(true)} className="gap-2 border-sky-500/40 text-sky-400 hover:text-sky-300 hover:border-sky-400/60">
                <FileSpreadsheet className="h-4 w-4" />MBPOS Import
              </Button>
              <Button variant="outline" onClick={() => setImportDialogOpen(true)} className="gap-2">
                <Upload className="h-4 w-4" />Import
              </Button>
              <Button variant="outline" onClick={() => setCatManagerOpen(true)} className="gap-2">
                <Settings2 className="h-4 w-4" />Categories
              </Button>
              <Button variant="outline" onClick={() => setMergeDialogOpen(true)} className="gap-2 border-amber-500/40 text-amber-400 hover:text-amber-300 hover:border-amber-400/60">
                <Copy className="h-4 w-4" />Find Duplicates
              </Button>
              <Button onClick={openAdd} className="gap-2">
                <Plus className="h-4 w-4" />Add Product
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Plan product-limit banner — shown when the tenant is at or over their
          subscription plan's product allowance (e.g. after a downgrade). */}
      {pageTab === "products" && planLimit?.enforced && planLimit.atLimit && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold text-amber-200">
                {planLimit.overBy > 0
                  ? `You're over your ${planLimit.planName} plan's product limit`
                  : `You've reached your ${planLimit.planName} plan's product limit`}
              </p>
              <p className="text-amber-100/80 mt-0.5">
                Your {planLimit.planName} plan allows{" "}
                <span className="font-semibold">{planLimit.maxProducts}</span> products. You currently have{" "}
                <span className="font-semibold">{planLimit.productCount}</span>
                {planLimit.overBy > 0 ? (
                  <> — over the limit by <span className="font-semibold">{planLimit.overBy}</span>.</>
                ) : (
                  <>.</>
                )}{" "}
                {"Upgrade your plan to add more products."}
              </p>
            </div>
          </div>
          <Button
            onClick={() => navigate("/subscription")}
            className="gap-2 shrink-0 bg-amber-500 hover:bg-amber-400 text-amber-950"
          >
            <TrendingUp className="h-4 w-4" />
            Upgrade Plan
          </Button>
        </div>
      )}

      {/* Low stock / out of stock summary buttons (click to reveal details) */}
      {pageTab === "products" && !isLoading && (lowStockProducts.length > 0 || outOfStockProducts.length > 0) && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-3">
            {outOfStockProducts.length > 0 && (
              <button
                type="button"
                onClick={() => setShowOutOfStock((v) => !v)}
                aria-expanded={showOutOfStock}
                className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm transition-colors ${showOutOfStock ? "border-destructive bg-destructive/15" : "border-destructive/40 bg-destructive/10 hover:bg-destructive/15"}`}
              >
                <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
                <span className="font-medium text-destructive">{outOfStockProducts.length} out of stock</span>
                <ChevronDown className={`h-4 w-4 text-destructive transition-transform ${showOutOfStock ? "rotate-180" : ""}`} />
              </button>
            )}
            {lowStockProducts.length > 0 && (
              <button
                type="button"
                onClick={() => setShowLowStock((v) => !v)}
                aria-expanded={showLowStock}
                className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm transition-colors ${showLowStock ? "border-yellow-500 bg-yellow-500/15" : "border-yellow-500/40 bg-yellow-500/10 hover:bg-yellow-500/15"}`}
              >
                <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0" />
                <span className="font-medium text-yellow-500">{lowStockProducts.length} running low</span>
                <ChevronDown className={`h-4 w-4 text-yellow-500 transition-transform ${showLowStock ? "rotate-180" : ""}`} />
              </button>
            )}
          </div>
          {showOutOfStock && outOfStockProducts.length > 0 && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
              <p className="font-medium text-destructive mb-1.5">Out of stock ({outOfStockProducts.length})</p>
              <div className="flex flex-wrap gap-1.5">
                {outOfStockProducts.map((p) => (
                  <Badge key={p.id} variant="outline" className="border-destructive/40 text-destructive">{p.name}</Badge>
                ))}
              </div>
            </div>
          )}
          {showLowStock && lowStockProducts.length > 0 && (
            <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/5 px-4 py-3 text-sm">
              <p className="font-medium text-yellow-500 mb-1.5">Running low ({lowStockProducts.length})</p>
              <div className="flex flex-wrap gap-1.5">
                {lowStockProducts.map((p) => (
                  <Badge key={p.id} variant="outline" className="border-yellow-500/40 text-yellow-500">{p.name} ({p.stockCount})</Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {pageTab === "products" && (
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-[160px] sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9 w-full bg-white text-gray-900 placeholder:text-gray-400 border-gray-300" placeholder="Search by name, barcode or SKU…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        </div>
        <div className="flex gap-2 flex-wrap flex-1">
          <Button size="sm" variant={!categoryFilter ? "default" : "outline"} onClick={() => setCategoryFilter(null)}>All</Button>
          {categories.map((c) => (
            <Button key={c} size="sm" variant={categoryFilter === c ? "default" : "outline"} onClick={() => setCategoryFilter(c)}>{c}</Button>
          ))}
          {canManage && (
            <Button size="sm" variant="ghost" onClick={() => setCatManagerOpen(true)} className="gap-1 text-muted-foreground hover:text-foreground border border-dashed border-border/60">
              <Settings2 className="h-3 w-3" />Manage
            </Button>
          )}
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
        {/* Show archived toggle */}
        {canManage && (
          <Button
            size="sm"
            variant={showArchived ? "default" : "outline"}
            onClick={() => { setShowArchived((v) => !v); clearSelection(); }}
            className="gap-1.5 shrink-0"
            title="Archived products are hidden from the catalog and POS but keep their full sales/purchase history."
          >
            <Archive className="h-3.5 w-3.5" />
            {showArchived ? "Showing archived" : "Show archived"}
          </Button>
        )}
      </div>
      )}

      {/* ── Bulk selection action bar ── */}
      {pageTab === "products" && canManage && viewMode === "list" && selectedCount > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/40 bg-primary/10 px-4 py-2.5">
          <span className="text-sm font-semibold">{selectedCount} selected</span>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={clearSelection}>Clear</Button>
          <div className="flex-1" />
          {showArchived ? (
            <>
              {selectedDeletableCount > 0 && (
                <Button size="sm" variant="destructive" className="gap-1.5" disabled={!!bulkProgress} onClick={() => setBulkPermConfirmOpen(true)}>
                  <Trash2 className="h-3.5 w-3.5" />Delete permanently ({selectedDeletableCount})
                </Button>
              )}
              <Button size="sm" variant="default" className="gap-1.5" disabled={!!bulkProgress} onClick={doBulkRestore}>
                <RotateCcw className="h-3.5 w-3.5" />Restore selected
              </Button>
            </>
          ) : (
            <Button size="sm" variant="destructive" className="gap-1.5" onClick={() => setBulkConfirmOpen(true)}>
              <Trash2 className="h-3.5 w-3.5" />Delete selected
            </Button>
          )}
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
          {canManage && <Button variant="outline" onClick={openAdd}>Add your first product</Button>}
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <AnimatePresence>
            {filteredProducts.map((product) => {
              const isLow = product.inStock && product.stockCount > 0 && product.stockCount <= LOW_STOCK_THRESHOLD;
              const isOut = !product.inStock || product.stockCount === 0;
              return (
              <motion.div key={product.id} initial={false} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}>
                <Card className={`group hover:border-primary/50 transition-colors ${isOut ? "border-destructive/30" : isLow ? "border-yellow-500/30" : ""}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-sm font-semibold leading-snug flex-1 truncate">{product.name}</CardTitle>
                      <Badge variant="outline" className="text-[10px] shrink-0">{product.category}</Badge>
                    </div>
                    {product.sku && <p className="text-[11px] text-muted-foreground/80 font-mono truncate mt-0.5">SKU: {product.sku}</p>}
                    {showProductSize && product.size && <p className="text-[11px] text-muted-foreground/80 truncate mt-0.5">Size: {product.size}</p>}
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
                    <div className="flex gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button size="sm" variant="outline" className="h-9 px-3 text-sm" title="Print Label" onClick={() => setPrintProduct(product)}>
                        <Printer className="h-4 w-4" />
                      </Button>
                      {canManage && (
                        <Button size="sm" variant="outline" className="h-9 text-sm px-3 text-blue-400 border-blue-400/40 hover:bg-blue-400/10" onClick={() => openRestock(product)}>
                          <PackagePlus className="h-4 w-4 mr-1.5" />Restock
                        </Button>
                      )}
                      {canManage && (
                        <Button size="sm" variant="outline" className="h-9 px-3 text-sm" title="Clone product" onClick={() => openClone(product)}>
                          <Copy className="h-4 w-4 mr-1.5" />Clone
                        </Button>
                      )}
                      {canManage && (
                        <Button size="sm" variant="outline" className="flex-1 h-9 text-sm" onClick={() => openEdit(product)}>
                          <Pencil className="h-4 w-4 mr-1.5" />Edit
                        </Button>
                      )}
                      {canManage && (
                        <Button size="sm" variant="outline" className="h-9 px-3 text-destructive hover:bg-destructive/10 hover:border-destructive" onClick={() => setDeleteId(product.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                      {canManage && product.deletable && (
                        <Button size="sm" variant="outline" className="h-9 px-3 text-destructive border-destructive/40 hover:bg-destructive/10" title="Delete permanently" onClick={() => setPermDelete({ id: product.id, name: product.name })}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
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
          <div className="overflow-x-auto">
          <div className="min-w-[680px]">
          {/* Header row */}
          <div className="grid grid-cols-[32px_minmax(140px,1fr)_110px_90px_130px_90px_110px] gap-4 px-4 py-2.5 bg-secondary/40 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {canManage ? (
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary cursor-pointer self-center"
                checked={allVisibleSelected}
                onChange={toggleSelectAll}
                title="Select all"
                aria-label="Select all products"
              />
            ) : <span />}
            <span>Product</span>
            <span>Category</span>
            <span className="text-right">Price</span>
            <span>Stock</span>
            <span>Add-ons</span>
            <span className="text-right">Actions</span>
          </div>
          {/* Virtualized scroll container — only renders rows currently in view */}
          <div
            ref={listScrollRef}
            style={{ height: "min(70vh, 720px)", overflowY: "auto" }}
          >
            <div style={{ height: virtualizer.getTotalSize(), position: "relative", width: "100%" }}>
            {virtualizer.getVirtualItems().map((vItem) => {
              const product = filteredProducts[vItem.index];
              if (!product) return null;
              const isLow = product.inStock && product.stockCount > 0 && product.stockCount <= LOW_STOCK_THRESHOLD;
              const isOut = !product.inStock || product.stockCount === 0;
              const varExpanded = expandedVariants.has(product.id);
              return (
              <div
                key={vItem.key}
                data-index={vItem.index}
                ref={virtualizer.measureElement}
                style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${vItem.start}px)` }}
                className="border-b border-border/50"
              >
                {/* Main row */}
                <div className={`grid grid-cols-[32px_minmax(140px,1fr)_110px_90px_130px_90px_110px] gap-4 px-4 py-3 items-center hover:bg-secondary/20 transition-colors group ${selectedIds[product.id] ? "bg-primary/5" : ""}`}>
                  {/* Selection checkbox */}
                  {canManage ? (
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-primary cursor-pointer"
                      checked={!!selectedIds[product.id]}
                      onChange={() => toggleSelect(product.id)}
                      aria-label={`Select ${product.name}`}
                    />
                  ) : <span />}
                  {/* Name + description */}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate flex items-center gap-1.5">
                      {product.archivedAt && <Badge variant="secondary" className="text-[9px] h-4 px-1 gap-0.5 shrink-0"><Archive className="h-2.5 w-2.5" />Archived</Badge>}
                      <span className="truncate">{product.name}</span>
                    </p>
                    {product.description && <p className="text-xs text-muted-foreground truncate mt-0.5">{product.description}</p>}
                    {product.sku && <p className="text-[11px] text-muted-foreground/80 font-mono truncate mt-0.5">SKU: {product.sku}</p>}
                    {showProductSize && product.size && <p className="text-[11px] text-muted-foreground/80 truncate mt-0.5">Size: {product.size}</p>}
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
                      <button
                        onClick={() => toggleVariantExpand(product.id)}
                        className={`inline-flex items-center gap-0.5 text-[10px] h-5 px-1.5 rounded-md border font-medium transition-colors ${varExpanded ? "bg-blue-500/20 text-blue-300 border-blue-500/40" : "bg-secondary text-muted-foreground border-border hover:bg-secondary/80"}`}
                      >
                        <Layers className="h-2.5 w-2.5" />
                        Variants
                        <span className={`ml-0.5 transition-transform ${varExpanded ? "rotate-180" : ""}`} style={{ display: "inline-block" }}>▾</span>
                      </button>
                    )}
                    {product.hasModifiers && (
                      <Badge variant="secondary" className="text-[10px] h-5 gap-0.5 px-1.5">
                        <Settings2 className="h-2.5 w-2.5" />Mods
                      </Badge>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button size="icon" variant="outline" className="h-9 w-9" title="Print Label" onClick={() => setPrintProduct(product)}>
                      <Printer className="h-4 w-4" />
                    </Button>
                    {canManage && (
                      <Button size="icon" variant="outline" className="h-9 w-9 text-blue-400 border-blue-400/40 hover:bg-blue-400/10" title="Restock" onClick={() => openRestock(product)}>
                        <PackagePlus className="h-4 w-4" />
                      </Button>
                    )}
                    {canManage && (
                      <Button size="icon" variant="outline" className="h-9 w-9" title="Clone product" onClick={() => openClone(product)}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    )}
                    {canManage && (
                      <Button size="icon" variant="outline" className="h-9 w-9" onClick={() => openEdit(product)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                    {canManage && (product.archivedAt ? (
                      <>
                      <Button size="icon" variant="outline" className="h-9 w-9 text-emerald-400 border-emerald-400/40 hover:bg-emerald-400/10" title="Restore" onClick={() => doRestoreOne(product.id)}>
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                      {product.deletable && (
                        <Button size="icon" variant="outline" className="h-9 w-9 text-destructive border-destructive/40 hover:bg-destructive/10" title="Delete permanently" onClick={() => setPermDelete({ id: product.id, name: product.name })}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                      </>
                    ) : (
                      <Button size="icon" variant="outline" className="h-9 w-9 text-destructive hover:bg-destructive/10 hover:border-destructive" title="Delete (archive)" onClick={() => setDeleteId(product.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Variant stock panel (expanded) */}
                <AnimatePresence initial={false}>
                  {product.hasVariants && varExpanded && (
                    <motion.div
                      key="vsp"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.18 }}
                      style={{ overflow: "hidden" }}
                    >
                      <VariantStockPanel productId={product.id} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
            })}
            </div>{/* end virtual sizer */}
          </div>{/* end virtual scroll */}
          </div>{/* end min-w */}
          </div>{/* end overflow-x-auto */}
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
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    className="gap-2"
                    onClick={() => navigate("/supplier-returns")}
                  >
                    Supplier Returns
                  </Button>
                  <Button className="gap-2" onClick={() => {
                    // Pre-fill default tax rate from business tax settings so
                    // every new bill mirrors the tenant's standing rate.
                    const tenantRate = parseFloat(String(settings?.tax_rate ?? ""));
                    setBillForm({
                      ...emptyBillForm(),
                      defaultTaxRate: Number.isFinite(tenantRate) ? String(tenantRate) : "",
                    });
                    setBillSupplierManual(false);
                    setBillView("new");
                    refetchProducts();
                  }}>
                    <Plus className="h-4 w-4" />New Purchase Bill
                  </Button>
                </div>
              </div>

              {/* Bills table */}
              {!bills?.length ? (
                <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
                  <Truck className="h-12 w-12 opacity-30" />
                  <p className="text-lg">No purchase bills yet</p>
                  <p className="text-sm">Create a purchase bill to record deliveries and update inventory for multiple products at once.</p>
                  <Button variant="outline" className="mt-2 gap-2" onClick={() => {
                    const tenantRate = parseFloat(String(settings?.tax_rate ?? ""));
                    setBillForm({
                      ...emptyBillForm(),
                      defaultTaxRate: Number.isFinite(tenantRate) ? String(tenantRate) : "",
                    });
                    setBillSupplierManual(false);
                    setBillView("new");
                    refetchProducts();
                  }}>
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
                              <Button size="icon" variant="outline" className="h-7 w-7 text-primary hover:bg-primary/10" title="Edit" onClick={() => {
                                setEditingBillId(bill.id);
                                setBillForm(emptyBillForm());
                                setConvertingPoId(null);
                                setBillView("new");
                                refetchProducts();
                              }}>
                                <Pencil className="h-3 w-3" />
                              </Button>
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
                <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground" onClick={() => { setBillView("list"); setConvertingPoId(null); setEditingBillId(null); }}>
                  <ArrowLeft className="h-3.5 w-3.5" />Bills
                </Button>
                <span className="text-muted-foreground">/</span>
                <h3 className="text-lg font-semibold">{editingBillId ? "Edit Purchase Bill" : "New Purchase Bill"}</h3>
              </div>

              {/* Bill Info */}
              <Card>
                <CardContent className="pt-4 pb-4">
                  <div className="grid grid-cols-4 gap-4">
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
                      {(billSupplierManual || vendors.length === 0) ? (
                        <div className="flex gap-1">
                          <Input
                            value={billForm.supplier}
                            onChange={(e) => setBillForm((f) => ({ ...f, supplier: e.target.value }))}
                            placeholder="Type supplier name"
                            className="flex-1"
                          />
                          {vendors.length > 0 && (
                            <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0"
                              onClick={() => { setBillSupplierManual(false); setBillForm(f => ({ ...f, supplier: "" })); }}>
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      ) : (
                        <Select
                          value={billForm.supplier}
                          onValueChange={(v) => {
                            if (v === "__manual__") { setBillSupplierManual(true); setBillForm(f => ({ ...f, supplier: "" })); }
                            else setBillForm((f) => ({ ...f, supplier: v }));
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select vendor..." />
                          </SelectTrigger>
                          <SelectContent>
                            {vendors.filter(v => v.isActive).map((v) => (
                              <SelectItem key={v.id} value={v.name}>{v.name}</SelectItem>
                            ))}
                            <SelectItem value="__manual__" className="text-muted-foreground italic">Enter manually...</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                    <div className="grid gap-1.5">
                      <Label className="text-xs text-muted-foreground uppercase tracking-wide">Default Tax %</Label>
                      <div className="relative">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          placeholder="0"
                          value={billForm.defaultTaxRate}
                          onChange={(e) => setBillForm((f) => ({ ...f, defaultTaxRate: e.target.value }))}
                          className="pr-7 text-right font-mono"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                      </div>
                    </div>
                    <div className="grid gap-1.5">
                      <Label className="text-xs text-muted-foreground uppercase tracking-wide">Tax Mode</Label>
                      <div className="flex h-9 rounded-md border border-border overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setBillForm((f) => ({ ...f, taxMode: "exclusive" }))}
                          className={`flex-1 text-xs font-medium transition ${billForm.taxMode === "exclusive" ? "bg-primary text-primary-foreground" : "bg-transparent text-muted-foreground hover:bg-secondary/60"}`}
                          title="Unit costs are net; tax is added on top"
                        >
                          Exclusive
                        </button>
                        <button
                          type="button"
                          onClick={() => setBillForm((f) => ({ ...f, taxMode: "inclusive" }))}
                          className={`flex-1 text-xs font-medium transition border-l border-border ${billForm.taxMode === "inclusive" ? "bg-primary text-primary-foreground" : "bg-transparent text-muted-foreground hover:bg-secondary/60"}`}
                          title="Unit costs already include tax; net cost is back-computed"
                        >
                          Inclusive
                        </button>
                      </div>
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
                  {/* Header row — Batch # and Expiry are inline columns now
                      (only populated for batch-tracked products). */}
                  <div className="grid grid-cols-[1.5fr_60px_100px_75px_130px_120px_95px_100px_36px] gap-2 px-4 py-2.5 bg-secondary/40 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    <span>Product</span>
                    <span className="text-right">Qty</span>
                    <span className="text-right">Unit Cost</span>
                    <span className="text-right">Tax %</span>
                    <span>Batch / Lot #</span>
                    <span>Expiry</span>
                    <span className="text-right">Margin</span>
                    <span className="text-right">Line Total</span>
                    <span />
                  </div>

                  {/* Item rows */}
                  {billForm.items.map((item) => {
                    const margin = billLineMargin(item);
                    const breakdown = billLineBreakdown(item);
                    const defaultRate = parseFloat(billForm.defaultTaxRate) || 0;
                    const selectedProduct = item.productId
                      ? (products ?? []).find((p) => p.id === parseInt(item.productId)) as (typeof products extends readonly (infer U)[] ? U : never) & { trackBatches?: boolean } | undefined
                      : undefined;
                    const showBatchRow = !!selectedProduct?.trackBatches;
                    return (
                    <React.Fragment key={item.tempId}>
                    <div
                      className="grid grid-cols-[1.5fr_90px_100px_75px_130px_120px_95px_100px_36px] gap-2 px-4 py-2 items-center border-b border-border/40 last:border-0"
                    >
                      {/* Product picker — searchable combobox (fast for 1000+ products) */}
                      <ProductCombobox
                        products={products ?? []}
                        value={item.productId}
                        onChange={(v) => updateLineItem(item.tempId, { productId: v })}
                      />

                      {/* Qty */}
                      <Input
                        type="number"
                        min="1"
                        placeholder="0"
                        value={item.quantity}
                        onChange={(e) => updateLineItem(item.tempId, { quantity: e.target.value })}
                        className="h-8 text-sm text-right"
                      />

                      {/* Unit cost (ex-tax) */}
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

                      {/* Tax % — empty = inherit bill default (shown as placeholder) */}
                      <div className="relative">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          placeholder={defaultRate > 0 ? defaultRate.toString() : "0"}
                          value={item.taxRate}
                          onChange={(e) => updateLineItem(item.tempId, { taxRate: e.target.value })}
                          className="h-8 text-sm pr-6 text-right"
                          title="Leave blank to use the bill's default tax rate"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                      </div>

                      {/* Batch / Lot # — input when product is batch-tracked,
                          dash otherwise. Keeps the column always aligned. */}
                      <div>
                        {showBatchRow ? (
                          <Input
                            placeholder="LOT-…"
                            value={item.batchNumber}
                            onChange={(e) => updateLineItem(item.tempId, { batchNumber: e.target.value })}
                            className="h-8 text-sm"
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>

                      {/* Expiry date */}
                      <div>
                        {showBatchRow ? (
                          <Input
                            type="date"
                            value={item.expiryDate}
                            onChange={(e) => updateLineItem(item.tempId, { expiryDate: e.target.value })}
                            className="h-8 text-sm"
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>

                      {/* Margin — both % and amount */}
                      <div className="text-right text-sm font-mono leading-tight">
                        {margin ? (
                          <>
                            <div className={margin.pct < 0 ? "text-destructive font-semibold" : margin.pct < 15 ? "text-yellow-400 font-semibold" : "text-green-400 font-semibold"}>
                              {margin.pct.toFixed(1)}%
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              {formatCurrency(margin.amount)}
                            </div>
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </div>

                      {/* Line total (includes tax) */}
                      <div className="text-right leading-tight">
                        <p className="text-sm font-bold font-mono text-primary">
                          {breakdown.total > 0 ? formatCurrency(breakdown.total) : "—"}
                        </p>
                        {breakdown.tax > 0 && (
                          <p className="text-[11px] text-muted-foreground font-mono">
                            tax {formatCurrency(breakdown.tax)}
                          </p>
                        )}
                      </div>

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
                    </React.Fragment>
                    );
                  })}

                  {/* Add item row */}
                  <div className="px-4 py-2.5 border-t border-border/40 bg-secondary/20">
                    <Button size="sm" variant="ghost" className="gap-1.5 text-sm text-primary hover:text-primary" onClick={addLineItem}>
                      <Plus className="h-3.5 w-3.5" />Add Item
                    </Button>
                  </div>
                </div>

                {/* Totals row — subtotal, input tax, grand total */}
                <div className="flex items-start justify-between gap-4 px-4 py-2">
                  <span className="text-sm text-muted-foreground pt-1">
                    {billForm.items.filter((i) => i.productId && parseInt(i.quantity) > 0).length} valid items
                  </span>
                  <div className="flex flex-col items-end gap-0.5 min-w-[220px]">
                    <div className="flex items-center justify-between w-full text-sm">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span className="font-mono">{formatCurrency(billTotals.subtotal)}</span>
                    </div>
                    <div className="flex items-center justify-between w-full text-sm">
                      <span className="text-muted-foreground">Input Tax</span>
                      <span className="font-mono">{formatCurrency(billTotals.tax)}</span>
                    </div>
                    <div className="flex items-center justify-between w-full pt-1 mt-1 border-t border-border/60">
                      <span className="text-sm font-medium">Grand Total</span>
                      <span className="text-xl font-bold font-mono text-primary">{formatCurrency(billTotals.total)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-3 justify-end pt-2 border-t border-border">
                <Button variant="outline" onClick={() => { setBillView("list"); setConvertingPoId(null); setEditingBillId(null); }}>Cancel</Button>
                {editingBillId ? (
                  <>
                    <Button
                      variant="outline"
                      className="gap-2 border-primary/40 text-primary hover:bg-primary/10"
                      onClick={() => handleUpdateBill("save")}
                      disabled={updateBill.isPending}
                    >
                      <Pencil className="h-4 w-4" />Save Changes
                    </Button>
                    <Button
                      className="gap-2 bg-green-600 hover:bg-green-700 text-white"
                      onClick={() => handleUpdateBill("confirm")}
                      disabled={updateBill.isPending}
                    >
                      <CheckCircle2 className="h-4 w-4" />Save & Confirm Inventory
                    </Button>
                  </>
                ) : (
                  <>
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
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── PURCHASE ORDERS TAB ── */}
      {pageTab === "orders" && (
        <div className="space-y-5">
          {poView === "list" ? (
            <>
              {/* Stats */}
              <div className="grid grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-4 pb-4">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Total Orders</p>
                    <p className="text-2xl font-bold mt-1">{purchaseOrders?.length ?? 0}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-4">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Open (Draft / Sent)</p>
                    <p className="text-2xl font-bold mt-1 text-yellow-400">{purchaseOrders?.filter(p => p.status === "draft" || p.status === "sent").length ?? 0}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-4">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Converted</p>
                    <p className="text-2xl font-bold mt-1 text-green-400">{purchaseOrders?.filter(p => p.status === "converted").length ?? 0}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-4">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Open Value</p>
                    <p className="text-2xl font-bold mt-1">{formatCurrency(purchaseOrders?.filter(p => p.status === "draft" || p.status === "sent").reduce((s, p) => s + p.totalCost, 0) ?? 0)}</p>
                  </CardContent>
                </Card>
              </div>

              {/* Header + action */}
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Purchase Orders</h3>
                <Button className="gap-2" onClick={() => {
                  const tenantRate = parseFloat(String(settings?.tax_rate ?? ""));
                  setPoForm({
                    ...emptyPoForm(),
                    defaultTaxRate: Number.isFinite(tenantRate) ? String(tenantRate) : "",
                  });
                  setPoSupplierManual(false);
                  setPoView("new");
                  refetchProducts();
                }}>
                  <Plus className="h-4 w-4" />New Purchase Order
                </Button>
              </div>

              {/* Orders table */}
              {!purchaseOrders?.length ? (
                <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
                  <ClipboardList className="h-12 w-12 opacity-30" />
                  <p className="text-lg">No purchase orders yet</p>
                  <p className="text-sm">Create a purchase order to request goods from a supplier. Orders don't change stock or accounting until you convert them to a purchase bill.</p>
                  <Button variant="outline" className="mt-2 gap-2" onClick={() => {
                    const tenantRate = parseFloat(String(settings?.tax_rate ?? ""));
                    setPoForm({
                      ...emptyPoForm(),
                      defaultTaxRate: Number.isFinite(tenantRate) ? String(tenantRate) : "",
                    });
                    setPoSupplierManual(false);
                    setPoView("new");
                    refetchProducts();
                  }}>
                    <Plus className="h-4 w-4" />New Purchase Order
                  </Button>
                </div>
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <div className="grid grid-cols-[1fr_160px_80px_100px_120px_120px_100px] gap-3 px-4 py-2.5 bg-secondary/40 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    <span>PO #</span>
                    <span>Supplier</span>
                    <span className="text-center">Items</span>
                    <span className="text-right">Total</span>
                    <span>Status</span>
                    <span>Expected</span>
                    <span className="text-right">Actions</span>
                  </div>
                  <AnimatePresence initial={false}>
                    {purchaseOrders.map((po, i) => (
                      <motion.div
                        key={po.id}
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ delay: i * 0.02 }}
                        className="grid grid-cols-[1fr_160px_80px_100px_120px_120px_100px] gap-3 px-4 py-3 items-center border-b border-border/50 last:border-0 hover:bg-secondary/20 transition-colors group"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <ClipboardList className="h-3.5 w-3.5 text-primary shrink-0" />
                          <p className="text-sm font-semibold font-mono truncate">{po.poNumber}</p>
                        </div>
                        <p className="text-sm text-muted-foreground truncate">{po.supplier ?? "—"}</p>
                        <p className="text-sm font-bold text-center">{po.itemCount}</p>
                        <p className="text-sm font-bold font-mono text-right">{formatCurrency(po.totalCost)}</p>
                        <div>
                          {po.status === "draft" ? (
                            <Badge className="text-[10px] bg-yellow-500/20 text-yellow-400 border-yellow-500/40 hover:bg-yellow-500/30 gap-0.5">
                              <Clock className="h-2.5 w-2.5" />Draft
                            </Badge>
                          ) : po.status === "sent" ? (
                            <Badge className="text-[10px] bg-sky-500/20 text-sky-400 border-sky-500/40 hover:bg-sky-500/30 gap-0.5">
                              <Send className="h-2.5 w-2.5" />Sent
                            </Badge>
                          ) : po.status === "converted" ? (
                            <Badge className="text-[10px] bg-green-500/20 text-green-400 border-green-500/40 hover:bg-green-500/30 gap-0.5">
                              <CheckCircle2 className="h-2.5 w-2.5" />Converted
                            </Badge>
                          ) : (
                            <Badge className="text-[10px] bg-secondary text-muted-foreground border-border gap-0.5">
                              <Ban className="h-2.5 w-2.5" />Cancelled
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {po.expectedDate
                            ? new Date(po.expectedDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                            : "—"}
                        </p>
                        <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button size="icon" variant="outline" className="h-7 w-7" title="View" onClick={() => setViewPoId(po.id)}>
                            <Eye className="h-3 w-3" />
                          </Button>
                          {po.status === "draft" && (
                            <Button size="icon" variant="outline" className="h-7 w-7 text-sky-400 border-sky-500/40 hover:bg-sky-500/10" title="Mark as Sent" onClick={() => handleUpdatePoStatus(po.id, "sent")}>
                              <Send className="h-3 w-3" />
                            </Button>
                          )}
                          {po.status === "draft" && (
                            <Button size="icon" variant="outline" className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:border-destructive" title="Delete" onClick={() => handleDeletePo(po.id)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </>
          ) : (
            /* ── NEW PURCHASE ORDER FORM ── */
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground" onClick={() => setPoView("list")}>
                  <ArrowLeft className="h-3.5 w-3.5" />Orders
                </Button>
                <span className="text-muted-foreground">/</span>
                <h3 className="text-lg font-semibold">New Purchase Order</h3>
              </div>

              {/* PO Info */}
              <Card>
                <CardContent className="pt-4 pb-4">
                  <div className="grid grid-cols-4 gap-4">
                    <div className="grid gap-1.5">
                      <Label className="text-xs text-muted-foreground uppercase tracking-wide">Supplier</Label>
                      {(poSupplierManual || vendors.length === 0) ? (
                        <div className="flex gap-1">
                          <Input
                            value={poForm.supplier}
                            onChange={(e) => setPoForm((f) => ({ ...f, supplier: e.target.value }))}
                            placeholder="Type supplier name"
                            className="flex-1"
                          />
                          {vendors.length > 0 && (
                            <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0"
                              onClick={() => { setPoSupplierManual(false); setPoForm(f => ({ ...f, supplier: "" })); }}>
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      ) : (
                        <Select
                          value={poForm.supplier}
                          onValueChange={(v) => {
                            if (v === "__manual__") { setPoSupplierManual(true); setPoForm(f => ({ ...f, supplier: "" })); }
                            else setPoForm((f) => ({ ...f, supplier: v }));
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select vendor..." />
                          </SelectTrigger>
                          <SelectContent>
                            {vendors.filter(v => v.isActive).map((v) => (
                              <SelectItem key={v.id} value={v.name}>{v.name}</SelectItem>
                            ))}
                            <SelectItem value="__manual__" className="text-muted-foreground italic">Enter manually...</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                    <div className="grid gap-1.5">
                      <Label className="text-xs text-muted-foreground uppercase tracking-wide">Expected Date</Label>
                      <Input
                        type="date"
                        value={poForm.expectedDate}
                        onChange={(e) => setPoForm((f) => ({ ...f, expectedDate: e.target.value }))}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label className="text-xs text-muted-foreground uppercase tracking-wide">Default Tax %</Label>
                      <div className="relative">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          placeholder="0"
                          value={poForm.defaultTaxRate}
                          onChange={(e) => setPoForm((f) => ({ ...f, defaultTaxRate: e.target.value }))}
                          className="pr-7 text-right font-mono"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                      </div>
                    </div>
                    <div className="grid gap-1.5">
                      <Label className="text-xs text-muted-foreground uppercase tracking-wide">Tax Mode</Label>
                      <div className="flex h-9 rounded-md border border-border overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setPoForm((f) => ({ ...f, taxMode: "exclusive" }))}
                          className={`flex-1 text-xs font-medium transition ${poForm.taxMode === "exclusive" ? "bg-primary text-primary-foreground" : "bg-transparent text-muted-foreground hover:bg-secondary/60"}`}
                          title="Unit costs are net; tax is added on top"
                        >
                          Exclusive
                        </button>
                        <button
                          type="button"
                          onClick={() => setPoForm((f) => ({ ...f, taxMode: "inclusive" }))}
                          className={`flex-1 text-xs font-medium transition border-l border-border ${poForm.taxMode === "inclusive" ? "bg-primary text-primary-foreground" : "bg-transparent text-muted-foreground hover:bg-secondary/60"}`}
                          title="Unit costs already include tax; net cost is back-computed"
                        >
                          Inclusive
                        </button>
                      </div>
                    </div>
                    <div className="grid gap-1.5 col-span-4">
                      <Label className="text-xs text-muted-foreground uppercase tracking-wide">Notes</Label>
                      <Input
                        value={poForm.notes}
                        onChange={(e) => setPoForm((f) => ({ ...f, notes: e.target.value }))}
                        placeholder="Optional notes / terms"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Line Items */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold">Line Items</h4>
                  <span className="text-xs text-muted-foreground">{poForm.items.length} item{poForm.items.length !== 1 ? "s" : ""}</span>
                </div>

                <div className="rounded-xl border border-border overflow-hidden">
                  <div className="grid grid-cols-[1.5fr_60px_100px_75px_95px_100px_36px] gap-2 px-4 py-2.5 bg-secondary/40 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    <span>Product</span>
                    <span className="text-right">Qty</span>
                    <span className="text-right">Unit Cost</span>
                    <span className="text-right">Tax %</span>
                    <span className="text-right">Margin</span>
                    <span className="text-right">Line Total</span>
                    <span />
                  </div>

                  {poForm.items.map((item) => {
                    const margin = poLineMargin(item);
                    const breakdown = poLineBreakdown(item);
                    const defaultRate = parseFloat(poForm.defaultTaxRate) || 0;
                    return (
                      <div
                        key={item.tempId}
                        className="grid grid-cols-[1.5fr_60px_100px_75px_95px_100px_36px] gap-2 px-4 py-2 items-center border-b border-border/40 last:border-0"
                      >
                        <ProductCombobox
                          products={products ?? []}
                          value={item.productId}
                          onChange={(v) => updatePoLineItem(item.tempId, { productId: v })}
                        />
                        <Input
                          type="number"
                          min="1"
                          placeholder="0"
                          value={item.quantity}
                          onChange={(e) => updatePoLineItem(item.tempId, { quantity: e.target.value })}
                          className="h-8 text-sm text-right"
                        />
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            value={item.unitCost}
                            onChange={(e) => updatePoLineItem(item.tempId, { unitCost: e.target.value })}
                            className="h-8 text-sm pl-6 text-right"
                          />
                        </div>
                        <div className="relative">
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            max="100"
                            placeholder={defaultRate > 0 ? defaultRate.toString() : "0"}
                            value={item.taxRate}
                            onChange={(e) => updatePoLineItem(item.tempId, { taxRate: e.target.value })}
                            className="h-8 text-sm pr-6 text-right"
                            title="Leave blank to use the order's default tax rate"
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                        </div>
                        <div className="text-right text-sm font-mono leading-tight">
                          {margin ? (
                            <>
                              <div className={margin.pct < 0 ? "text-destructive font-semibold" : margin.pct < 15 ? "text-yellow-400 font-semibold" : "text-green-400 font-semibold"}>
                                {margin.pct.toFixed(1)}%
                              </div>
                              <div className="text-[11px] text-muted-foreground">
                                {formatCurrency(margin.amount)}
                              </div>
                            </>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </div>
                        <div className="text-right leading-tight">
                          <p className="text-sm font-bold font-mono text-primary">
                            {breakdown.total > 0 ? formatCurrency(breakdown.total) : "—"}
                          </p>
                          {breakdown.tax > 0 && (
                            <p className="text-[11px] text-muted-foreground font-mono">
                              tax {formatCurrency(breakdown.tax)}
                            </p>
                          )}
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                          onClick={() => removePoLineItem(item.tempId)}
                          disabled={poForm.items.length === 1}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    );
                  })}

                  <div className="px-4 py-2.5 border-t border-border/40 bg-secondary/20">
                    <Button size="sm" variant="ghost" className="gap-1.5 text-sm text-primary hover:text-primary" onClick={addPoLineItem}>
                      <Plus className="h-3.5 w-3.5" />Add Item
                    </Button>
                  </div>
                </div>

                <div className="flex items-start justify-between gap-4 px-4 py-2">
                  <span className="text-sm text-muted-foreground pt-1">
                    {poForm.items.filter((i) => i.productId && parseInt(i.quantity) > 0).length} valid items
                  </span>
                  <div className="flex flex-col items-end gap-0.5 min-w-[220px]">
                    <div className="flex items-center justify-between w-full text-sm">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span className="font-mono">{formatCurrency(poTotals.subtotal)}</span>
                    </div>
                    <div className="flex items-center justify-between w-full text-sm">
                      <span className="text-muted-foreground">Tax</span>
                      <span className="font-mono">{formatCurrency(poTotals.tax)}</span>
                    </div>
                    <div className="flex items-center justify-between w-full pt-1 mt-1 border-t border-border/60">
                      <span className="text-sm font-medium">Grand Total</span>
                      <span className="text-xl font-bold font-mono text-primary">{formatCurrency(poTotals.total)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 justify-end pt-2 border-t border-border">
                <Button variant="outline" onClick={() => setPoView("list")}>Cancel</Button>
                <Button
                  variant="outline"
                  className="gap-2 border-yellow-500/40 text-yellow-400 hover:bg-yellow-500/10"
                  onClick={() => handleSavePo("draft")}
                  disabled={createPo.isPending}
                >
                  <Clock className="h-4 w-4" />Save as Draft
                </Button>
                <Button
                  className="gap-2 bg-sky-600 hover:bg-sky-700 text-white"
                  onClick={() => handleSavePo("sent")}
                  disabled={createPo.isPending}
                >
                  <Send className="h-4 w-4" />Save & Mark Sent
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── UNITS CATALOG ── */}
      {pageTab === "units" && (
        <ProductUnitsManager canManage={canManage} />
      )}

      {/* ── PURCHASE ORDER VIEW DIALOG ── */}
      <Dialog open={!!viewPoId} onOpenChange={(o) => !o && setViewPoId(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-primary" />
              Purchase Order: {viewPoDetail?.poNumber}
              {viewPoDetail && (
                <span className="ml-2">
                  {viewPoDetail.status === "draft" ? (
                    <Badge className="text-[10px] bg-yellow-500/20 text-yellow-400 border-yellow-500/40 gap-0.5">
                      <Clock className="h-2.5 w-2.5" />Draft
                    </Badge>
                  ) : viewPoDetail.status === "sent" ? (
                    <Badge className="text-[10px] bg-sky-500/20 text-sky-400 border-sky-500/40 gap-0.5">
                      <Send className="h-2.5 w-2.5" />Sent
                    </Badge>
                  ) : viewPoDetail.status === "converted" ? (
                    <Badge className="text-[10px] bg-green-500/20 text-green-400 border-green-500/40 gap-0.5">
                      <CheckCircle2 className="h-2.5 w-2.5" />Converted
                    </Badge>
                  ) : (
                    <Badge className="text-[10px] bg-secondary text-muted-foreground border-border gap-0.5">
                      <Ban className="h-2.5 w-2.5" />Cancelled
                    </Badge>
                  )}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          {viewPoDetail && (
            <div className="flex-1 overflow-y-auto space-y-4 py-2">
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-0.5">Supplier</p>
                  <p className="font-medium">{viewPoDetail.supplier ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-0.5">Expected Date</p>
                  <p className="font-medium">{viewPoDetail.expectedDate ? new Date(viewPoDetail.expectedDate).toLocaleDateString("en-US", { dateStyle: "medium" }) : "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-0.5">Notes</p>
                  <p className="font-medium">{viewPoDetail.notes ?? "—"}</p>
                </div>
              </div>

              <div className="rounded-lg border border-border overflow-hidden">
                <div className="grid grid-cols-[2fr_80px_100px_100px] gap-3 px-4 py-2 bg-secondary/40 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  <span>Product</span>
                  <span className="text-right">Qty</span>
                  <span className="text-right">Unit Cost</span>
                  <span className="text-right">Total</span>
                </div>
                {viewPoDetail.items.map((item, i) => (
                  <div key={item.id} className={`grid grid-cols-[2fr_80px_100px_100px] gap-3 px-4 py-2.5 items-center ${i < viewPoDetail.items.length - 1 ? "border-b border-border/50" : ""}`}>
                    <div className="flex items-center gap-2">
                      <Package className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <p className="text-sm font-semibold">{item.productName}</p>
                    </div>
                    <p className="text-sm font-bold font-mono text-right">{item.quantity}</p>
                    <p className="text-sm font-mono text-right">{item.unitCost > 0 ? formatCurrency(item.unitCost) : "—"}</p>
                    <p className="text-sm font-bold font-mono text-right">{item.totalCost > 0 ? formatCurrency(item.totalCost) : "—"}</p>
                  </div>
                ))}
                <div className="grid grid-cols-[2fr_80px_100px_100px] gap-3 px-4 py-2.5 border-t border-border bg-secondary/20">
                  <span className="text-xs font-semibold text-muted-foreground uppercase col-span-3 text-right">Grand Total</span>
                  <p className="text-base font-bold font-mono text-right text-primary">{formatCurrency(viewPoDetail.totalCost)}</p>
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="flex-wrap gap-2">
            <Button variant="outline" onClick={() => setViewPoId(null)}>Close</Button>
            {viewPoDetail && (
              <Button variant="outline" className="gap-1.5" onClick={() => printPoDoc(viewPoDetail)}>
                <Printer className="h-3.5 w-3.5" />Print
              </Button>
            )}
            {viewPoDetail && viewPoDetail.status === "draft" && (
              <Button
                variant="outline"
                className="gap-1.5 text-sky-400 border-sky-500/40 hover:bg-sky-500/10"
                onClick={() => handleUpdatePoStatus(viewPoDetail.id, "sent")}
                disabled={updatePo.isPending}
              >
                <Send className="h-3.5 w-3.5" />Mark Sent
              </Button>
            )}
            {viewPoDetail && (viewPoDetail.status === "draft" || viewPoDetail.status === "sent") && (
              <>
                <Button
                  variant="outline"
                  className="gap-1.5 text-muted-foreground"
                  onClick={() => handleUpdatePoStatus(viewPoDetail.id, "cancelled")}
                  disabled={updatePo.isPending}
                >
                  <Ban className="h-3.5 w-3.5" />Cancel
                </Button>
                <Button
                  className="gap-1.5 bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => handleConvertPoToBill(viewPoDetail)}
                >
                  <ArrowRight className="h-3.5 w-3.5" />Convert to Bill
                </Button>
              </>
            )}
            {viewPoDetail && viewPoDetail.status === "draft" && (
              <Button
                variant="outline"
                className="gap-1.5 text-destructive hover:bg-destructive/10 border-destructive/40"
                onClick={() => handleDeletePo(viewPoDetail.id)}
                disabled={deletePo.isPending}
              >
                <Trash2 className="h-3.5 w-3.5" />Delete
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cost-change price-adjustment dialog. Opens after confirming a bill
          when one or more product costs went up. Suggested prices preserve
          the previous margin %; the user can edit them or untick rows. */}
      <Dialog open={!!costChangeRows} onOpenChange={(o) => { if (!o && !applyingPrices) setCostChangeRows(null); }}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-yellow-400" />
              Cost Increased — Review Selling Prices
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            The cost went up on {costChangeRows?.length ?? 0} product{(costChangeRows?.length ?? 0) !== 1 ? "s" : ""}. Suggested prices keep your previous margin. Edit any price or untick to skip.
          </p>
          <div className="flex-1 overflow-y-auto rounded-xl border border-border">
            <div className="grid grid-cols-[28px_1.6fr_96px_96px_96px_96px_120px] gap-2 px-3 py-2 bg-secondary/40 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wide sticky top-0">
              <span />
              <span>Product</span>
              <span className="text-right">Old Cost</span>
              <span className="text-right">New Cost</span>
              <span className="text-right">Current Price</span>
              <span className="text-right">Markup %</span>
              <span className="text-right">New Price</span>
            </div>
            {costChangeRows?.map((row, idx) => {
              const newPriceNum = parseFloat(row.newPrice) || 0;
              const newMargin = newPriceNum > 0 ? ((newPriceNum - row.newCost) / newPriceNum) * 100 : 0;
              return (
                <div
                  key={row.productId}
                  className="grid grid-cols-[28px_1.6fr_96px_96px_96px_96px_120px] gap-2 px-3 py-2 items-center border-b border-border/40 last:border-0"
                >
                  <input
                    type="checkbox"
                    checked={row.apply}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setCostChangeRows((prev) => prev?.map((r, i) => i === idx ? { ...r, apply: checked } : r) ?? null);
                    }}
                    className="h-4 w-4 accent-primary"
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{row.productName}</div>
                    <div className="text-[11px] text-muted-foreground">
                      new margin {newMargin.toFixed(1)}%
                    </div>
                  </div>
                  <span className="text-right text-sm font-mono text-muted-foreground">
                    {row.oldCost != null ? formatCurrency(row.oldCost) : "—"}
                  </span>
                  <span className="text-right text-sm font-mono">{formatCurrency(row.newCost)}</span>
                  <span className="text-right text-sm font-mono text-muted-foreground">{formatCurrency(row.currentPrice)}</span>
                  <div className="relative">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={row.markup}
                      onChange={(e) => {
                        const v = e.target.value;
                        setCostChangeRows((prev) => prev?.map((r, i) => {
                          if (i !== idx) return r;
                          const m = parseFloat(v);
                          const np = !isNaN(m) && r.newCost > 0 ? round2(calcPriceFromMarkup(r.newCost, m)) : r.newPrice;
                          return { ...r, markup: v, newPrice: np };
                        }) ?? null);
                      }}
                      disabled={!row.apply}
                      className="h-8 text-sm pr-5 text-right font-mono"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                  </div>
                  <div className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={row.newPrice}
                      onChange={(e) => {
                        const v = e.target.value;
                        setCostChangeRows((prev) => prev?.map((r, i) => {
                          if (i !== idx) return r;
                          const price = parseFloat(v);
                          const mk = !isNaN(price) && r.newCost > 0 ? round2(calcMarkupFromPrice(r.newCost, price)) : r.markup;
                          return { ...r, newPrice: v, markup: mk };
                        }) ?? null);
                      }}
                      disabled={!row.apply}
                      className="h-8 text-sm pl-5 text-right font-mono"
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCostChangeRows(null)}
              disabled={applyingPrices}
            >
              Skip All
            </Button>
            <Button
              onClick={applyPriceAdjustments}
              disabled={applyingPrices || !costChangeRows?.some((r) => r.apply)}
              className="gap-2"
            >
              <CheckCircle2 className="h-4 w-4" />
              {applyingPrices ? "Applying…" : `Apply (${costChangeRows?.filter((r) => r.apply).length ?? 0})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              {/* Case-cost calculator: enter cost per case + units per case to
                  auto-fill the unit cost below. */}
              <div className="rounded-lg border border-border bg-secondary/20 px-3 py-2.5 space-y-2">
                <div className="text-xs font-medium text-muted-foreground">Cost by the case <span className="font-normal">(optional)</span></div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="grid gap-1">
                    <Label className="text-xs">Cost per case</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={restockForm.casePrice}
                      onChange={(e) => {
                        const casePrice = e.target.value;
                        setRestockForm((f) => {
                          const cp = parseFloat(casePrice);
                          const upc = parseFloat(f.unitsPerCase);
                          const unitCost = cp > 0 && upc > 0 ? round2(cp / upc) : f.unitCost;
                          return { ...f, casePrice, unitCost };
                        });
                      }}
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label className="text-xs">Units per case</Label>
                    <Input
                      type="number"
                      min="1"
                      placeholder="e.g. 24"
                      value={restockForm.unitsPerCase}
                      onChange={(e) => {
                        const unitsPerCase = e.target.value;
                        setRestockForm((f) => {
                          const cp = parseFloat(f.casePrice);
                          const upc = parseFloat(unitsPerCase);
                          const unitCost = cp > 0 && upc > 0 ? round2(cp / upc) : f.unitCost;
                          return { ...f, unitsPerCase, unitCost };
                        });
                      }}
                    />
                  </div>
                </div>
                {parseFloat(restockForm.casePrice) > 0 && parseFloat(restockForm.unitsPerCase) > 0 && (
                  <div className="text-xs text-muted-foreground">
                    = <span className="font-semibold text-foreground">{round2(parseFloat(restockForm.casePrice) / parseFloat(restockForm.unitsPerCase))}</span> per unit
                  </div>
                )}
              </div>
              <div className="grid gap-1.5">
                <Label>Unit cost <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={restockForm.unitCost}
                  onChange={(e) => setRestockForm((f) => ({ ...f, unitCost: e.target.value, casePrice: "", unitsPerCase: "" }))}
                />
              </div>
              {/* Markup preservation: when the new unit cost is higher than the
                  current cost, offer to raise the selling price to keep markup. */}
              {(() => {
                const enteredCost = parseFloat(restockForm.unitCost);
                const currentCost = Number((restockProduct as { costPrice?: number | null }).costPrice ?? 0);
                const currentPrice = restockProduct.price;
                const costGoingUp = !isNaN(enteredCost) && enteredCost > 0 && enteredCost > currentCost;
                if (!costGoingUp) return null;
                const currentMarkup = currentCost > 0 ? calcMarkupFromPrice(currentCost, currentPrice) : NaN;
                const canKeep = !isNaN(currentMarkup) && currentMarkup > 0;
                const newPrice = canKeep ? Number(round2(calcPriceFromMarkup(enteredCost, currentMarkup))) : null;
                const erodedMarkup = currentCost >= 0 ? calcMarkupFromPrice(enteredCost, currentPrice) : NaN;
                return (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-amber-300 font-medium">
                      <TrendingUp className="h-4 w-4" />Cost is going up
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Current: cost {currentCost.toFixed(2)} · price {currentPrice.toFixed(2)}
                      {canKeep ? ` · markup ${currentMarkup.toFixed(1)}%` : ""}
                    </div>
                    {canKeep ? (
                      <>
                        <label className="flex items-start gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            className="mt-0.5 accent-amber-500"
                            checked={restockForm.keepMarkup}
                            onChange={(e) => setRestockForm((f) => ({ ...f, keepMarkup: e.target.checked }))}
                          />
                          <span className="text-xs">
                            Keep my <span className="font-semibold">{currentMarkup.toFixed(1)}%</span> markup — raise selling price to{" "}
                            <span className="font-semibold text-foreground">{newPrice?.toFixed(2)}</span>
                          </span>
                        </label>
                        {!restockForm.keepMarkup && !isNaN(erodedMarkup) && (
                          <div className="text-xs text-amber-300/80">
                            Leaving price at {currentPrice.toFixed(2)} drops markup to {erodedMarkup.toFixed(1)}%.
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="text-xs text-muted-foreground">Cost will be updated to {enteredCost.toFixed(2)}.</div>
                    )}
                  </div>
                );
              })()}
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

      {/* Upgrade prompt shown when adding a product is blocked by the plan limit. */}
      <Dialog open={!!limitPrompt} onOpenChange={(o) => !o && setLimitPrompt(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-400" />
              {limitPrompt && limitPrompt.overBy > 0 ? "Product limit exceeded" : "Product limit reached"}
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 pt-1 text-sm">
                <p>
                  Your <span className="font-semibold text-foreground">{limitPrompt?.planName}</span> plan allows{" "}
                  <span className="font-semibold text-foreground">{limitPrompt?.maxProducts}</span> products. You currently
                  have <span className="font-semibold text-foreground">{limitPrompt?.productCount}</span>
                  {limitPrompt && limitPrompt.overBy > 0 ? (
                    <> — over the limit by <span className="font-semibold text-foreground">{limitPrompt.overBy}</span>.</>
                  ) : (
                    <>.</>
                  )}
                </p>
                <p>Upgrade your plan to add more products.</p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setLimitPrompt(null)}>Not now</Button>
            <Button
              onClick={() => { setLimitPrompt(null); navigate("/subscription"); }}
              className="gap-2 bg-amber-500 hover:bg-amber-400 text-amber-950"
            >
              <TrendingUp className="h-4 w-4" />
              Upgrade Plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) { setFormCasePrice(""); setFormUnitsPerCase(""); } }}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{editingProduct ? "Edit Product" : "Add Product"}</DialogTitle>
          </DialogHeader>

          <Tabs value={dialogTab} onValueChange={setDialogTab} className="flex-1 overflow-hidden flex flex-col">
            <TabsList className="shrink-0 flex-wrap h-auto gap-0.5">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="variants" disabled={!editingProduct}>Variants</TabsTrigger>
              <TabsTrigger value="modifiers" disabled={!editingProduct}>Modifiers</TabsTrigger>
              <TabsTrigger value="locations" disabled={!editingProduct}>Locations</TabsTrigger>
              <TabsTrigger value="pricing" disabled={!editingProduct}>Pricing & Units</TabsTrigger>
              <TabsTrigger value="composite" disabled={!editingProduct || form.structureType !== "composite"}>
                Composite
              </TabsTrigger>
              <TabsTrigger value="history" disabled={!editingProduct}>
                <History className="h-3.5 w-3.5 mr-1" />History
              </TabsTrigger>
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
                    <Input type="number" step="0.01" min="0" value={form.price} onChange={(e) => handleFormPriceChange(e.target.value)} placeholder="0.00" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Category *</Label>
                    <Select
                      value={form.category}
                      onValueChange={(v) => {
                        if (v === "__new__") { setCatManagerOpen(true); return; }
                        setForm((f) => ({ ...f, category: v }));
                      }}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent className="max-h-[280px]">
                        {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        <SelectItem value="__new__" className="text-primary border-t border-border mt-1 pt-2">
                          <span className="flex items-center gap-1.5"><Plus className="h-3.5 w-3.5" />New category…</span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label>Description</Label>
                  <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Optional description" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label>Barcode</Label>
                    <Input value={form.barcode} onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))} placeholder="EAN / UPC" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>SKU</Label>
                    <Input value={form.sku} onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))} placeholder="e.g. JC001" />
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label>
                    Brand{" "}
                    <span className="text-muted-foreground text-[11px]">(optional — manufacturer or brand name)</span>
                  </Label>
                  <Input value={form.brand} onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))} placeholder="e.g. Nestlé, Samsung, Nike" />
                </div>
                {showProductSize && (
                  <div className="grid gap-1.5">
                    <Label>
                      Size{" "}
                      <span className="text-muted-foreground text-[11px]">(optional — shows on POS &amp; receipts)</span>
                    </Label>
                    <Input value={form.size} onChange={(e) => setForm((f) => ({ ...f, size: e.target.value }))} placeholder="e.g. 12 inch, Large, 500ml" />
                  </div>
                )}
                <div className="grid gap-1.5">
                  <Label>
                    Unit of measure{" "}
                    <span className="text-muted-foreground text-[11px]">(optional — how it's sold; shows on POS &amp; receipts)</span>
                  </Label>
                  <Input
                    list="selling-unit-options"
                    value={form.sellingUnit}
                    onChange={(e) => setForm((f) => ({ ...f, sellingUnit: e.target.value }))}
                    placeholder="e.g. each, case, pieces"
                  />
                  <datalist id="selling-unit-options">
                    <option value="each" />
                    <option value="case" />
                    <option value="pieces" />
                    <option value="box" />
                    <option value="pack" />
                    <option value="dozen" />
                    <option value="pair" />
                    <option value="set" />
                    <option value="roll" />
                    <option value="bag" />
                    <option value="bottle" />
                    <option value="carton" />
                  </datalist>
                </div>
                <Separator />
                {/* Product structure: Simple SKUs track their own stock;
                    Composite SKUs (bundles) derive cost & availability
                    from their child components and have no stock of
                    their own. Switching to Composite hides the stock
                    field below and unlocks the Composite tab above. */}
                <div className="rounded-md border border-border bg-secondary/20 p-3 space-y-3">
                  <div className="space-y-0.5">
                    <Label className="text-sm">Product structure</Label>
                    <p className="text-xs text-muted-foreground">
                      Choose Composite for bundles like a "Case of 24" or a "Party Pack".
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, structureType: "simple" }))}
                      className={`rounded-md border px-3 py-2 text-left text-xs transition-colors ${
                        form.structureType === "simple"
                          ? "border-primary bg-primary/10"
                          : "border-border bg-background hover:bg-muted/40"
                      }`}
                    >
                      <div className="font-medium">Simple</div>
                      <div className="text-muted-foreground">Standard SKU. Tracks its own stock.</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, structureType: "composite" }))}
                      className={`rounded-md border px-3 py-2 text-left text-xs transition-colors ${
                        form.structureType === "composite"
                          ? "border-primary bg-primary/10"
                          : "border-border bg-background hover:bg-muted/40"
                      }`}
                    >
                      <div className="font-medium">Composite (bundle)</div>
                      <div className="text-muted-foreground">Made of other products. Stock derived.</div>
                    </button>
                  </div>
                  {form.structureType === "composite" && !editingProduct && (
                    <p className="text-[11px] text-amber-400">
                      Save first, then add components in the Composite tab.
                    </p>
                  )}
                </div>
                {form.structureType === "simple" ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-1.5">
                      <Label>Stock count</Label>
                      <Input type="number" min="0" value={form.stockCount} onChange={(e) => { const v = e.target.value; setForm((f) => ({ ...f, stockCount: v, inStock: (parseFloat(v) || 0) > 0 ? true : f.inStock })); }} />
                    </div>
                    <div className="flex items-end gap-2 pb-0.5">
                      <Switch id="inStock" checked={form.inStock} onCheckedChange={(v) => setForm((f) => ({ ...f, inStock: v }))} />
                      <Label htmlFor="inStock">In stock</Label>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                    Stock for composites is derived from child components. The Composite tab shows how many bundles can be assembled.
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Switch id="isTaxable" checked={form.isTaxable} onCheckedChange={(v) => setForm((f) => ({ ...f, isTaxable: v }))} />
                  <Label htmlFor="isTaxable">Attracts sales tax</Label>
                </div>
                {form.structureType === "simple" && (
                  <div className="rounded-md border border-border bg-secondary/20 p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <Switch
                        id="trackBatches"
                        checked={form.trackBatches}
                        onCheckedChange={(v) => setForm((f) => ({ ...f, trackBatches: v }))}
                      />
                      <Label htmlFor="trackBatches" className="font-medium">Track batches / lots / expiry</Label>
                    </div>
                    {form.trackBatches && (
                      <div className="grid gap-1.5 pl-10">
                        <Label className="text-xs text-muted-foreground">Stock method (overrides global setting)</Label>
                        <select
                          value={form.stockMethodOverride}
                          onChange={(e) => setForm((f) => ({ ...f, stockMethodOverride: e.target.value as "" | "fifo" | "lifo" }))}
                          className="h-8 rounded-md border border-border bg-background px-2 text-sm"
                        >
                          <option value="">Inherit global setting</option>
                          <option value="fifo">FIFO — First In, First Out</option>
                          <option value="lifo">LIFO — Last In, First Out</option>
                        </select>
                        <p className="text-[11px] text-muted-foreground">
                          When enabled, each purchase bill line will ask for an optional batch number and expiry date, and sales auto-deduct from batches in the chosen order.
                        </p>
                      </div>
                    )}
                  </div>
                )}
                {/* Cost price drives margin reports for simple products
                    and is the per-unit basis for composites. Hidden on
                    composites because the cost is derived. */}
                {form.structureType === "simple" && (
                  <>
                    {/* Case-cost calculator: cost per case ÷ units per case fills
                        the cost price below (which keeps the markup in sync). */}
                    <div className="rounded-lg border border-border bg-secondary/20 px-3 py-2.5 space-y-2">
                      <div className="text-xs font-medium text-muted-foreground">Cost by the case <span className="font-normal">(optional helper)</span></div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="grid gap-1">
                          <Label className="text-xs">Cost per case</Label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            value={formCasePrice}
                            onChange={(e) => {
                              const v = e.target.value;
                              setFormCasePrice(v);
                              const cp = parseFloat(v);
                              const upc = parseFloat(formUnitsPerCase);
                              if (cp > 0 && upc > 0) handleFormCostChange(round2(cp / upc));
                            }}
                          />
                        </div>
                        <div className="grid gap-1">
                          <Label className="text-xs">Units per case</Label>
                          <Input
                            type="number"
                            min="1"
                            placeholder="e.g. 24"
                            value={formUnitsPerCase}
                            onChange={(e) => {
                              const v = e.target.value;
                              setFormUnitsPerCase(v);
                              const cp = parseFloat(formCasePrice);
                              const upc = parseFloat(v);
                              if (cp > 0 && upc > 0) handleFormCostChange(round2(cp / upc));
                            }}
                          />
                        </div>
                      </div>
                      {parseFloat(formCasePrice) > 0 && parseFloat(formUnitsPerCase) > 0 && (
                        <div className="text-xs text-muted-foreground">
                          = <span className="font-semibold text-foreground">{round2(parseFloat(formCasePrice) / parseFloat(formUnitsPerCase))}</span> per unit (filled in below)
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="grid gap-1.5">
                        <Label>Cost price <span className="text-muted-foreground text-[11px]">(optional, for margin reports)</span></Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          value={form.costPrice}
                          onChange={(e) => { handleFormCostChange(e.target.value); setFormCasePrice(""); setFormUnitsPerCase(""); }}
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label>Markup <span className="text-muted-foreground text-[11px]">(% on cost)</span></Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="e.g. 50"
                          value={form.markup}
                          onChange={(e) => handleFormMarkupChange(e.target.value)}
                        />
                      </div>
                    </div>
                  </>
                )}
                <Separator />
                {/* Sold-by-weight: when on, the cashier is prompted for a
                    decimal weight at sale time instead of a whole-unit
                    quantity. Unit picker only matters when the toggle
                    is on, so keep it visually subordinate. */}
                <div className="rounded-md border border-border bg-secondary/20 p-3 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-0.5">
                      <Label htmlFor="soldByWeight" className="text-sm">Sold by weight</Label>
                      <p className="text-xs text-muted-foreground">
                        Cashier enters a decimal weight (e.g. 1.75) at checkout.
                        Price is multiplied by the weight.
                      </p>
                    </div>
                    <Switch
                      id="soldByWeight"
                      checked={form.soldByWeight}
                      onCheckedChange={(v) => setForm((f) => ({ ...f, soldByWeight: v }))}
                    />
                  </div>
                  {form.soldByWeight && (
                    <div className="grid gap-1.5">
                      <Label className="text-xs">Unit of measure</Label>
                      <Select
                        value={form.unitOfMeasure}
                        onValueChange={(v) => setForm((f) => ({ ...f, unitOfMeasure: v as WeightUnit }))}
                      >
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="kg">Kilogram (kg)</SelectItem>
                          <SelectItem value="lb">Pound (lb)</SelectItem>
                          <SelectItem value="oz">Ounce (oz)</SelectItem>
                          <SelectItem value="g">Gram (g)</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Price above is treated as price per {form.unitOfMeasure}.
                      </p>
                    </div>
                  )}
                </div>
                <DialogFooter className="pt-2">
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                  <Button variant="secondary" onClick={() => handleSave(false)} disabled={createProduct.isPending || updateProduct.isPending}>
                    {editingProduct ? "Save" : "Save & Continue"}
                  </Button>
                  <Button onClick={() => handleSave(true)} disabled={createProduct.isPending || updateProduct.isPending}>
                    Save & Close
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
                {editingProduct && <LocationsEditor productId={editingProduct.id} productCost={form.costPrice.trim() === "" ? null : parseFloat(form.costPrice)} defaultMarkup={defaultMarkupSetting} />}
              </TabsContent>

              <TabsContent value="pricing" className="mt-0">
                {editingProduct && (
                  <PricingUnitsEditor
                    productId={editingProduct.id}
                    basePrice={editingProduct.price}
                    baseUnit={(editingProduct as { baseUnit?: string }).baseUnit ?? "each"}
                  />
                )}
              </TabsContent>

              <TabsContent value="composite" className="mt-0">
                {editingProduct && form.structureType === "composite" && (
                  <CompositeEditor
                    productId={editingProduct.id}
                    parentName={editingProduct.name}
                    sellingPrice={editingProduct.price}
                    allProducts={products ?? []}
                  />
                )}
              </TabsContent>

              <TabsContent value="history" className="mt-0">
                {editingProduct && <StockHistoryPanel productId={editingProduct.id} />}
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
              This product will be hidden from the catalog, POS, and online menu. Its sales and purchase history is kept, and you can restore it anytime from "Show archived".
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

      {/* Permanent (hard) delete confirm — archived + no history only */}
      <AlertDialog open={!!permDelete} onOpenChange={(o) => !o && setPermDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete "{permDelete?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. The product and its configuration will be erased for good. This is only allowed because it's archived and has no sales or purchase history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90 text-destructive-foreground" onClick={handlePermDelete} disabled={deletePermanent.isPending}>
              {deletePermanent.isPending ? "Deleting…" : "Delete permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk delete (archive) confirm */}
      <AlertDialog open={bulkConfirmOpen} onOpenChange={setBulkConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedCount} product{selectedCount === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>
              The selected product{selectedCount === 1 ? "" : "s"} will be hidden from the catalog, POS, and online menu. All sales and purchase history is preserved, and you can restore {selectedCount === 1 ? "it" : "them"} anytime from "Show archived".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90 text-destructive-foreground" disabled={!!bulkProgress} onClick={doBulkArchive}>
              {bulkProgress ? "Deleting…" : `Delete ${selectedCount}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk permanent (hard) delete confirm */}
      <AlertDialog open={bulkPermConfirmOpen} onOpenChange={setBulkPermConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete {selectedDeletableCount} product{selectedDeletableCount === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes {selectedDeletableCount === 1 ? "this product" : "these products"} and cannot be undone. Only archived products with no sales or purchase history are eligible — anything else in your selection is skipped. This action is irreversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90 text-destructive-foreground" disabled={!!bulkProgress} onClick={doBulkPermDelete}>
              {bulkProgress ? "Deleting…" : `Delete ${selectedDeletableCount} permanently`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk archive/restore progress */}
      <Dialog open={!!bulkProgress}>
        <DialogContent className="sm:max-w-sm" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>{bulkProgress?.mode === "restore" ? "Restoring products" : "Deleting products"}</DialogTitle>
            <DialogDescription>
              Please keep this window open until all products are processed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <div className="h-2 rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300 rounded-full"
                style={{ width: `${bulkProgress ? (bulkProgress.done / Math.max(bulkProgress.total, 1)) * 100 : 0}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground text-center">
              {bulkProgress?.mode === "restore" ? "Restoring" : "Deleting"} {bulkProgress?.done ?? 0} of {bulkProgress?.total ?? 0}…
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Find & Merge Duplicates dialog */}
      <DuplicateMergeDialog open={mergeDialogOpen} onClose={() => setMergeDialogOpen(false)} />

      {/* Print Label dialog */}
      <PrintLabelDialog
        product={printProduct}
        onClose={() => setPrintProduct(null)}
        businessName={businessName}
      />

      {/* Category Manager dialog */}
      <CategoryManagerDialog
        open={catManagerOpen}
        onClose={() => setCatManagerOpen(false)}
        categories={categories}
        onSave={(updated) => {
          updateSettings.mutate(
            { data: { product_categories: JSON.stringify(updated) } },
            {
              onSuccess: () => {
                toast({ title: "Categories saved" });
                queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
              },
              onError: () => toast({ title: "Failed to save categories", variant: "destructive" }),
            },
          );
        }}
      />

      {/* Import Products dialog */}
      <ImportProductsDialog
        open={importDialogOpen}
        onClose={() => setImportDialogOpen(false)}
        onImported={(count) => {
          toast({ title: `${count} product${count !== 1 ? "s" : ""} imported successfully` });
          queryClient.invalidateQueries({ queryKey: ["/api/products"] });
          queryClient.invalidateQueries({ queryKey: ["/api/products/plan-limit"] });
        }}
      />

      {/* MBPOS → NEXXUS Import dialog */}
      <MBPOSImportDialog
        open={mbposDialogOpen}
        onClose={() => setMbposDialogOpen(false)}
        onImported={(count) => {
          toast({ title: `${count} product${count !== 1 ? "s" : ""} imported from MBPOS` });
          queryClient.invalidateQueries({ queryKey: ["/api/products"] });
          queryClient.invalidateQueries({ queryKey: ["/api/products/plan-limit"] });
        }}
      />

      <SubscriptionExpiredDialog
        open={subscriptionExpiredMsg !== null}
        onOpenChange={(open) => { if (!open) setSubscriptionExpiredMsg(null); }}
        description={subscriptionExpiredMsg ?? undefined}
      />
    </motion.div>
  );
}
