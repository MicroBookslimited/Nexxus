import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  listSupplierReturns,
  getSupplierReturn,
  getEligibleBillForReturn,
  createSupplierReturn,
  confirmSupplierReturn,
  deleteSupplierReturn,
  listProductBatches,
  TENANT_TOKEN_KEY,
  type SupplierReturn,
  type EligibleReturnLine,
  type CreateSupplierReturnItem,
  type ProductBatch,
} from "@/lib/saas-api";
import {
  ArrowLeft,
  Plus,
  Trash2,
  CheckCircle2,
  Eye,
  FileMinus,
  Package,
} from "lucide-react";

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-JM", {
    style: "currency",
    currency: "JMD",
    maximumFractionDigits: 2,
  }).format(n || 0);
}

const statusStyles: Record<string, string> = {
  draft: "bg-amber-500/20 text-amber-300 border-amber-500/40",
  confirmed: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  cancelled: "bg-zinc-500/20 text-zinc-400 border-zinc-500/40",
};

type Mode = "bill" | "standalone";

interface BillStub {
  id: number;
  billNumber: string;
  supplier: string | null;
  status: string;
}

interface ProductStub {
  id: number;
  name: string;
  price: number;
  costPrice: number | null;
  trackBatches?: boolean;
}

interface DraftLine {
  productId: number;
  productName: string;
  purchaseBillItemId: number | null;
  trackBatches: boolean;
  quantity: number;
  maxQuantity: number | null; // null for standalone
  unitCost: number;
  taxRate: number | null;
  batchId: number | null;
  batchLabel: string | null;
}

export default function SupplierReturnsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [view, setView] = useState<"list" | "create">("list");
  const [detailId, setDetailId] = useState<number | null>(null);

  const { data: returns = [], isLoading } = useQuery({
    queryKey: ["/api/supplier-returns"],
    queryFn: listSupplierReturns,
  });

  const { data: detail } = useQuery({
    queryKey: ["/api/supplier-returns", detailId],
    queryFn: () => (detailId ? getSupplierReturn(detailId) : null),
    enabled: detailId != null,
  });

  const confirmMut = useMutation({
    mutationFn: (id: number) => confirmSupplierReturn(id),
    onSuccess: () => {
      toast({ title: "Return confirmed — stock and accounting updated" });
      qc.invalidateQueries({ queryKey: ["/api/supplier-returns"] });
      qc.invalidateQueries({ queryKey: ["/api/products"] });
      setDetailId(null);
    },
    onError: (e: Error) =>
      toast({ title: "Confirm failed", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteSupplierReturn(id),
    onSuccess: () => {
      toast({ title: "Draft deleted" });
      qc.invalidateQueries({ queryKey: ["/api/supplier-returns"] });
      setDetailId(null);
    },
    onError: (e: Error) =>
      toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="min-h-screen bg-[#0f1729] text-zinc-100 p-4 md:p-6">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/products">
              <Button variant="ghost" size="icon" className="text-zinc-300">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <FileMinus className="h-6 w-6 text-rose-400" />
                Supplier Returns
              </h1>
              <p className="text-sm text-zinc-400">
                Debit notes against confirmed purchase bills (or standalone)
              </p>
            </div>
          </div>
          {view === "list" && (
            <Button onClick={() => setView("create")} className="gap-2">
              <Plus className="h-4 w-4" /> New Return
            </Button>
          )}
        </div>

        {view === "list" ? (
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-8 text-center text-zinc-400">Loading…</div>
              ) : returns.length === 0 ? (
                <div className="p-12 text-center text-zinc-400">
                  <FileMinus className="h-12 w-12 mx-auto mb-3 opacity-40" />
                  <p>No supplier returns yet.</p>
                </div>
              ) : (
                <div className="divide-y divide-zinc-800">
                  {returns.map((r) => (
                    <ReturnRow
                      key={r.id}
                      ret={r}
                      onView={() => setDetailId(r.id)}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <CreateReturnForm
            onCancel={() => setView("list")}
            onCreated={() => {
              setView("list");
              qc.invalidateQueries({ queryKey: ["/api/supplier-returns"] });
              qc.invalidateQueries({ queryKey: ["/api/products"] });
            }}
          />
        )}
      </div>

      {/* Detail dialog */}
      <Dialog open={detailId != null} onOpenChange={(o) => !o && setDetailId(null)}>
        <DialogContent className="max-w-3xl bg-zinc-900 border-zinc-800 text-zinc-100">
          <DialogHeader>
            <DialogTitle>
              Supplier Return: {detail?.returnNumber ?? "…"}
            </DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <Field label="Status">
                  <Badge className={statusStyles[detail.status]}>{detail.status}</Badge>
                </Field>
                <Field label="Supplier">{detail.supplier ?? "—"}</Field>
                <Field label="Linked Bill">
                  {detail.purchaseBillId ? `#${detail.purchaseBillId}` : "Standalone"}
                </Field>
                <Field label="Date">
                  {new Date(detail.returnDate).toLocaleDateString()}
                </Field>
              </div>

              <div className="border border-zinc-800 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-zinc-800/60 text-zinc-300">
                    <tr>
                      <th className="text-left p-2">Product</th>
                      <th className="text-right p-2">Qty</th>
                      <th className="text-right p-2">Unit Cost</th>
                      <th className="text-right p-2">Tax</th>
                      <th className="text-right p-2">Total</th>
                      <th className="text-left p-2">Batch</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.items.map((it) => (
                      <tr key={it.id} className="border-t border-zinc-800">
                        <td className="p-2">{it.productName}</td>
                        <td className="text-right p-2">{it.quantity}</td>
                        <td className="text-right p-2">{formatCurrency(it.unitCost)}</td>
                        <td className="text-right p-2">{formatCurrency(it.taxAmount)}</td>
                        <td className="text-right p-2">{formatCurrency(it.totalAmount)}</td>
                        <td className="p-2 text-zinc-400">{it.batchLabel ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-zinc-800/40 text-zinc-200">
                    <tr>
                      <td colSpan={3} className="p-2 text-right">Subtotal</td>
                      <td colSpan={2} className="p-2 text-right">{formatCurrency(detail.subtotal)}</td>
                      <td />
                    </tr>
                    <tr>
                      <td colSpan={3} className="p-2 text-right">Tax</td>
                      <td colSpan={2} className="p-2 text-right">{formatCurrency(detail.taxTotal)}</td>
                      <td />
                    </tr>
                    <tr className="font-semibold">
                      <td colSpan={3} className="p-2 text-right">Total Return</td>
                      <td colSpan={2} className="p-2 text-right">{formatCurrency(detail.totalAmount)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>

              {detail.notes && (
                <div className="text-sm">
                  <Label className="text-zinc-400">Notes</Label>
                  <p className="mt-1 text-zinc-200">{detail.notes}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter className="gap-2">
            {detail?.status === "draft" && (
              <>
                <Button
                  variant="outline"
                  onClick={() => detail && deleteMut.mutate(detail.id)}
                  disabled={deleteMut.isPending}
                  className="gap-2"
                >
                  <Trash2 className="h-4 w-4" /> Delete draft
                </Button>
                <Button
                  onClick={() => detail && confirmMut.mutate(detail.id)}
                  disabled={confirmMut.isPending}
                  className="gap-2"
                >
                  <CheckCircle2 className="h-4 w-4" /> Confirm return
                </Button>
              </>
            )}
            <Button variant="ghost" onClick={() => setDetailId(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-zinc-400 text-xs">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function ReturnRow({ ret, onView }: { ret: SupplierReturn; onView: () => void }) {
  return (
    <div className="flex items-center justify-between p-4 hover:bg-zinc-800/30">
      <div>
        <div className="flex items-center gap-2">
          <span className="font-semibold">{ret.returnNumber}</span>
          <Badge className={statusStyles[ret.status]}>{ret.status}</Badge>
        </div>
        <div className="text-sm text-zinc-400 mt-0.5">
          {ret.supplier ?? "Standalone"} • {ret.itemCount} line{ret.itemCount !== 1 ? "s" : ""} •{" "}
          {new Date(ret.returnDate).toLocaleDateString()}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="font-mono text-zinc-200">{formatCurrency(ret.totalAmount)}</span>
        <Button variant="ghost" size="sm" onClick={onView} className="gap-1">
          <Eye className="h-4 w-4" /> View
        </Button>
      </div>
    </div>
  );
}

/* ─── Create form ─────────────────────────────────────────────────────── */

function CreateReturnForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>("bill");
  const [returnNumber, setReturnNumber] = useState(
    `SR-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(Math.random() * 1000)}`,
  );
  const [supplier, setSupplier] = useState("");
  const [notes, setNotes] = useState("");
  const [defaultTaxRate, setDefaultTaxRate] = useState(0);
  const [billId, setBillId] = useState<number | null>(null);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [productPicker, setProductPicker] = useState("");

  /* Bills + products fetched via direct fetch (no codegen helper yet) */
  const { data: bills = [] } = useQuery({
    queryKey: ["/api/purchase-bills"],
    queryFn: async () => {
      const t = localStorage.getItem(TENANT_TOKEN_KEY);
      const r = await fetch("/api/purchase-bills", {
        headers: t ? { Authorization: `Bearer ${t}` } : {},
      });
      if (!r.ok) throw new Error(`Bills fetch failed (${r.status})`);
      return (await r.json()) as BillStub[];
    },
  });
  const confirmedBills = useMemo(
    () => bills.filter((b) => b.status === "confirmed"),
    [bills],
  );

  const { data: products = [] } = useQuery({
    queryKey: ["/api/products", "for-returns"],
    queryFn: async () => {
      const t = localStorage.getItem(TENANT_TOKEN_KEY);
      const r = await fetch("/api/products", {
        headers: t ? { Authorization: `Bearer ${t}` } : {},
      });
      if (!r.ok) throw new Error(`Products fetch failed (${r.status})`);
      return (await r.json()) as ProductStub[];
    },
  });

  /* Eligible lines for the selected bill */
  const { data: eligible } = useQuery({
    queryKey: ["/api/supplier-returns/eligible", billId],
    queryFn: () => (billId ? getEligibleBillForReturn(billId) : null),
    enabled: mode === "bill" && billId != null,
  });

  // When the eligible bill loads, autofill supplier, tax rate, and seed
  // one return line per returnable bill line at qty=0.
  useEffect(() => {
    if (mode !== "bill" || !eligible) return;
    setSupplier((s) => s || eligible.supplier || "");
    setDefaultTaxRate(eligible.defaultTaxRate);
    const seeded: DraftLine[] = eligible.lines
      .filter((l: EligibleReturnLine) => l.returnableQuantity > 0)
      .map((l) => ({
        productId: l.productId,
        productName: l.productName,
        purchaseBillItemId: l.purchaseBillItemId,
        trackBatches: l.trackBatches,
        quantity: 0,
        maxQuantity: l.returnableQuantity,
        unitCost: l.unitCost,
        taxRate: l.taxRate,
        batchId: null,
        batchLabel: null,
      }));
    setLines(seeded);
  }, [eligible, mode]);

  // Reset when mode flips so stale lines don't leak across modes.
  useEffect(() => {
    setLines([]);
    setBillId(null);
  }, [mode]);

  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unitCost, 0);
  const taxTotal = lines.reduce((s, l) => {
    const r = l.taxRate ?? defaultTaxRate;
    return s + (l.quantity * l.unitCost * r) / 100;
  }, 0);
  const total = subtotal + taxTotal;

  const createMut = useMutation({
    mutationFn: (status: "draft" | "confirmed") => {
      const activeLines = lines.filter((l) => l.quantity > 0);
      if (activeLines.length === 0) throw new Error("Add at least one line with qty > 0");
      const payload: CreateSupplierReturnItem[] = activeLines.map((l) => ({
        productId: l.productId,
        purchaseBillItemId: mode === "bill" ? l.purchaseBillItemId : null,
        quantity: l.quantity,
        unitCost: l.unitCost,
        taxRate: l.taxRate,
        batchId: l.trackBatches ? l.batchId : null,
      }));
      return createSupplierReturn({
        returnNumber,
        supplier: supplier || null,
        purchaseBillId: mode === "bill" ? billId : null,
        notes: notes || null,
        status,
        defaultTaxRate,
        items: payload,
      });
    },
    onSuccess: (_d, status) => {
      toast({
        title:
          status === "confirmed"
            ? "Return confirmed — stock & accounting updated"
            : "Return saved as draft",
      });
      onCreated();
    },
    onError: (e: Error) =>
      toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const addStandaloneLine = () => {
    const pid = parseInt(productPicker, 10);
    const p = products.find((x) => x.id === pid);
    if (!p) {
      toast({ title: "Pick a product first", variant: "destructive" });
      return;
    }
    setLines((prev) => [
      ...prev,
      {
        productId: p.id,
        productName: p.name,
        purchaseBillItemId: null,
        trackBatches: p.trackBatches ?? false,
        quantity: 1,
        maxQuantity: null,
        unitCost: p.costPrice ?? 0,
        taxRate: null,
        batchId: null,
        batchLabel: null,
      },
    ]);
    setProductPicker("");
  };

  return (
    <Card className="bg-zinc-900/50 border-zinc-800">
      <CardHeader>
        <CardTitle>New Supplier Return</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Mode toggle */}
        <div className="flex gap-2">
          <Button
            variant={mode === "bill" ? "default" : "outline"}
            onClick={() => setMode("bill")}
            size="sm"
          >
            Against a purchase bill
          </Button>
          <Button
            variant={mode === "standalone" ? "default" : "outline"}
            onClick={() => setMode("standalone")}
            size="sm"
          >
            Standalone debit note
          </Button>
        </div>

        {/* Header fields */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label>Return number</Label>
            <Input
              value={returnNumber}
              onChange={(e) => setReturnNumber(e.target.value)}
              className="mt-1"
            />
          </div>
          {mode === "bill" ? (
            <div className="md:col-span-2">
              <Label>Purchase bill</Label>
              <Select
                value={billId?.toString() ?? ""}
                onValueChange={(v) => setBillId(parseInt(v, 10))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Pick a confirmed bill…" />
                </SelectTrigger>
                <SelectContent>
                  {confirmedBills.map((b) => (
                    <SelectItem key={b.id} value={b.id.toString()}>
                      {b.billNumber} {b.supplier ? `— ${b.supplier}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <>
              <div>
                <Label>Supplier (free text)</Label>
                <Input
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Default tax rate (%)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={defaultTaxRate}
                  onChange={(e) => setDefaultTaxRate(Number(e.target.value))}
                  className="mt-1"
                />
              </div>
            </>
          )}
        </div>

        {/* Standalone product picker */}
        {mode === "standalone" && (
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Label>Add product</Label>
              <Select value={productPicker} onValueChange={setProductPicker}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Pick a product…" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id.toString()}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={addStandaloneLine} className="gap-2">
              <Plus className="h-4 w-4" /> Add line
            </Button>
          </div>
        )}

        {/* Lines */}
        {lines.length > 0 && (
          <div className="border border-zinc-800 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-zinc-800/60 text-zinc-300">
                <tr>
                  <th className="text-left p-2">Product</th>
                  <th className="text-right p-2 w-24">Qty</th>
                  {mode === "bill" && <th className="text-right p-2 w-20">Max</th>}
                  <th className="text-right p-2 w-32">Unit Cost</th>
                  <th className="text-right p-2 w-20">Tax %</th>
                  <th className="text-left p-2">Batch</th>
                  <th className="text-right p-2 w-32">Line Total</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {lines.map((l, idx) => (
                  <LineRow
                    key={`${l.productId}-${l.purchaseBillItemId ?? "x"}-${idx}`}
                    line={l}
                    mode={mode}
                    defaultTaxRate={defaultTaxRate}
                    onChange={(patch) =>
                      setLines((prev) =>
                        prev.map((x, i) => (i === idx ? { ...x, ...patch } : x)),
                      )
                    }
                    onRemove={() =>
                      setLines((prev) => prev.filter((_, i) => i !== idx))
                    }
                  />
                ))}
              </tbody>
              <tfoot className="bg-zinc-800/40 text-zinc-200">
                <tr>
                  <td colSpan={mode === "bill" ? 6 : 5} className="p-2 text-right">
                    Subtotal
                  </td>
                  <td className="p-2 text-right">{formatCurrency(subtotal)}</td>
                  <td />
                </tr>
                <tr>
                  <td colSpan={mode === "bill" ? 6 : 5} className="p-2 text-right">
                    Tax
                  </td>
                  <td className="p-2 text-right">{formatCurrency(taxTotal)}</td>
                  <td />
                </tr>
                <tr className="font-semibold">
                  <td colSpan={mode === "bill" ? 6 : 5} className="p-2 text-right">
                    Total Return
                  </td>
                  <td className="p-2 text-right">{formatCurrency(total)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* Notes */}
        <div>
          <Label>Notes</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="mt-1"
            rows={2}
            placeholder="Reason for return, damage notes, etc."
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={() => createMut.mutate("draft")}
            disabled={createMut.isPending}
          >
            Save as draft
          </Button>
          <Button
            onClick={() => createMut.mutate("confirmed")}
            disabled={createMut.isPending}
            className="gap-2"
          >
            <CheckCircle2 className="h-4 w-4" /> Confirm now
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function LineRow({
  line,
  mode,
  defaultTaxRate,
  onChange,
  onRemove,
}: {
  line: DraftLine;
  mode: Mode;
  defaultTaxRate: number;
  onChange: (patch: Partial<DraftLine>) => void;
  onRemove: () => void;
}) {
  // Fetch lots only for batch-tracked products. The FIFO suggestion is
  // the oldest non-empty batch (server already orders by receivedAt).
  const { data: batchData } = useQuery({
    queryKey: ["/api/product-batches", line.productId],
    queryFn: () => listProductBatches({ productId: line.productId }),
    enabled: line.trackBatches,
  });
  const batches: ProductBatch[] = (batchData?.batches ?? []).filter(
    (b) => b.quantityRemaining > 0,
  );

  // Auto-pick FIFO (oldest available) batch when none selected yet.
  useEffect(() => {
    if (!line.trackBatches || line.batchId || batches.length === 0) return;
    const oldest = batches[0];
    const label = oldest.batchNumber
      ? `${oldest.batchNumber}${oldest.expiryDate ? ` (exp ${oldest.expiryDate})` : ""}`
      : `#${oldest.id}`;
    onChange({ batchId: oldest.id, batchLabel: label });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batches.length]);

  const lineSub = line.quantity * line.unitCost;
  const r = line.taxRate ?? defaultTaxRate;
  const lineTax = (lineSub * r) / 100;
  const lineTotal = lineSub + lineTax;

  return (
    <tr className="border-t border-zinc-800">
      <td className="p-2">
        <div className="flex items-center gap-1">
          <Package className="h-3.5 w-3.5 text-zinc-500" />
          {line.productName}
        </div>
      </td>
      <td className="p-2">
        <Input
          type="number"
          min={0}
          max={line.maxQuantity ?? undefined}
          value={line.quantity}
          onChange={(e) => {
            const next = Math.max(0, Math.floor(Number(e.target.value) || 0));
            const capped =
              line.maxQuantity != null ? Math.min(next, line.maxQuantity) : next;
            onChange({ quantity: capped });
          }}
          className="text-right h-8"
        />
      </td>
      {mode === "bill" && (
        <td className="p-2 text-right text-zinc-400">{line.maxQuantity}</td>
      )}
      <td className="p-2">
        <Input
          type="number"
          min={0}
          step="0.01"
          value={line.unitCost}
          disabled={mode === "bill"}
          onChange={(e) => onChange({ unitCost: Number(e.target.value) || 0 })}
          className="text-right h-8"
        />
      </td>
      <td className="p-2">
        <Input
          type="number"
          min={0}
          max={100}
          step="0.01"
          value={line.taxRate ?? ""}
          placeholder={String(defaultTaxRate)}
          disabled={mode === "bill"}
          onChange={(e) => {
            const v = e.target.value;
            onChange({ taxRate: v === "" ? null : Number(v) });
          }}
          className="text-right h-8"
        />
      </td>
      <td className="p-2">
        {line.trackBatches ? (
          <Select
            value={line.batchId?.toString() ?? ""}
            onValueChange={(v) => {
              const b = batches.find((x) => x.id === parseInt(v, 10));
              onChange({
                batchId: b?.id ?? null,
                batchLabel: b
                  ? b.batchNumber
                    ? `${b.batchNumber}${b.expiryDate ? ` (exp ${b.expiryDate})` : ""}`
                    : `#${b.id}`
                  : null,
              });
            }}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Pick lot…" />
            </SelectTrigger>
            <SelectContent>
              {batches.map((b, i) => (
                <SelectItem key={b.id} value={b.id.toString()}>
                  {i === 0 ? "FIFO " : ""}
                  {b.batchNumber ?? `#${b.id}`}
                  {b.expiryDate ? ` · exp ${b.expiryDate}` : ""}
                  {" · "}
                  {b.quantityRemaining} left
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="text-zinc-500 text-xs">—</span>
        )}
      </td>
      <td className="p-2 text-right">{formatCurrency(lineTotal)}</td>
      <td className="p-2">
        <Button variant="ghost" size="icon" onClick={onRemove} className="h-7 w-7">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </td>
    </tr>
  );
}
