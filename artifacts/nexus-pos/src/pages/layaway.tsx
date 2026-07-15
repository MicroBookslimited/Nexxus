import { useState, useMemo } from "react";
import {
  useListCustomers,
  useListProducts,
  useGetSettings,
  useListLayaways,
  useGetLayaway,
  useCreateLayaway,
  useAddLayawayPayment,
  useCancelLayaway,
} from "@workspace/api-client-react";
import type { Layaway, LayawayItem } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useStaff } from "@/contexts/StaffContext";
import { PiggyBank, Search, Plus, Trash2, Eye, Ban, DollarSign } from "lucide-react";

function formatCurrency(n: number, currency = "JMD") {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
    }).format(n || 0);
  } catch {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n || 0);
  }
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  completed: "bg-sky-500/15 text-sky-600 border-sky-500/30",
  cancelled: "bg-rose-500/15 text-rose-600 border-rose-500/30",
  defaulted: "bg-amber-500/15 text-amber-600 border-amber-500/30",
};

export default function LayawayPage() {
  const { toast } = useToast();
  const { staff: sessionStaff } = useStaff();
  const { data: layaways, isLoading } = useListLayaways();
  const { data: customers } = useListCustomers();
  const { data: products } = useListProducts();
  const { data: settings } = useGetSettings();
  const createLayaway = useCreateLayaway();
  const addPayment = useAddLayawayPayment();
  const cancelLayaway = useCancelLayaway();

  const currency = settings?.base_currency || "JMD";

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "completed" | "cancelled" | "defaulted">("all");
  const [viewingId, setViewingId] = useState<number | null>(null);
  const { data: viewing } = useGetLayaway(viewingId);
  const [showCreate, setShowCreate] = useState(false);
  const [cancelling, setCancelling] = useState<Layaway | null>(null);

  // ── Create form state ──
  const [custId, setCustId] = useState<number | "">("");
  const [productSearch, setProductSearch] = useState("");
  const [cartItems, setCartItems] = useState<LayawayItem[]>([]);
  const [depositAmount, setDepositAmount] = useState("");
  const [depositMethod, setDepositMethod] = useState<"cash" | "card" | "other">("cash");
  const [planType, setPlanType] = useState<"flexible" | "installment">("flexible");
  const [installmentAmount, setInstallmentAmount] = useState("");
  const [installmentFrequency, setInstallmentFrequency] = useState<"weekly" | "biweekly" | "monthly">("weekly");
  const [firstDueDate, setFirstDueDate] = useState("");
  const [notes, setNotes] = useState("");

  // ── Payment form state ──
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<"cash" | "card" | "other">("cash");
  const [cancelFee, setCancelFee] = useState("");
  const [markDefaulted, setMarkDefaulted] = useState(false);

  const customerName = (id: number | null | undefined): string => {
    if (!id) return "—";
    return customers?.find((c) => c.id === id)?.name ?? `Customer #${id}`;
  };

  const filtered = useMemo(() => {
    const list = layaways ?? [];
    const q = search.trim().toLowerCase();
    return list.filter((l) => {
      if (statusFilter !== "all" && l.status !== statusFilter) return false;
      if (!q) return true;
      return (
        l.layawayNumber.toLowerCase().includes(q) ||
        customerName(l.customerId).toLowerCase().includes(q)
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layaways, search, statusFilter, customers]);

  const productMatches = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return [];
    return (products ?? [])
      .filter((p: any) => !p.archivedAt)
      .filter(
        (p: any) =>
          p.name?.toLowerCase().includes(q) ||
          p.sku?.toLowerCase?.().includes(q) ||
          p.barcode?.toLowerCase?.().includes(q),
      )
      .slice(0, 8);
  }, [products, productSearch]);

  const cartSubtotal = cartItems.reduce((s, i) => s + i.price * i.quantity, 0);

  const resetCreateForm = () => {
    setCustId("");
    setProductSearch("");
    setCartItems([]);
    setDepositAmount("");
    setDepositMethod("cash");
    setPlanType("flexible");
    setInstallmentAmount("");
    setInstallmentFrequency("weekly");
    setFirstDueDate("");
    setNotes("");
  };

  const addProduct = (p: any) => {
    setCartItems((prev) => {
      const existing = prev.find((i) => i.productId === p.id);
      if (existing) {
        return prev.map((i) => (i.productId === p.id ? { ...i, quantity: i.quantity + 1 } : i));
      }
      return [
        ...prev,
        {
          productId: p.id,
          productName: p.name,
          price: Number(p.price) || 0,
          quantity: 1,
          isTaxable: p.isTaxable !== false,
        },
      ];
    });
    setProductSearch("");
  };

  const handleCreate = () => {
    if (!custId) { toast({ title: "Select a customer", variant: "destructive" }); return; }
    if (cartItems.length === 0) { toast({ title: "Add at least one item", variant: "destructive" }); return; }
    const dep = Number(depositAmount);
    if (!Number.isFinite(dep) || dep <= 0) { toast({ title: "Enter a deposit amount", variant: "destructive" }); return; }
    if (planType === "installment") {
      const inst = Number(installmentAmount);
      if (!Number.isFinite(inst) || inst <= 0) { toast({ title: "Enter an installment amount", variant: "destructive" }); return; }
    }
    createLayaway.mutate(
      {
        customerId: Number(custId),
        items: cartItems,
        depositAmount: dep,
        depositMethod,
        planType,
        ...(planType === "installment"
          ? {
              installmentAmount: Number(installmentAmount),
              installmentFrequency,
              ...(firstDueDate ? { firstDueDate } : {}),
            }
          : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        ...(sessionStaff ? { staffId: sessionStaff.id, staffName: sessionStaff.name } : {}),
      },
      {
        onSuccess: (created) => {
          toast({ title: `Layaway ${created.layawayNumber} created` });
          setShowCreate(false);
          resetCreateForm();
        },
        onError: (e: any) =>
          toast({ title: "Could not create layaway", description: e?.message, variant: "destructive" }),
      },
    );
  };

  const handleAddPayment = () => {
    if (!viewing) return;
    const amt = Number(payAmount);
    if (!Number.isFinite(amt) || amt <= 0) { toast({ title: "Enter a payment amount", variant: "destructive" }); return; }
    addPayment.mutate(
      {
        id: viewing.id,
        amount: amt,
        method: payMethod,
        ...(sessionStaff ? { staffId: sessionStaff.id, staffName: sessionStaff.name } : {}),
      },
      {
        onSuccess: (updated) => {
          setPayAmount("");
          if (updated.status === "completed") {
            toast({ title: "Layaway paid off!", description: "A sale has been recorded and items released." });
          } else {
            toast({ title: "Payment recorded", description: `Balance: ${formatCurrency(updated.balance, currency)}` });
          }
        },
        onError: (e: any) =>
          toast({ title: "Could not record payment", description: e?.message, variant: "destructive" }),
      },
    );
  };

  const handleCancel = () => {
    if (!cancelling) return;
    const fee = Number(cancelFee);
    cancelLayaway.mutate(
      {
        id: cancelling.id,
        ...(Number.isFinite(fee) && fee > 0 ? { cancellationFee: fee } : {}),
        markDefaulted,
        ...(sessionStaff ? { staffId: sessionStaff.id } : {}),
      },
      {
        onSuccess: () => {
          toast({ title: markDefaulted ? "Layaway marked as defaulted" : "Layaway cancelled", description: "Reserved stock was returned to inventory." });
          setCancelling(null);
          setCancelFee("");
          setMarkDefaulted(false);
        },
        onError: (e: any) =>
          toast({ title: "Could not cancel layaway", description: e?.message, variant: "destructive" }),
      },
    );
  };

  // Route-level module gate: nav is already hidden, but block direct URL access too.
  if (settings && settings.layaway_enabled !== "true") {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <p className="font-medium">Layaway module is disabled</p>
        <p className="text-sm mt-1">Enable it in Settings → Optional Modules.</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/15 text-violet-500">
            <PiggyBank className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Layaway</h1>
            <p className="text-sm text-muted-foreground">
              Reserve items with a deposit — the sale is recorded automatically when fully paid.
            </p>
          </div>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-1" /> New Layaway
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by layaway number or customer…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {(["all", "active", "completed", "cancelled", "defaulted"] as const).map((s) => (
            <Button
              key={s}
              size="sm"
              variant={statusFilter === s ? "default" : "outline"}
              onClick={() => setStatusFilter(s)}
              className="capitalize"
            >
              {s}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground py-12 text-center">Loading layaways…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-12 text-center">No layaways found.</p>
      ) : (
        <div className="grid gap-3">
          {filtered.map((l) => (
            <Card key={l.id} className="hover:border-primary/40 transition-colors">
              <CardContent className="p-4 flex flex-wrap items-center gap-3">
                <div className="min-w-[130px]">
                  <p className="font-semibold">{l.layawayNumber}</p>
                  <p className="text-xs text-muted-foreground">{fmtDate(l.createdAt)}</p>
                </div>
                <div className="flex-1 min-w-[140px]">
                  <p className="text-sm">{customerName(l.customerId)}</p>
                  <p className="text-xs text-muted-foreground">
                    {l.items.length} item{l.items.length === 1 ? "" : "s"}
                    {l.planType === "installment" && l.nextDueDate && l.status === "active"
                      ? ` · next due ${fmtDate(l.nextDueDate)}`
                      : ""}
                  </p>
                </div>
                <div className="text-right min-w-[120px]">
                  <p className="font-semibold">{formatCurrency(l.total, currency)}</p>
                  {l.status === "active" && (
                    <p className="text-xs text-muted-foreground">
                      Balance {formatCurrency(l.balance, currency)}
                    </p>
                  )}
                </div>
                <Badge variant="outline" className={`capitalize ${STATUS_STYLES[l.status] ?? ""}`}>
                  {l.status}
                </Badge>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => setViewingId(l.id)}>
                    <Eye className="h-4 w-4" />
                  </Button>
                  {l.status === "active" && (
                    <Button size="sm" variant="outline" className="text-rose-500" onClick={() => setCancelling(l)}>
                      <Ban className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Create dialog ── */}
      <Dialog open={showCreate} onOpenChange={(o) => { if (!o) setShowCreate(false); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Layaway</DialogTitle>
            <DialogDescription>Stock is reserved as soon as the layaway is created.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Customer *</Label>
              <select
                className="w-full mt-1 h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={custId}
                onChange={(e) => setCustId(e.target.value ? Number(e.target.value) : "")}
              >
                <option value="">Select customer…</option>
                {(customers ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <Label>Add items *</Label>
              <div className="relative mt-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search products by name, SKU or barcode…"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  className="pl-9"
                />
                {productMatches.length > 0 && (
                  <div className="absolute z-20 mt-1 w-full rounded-md border border-border bg-popover shadow-lg max-h-56 overflow-y-auto">
                    {productMatches.map((p: any) => (
                      <button
                        key={p.id}
                        type="button"
                        className="w-full px-3 py-2 text-left text-sm hover:bg-muted flex justify-between gap-2"
                        onClick={() => addProduct(p)}
                      >
                        <span className="truncate">{p.name}</span>
                        <span className="text-muted-foreground shrink-0">{formatCurrency(Number(p.price) || 0, currency)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {cartItems.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {cartItems.map((i, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-sm rounded-md border border-border px-2 py-1.5">
                      <span className="flex-1 truncate">{i.productName}</span>
                      <Input
                        type="number"
                        min={1}
                        value={i.quantity}
                        onChange={(e) => {
                          const q = Math.max(1, Math.floor(Number(e.target.value) || 1));
                          setCartItems((prev) => prev.map((x, xi) => (xi === idx ? { ...x, quantity: q } : x)));
                        }}
                        className="w-16 h-7 text-center"
                      />
                      <span className="w-20 text-right">{formatCurrency(i.price * i.quantity, currency)}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-rose-500"
                        onClick={() => setCartItems((prev) => prev.filter((_, xi) => xi !== idx))}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                  <p className="text-right text-sm font-medium pt-1">
                    Subtotal: {formatCurrency(cartSubtotal, currency)}
                  </p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Deposit amount *</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Deposit method</Label>
                <select
                  className="w-full mt-1 h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={depositMethod}
                  onChange={(e) => setDepositMethod(e.target.value as any)}
                >
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>

            <div>
              <Label>Payment plan</Label>
              <div className="flex gap-2 mt-1">
                <Button
                  type="button"
                  size="sm"
                  variant={planType === "flexible" ? "default" : "outline"}
                  onClick={() => setPlanType("flexible")}
                >
                  Flexible payments
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={planType === "installment" ? "default" : "outline"}
                  onClick={() => setPlanType("installment")}
                >
                  Fixed installments
                </Button>
              </div>
            </div>

            {planType === "installment" && (
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Installment *</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={installmentAmount}
                    onChange={(e) => setInstallmentAmount(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Frequency</Label>
                  <select
                    className="w-full mt-1 h-9 rounded-md border border-input bg-background px-3 text-sm"
                    value={installmentFrequency}
                    onChange={(e) => setInstallmentFrequency(e.target.value as any)}
                  >
                    <option value="weekly">Weekly</option>
                    <option value="biweekly">Bi-weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
                <div>
                  <Label>First due date</Label>
                  <Input
                    type="date"
                    value={firstDueDate}
                    onChange={(e) => setFirstDueDate(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>
            )}

            <div>
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createLayaway.isPending}>
              {createLayaway.isPending ? "Creating…" : "Create Layaway"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Detail dialog ── */}
      <Dialog open={viewingId != null} onOpenChange={(o) => { if (!o) setViewingId(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          {viewing && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {viewing.layawayNumber}
                  <Badge variant="outline" className={`capitalize ${STATUS_STYLES[viewing.status] ?? ""}`}>
                    {viewing.status}
                  </Badge>
                </DialogTitle>
                <DialogDescription>
                  {customerName(viewing.customerId)} · created {fmtDate(viewing.createdAt)}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 text-sm">
                <div className="space-y-1">
                  {viewing.items.map((i, idx) => (
                    <div key={idx} className="flex justify-between gap-2">
                      <span className="truncate">{i.quantity} × {i.productName}</span>
                      <span>{formatCurrency(i.price * i.quantity, currency)}</span>
                    </div>
                  ))}
                </div>
                <div className="border-t border-border pt-2 space-y-1">
                  <div className="flex justify-between"><span>Subtotal</span><span>{formatCurrency(viewing.subtotal, currency)}</span></div>
                  {(viewing.discountAmount ?? 0) > 0 && (
                    <div className="flex justify-between text-rose-500"><span>Discount</span><span>-{formatCurrency(viewing.discountAmount ?? 0, currency)}</span></div>
                  )}
                  <div className="flex justify-between"><span>Tax</span><span>{formatCurrency(viewing.tax, currency)}</span></div>
                  <div className="flex justify-between font-semibold"><span>Total</span><span>{formatCurrency(viewing.total, currency)}</span></div>
                  <div className="flex justify-between text-emerald-600"><span>Paid</span><span>{formatCurrency(viewing.amountPaid, currency)}</span></div>
                  <div className="flex justify-between font-semibold"><span>Balance</span><span>{formatCurrency(viewing.balance, currency)}</span></div>
                </div>
                {viewing.planType === "installment" && (
                  <p className="text-xs text-muted-foreground">
                    Installments of {formatCurrency(viewing.installmentAmount ?? 0, currency)} {viewing.installmentFrequency}
                    {viewing.nextDueDate && viewing.status === "active" ? ` · next due ${fmtDate(viewing.nextDueDate)}` : ""}
                  </p>
                )}
                {viewing.notes && <p className="text-xs text-muted-foreground">{viewing.notes}</p>}

                <div>
                  <p className="font-medium mb-1">Payments</p>
                  <div className="space-y-1">
                    {viewing.payments.length === 0 && <p className="text-xs text-muted-foreground">No payments yet.</p>}
                    {viewing.payments.map((p) => (
                      <div key={p.id} className="flex justify-between gap-2 text-xs">
                        <span className="capitalize">{p.kind} ({p.method}) · {fmtDate(p.createdAt)}</span>
                        <span className={p.kind === "refund" ? "text-rose-500" : ""}>
                          {p.kind === "refund" ? "-" : ""}{formatCurrency(p.amount, currency)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {viewing.status === "active" && (
                  <div className="rounded-lg border border-border p-3 space-y-2">
                    <p className="font-medium flex items-center gap-1.5"><DollarSign className="h-4 w-4" /> Record payment</p>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        placeholder={`Up to ${formatCurrency(viewing.balance, currency)}`}
                        value={payAmount}
                        onChange={(e) => setPayAmount(e.target.value)}
                      />
                      <select
                        className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                        value={payMethod}
                        onChange={(e) => setPayMethod(e.target.value as any)}
                      >
                        <option value="cash">Cash</option>
                        <option value="card">Card</option>
                        <option value="other">Other</option>
                      </select>
                      <Button onClick={handleAddPayment} disabled={addPayment.isPending}>
                        {addPayment.isPending ? "Saving…" : "Add"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Cancel dialog ── */}
      <Dialog open={cancelling != null} onOpenChange={(o) => { if (!o) { setCancelling(null); setCancelFee(""); setMarkDefaulted(false); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel layaway {cancelling?.layawayNumber}?</DialogTitle>
            <DialogDescription>
              Reserved stock will be returned to inventory. Payments of {formatCurrency(cancelling?.amountPaid ?? 0, currency)} were collected — apply an optional cancellation fee kept by the store; the rest is refunded to the customer outside the system.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Cancellation fee (optional)</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={cancelFee}
                onChange={(e) => setCancelFee(e.target.value)}
                className="mt-1"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={markDefaulted} onChange={(e) => setMarkDefaulted(e.target.checked)} />
              Mark as defaulted (customer stopped paying)
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelling(null)}>Keep layaway</Button>
            <Button variant="destructive" onClick={handleCancel} disabled={cancelLayaway.isPending}>
              {cancelLayaway.isPending ? "Cancelling…" : markDefaulted ? "Mark Defaulted" : "Cancel Layaway"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
