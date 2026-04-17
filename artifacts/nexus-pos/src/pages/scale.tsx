import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import JsBarcode from "jsbarcode";
import {
  Scale, Search, Printer, X, Plus, Trash2, Settings2, Maximize, Loader2, ShieldCheck,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { PinPad } from "@/components/PinPad";
import { useStaff } from "@/contexts/StaffContext";
import {
  getScaleProducts, updateScaleProductSettings, createWeightLabel, listWeightLabels,
  voidWeightLabel,
  type ScaleProduct, type WeightLabel,
} from "@/lib/saas-api";

// ── Roles allowed to use the scale (matches user spec) ───────────────────────
const ALLOWED_ROLES = ["Admin", "Manager", "Inventory Clerk"];

const UNITS = [
  { value: "lb", label: "Pound (lb)" },
  { value: "kg", label: "Kilogram (kg)" },
  { value: "oz", label: "Ounce (oz)" },
  { value: "g",  label: "Gram (g)" },
];

const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const fmtJMD = (n: number) => `J$${n.toFixed(2)}`;

// ── Print one or more labels via a hidden iframe ─────────────────────────────
function printLabelHtml(labels: WeightLabel[], businessName: string) {
  const labelHtml = labels.map((l) => `
    <div class="lbl">
      <div class="biz">${businessName}</div>
      <div class="name">${l.productName}</div>
      <div class="row"><span>Weight</span><strong>${l.weightValue.toFixed(3)} ${l.unitOfMeasure}</strong></div>
      <div class="row"><span>Unit Price</span><span>${fmtJMD(l.pricePerUnit)} / ${l.unitOfMeasure}</span></div>
      <div class="total">${fmtJMD(l.totalPrice)}</div>
      ${l.packDate ? `<div class="row"><span>Packed</span><span>${l.packDate}</span></div>` : ""}
      ${l.expirationDate ? `<div class="row"><span>Best By</span><strong>${l.expirationDate}</strong></div>` : ""}
      <svg class="bc" id="bc-${l.id}"></svg>
      <div class="bc-text">${l.barcode}</div>
    </div>
  `).join("");

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Label</title>
<style>
  @page { size: 58mm auto; margin: 2mm; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, sans-serif; color: #000; }
  .lbl { width: 54mm; padding: 1mm 2mm 3mm; page-break-after: always; border-bottom: 1px dashed #999; }
  .lbl:last-child { page-break-after: auto; border-bottom: none; }
  .biz { font-size: 9pt; text-align: center; font-weight: 700; letter-spacing: 0.5px; }
  .name { font-size: 12pt; font-weight: 700; margin-top: 1mm; line-height: 1.15; text-align: center; }
  .row { display: flex; justify-content: space-between; font-size: 9pt; margin-top: 1mm; }
  .total { font-size: 18pt; font-weight: 800; text-align: center; margin: 2mm 0 1mm; }
  .bc { display: block; width: 100%; height: 16mm; margin: 1mm auto 0; }
  .bc-text { text-align: center; font-size: 8pt; font-family: monospace; letter-spacing: 1px; }
  @media screen { body { background: #f3f4f6; padding: 24px; } .lbl { background: #fff; margin: 0 auto 12px; box-shadow: 0 1px 4px rgba(0,0,0,.1); } }
</style></head><body>${labelHtml}
<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.12.3/dist/JsBarcode.all.min.js"></script>
<script>
  document.addEventListener('DOMContentLoaded', function () {
    ${labels.map((l) => `try { JsBarcode("#bc-${l.id}", "${l.barcode}", { format: "EAN13", displayValue: false, height: 50, margin: 0 }); } catch(e){}`).join("\n")}
    setTimeout(function(){ window.focus(); window.print(); }, 250);
  });
</script>
</body></html>`;

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument!;
  doc.open();
  doc.write(html);
  doc.close();
  setTimeout(() => { try { document.body.removeChild(iframe); } catch {} }, 30_000);
}

export function ScalePage() {
  const { staff, setStaff } = useStaff();
  const { toast } = useToast();
  const qc = useQueryClient();

  // Roles authorised: Admin, Manager, Inventory Clerk (or anyone with the scale.use permission).
  const isAuthorised = !!staff && (
    ALLOWED_ROLES.includes(staff.role) ||
    (staff.permissions ?? []).includes("scale.use")
  );

  // ── Auto-fullscreen on entry ────────────────────────────────────────────────
  useEffect(() => {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  }, []);

  // ── Manage settings drawer ──────────────────────────────────────────────────
  const [settingsOpen, setSettingsOpen] = useState(false);

  // ── State for label generation flow ────────────────────────────────────────
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<ScaleProduct | null>(null);
  const [weightInput, setWeightInput] = useState("");
  const [packDate, setPackDate] = useState(isoDate(new Date()));
  const defaultExp = useMemo(() => { const d = new Date(); d.setDate(d.getDate() + 7); return isoDate(d); }, []);
  const [expirationDate, setExpirationDate] = useState(defaultExp);
  const weightInputRef = useRef<HTMLInputElement | null>(null);

  // ── Data ───────────────────────────────────────────────────────────────────
  const { data: products } = useQuery({
    queryKey: ["scale", "products"],
    queryFn: () => getScaleProducts(false),
    enabled: isAuthorised,
  });
  const { data: labels } = useQuery({
    queryKey: ["scale", "labels", "available"],
    queryFn: () => listWeightLabels("available"),
    enabled: isAuthorised,
    refetchInterval: 30_000,
  });

  const weightProducts = useMemo(() => products?.filter((p) => p.soldByWeight) ?? [], [products]);
  const filteredProducts = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return weightProducts.slice(0, 30);
    return weightProducts.filter((p) =>
      p.name.toLowerCase().includes(q) ||
      (p.barcode ?? "").includes(q) ||
      (p.plu ?? "").includes(q)
    ).slice(0, 30);
  }, [weightProducts, searchTerm]);

  // ── Mutations ──────────────────────────────────────────────────────────────
  const updateSettings = useMutation({
    mutationFn: (vars: { id: number; soldByWeight: boolean; unitOfMeasure?: "lb" | "kg" | "oz" | "g" }) =>
      updateScaleProductSettings(
        vars.id,
        { soldByWeight: vars.soldByWeight, unitOfMeasure: vars.unitOfMeasure },
        staff?.id,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scale", "products"] }),
    onError: (e: Error) => toast({ title: "Could not update product", description: e.message, variant: "destructive" }),
  });

  const createLabel = useMutation({
    mutationFn: createWeightLabel,
    onSuccess: (label) => {
      toast({ title: "Label created", description: `${label.productName} • ${label.weightValue} ${label.unitOfMeasure}` });
      qc.invalidateQueries({ queryKey: ["scale", "labels", "available"] });
      const businessName = (typeof window !== "undefined" && localStorage.getItem("nexus_business_name")) || "NEXXUS POS";
      printLabelHtml([label], businessName);
      setSelectedProduct(null);
      setWeightInput("");
    },
    onError: (e: Error) => toast({ title: "Could not create label", description: e.message, variant: "destructive" }),
  });

  const voidLabel = useMutation({
    mutationFn: (id: number) => voidWeightLabel(id, staff?.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scale", "labels", "available"] }),
    onError: (e: Error) => toast({ title: "Could not void label", description: e.message, variant: "destructive" }),
  });

  // ── Auto-focus weight input when modal opens ───────────────────────────────
  useEffect(() => {
    if (selectedProduct) {
      setTimeout(() => weightInputRef.current?.focus(), 50);
    }
  }, [selectedProduct]);

  // ── PIN gate ────────────────────────────────────────────────────────────────
  if (!staff) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center bg-gradient-to-br from-[#0f1729] to-[#1e293b] p-6">
        <div className="bg-card border border-border rounded-2xl p-8 max-w-md w-full shadow-2xl">
          <div className="flex items-center justify-center mb-4">
            <div className="w-14 h-14 rounded-full bg-primary/15 flex items-center justify-center">
              <Scale className="w-7 h-7 text-primary" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-center mb-1">Weighing Scale</h1>
          <p className="text-sm text-muted-foreground text-center mb-6">
            Manager, Admin or Inventory Clerk PIN required
          </p>
          <PinPad
            requiredRoles={ALLOWED_ROLES}
            onSuccess={(s) => setStaff({ id: s.id, name: s.name, role: s.role, permissions: s.permissions ?? [] })}
            onError={(m) => toast({ title: "Access denied", description: m, variant: "destructive" })}
            title=""
          />
        </div>
      </div>
    );
  }

  if (!isAuthorised) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center p-6">
        <div className="bg-destructive/10 border border-destructive/40 rounded-2xl p-8 max-w-md text-center">
          <ShieldCheck className="w-10 h-10 mx-auto text-destructive mb-3" />
          <h2 className="text-lg font-bold">Not authorised</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Your role ({staff.role}) cannot use the weighing scale.
            Ask an Admin to grant you the <code>scale.use</code> permission.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-gradient-to-br from-[#0a1024] to-[#111c36]">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 bg-[#0f1729]/95 backdrop-blur border-b border-border/50">
        <div className="px-4 py-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center">
            <Scale className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold leading-tight">Weighing Scale</h1>
            <p className="text-xs text-muted-foreground">Operator: {staff.name} • {staff.role}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)} className="gap-2">
            <Settings2 className="w-4 h-4" /> Manage Products
          </Button>
          <Button variant="outline" size="sm" onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})} className="gap-2">
            <Maximize className="w-4 h-4" /> Fullscreen
          </Button>
        </div>
      </div>

      <div className="p-4 lg:p-6 grid lg:grid-cols-[1fr_360px] gap-4 max-w-[1600px] mx-auto">
        {/* ── Search + product grid ─────────────────────────────────────────── */}
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="Search by name, barcode or PLU…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-12 h-14 text-lg bg-card border-border/60"
            />
          </div>

          {weightProducts.length === 0 ? (
            <div className="text-center py-16 px-6 border-2 border-dashed border-border rounded-2xl">
              <Scale className="w-10 h-10 mx-auto text-muted-foreground/60 mb-3" />
              <h3 className="font-semibold">No weight-priced products yet</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Open <strong>Manage Products</strong> above to mark items (e.g. Bananas, Cheese, Beef) as sold-by-weight.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {filteredProducts.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedProduct(p)}
                  className="group p-4 rounded-2xl border border-border/60 bg-card text-left hover:border-primary/60 hover:bg-primary/5 transition-colors"
                  data-testid={`scale-product-${p.id}`}
                >
                  <div className="font-semibold leading-tight line-clamp-2 mb-2">{p.name}</div>
                  <div className="text-xs text-muted-foreground">{p.category}</div>
                  <div className="mt-3 flex items-baseline justify-between">
                    <span className="text-lg font-bold text-primary">{fmtJMD(p.price)}</span>
                    <span className="text-xs text-muted-foreground">/ {p.unitOfMeasure ?? "lb"}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Active labels sidebar (live inventory) ─────────────────────────── */}
        <aside className="bg-card border border-border/60 rounded-2xl p-4 h-fit max-h-[calc(100vh-9rem)] overflow-hidden flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Active Labels</h2>
            <span className="text-xs text-muted-foreground">{labels?.length ?? 0} unsold</span>
          </div>
          <div className="overflow-y-auto -mx-2 px-2 space-y-2 flex-1">
            {(labels ?? []).map((l) => (
              <div key={l.id} className="bg-secondary/40 border border-border/40 rounded-xl p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm truncate">{l.productName}</div>
                    <div className="text-xs text-muted-foreground">
                      {l.weightValue.toFixed(3)} {l.unitOfMeasure} • {fmtJMD(l.totalPrice)}
                    </div>
                    <div className="text-[10px] font-mono text-muted-foreground mt-0.5">{l.barcode}</div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Button size="sm" variant="ghost" className="h-7 px-2"
                      onClick={() => printLabelHtml([l], localStorage.getItem("nexus_business_name") || "NEXXUS POS")}>
                      <Printer className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive hover:text-destructive"
                      onClick={() => voidLabel.mutate(l.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            {(labels ?? []).length === 0 && (
              <div className="text-center text-xs text-muted-foreground py-8">
                No active labels — they'll appear here as you weigh items.
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* ── Weight entry modal ──────────────────────────────────────────────── */}
      <WeightEntryModal
        product={selectedProduct}
        weightInput={weightInput}
        setWeightInput={setWeightInput}
        weightInputRef={weightInputRef}
        packDate={packDate}
        setPackDate={setPackDate}
        expirationDate={expirationDate}
        setExpirationDate={setExpirationDate}
        onClose={() => { setSelectedProduct(null); setWeightInput(""); }}
        onSubmit={(w) => {
          if (!selectedProduct) return;
          createLabel.mutate({
            productId: selectedProduct.id,
            weightValue: w,
            packDate: packDate || null,
            expirationDate: expirationDate || null,
            staffId: staff.id,
          });
        }}
        submitting={createLabel.isPending}
      />

      {/* ── Manage products drawer ──────────────────────────────────────────── */}
      <ManageProductsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        products={products ?? []}
        onUpdate={(id, soldByWeight, unit) => updateSettings.mutate({ id, soldByWeight, unitOfMeasure: unit })}
        saving={updateSettings.isPending}
      />
    </div>
  );
}

/* ─── Weight Entry Modal ────────────────────────────────────────────────── */
function WeightEntryModal({
  product, weightInput, setWeightInput, weightInputRef,
  packDate, setPackDate, expirationDate, setExpirationDate,
  onClose, onSubmit, submitting,
}: {
  product: ScaleProduct | null;
  weightInput: string;
  setWeightInput: (s: string) => void;
  weightInputRef: React.MutableRefObject<HTMLInputElement | null>;
  packDate: string; setPackDate: (s: string) => void;
  expirationDate: string; setExpirationDate: (s: string) => void;
  onClose: () => void;
  onSubmit: (weight: number) => void;
  submitting: boolean;
}) {
  const numericWeight = parseFloat(weightInput);
  const validWeight = !isNaN(numericWeight) && numericWeight > 0;
  const total = product && validWeight ? product.price * numericWeight : 0;

  // ── USB scale support: many USB scales emulate a HID keyboard and type the
  //    weight followed by Enter. Because the input is auto-focused, those
  //    keystrokes land here directly. We also accept a quick keypad press
  //    when the modal is open.
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && validWeight && product && !submitting) {
      e.preventDefault();
      onSubmit(numericWeight);
    }
  };

  const numpad = (key: string) => {
    if (key === "C") { setWeightInput(""); return; }
    if (key === "←") { setWeightInput(weightInput.slice(0, -1)); return; }
    if (key === ".") {
      if (weightInput.includes(".")) return;
      setWeightInput((weightInput || "0") + ".");
      return;
    }
    if (weightInput.length >= 8) return;
    setWeightInput(weightInput + key);
  };

  return (
    <Dialog open={!!product} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b bg-card">
          <DialogTitle className="flex items-center justify-between">
            <span className="text-xl">{product?.name}</span>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
          </DialogTitle>
        </DialogHeader>

        {product && (
          <div className="p-6 space-y-5">
            <div className="text-center">
              <div className="text-sm text-muted-foreground">
                {fmtJMD(product.price)} per {product.unitOfMeasure ?? "lb"}
              </div>
              <Input
                ref={weightInputRef}
                value={weightInput}
                onChange={(e) => setWeightInput(e.target.value.replace(/[^0-9.]/g, ""))}
                onKeyDown={handleKeyDown}
                placeholder="0.000"
                inputMode="decimal"
                autoComplete="off"
                className="mt-2 h-24 text-center text-6xl font-bold bg-secondary/40 border-2 border-primary/40 focus-visible:border-primary"
                data-testid="scale-weight-input"
              />
              <div className="text-xs text-muted-foreground mt-1">
                Enter weight in {product.unitOfMeasure ?? "lb"} — USB scale input is auto-detected
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {["7","8","9","4","5","6","1","2","3",".","0","←"].map((k) => (
                <Button key={k} variant="outline" className="h-14 text-xl font-semibold" onClick={() => numpad(k)}>
                  {k}
                </Button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="pack-date" className="text-xs">Pack Date</Label>
                <Input id="pack-date" type="date" value={packDate} onChange={(e) => setPackDate(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="exp-date" className="text-xs">Expiration Date</Label>
                <Input id="exp-date" type="date" value={expirationDate} onChange={(e) => setExpirationDate(e.target.value)} className="mt-1" />
              </div>
            </div>

            <div className="flex items-center justify-between bg-primary/10 border border-primary/30 rounded-xl px-4 py-3">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="text-3xl font-bold text-primary" data-testid="scale-total">
                {validWeight ? fmtJMD(total) : "—"}
              </span>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { setWeightInput(""); onClose(); }}>Cancel</Button>
              <Button
                className="flex-1 gap-2"
                disabled={!validWeight || submitting}
                onClick={() => onSubmit(numericWeight)}
                data-testid="scale-print-btn"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                Generate & Print Label
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ─── Manage Products Dialog (toggle sold-by-weight & unit) ────────────── */
function ManageProductsDialog({
  open, onClose, products, onUpdate, saving,
}: {
  open: boolean; onClose: () => void;
  products: ScaleProduct[];
  onUpdate: (id: number, soldByWeight: boolean, unit?: "lb" | "kg" | "oz" | "g") => void;
  saving: boolean;
}) {
  const [filter, setFilter] = useState("");
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return products.slice(0, 200);
    return products.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 200);
  }, [products, filter]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col p-0">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle>Configure Sold-by-Weight Products</DialogTitle>
        </DialogHeader>
        <div className="px-6 py-3 border-b">
          <Input
            placeholder="Search products…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            autoFocus
          />
        </div>
        <div className="overflow-y-auto px-6 py-4 space-y-2 flex-1">
          {filtered.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-8">No products match your search.</div>
          )}
          {filtered.map((p) => (
            <div key={p.id} className="flex items-center gap-3 p-3 rounded-lg border border-border/40 bg-secondary/30">
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{p.name}</div>
                <div className="text-xs text-muted-foreground">
                  {p.category} • {fmtJMD(p.price)}
                  {p.plu && p.soldByWeight ? ` • PLU ${p.plu}` : ""}
                </div>
              </div>
              {p.soldByWeight && (
                <Select
                  value={p.unitOfMeasure ?? "lb"}
                  onValueChange={(v) => onUpdate(p.id, true, v as "lb" | "kg" | "oz" | "g")}
                >
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {UNITS.map((u) => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              <Switch
                checked={p.soldByWeight}
                disabled={saving}
                onCheckedChange={(checked) => onUpdate(p.id, checked, p.unitOfMeasure as ("lb"|"kg"|"oz"|"g") || "lb")}
                data-testid={`weight-toggle-${p.id}`}
              />
            </div>
          ))}
        </div>
        <div className="px-6 py-3 border-t flex justify-end">
          <Button onClick={onClose} className="gap-2"><Plus className="w-4 h-4 hidden" />Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ScalePage;
