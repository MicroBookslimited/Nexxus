import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Users, DollarSign, Clock, CheckCircle, AlertCircle, ChevronRight, X, Receipt, Phone } from "lucide-react";
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

type ArDetail = ArRecord & { payments: ArPayment[] };

function fmt(n: number) {
  return `$${Math.abs(n).toFixed(2)}`;
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

  return (
    <>
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              {data.customerName}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-4 text-sm pr-1">
            {/* Summary */}
            <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-1.5">
              <div className="flex justify-between"><span className="text-muted-foreground">Order</span><span className="font-mono">{data.orderNumber}</span></div>
              {data.phone && (
                <div className="flex justify-between"><span className="text-muted-foreground">Phone</span><span className="font-mono">{data.phone}</span></div>
              )}
              <div className="flex justify-between"><span className="text-muted-foreground">Status</span><StatusBadge status={data.status} /></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Invoiced</span><span className="font-mono">{fmt(data.amount)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Collected</span><span className="font-mono text-emerald-400">{fmt(data.amountPaid)}</span></div>
              <Separator />
              <div className="flex justify-between font-bold text-base">
                <span>Balance Due</span>
                <span className={`font-mono ${balance > 0 ? "text-red-400" : "text-emerald-400"}`}>{fmt(balance)}</span>
              </div>
            </div>

            {/* Payment history */}
            {data.payments.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Payment History</p>
                {data.payments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between rounded-md bg-muted/20 px-3 py-2">
                    <div>
                      <span className="text-xs capitalize text-muted-foreground">{p.paymentMethod}</span>
                      {p.staffName && <span className="text-xs text-muted-foreground ml-1">· {p.staffName}</span>}
                      <div className="text-[10px] text-muted-foreground/60">{new Date(p.createdAt).toLocaleDateString()}</div>
                    </div>
                    <span className="font-mono font-semibold text-emerald-400">+{fmt(p.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {balance > 0 && (
            <div className="pt-3 border-t border-border">
              <Button className="w-full" onClick={() => setShowPayment(true)}>
                <DollarSign className="h-4 w-4 mr-2" />
                Collect Payment
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
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold truncate">{ar.customerName}</p>
                    <StatusBadge status={ar.status} />
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs text-muted-foreground font-mono">{ar.orderNumber}</span>
                    {ar.phone && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Phone className="h-3 w-3" />{ar.phone}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground">{new Date(ar.createdAt).toLocaleDateString()}</p>
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
