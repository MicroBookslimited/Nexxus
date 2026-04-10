import React, { useState, useEffect } from "react";
import { useStaff } from "@/contexts/StaffContext";
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
  useGetSettings,
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
import { Plus, Pencil, Trash2, Search, Package, X, Settings2, Layers, LayoutGrid, List, AlertTriangle, PackagePlus, ShoppingCart, Clock, FileText, CheckCircle2, Eye, ArrowLeft, Truck, ChevronRight, MapPin, FileSpreadsheet, Upload, FileDown, Printer } from "lucide-react";
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
  stockCount: number | null;
};

function authHeaders() {
  const token = localStorage.getItem(TENANT_TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
}

function LocationsEditor({ productId }: { productId: number }) {
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

  const [draft, setDraft] = useState<Record<number, { isAvailable: boolean; priceOverride: string; stockCount: string }>>({});

  useEffect(() => {
    if (!rows) return;
    const initial: Record<number, { isAvailable: boolean; priceOverride: string; stockCount: string }> = {};
    rows.forEach((r) => {
      initial[r.locationId] = {
        isAvailable: r.isAvailable,
        priceOverride: r.priceOverride != null ? String(r.priceOverride) : "",
        stockCount: r.stockCount != null ? String(r.stockCount) : "",
      };
    });
    setDraft(initial);
  }, [rows]);

  const [isSaving, setIsSaving] = useState(false);

  const handleSaveAll = async () => {
    if (!rows) return;
    setIsSaving(true);
    try {
      await Promise.all(
        rows.map(async (row) => {
          const d = draft[row.locationId];
          if (!d) return;
          const priceOverride = d.priceOverride !== "" ? parseFloat(d.priceOverride) : null;

          await fetch(`/api/products/${productId}/locations/${row.locationId}`, {
            method: "PUT",
            headers: authHeaders(),
            body: JSON.stringify({
              isAvailable: d.isAvailable,
              priceOverride: Number.isFinite(priceOverride as number) ? priceOverride : null,
            }),
          });

          if (d.stockCount !== "") {
            const sc = parseInt(d.stockCount, 10);
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
        const d = draft[row.locationId] ?? { isAvailable: row.isAvailable, priceOverride: "", stockCount: "" };
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
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Price override"
                    value={d.priceOverride}
                    onChange={(e) => setDraft((prev) => ({ ...prev, [row.locationId]: { ...d, priceOverride: e.target.value } }))}
                    className="h-8 text-xs pl-5"
                  />
                </div>
                <div className="relative flex-1">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">📦</span>
                  <Input
                    type="number"
                    min="0"
                    placeholder={row.stockCount != null ? `${row.stockCount} in stock` : "Stock count"}
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
      <script>window.onload=function(){window.print();setTimeout(function(){window.close();},800);}<\/script>
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
  { key: "name",        label: "Product Name",          required: true  },
  { key: "price",       label: "Price",                 required: true  },
  { key: "category",    label: "Category",              required: false },
  { key: "description", label: "Description",           required: false },
  { key: "barcode",     label: "Barcode / SKU",         required: false },
  { key: "stockCount",  label: "Stock Quantity",        required: false },
  { key: "inStock",     label: "In Stock (yes/no/1/0)", required: false },
];

const TEMPLATE_ROWS = [
  ["Name", "Price", "Category", "Description", "Barcode", "Stock Quantity", "In Stock"],
  ["Jerk Chicken",  "850.00", "Food",       "Seasoned jerk chicken",   "JC001", "50",  "yes"],
  ["Ting Soda",     "120.00", "Beverages",  "Grapefruit flavour soda", "TS001", "100", "yes"],
  ["Rum Cake Slice","350.00", "Bakery",     "Moist spiced rum cake",   "RC001", "30",  "yes"],
];

function downloadTemplate() {
  const csv = TEMPLATE_ROWS.map(r => r.map(c => `"${c}"`).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement("a"), { href: url, download: "NEXUS_Product_Import_Template.csv" });
  a.click();
  URL.revokeObjectURL(url);
}

type ImportResult = { row: number; name: string; status: "ok" | "error"; error?: string };

function ImportProductsDialog({ open, onClose, onImported }: {
  open: boolean;
  onClose: () => void;
  onImported: (count: number) => void;
}) {
  const createProduct = useCreateProduct();
  const { toast } = useToast();
  const fileRef = React.useRef<HTMLInputElement>(null);

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
      const XLSX = await import("xlsx");
      const buf  = await file.arrayBuffer();
      const wb   = XLSX.read(buf, { type: "array" });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: "" }) as string[][];
      if (!data.length) { toast({ title: "Empty file", variant: "destructive" }); return; }
      const [hdr, ...body] = data;
      const clean = hdr.map(h => String(h).trim());
      setHeaders(clean);
      setRows(body.filter(r => r.some(c => String(c).trim())));
      // Auto-map by column name similarity
      const auto: Record<string, string> = {};
      clean.forEach(h => {
        const l = h.toLowerCase();
        if      (/name|product/i.test(l))                           auto[h] = "name";
        else if (/price|cost|amount/i.test(l))                      auto[h] = "price";
        else if (/categ/i.test(l))                                   auto[h] = "category";
        else if (/desc/i.test(l))                                    auto[h] = "description";
        else if (/barcode|sku|code/i.test(l))                       auto[h] = "barcode";
        else if (/stock.*qty|qty.*stock|quantity|stock.count/i.test(l)) auto[h] = "stockCount";
        else if (/in.?stock|available/i.test(l))                    auto[h] = "inStock";
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
      const stockCount = parseInt(d.stockCount ?? "0") || 0;
      const inStockRaw = (d.inStock ?? "yes").toLowerCase().trim();
      const inStock    = inStockRaw === "yes" || inStockRaw === "true" || inStockRaw === "1";
      const category   = CATEGORIES.includes(d.category ?? "") ? d.category! : "Other";
      try {
        await new Promise<void>((resolve, reject) => {
          createProduct.mutate({ data: { name: d.name.trim(), price, category, description: d.description?.trim() || undefined, barcode: d.barcode?.trim() || undefined, stockCount, inStock: stockCount > 0 ? inStock : false } },
            { onSuccess: () => resolve(), onError: (e) => reject(e) });
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

              <div className="rounded-lg border border-border bg-secondary/10 p-4 text-xs text-muted-foreground space-y-1">
                <p className="font-semibold text-foreground text-sm mb-2">Expected columns</p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                  {IMPORT_FIELDS.map(f => (
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
                          {IMPORT_FIELDS.map(f => (
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
                                <span className="ml-1 text-[10px] text-primary font-normal">→ {IMPORT_FIELDS.find(f => f.key === mapping[h])?.label}</span>
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

/* ─── Main Products page ─── */
export function Products() {
  const { can } = useStaff();
  const canManage = can("inventory.manage");

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
  const { data: settings } = useGetSettings();
  const businessName = settings?.business_name || "My Store";

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
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [printProduct, setPrintProduct] = useState<LabelProduct | null>(null);
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
          {pageTab === "products" && canManage && (
            <>
              <Button variant="outline" onClick={() => setImportDialogOpen(true)} className="gap-2">
                <FileSpreadsheet className="h-4 w-4" />Import
              </Button>
              <Button onClick={openAdd} className="gap-2">
                <Plus className="h-4 w-4" />Add Product
              </Button>
            </>
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
          {canManage && <Button variant="outline" onClick={openAdd}>Add your first product</Button>}
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
                      <Button size="sm" variant="outline" className="h-7 px-2 text-xs" title="Print Label" onClick={() => setPrintProduct(product)}>
                        <Printer className="h-3 w-3" />
                      </Button>
                      {canManage && (
                        <Button size="sm" variant="outline" className="h-7 text-xs px-2 text-blue-400 border-blue-400/40 hover:bg-blue-400/10" onClick={() => openRestock(product)}>
                          <PackagePlus className="h-3 w-3 mr-1" />Restock
                        </Button>
                      )}
                      {canManage && (
                        <Button size="sm" variant="outline" className="flex-1 h-7 text-xs" onClick={() => openEdit(product)}>
                          <Pencil className="h-3 w-3 mr-1" />Edit
                        </Button>
                      )}
                      {canManage && (
                        <Button size="sm" variant="outline" className="h-7 px-2 text-destructive hover:bg-destructive/10 hover:border-destructive" onClick={() => setDeleteId(product.id)}>
                          <Trash2 className="h-3 w-3" />
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
                  <Button size="icon" variant="outline" className="h-7 w-7" title="Print Label" onClick={() => setPrintProduct(product)}>
                    <Printer className="h-3 w-3" />
                  </Button>
                  {canManage && (
                    <Button size="icon" variant="outline" className="h-7 w-7 text-blue-400 border-blue-400/40 hover:bg-blue-400/10" title="Restock" onClick={() => openRestock(product)}>
                      <PackagePlus className="h-3 w-3" />
                    </Button>
                  )}
                  {canManage && (
                    <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => openEdit(product)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                  )}
                  {canManage && (
                    <Button size="icon" variant="outline" className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:border-destructive" onClick={() => setDeleteId(product.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
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

      {/* Print Label dialog */}
      <PrintLabelDialog
        product={printProduct}
        onClose={() => setPrintProduct(null)}
        businessName={businessName}
      />

      {/* Import Products dialog */}
      <ImportProductsDialog
        open={importDialogOpen}
        onClose={() => setImportDialogOpen(false)}
        onImported={(count) => {
          toast({ title: `${count} product${count !== 1 ? "s" : ""} imported successfully` });
          queryClient.invalidateQueries({ queryKey: ["/api/products"] });
        }}
      />
    </motion.div>
  );
}
