import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useStaff } from "@/contexts/StaffContext";
import { Layout } from "@/components/layout";
import {
  pricePreview,
  priceApply,
  priceListLogs,
  type PriceMethod,
  type PriceRounding,
  type PriceScope,
  type PricePreviewRow,
} from "@/lib/saas-api";
import {
  TrendingUp,
  TrendingDown,
  Calculator,
  CheckCircle2,
  History,
  ShieldAlert,
  Tag,
  Package as PackageIcon,
} from "lucide-react";

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-JM", { style: "currency", currency: "JMD" }).format(n);
}

interface ProductLite {
  id: number;
  name: string;
  category: string;
  price: number;
  costPrice: number | null;
}

export default function PriceManagerPage() {
  const { staff, can } = useStaff();
  const allowed = can("pricing.manage") || staff?.role === "Owner" || staff?.role === "Admin";

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const productsQuery = useQuery<ProductLite[]>({
    queryKey: ["/api/products"],
    queryFn: async () => {
      const token = localStorage.getItem("nexus_tenant_token");
      const r = await fetch("/api/products", { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!r.ok) throw new Error("Failed to load products");
      return r.json();
    },
    enabled: allowed,
  });

  const logsQuery = useQuery({
    queryKey: ["/api/price-manager/logs", staff?.id],
    queryFn: () => priceListLogs(staff!.id, 50),
    enabled: allowed && !!staff?.id,
  });

  const [method, setMethod] = useState<PriceMethod>("percent");
  const [direction, setDirection] = useState<"up" | "down">("up");
  const [value, setValue] = useState<string>("10");
  const [rounding, setRounding] = useState<PriceRounding>("none");
  const [scope, setScope] = useState<PriceScope>("all");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedProductIds, setSelectedProductIds] = useState<number[]>([]);
  const [productFilter, setProductFilter] = useState("");
  const [preview, setPreview] = useState<PricePreviewRow[] | null>(null);
  const [previewSelection, setPreviewSelection] = useState<Record<number, boolean>>({});
  const [previewEdits, setPreviewEdits] = useState<Record<number, string>>({});

  const categories = useMemo(() => {
    const set = new Set<string>();
    (productsQuery.data ?? []).forEach((p) => set.add(p.category || "Uncategorised"));
    return Array.from(set).sort();
  }, [productsQuery.data]);

  const filteredProducts = useMemo(() => {
    const q = productFilter.trim().toLowerCase();
    return (productsQuery.data ?? []).filter((p) =>
      !q || p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q),
    );
  }, [productsQuery.data, productFilter]);

  const previewMutation = useMutation({
    mutationFn: () =>
      pricePreview({
        method,
        value: parseFloat(value) || 0,
        direction,
        rounding,
        scope,
        categories: scope === "category" ? selectedCategories : undefined,
        productIds: scope === "products" ? selectedProductIds : undefined,
        staffId: staff!.id,
        staffName: staff!.name,
      }),
    onSuccess: (data) => {
      setPreview(data.rows);
      const sel: Record<number, boolean> = {};
      const edits: Record<number, string> = {};
      for (const r of data.rows) {
        if (r.newPrice != null) {
          sel[r.productId] = true;
          edits[r.productId] = r.newPrice.toFixed(2);
        }
      }
      setPreviewSelection(sel);
      setPreviewEdits(edits);
    },
    onError: (e: Error) => toast({ title: "Preview failed", description: e.message, variant: "destructive" }),
  });

  const applyMutation = useMutation({
    mutationFn: () => {
      const changes = (preview ?? [])
        .filter((r) => r.newPrice != null && previewSelection[r.productId])
        .map((r) => ({
          productId: r.productId,
          newPrice: parseFloat(previewEdits[r.productId] ?? String(r.newPrice ?? 0)) || 0,
        }));
      return priceApply({
        method,
        value: parseFloat(value) || 0,
        direction,
        rounding,
        scope,
        categories: scope === "category" ? selectedCategories : undefined,
        productIds: scope === "products" ? selectedProductIds : undefined,
        staffId: staff!.id,
        staffName: staff!.name,
        changes,
      });
    },
    onSuccess: (data) => {
      toast({ title: "Prices updated", description: `${data.appliedCount} products updated` });
      setPreview(null);
      setPreviewSelection({});
      setPreviewEdits({});
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/price-manager/logs"] });
    },
    onError: (e: Error) => toast({ title: "Apply failed", description: e.message, variant: "destructive" }),
  });

  if (!allowed) {
    return (
      <Layout>
        <div className="p-6 flex items-center justify-center min-h-[60vh]">
          <Card className="max-w-md">
            <CardContent className="pt-6 text-center space-y-3">
              <ShieldAlert className="h-12 w-12 text-destructive mx-auto" />
              <h2 className="text-xl font-bold">Access Restricted</h2>
              <p className="text-sm text-muted-foreground">
                The Price Manager is limited to Owner, Admin and Manager roles, or anyone with the
                <span className="font-mono mx-1">pricing.manage</span>
                permission.
              </p>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  const methodLabel: Record<PriceMethod, string> = {
    percent: "Percentage of current price",
    cost_markup: "Cost-based markup",
    fixed: "Fixed amount",
  };

  const valueSuffix = method === "fixed" ? "$" : "%";

  const selectedCount = preview ? Object.values(previewSelection).filter(Boolean).length : 0;

  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Calculator className="h-6 w-6 text-primary" />
              Price Manager
            </h1>
            <p className="text-sm text-muted-foreground">Bulk update selling prices with percentage, cost markup, or fixed adjustments.</p>
          </div>
        </div>

        <Tabs defaultValue="bulk">
          <TabsList>
            <TabsTrigger value="bulk">Bulk Update</TabsTrigger>
            <TabsTrigger value="history">
              <History className="h-4 w-4 mr-1.5" />
              History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="bulk" className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">1. Pick what to update</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2 flex-wrap">
                  <Button variant={scope === "all" ? "default" : "outline"} size="sm" onClick={() => setScope("all")}>
                    All products
                  </Button>
                  <Button variant={scope === "category" ? "default" : "outline"} size="sm" onClick={() => setScope("category")}>
                    <Tag className="h-3.5 w-3.5 mr-1" /> By category
                  </Button>
                  <Button variant={scope === "products" ? "default" : "outline"} size="sm" onClick={() => setScope("products")}>
                    <PackageIcon className="h-3.5 w-3.5 mr-1" /> Specific products
                  </Button>
                </div>

                {scope === "category" && (
                  <div className="flex flex-wrap gap-2 pt-2">
                    {categories.length === 0 && <span className="text-sm text-muted-foreground">No categories.</span>}
                    {categories.map((c) => {
                      const on = selectedCategories.includes(c);
                      return (
                        <Badge
                          key={c}
                          variant={on ? "default" : "outline"}
                          className="cursor-pointer"
                          onClick={() =>
                            setSelectedCategories((prev) => (on ? prev.filter((x) => x !== c) : [...prev, c]))
                          }
                        >
                          {c}
                        </Badge>
                      );
                    })}
                  </div>
                )}

                {scope === "products" && (
                  <div className="space-y-2 pt-2">
                    <Input
                      placeholder="Search products…"
                      value={productFilter}
                      onChange={(e) => setProductFilter(e.target.value)}
                    />
                    <div className="max-h-64 overflow-y-auto rounded-lg border border-border divide-y divide-border/40">
                      {filteredProducts.slice(0, 200).map((p) => {
                        const on = selectedProductIds.includes(p.id);
                        return (
                          <label
                            key={p.id}
                            className="flex items-center gap-3 px-3 py-1.5 text-sm hover:bg-secondary/40 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={() =>
                                setSelectedProductIds((prev) =>
                                  on ? prev.filter((id) => id !== p.id) : [...prev, p.id],
                                )
                              }
                              className="h-4 w-4 accent-primary"
                            />
                            <span className="flex-1 truncate">{p.name}</span>
                            <span className="text-xs text-muted-foreground">{p.category}</span>
                            <span className="font-mono text-xs w-20 text-right">{formatCurrency(p.price)}</span>
                          </label>
                        );
                      })}
                      {filteredProducts.length > 200 && (
                        <div className="px-3 py-2 text-xs text-muted-foreground text-center">
                          Showing first 200 of {filteredProducts.length}. Refine your search to see more.
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{selectedProductIds.length} selected</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">2. How to calculate</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="grid gap-1.5 md:col-span-2">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Method</Label>
                  <Select value={method} onValueChange={(v) => setMethod(v as PriceMethod)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percent">{methodLabel.percent}</SelectItem>
                      <SelectItem value="cost_markup">{methodLabel.cost_markup}</SelectItem>
                      <SelectItem value="fixed">{methodLabel.fixed}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {method !== "cost_markup" && (
                  <div className="grid gap-1.5">
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">Direction</Label>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant={direction === "up" ? "default" : "outline"}
                        onClick={() => setDirection("up")}
                        className="flex-1"
                      >
                        <TrendingUp className="h-4 w-4 mr-1" /> Increase
                      </Button>
                      <Button
                        size="sm"
                        variant={direction === "down" ? "default" : "outline"}
                        onClick={() => setDirection("down")}
                        className="flex-1"
                      >
                        <TrendingDown className="h-4 w-4 mr-1" /> Decrease
                      </Button>
                    </div>
                  </div>
                )}

                <div className="grid gap-1.5">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                    Value ({valueSuffix})
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    className="font-mono text-right"
                  />
                </div>

                <div className="grid gap-1.5 md:col-span-4">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Round result to nearest</Label>
                  <div className="flex flex-wrap gap-2">
                    {(["none", "5", "10", "50", "100", "1000"] as PriceRounding[]).map((r) => (
                      <Button
                        key={r}
                        size="sm"
                        variant={rounding === r ? "default" : "outline"}
                        onClick={() => setRounding(r)}
                      >
                        {r === "none" ? "No rounding" : `$${r}`}
                      </Button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end gap-2">
              <Button
                onClick={() => previewMutation.mutate()}
                disabled={
                  previewMutation.isPending ||
                  !value ||
                  (scope === "category" && selectedCategories.length === 0) ||
                  (scope === "products" && selectedProductIds.length === 0)
                }
              >
                {previewMutation.isPending ? "Calculating…" : "Preview changes"}
              </Button>
            </div>

            {preview && (
              <Card>
                <CardHeader className="pb-3 flex flex-row items-center justify-between">
                  <CardTitle className="text-base">3. Review &amp; apply</CardTitle>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const all: Record<number, boolean> = {};
                        preview.forEach((r) => { if (r.newPrice != null) all[r.productId] = true; });
                        setPreviewSelection(all);
                      }}
                    >
                      Select all
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setPreviewSelection({})}>
                      Clear
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {preview.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-6 text-center">No products matched your filters.</p>
                  ) : (
                    <div className="rounded-lg border border-border overflow-hidden">
                      <div className="grid grid-cols-[28px_1.6fr_110px_110px_130px_100px] gap-2 px-3 py-2 bg-secondary/40 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        <span />
                        <span>Product</span>
                        <span className="text-right">Old Price</span>
                        <span className="text-right">New Price</span>
                        <span className="text-right">Override</span>
                        <span className="text-right">Change</span>
                      </div>
                      <div className="max-h-[55vh] overflow-y-auto">
                        {preview.map((r) => {
                          const editedVal = parseFloat(previewEdits[r.productId] ?? "") || 0;
                          const diff = editedVal - r.oldPrice;
                          const pct = r.oldPrice > 0 ? (diff / r.oldPrice) * 100 : 0;
                          return (
                            <div
                              key={r.productId}
                              className="grid grid-cols-[28px_1.6fr_110px_110px_130px_100px] gap-2 px-3 py-1.5 items-center border-b border-border/40 last:border-0 text-sm"
                            >
                              <input
                                type="checkbox"
                                disabled={r.newPrice == null}
                                checked={!!previewSelection[r.productId]}
                                onChange={(e) =>
                                  setPreviewSelection((prev) => ({ ...prev, [r.productId]: e.target.checked }))
                                }
                                className="h-4 w-4 accent-primary"
                              />
                              <div className="min-w-0">
                                <div className="truncate">{r.productName}</div>
                                <div className="text-[11px] text-muted-foreground truncate">{r.category}</div>
                              </div>
                              <span className="text-right font-mono text-muted-foreground">
                                {formatCurrency(r.oldPrice)}
                              </span>
                              <span className="text-right font-mono">
                                {r.newPrice != null ? formatCurrency(r.newPrice) : <span className="text-yellow-400 text-xs">no cost</span>}
                              </span>
                              <div className="relative">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={previewEdits[r.productId] ?? ""}
                                  onChange={(e) =>
                                    setPreviewEdits((prev) => ({ ...prev, [r.productId]: e.target.value }))
                                  }
                                  disabled={r.newPrice == null || !previewSelection[r.productId]}
                                  className="h-7 text-sm pl-5 text-right font-mono"
                                />
                              </div>
                              <span
                                className={
                                  "text-right font-mono text-xs " +
                                  (diff > 0 ? "text-green-400" : diff < 0 ? "text-destructive" : "text-muted-foreground")
                                }
                              >
                                {diff > 0 ? "+" : ""}{pct.toFixed(1)}%
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-4">
                    <p className="text-sm text-muted-foreground">
                      {selectedCount} of {preview.length} selected
                    </p>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => setPreview(null)}>
                        Cancel
                      </Button>
                      <Button
                        onClick={() => applyMutation.mutate()}
                        disabled={applyMutation.isPending || selectedCount === 0}
                        className="gap-2"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        {applyMutation.isPending ? "Applying…" : `Apply ${selectedCount} change${selectedCount === 1 ? "" : "s"}`}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="history">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Recent price changes</CardTitle>
              </CardHeader>
              <CardContent>
                {logsQuery.isLoading ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
                ) : (logsQuery.data?.logs ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">No price changes yet.</p>
                ) : (
                  <div className="space-y-2">
                    {logsQuery.data?.logs.map((log) => (
                      <details key={log.id} className="rounded-lg border border-border p-3">
                        <summary className="cursor-pointer flex items-center justify-between gap-3 text-sm">
                          <div className="flex items-center gap-3 min-w-0">
                            <Badge variant="outline">{log.method}</Badge>
                            <span className="font-mono">
                              {log.method === "fixed" ? "$" : ""}{log.value}{log.method !== "fixed" ? "%" : ""}
                            </span>
                            {log.rounding !== "none" && (
                              <span className="text-xs text-muted-foreground">round to ${log.rounding}</span>
                            )}
                            <span className="text-xs text-muted-foreground truncate">
                              {log.staffName ?? "Unknown"} • {new Date(log.createdAt).toLocaleString()}
                            </span>
                          </div>
                          <Badge>{log.affectedCount} products</Badge>
                        </summary>
                        <div className="mt-3 grid grid-cols-[1.6fr_110px_110px_80px] gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide pb-1 border-b border-border/40">
                          <span>Product</span>
                          <span className="text-right">Old</span>
                          <span className="text-right">New</span>
                          <span className="text-right">Δ</span>
                        </div>
                        <div className="max-h-64 overflow-y-auto">
                          {log.details.map((d) => {
                            const diff = d.newPrice - d.oldPrice;
                            const pct = d.oldPrice > 0 ? (diff / d.oldPrice) * 100 : 0;
                            return (
                              <div key={d.productId} className="grid grid-cols-[1.6fr_110px_110px_80px] gap-2 py-1 text-sm border-b border-border/20 last:border-0">
                                <span className="truncate">{d.productName}</span>
                                <span className="text-right font-mono text-muted-foreground">{formatCurrency(d.oldPrice)}</span>
                                <span className="text-right font-mono">{formatCurrency(d.newPrice)}</span>
                                <span className={"text-right font-mono " + (diff > 0 ? "text-green-400" : diff < 0 ? "text-destructive" : "")}>
                                  {diff > 0 ? "+" : ""}{pct.toFixed(0)}%
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </details>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
