import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Users, DollarSign, CheckCircle, ChevronRight, Phone, Mail, Calendar, Clock, FileText, ShoppingBag, CreditCard, Banknote, MapPin, StickyNote, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { TENANT_TOKEN_KEY } from "@/lib/saas-api";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function authHeaders() {
  const token = localStorage.getItem(TENANT_TOKEN_KEY) ?? "";
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

async function fetchAR() {
  const r = await fetch(`${BASE}/api/ar`, { headers: authHeaders() });
  if (!r.ok) throw new Error("Failed to fetch AR");
  return r.json() as Promise<ArRecord[]>;
}

async function fetchARRecord(id: number) {
  const r = await fetch(`${BASE}/api/ar/${id}`, { headers: authHeaders() });
  if (!r.ok) throw new Error("Failed to fetch AR record");
  return r.json() as Promise<ArDetail>;
}

type ArRecord = {
  id: number;
  customerId: number;
  customerName: string;
  orderNumber: string;
  amount: number;
  amountPaid: number;
  status: "open" | "partial" | "paid";
  notes: string | null;
  dueDate: string | null;
  createdAt: string;
  phone: string | null;
  email: string | null;
};

type ArPayment = {
  id: number;
  amount: number;
  paymentMethod: string;
  staffName: string | null;
  notes: string | null;
  createdAt: string;
};

type ArOrderItem = {
  id: number;
  productName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  discountAmount: number | null;
  variantAdjustment: number | null;
  modifierAdjustment: number | null;
};

type ArOrder = {
  id: number;
  orderNumber: string;
  subtotal: number;
  tax: number;
  total: number;
  discountAmount: number | null;
  paymentMethod: string | null;
  orderType: string | null;
  orderNotes: string | null;
  createdAt: string;
};

type ArDetail = ArRecord & {
  payments: ArPayment[];
  order: ArOrder | null;
  items: ArOrderItem[];
};

function fmt(n: number) {
  return `$${Math.abs(n).toFixed(2)}`;
}

function daysBetween(a: Date, b: Date) {
  return Math.floor((a.getTime() - b.getTime()) / 86_400_000);
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function ageInfo(createdAt: string, dueDate: string | null, status: string) {
  const now = new Date();
  const age = daysBetween(now, new Date(createdAt));
  let overdue: number | null = null;
  if (dueDate && status !== "paid") {
    overdue = daysBetween(now, new Date(dueDate));
    if (overdue <= 0) overdue = null;
  }
  return { age, overdue };
}

function StatusBadge({ status }: { status: string }) {
  if (status === "paid")
    return <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20">Paid</Badge>;
  if (status === "partial")
    return <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 hover:bg-amber-500/20">Partial</Badge>;
  return <Badge className="bg-red-500/15 text-red-400 border-red-500/30 hover:bg-red-500/20">Open</Badge>;
}

function PaymentModal({ ar, onClose }: { ar: ArDetail; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"cash" | "card">("cash");

  const balance = ar.amount - ar.amountPaid;

  const record = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${BASE}/api/ar/${ar.id}/payments`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ amount: parseFloat(amount), paymentMethod: method }),
      });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Payment recorded" });
      qc.invalidateQueries({ queryKey: ["/api/ar"] });
      qc.invalidateQueries({ queryKey: ["/api/ar", ar.id] });
      onClose();
    },
    onError: () => toast({ title: "Failed to record payment", variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record Payment — {ar.customerName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="rounded-lg bg-muted/30 p-3 space-y-1">
            <div className="flex justify-between"><span className="text-muted-foreground">Order</span><span className="font-mono">{ar.orderNumber}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Total Owed</span><span className="font-mono">{fmt(ar.amount)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Amount Paid</span><span className="font-mono text-emerald-400">{fmt(ar.amountPaid)}</span></div>
            <Separator />
            <div className="flex justify-between font-bold text-base"><span>Balance Due</span><span className="font-mono text-red-400">{fmt(balance)}</span></div>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Payment Amount</label>
            <div className="flex gap-2">
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={`Max ${fmt(balance)}`}
                className="font-mono"
              />
              <Button variant="outline" size="sm" className="whitespace-nowrap" onClick={() => setAmount(balance.toFixed(2))}>
                Full
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Payment Method</label>
            <div className="flex gap-2">
              <Button variant={method === "cash" ? "default" : "outline"} size="sm" className="flex-1" onClick={() => setMethod("cash")}>Cash</Button>
              <Button variant={method === "card" ? "default" : "outline"} size="sm" className="flex-1" onClick={() => setMethod("card")}>Card</Button>
            </div>
          </div>

          <Button
            className="w-full"
            onClick={() => record.mutate()}
            disabled={!amount || parseFloat(amount) <= 0 || record.isPending}
          >
            {record.isPending ? "Recording…" : `Record ${amount ? fmt(parseFloat(amount)) : ""} Payment`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PaymentMethodIcon({ method }: { method: string }) {
  const m = method.toLowerCase();
  if (m === "cash") return <Banknote className="h-3.5 w-3.5 text-emerald-400" />;
  if (m === "card" || m === "credit" || m === "debit")
    return <CreditCard className="h-3.5 w-3.5 text-sky-400" />;
  return <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />;
}

function DetailModal({ arId, onClose }: { arId: number; onClose: () => void }) {
  const [showPayment, setShowPayment] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["/api/ar", arId],
    queryFn: () => fetchARRecord(arId),
  });

  if (isLoading || !data) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="sm:max-w-lg"><div className="py-8 text-center text-muted-foreground text-sm">Loading…</div></DialogContent>
      </Dialog>
    );
  }

  const balance = data.amount - data.amountPaid;
  const pctPaid = data.amount > 0 ? Math.min(100, (data.amountPaid / data.amount) * 100) : 0;
  const { age, overdue } = ageInfo(data.createdAt, data.dueDate, data.status);
  const totalPayments = data.payments.length;
  const lastPayment = data.payments[0]; // payments are desc by createdAt
  const avgPayment =
    totalPayments > 0 ? data.payments.reduce((s, p) => s + p.amount, 0) / totalPayments : 0;

  return (
    <>
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="sm:max-w-xl max-h-[88vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              {data.customerName}
              <StatusBadge status={data.status} />
              {overdue !== null && (
                <Badge className="bg-red-500/20 text-red-300 border-red-500/40 hover:bg-red-500/25 gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {overdue}d overdue
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 text-sm pr-1">
            {/* ── Customer contact ─────────────────────────────────── */}
            {(data.phone || data.email) && (
              <div className="rounded-lg border border-border bg-muted/20 p-3 grid grid-cols-2 gap-2">
                {data.phone && (
                  <div className="flex items-center gap-2 text-xs">
                    <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                    <a href={`tel:${data.phone}`} className="font-mono text-foreground hover:underline">
                      {data.phone}
                    </a>
                  </div>
                )}
                {data.email && (
                  <div className="flex items-center gap-2 text-xs min-w-0">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <a href={`mailto:${data.email}`} className="text-foreground hover:underline truncate">
                      {data.email}
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* ── Credit summary with progress bar ─────────────────── */}
            <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2.5">
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground">Order</span>
                <span className="font-mono text-xs">{data.orderNumber}</span>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-1">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Invoiced</p>
                  <p className="font-mono text-sm font-semibold">{fmt(data.amount)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Collected</p>
                  <p className="font-mono text-sm font-semibold text-emerald-400">{fmt(data.amountPaid)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Balance</p>
                  <p className={`font-mono text-sm font-bold ${balance > 0 ? "text-red-400" : "text-emerald-400"}`}>
                    {fmt(balance)}
                  </p>
                </div>
              </div>

              {/* Progress bar */}
              <div className="space-y-1">
                <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
                  <div
                    className={`h-full transition-all ${data.status === "paid" ? "bg-emerald-500" : "bg-amber-500"}`}
                    style={{ width: `${pctPaid}%` }}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground text-right">
                  {pctPaid.toFixed(0)}% collected
                </p>
              </div>
            </div>

            {/* ── Timeline / aging ─────────────────────────────────── */}
            <div className="rounded-lg border border-border bg-muted/10 p-3 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" />
                  Issued
                </span>
                <span className="font-mono">{fmtDateTime(data.createdAt)}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  Days outstanding
                </span>
                <span className="font-mono">{age} {age === 1 ? "day" : "days"}</span>
              </div>
              {data.dueDate && (
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" />
                    Due date
                  </span>
                  <span className={`font-mono ${overdue !== null ? "text-red-400 font-semibold" : ""}`}>
                    {fmtDate(data.dueDate)}
                  </span>
                </div>
              )}
              {lastPayment && (
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <DollarSign className="h-3.5 w-3.5" />
                    Last payment
                  </span>
                  <span className="font-mono">
                    {fmtDate(lastPayment.createdAt)} · {fmt(lastPayment.amount)}
                  </span>
                </div>
              )}
            </div>

            {/* ── Notes ────────────────────────────────────────────── */}
            {data.notes && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                <p className="flex items-center gap-1.5 text-[10px] font-semibold text-amber-400 uppercase tracking-wide mb-1">
                  <StickyNote className="h-3 w-3" />
                  AR Notes
                </p>
                <p className="text-xs text-foreground/90 whitespace-pre-wrap">{data.notes}</p>
              </div>
            )}

            {/* ── Original sale items ──────────────────────────────── */}
            {data.items.length > 0 && (
              <div className="space-y-2">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  <ShoppingBag className="h-3.5 w-3.5" />
                  Original Sale ({data.items.length} {data.items.length === 1 ? "item" : "items"})
                </p>
                <div className="rounded-lg border border-border bg-muted/10 divide-y divide-border/40">
                  {data.items.map((it) => (
                    <div key={it.id} className="px-3 py-2 flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{it.productName}</p>
                        <p className="text-[10px] text-muted-foreground font-mono">
                          {it.quantity} × {fmt(it.unitPrice)}
                          {it.discountAmount && it.discountAmount > 0 ? ` · −${fmt(it.discountAmount)}` : ""}
                        </p>
                      </div>
                      <span className="font-mono text-sm font-semibold whitespace-nowrap">
                        {fmt(it.lineTotal)}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Order totals breakdown */}
                {data.order && (
                  <div className="rounded-lg border border-border/60 bg-muted/5 p-3 space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span className="font-mono">{fmt(data.order.subtotal)}</span>
                    </div>
                    {data.order.discountAmount != null && data.order.discountAmount > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Discount</span>
                        <span className="font-mono text-amber-400">−{fmt(data.order.discountAmount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Tax</span>
                      <span className="font-mono">{fmt(data.order.tax)}</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between font-semibold">
                      <span>Total</span>
                      <span className="font-mono">{fmt(data.order.total)}</span>
                    </div>
                    {(data.order.orderType || data.order.paymentMethod) && (
                      <div className="flex items-center gap-3 pt-1 text-[10px] text-muted-foreground">
                        {data.order.orderType && (
                          <span className="flex items-center gap-1 capitalize">
                            <MapPin className="h-3 w-3" />
                            {data.order.orderType}
                          </span>
                        )}
                        {data.order.paymentMethod && (
                          <span className="capitalize">· {data.order.paymentMethod}</span>
                        )}
                      </div>
                    )}
                    {data.order.orderNotes && (
                      <div className="pt-1.5 mt-1 border-t border-border/40 text-[11px] text-muted-foreground italic">
                        “{data.order.orderNotes}”
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── Payment history ─────────────────────────────────── */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  <FileText className="h-3.5 w-3.5" />
                  Payment History
                </p>
                {totalPayments > 0 && (
                  <span className="text-[10px] text-muted-foreground">
                    {totalPayments} {totalPayments === 1 ? "payment" : "payments"} · avg {fmt(avgPayment)}
                  </span>
                )}
              </div>

              {totalPayments === 0 ? (
                <div className="rounded-md bg-muted/10 border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                  No payments recorded yet
                </div>
              ) : (
                <div className="space-y-1.5">
                  {data.payments.map((p) => (
                    <div key={p.id} className="rounded-md bg-muted/20 px-3 py-2 space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <PaymentMethodIcon method={p.paymentMethod} />
                          <span className="text-xs font-medium capitalize">{p.paymentMethod}</span>
                          {p.staffName && (
                            <span className="text-[10px] text-muted-foreground">· {p.staffName}</span>
                          )}
                        </div>
                        <span className="font-mono font-semibold text-emerald-400 text-sm">
                          +{fmt(p.amount)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground/70">
                        <span>{fmtDateTime(p.createdAt)}</span>
                        <span className="font-mono">#{p.id}</span>
                      </div>
                      {p.notes && (
                        <p className="text-[11px] text-foreground/70 italic pt-0.5 border-t border-border/30">
                          {p.notes}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {balance > 0 && (
            <div className="pt-3 border-t border-border">
              <Button className="w-full" onClick={() => setShowPayment(true)}>
                <DollarSign className="h-4 w-4 mr-2" />
                Collect Payment ({fmt(balance)} due)
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
      {showPayment && <PaymentModal ar={data} onClose={() => setShowPayment(false)} />}
    </>
  );
}

export function AccountsReceivable() {
  const [filter, setFilter] = useState<"all" | "open" | "partial" | "paid">("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ["/api/ar"],
    queryFn: fetchAR,
    refetchInterval: 30_000,
  });

  const filtered = filter === "all" ? data : data.filter((r) => r.status === filter);

  const totalOutstanding = data
    .filter((r) => r.status !== "paid")
    .reduce((s, r) => s + (r.amount - r.amountPaid), 0);

  const openCount = data.filter((r) => r.status === "open").length;
  const partialCount = data.filter((r) => r.status === "partial").length;

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 border border-primary/20">
          <BookOpen className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-bold">Accounts Receivable</h1>
          <p className="text-xs text-muted-foreground">Track and collect credit sales</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">Total Outstanding</p>
          <p className="text-lg font-bold text-red-400 font-mono">{fmt(totalOutstanding)}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">Open</p>
          <p className="text-lg font-bold text-red-400">{openCount}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">Partial</p>
          <p className="text-lg font-bold text-amber-400">{partialCount}</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1.5">
        {(["all", "open", "partial", "paid"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-all ${filter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"}`}
          >
            {f === "all" ? `All (${data.length})` : `${f} (${data.filter((r) => r.status === f).length})`}
          </button>
        ))}
      </div>

      {/* AR list */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-20" />
          <p>No {filter === "all" ? "" : filter} accounts receivable</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((ar) => {
            const balance = ar.amount - ar.amountPaid;
            const { age, overdue } = ageInfo(ar.createdAt, ar.dueDate, ar.status);
            return (
              <button
                key={ar.id}
                onClick={() => setSelectedId(ar.id)}
                className="w-full flex items-center gap-3 rounded-lg border border-border bg-card hover:bg-secondary/30 transition-colors p-3 text-left"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 shrink-0">
                  <span className="text-xs font-bold text-primary">{ar.customerName.charAt(0).toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold truncate">{ar.customerName}</p>
                    <StatusBadge status={ar.status} />
                    {overdue !== null && (
                      <Badge className="bg-red-500/20 text-red-300 border-red-500/40 hover:bg-red-500/25 gap-1 text-[10px] py-0 h-4">
                        <AlertTriangle className="h-2.5 w-2.5" />
                        {overdue}d late
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    <span className="text-xs text-muted-foreground font-mono">{ar.orderNumber}</span>
                    {ar.phone && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Phone className="h-3 w-3" />{ar.phone}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {new Date(ar.createdAt).toLocaleDateString()}
                    {ar.status !== "paid" && <span> · {age}d outstanding</span>}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-mono font-bold text-sm text-foreground">{fmt(ar.amount)}</p>
                  {ar.status !== "paid" && (
                    <p className="font-mono text-xs text-red-400">owes {fmt(balance)}</p>
                  )}
                  {ar.status === "paid" && (
                    <p className="text-xs text-emerald-400 flex items-center gap-0.5"><CheckCircle className="h-3 w-3" /> Paid</p>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </button>
            );
          })}
        </div>
      )}

      {selectedId !== null && (
        <DetailModal arId={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}
