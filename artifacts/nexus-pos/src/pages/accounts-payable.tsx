import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  useApSummary, useListApEntries, useListApPayments, useApAgingReport,
  useListVendors, useRecordApPayment, useCancelApEntry, useCreateApEntry,
  useApSupplierLedger,
  type ApEntry, type Vendor,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Search, AlertTriangle, CheckCircle2, Clock, ChevronDown, ChevronUp,
  CreditCard, DollarSign, TrendingDown, ArrowDownLeft, FileText, BookOpen,
  Plus, BarChart3, Landmark, Users, Truck,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { Vendors } from "./vendors";

function fmtC(n: number | null | undefined) {
  return new Intl.NumberFormat("en-JM", { style: "currency", currency: "JMD", minimumFractionDigits: 2 }).format(n ?? 0);
}

function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  try { return format(parseISO(s), "dd/MM/yyyy"); } catch { return s; }
}

const STATUS_STYLES: Record<string, { badge: string; label: string }> = {
  pending:        { badge: "border-blue-500 text-blue-400",    label: "Pending" },
  partially_paid: { badge: "border-amber-500 text-amber-400",  label: "Partial" },
  paid:           { badge: "border-emerald-500 text-emerald-400", label: "Paid" },
  overdue:        { badge: "border-red-500 text-red-400",      label: "Overdue" },
  cancelled:      { badge: "border-zinc-500 text-zinc-400",    label: "Cancelled" },
};

/* ─── Payment dialog ─── */
function PaymentDialog({ entry, open, onOpenChange }: { entry: ApEntry | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { toast } = useToast();
  const recordPayment = useRecordApPayment();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<string>("cash");
  const [reference, setReference] = useState("");
  const [paymentDate, setPaymentDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [notes, setNotes] = useState("");

  const max = entry?.amountBalance ?? 0;

  async function handlePay() {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { toast({ title: "Enter a valid amount", variant: "destructive" }); return; }
    try {
      await recordPayment.mutateAsync({
        apEntryId: entry!.id,
        paymentDate,
        amount: amt,
        paymentMethod: method,
        reference: reference || undefined,
        notes: notes || undefined,
      });
      toast({ title: amt > max ? "Payment recorded (overpayment stored as credit)" : "Payment recorded" });
      onOpenChange(false);
      setAmount(""); setReference(""); setNotes("");
    } catch {
      toast({ title: "Failed to record payment", variant: "destructive" });
    }
  }

  if (!entry) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="rounded-lg bg-secondary/30 p-3 space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Invoice</span><span className="font-medium">{entry.invoiceRef || `AP-${entry.id}`}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Vendor</span><span>{entry.vendorName ?? "—"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Total</span><span>{fmtC(entry.amountTotal)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Paid</span><span className="text-emerald-400">{fmtC(entry.amountPaid)}</span></div>
            <Separator />
            <div className="flex justify-between font-semibold"><span>Balance</span><span className="text-primary">{fmtC(entry.amountBalance)}</span></div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Amount (JMD) <span className="text-destructive">*</span></Label>
              <Input
                type="number" step="0.01" min={0.01}
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder={String(max.toFixed(2))}
                className="bg-secondary/40"
              />
              {parseFloat(amount) > max && <p className="text-xs text-amber-400">Overpayment — excess stored as vendor credit</p>}
            </div>
            <div className="grid gap-1.5">
              <Label>Payment Date</Label>
              <Input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} className="bg-secondary/40" />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label>Payment Method</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger className="bg-secondary/40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="bank">Bank Transfer</SelectItem>
                <SelectItem value="cheque">Cheque</SelectItem>
                <SelectItem value="transfer">Wire Transfer</SelectItem>
                <SelectItem value="credit">Apply Credit</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label>Reference # {(method === "cheque" || method === "transfer") && <span className="text-destructive">*</span>}</Label>
            <Input value={reference} onChange={e => setReference(e.target.value)} placeholder="Cheque / transfer ref" className="bg-secondary/40" />
          </div>

          <div className="grid gap-1.5">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="bg-secondary/40" />
          </div>

          <Button onClick={() => setAmount(String(max.toFixed(2)))} variant="outline" size="sm" className="w-full">
            Pay Full Balance ({fmtC(max)})
          </Button>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handlePay} disabled={recordPayment.isPending}>Record Payment</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── AP Entry card ─── */
function ApEntryCard({ entry, onPay, onCancel }: { entry: ApEntry; onPay: () => void; onCancel: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const st = STATUS_STYLES[entry.status] ?? STATUS_STYLES.pending;
  const isOverdue = entry.status === "overdue";

  return (
    <Card className={cn("bg-secondary/30 border-border transition-colors", isOverdue && "border-red-500/40")}>
      <CardContent className="p-0">
        <div className="flex items-center gap-3 p-4 cursor-pointer select-none" onClick={() => setExpanded(p => !p)}>
          <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0", isOverdue ? "bg-red-500/15" : "bg-primary/10")}>
            <FileText className={cn("h-4 w-4", isOverdue ? "text-red-400" : "text-primary")} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm">{entry.invoiceRef || `AP-${entry.id}`}</span>
              <Badge variant="outline" className={cn("text-xs", st.badge)}>{st.label}</Badge>
              {isOverdue && entry.daysPastDue != null && (
                <Badge variant="outline" className="border-red-500/50 text-red-400 text-xs">
                  <AlertTriangle className="h-3 w-3 mr-1" />{entry.daysPastDue}d overdue
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
              <span>{entry.vendorName ?? "No vendor"}</span>
              <span>· Due {fmtDate(entry.dueDate)}</span>
              {entry.payments.length > 0 && <span>· {entry.payments.length} payment{entry.payments.length !== 1 ? "s" : ""}</span>}
            </div>
          </div>
          <div className="text-right shrink-0 space-y-0.5">
            <p className="font-bold text-sm">{fmtC(entry.amountBalance)}</p>
            <p className="text-xs text-muted-foreground">of {fmtC(entry.amountTotal)}</p>
          </div>
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
        </div>

        <AnimatePresence>
          {expanded && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
              <Separator />
              <div className="p-4">
                {/* Payment progress bar */}
                <div className="mb-3">
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>Payment progress</span>
                    <span>{entry.amountTotal > 0 ? ((entry.amountPaid / entry.amountTotal) * 100).toFixed(0) : 0}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-secondary overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all"
                      style={{ width: `${entry.amountTotal > 0 ? Math.min(100, (entry.amountPaid / entry.amountTotal) * 100) : 0}%` }}
                    />
                  </div>
                </div>

                {/* Payment history */}
                {entry.payments.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Payment History</p>
                    <Table>
                      <TableHeader>
                        <TableRow className="border-border hover:bg-transparent">
                          <TableHead className="text-xs">Date</TableHead>
                          <TableHead className="text-xs">Method</TableHead>
                          <TableHead className="text-xs">Reference</TableHead>
                          <TableHead className="text-xs text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {entry.payments.map(pay => (
                          <TableRow key={pay.id} className="border-border">
                            <TableCell className="text-xs">{fmtDate(pay.paymentDate)}</TableCell>
                            <TableCell className="text-xs capitalize">{pay.paymentMethod}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{pay.reference ?? "—"}</TableCell>
                            <TableCell className="text-xs text-right text-emerald-400 font-medium">{fmtC(pay.amount)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {entry.notes && <p className="text-xs text-muted-foreground italic mb-3">{entry.notes}</p>}

                <div className="flex justify-end gap-2">
                  {entry.status !== "paid" && entry.status !== "cancelled" && (
                    <>
                      <Button size="sm" variant="outline" className="text-destructive border-destructive/40 hover:bg-destructive/10" onClick={onCancel}>
                        Cancel Entry
                      </Button>
                      <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={onPay}>
                        <ArrowDownLeft className="h-3.5 w-3.5 mr-1" /> Record Payment
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}

/* ─── Overview Tab ─── */
function OverviewTab() {
  const { data: summary, isLoading } = useApSummary();
  const { data: entries = [] } = useListApEntries({ status: "overdue" });

  const summaryCards = [
    { label: "Total Payable",    value: summary?.totalPayable  ?? 0, icon: DollarSign,  color: "text-blue-400",   bg: "bg-blue-500/10" },
    { label: "Overdue",          value: summary?.totalOverdue  ?? 0, icon: AlertTriangle, color: "text-red-400",  bg: "bg-red-500/10" },
    { label: "Due in 7 Days",    value: summary?.dueSoonAmount ?? 0, icon: Clock,        color: "text-amber-400", bg: "bg-amber-500/10" },
    { label: "Paid (30 days)",   value: summary?.totalPaid30d  ?? 0, icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  ];

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {summaryCards.map(c => (
          <Card key={c.label} className="bg-secondary/30 border-border">
            <CardContent className="p-4">
              <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center mb-3", c.bg)}>
                <c.icon className={cn("h-4 w-4", c.color)} />
              </div>
              <p className="text-2xl font-bold tracking-tight">{fmtC(c.value)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{c.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {(summary?.availableCredits ?? 0) > 0 && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 flex items-center gap-2 text-sm text-emerald-400">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>You have <strong>{fmtC(summary?.availableCredits)}</strong> in vendor credits available to apply against future invoices.</span>
        </div>
      )}

      {(summary?.overdueCount ?? 0) > 0 && (
        <div>
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2 text-red-400">
            <AlertTriangle className="h-4 w-4" /> {summary?.overdueCount} Overdue Invoice{(summary?.overdueCount ?? 0) !== 1 ? "s" : ""}
          </h3>
          <div className="space-y-2">
            {entries.slice(0, 5).map(e => (
              <div key={e.id} className="flex items-center justify-between p-3 rounded-lg bg-red-500/5 border border-red-500/20 text-sm">
                <div>
                  <p className="font-medium">{e.invoiceRef || `AP-${e.id}`}</p>
                  <p className="text-xs text-muted-foreground">{e.vendorName ?? "No vendor"} · {e.daysPastDue}d overdue</p>
                </div>
                <p className="font-bold text-red-400">{fmtC(e.amountBalance)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {(summary?.dueSoonCount ?? 0) > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 flex items-center gap-2 text-sm text-amber-400">
          <Clock className="h-4 w-4 shrink-0" />
          <span><strong>{summary?.dueSoonCount}</strong> invoice{(summary?.dueSoonCount ?? 0) !== 1 ? "s" : ""} totalling <strong>{fmtC(summary?.dueSoonAmount)}</strong> due in the next 7 days.</span>
        </div>
      )}
    </div>
  );
}

/* ─── Payables Tab ─── */
function PayablesTab() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [payEntry, setPayEntry] = useState<ApEntry | null>(null);
  const [cancelId, setCancelId] = useState<number | null>(null);
  const cancelEntry = useCancelApEntry();
  const { toast } = useToast();

  const { data: entries = [], isLoading } = useListApEntries({ status: statusFilter !== "all" ? statusFilter : undefined });

  const filtered = useMemo(() =>
    entries.filter(e =>
      (e.invoiceRef || `AP-${e.id}`).toLowerCase().includes(search.toLowerCase()) ||
      (e.vendorName || "").toLowerCase().includes(search.toLowerCase())
    ), [entries, search]);

  async function handleCancel() {
    if (!cancelId) return;
    try {
      await cancelEntry.mutateAsync(cancelId);
      toast({ title: "Entry cancelled" });
    } catch (e: any) {
      toast({ title: e?.message || "Failed to cancel", variant: "destructive" });
    }
    setCancelId(null);
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="shrink-0 flex flex-wrap gap-3 items-center px-4 sm:px-6 py-4 border-b border-border">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search invoices…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9 bg-secondary/40" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 w-40 bg-secondary/40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="partially_paid">Partial</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-3">
        {isLoading ? (
          <div className="text-center text-muted-foreground py-20 text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
            <FileText className="h-12 w-12 opacity-20" />
            <p className="text-sm">No payable entries found.</p>
          </div>
        ) : (
          filtered.map(e => (
            <ApEntryCard key={e.id} entry={e} onPay={() => setPayEntry(e)} onCancel={() => setCancelId(e.id)} />
          ))
        )}
      </div>

      <PaymentDialog entry={payEntry} open={!!payEntry} onOpenChange={o => !o && setPayEntry(null)} />

      <AlertDialog open={!!cancelId} onOpenChange={o => !o && setCancelId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel AP Entry?</AlertDialogTitle>
            <AlertDialogDescription>This entry will be marked cancelled. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancel} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Cancel Entry</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ─── Payments Tab ─── */
function PaymentsTab() {
  const { data: payments = [], isLoading } = useListApPayments();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() =>
    payments.filter(p =>
      (p.vendorName || "").toLowerCase().includes(search.toLowerCase()) ||
      (p.reference || "").toLowerCase().includes(search.toLowerCase()) ||
      p.paymentMethod.toLowerCase().includes(search.toLowerCase())
    ), [payments, search]);

  const total30d = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    return payments.filter(p => new Date(p.paymentDate) >= cutoff).reduce((s, p) => s + p.amount, 0);
  }, [payments]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="shrink-0 flex items-center gap-3 px-4 sm:px-6 py-4 border-b border-border">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search payments…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9 bg-secondary/40" />
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-muted-foreground">Last 30 days</p>
          <p className="font-bold text-emerald-400">{fmtC(total30d)}</p>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-4 sm:px-6 py-4">
        {isLoading ? (
          <div className="text-center text-muted-foreground py-20 text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-2 text-muted-foreground">
            <CreditCard className="h-12 w-12 opacity-20" />
            <p className="text-sm">No payments recorded yet.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-border">
                <TableHead>Date</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(p => (
                <TableRow key={p.id} className="border-border">
                  <TableCell className="text-sm">{fmtDate(p.paymentDate)}</TableCell>
                  <TableCell className="text-sm">{p.vendorName ?? "—"}</TableCell>
                  <TableCell><Badge variant="outline" className="text-xs capitalize">{p.paymentMethod}</Badge></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{p.reference ?? "—"}</TableCell>
                  <TableCell className="text-sm text-right font-bold text-emerald-400">{fmtC(p.amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

/* ─── Reports Tab ─── */
function ReportsTab() {
  const { data: aging, isLoading: agingLoading } = useApAgingReport();
  const { data: vendors = [] } = useListVendors();
  const [selectedVendorId, setSelectedVendorId] = useState<number | null>(null);
  const { data: ledger, isLoading: ledgerLoading } = useApSupplierLedger(selectedVendorId ?? 0);

  const totalAging = aging ? [
    aging.buckets.current,
    aging.buckets.days1_30,
    aging.buckets.days31_60,
    aging.buckets.days61_90,
    aging.buckets.over90,
  ].reduce((s, v) => s + v, 0) : 0;

  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-6">
      {/* Aging Report */}
      <Card className="bg-secondary/30 border-border">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <BarChart3 className="h-4 w-4 text-amber-400" /> Payables Aging Report
          </CardTitle>
        </CardHeader>
        <CardContent>
          {agingLoading ? (
            <div className="text-center text-muted-foreground py-8 text-sm">Loading…</div>
          ) : (
            <>
              {/* Summary buckets */}
              <div className="grid grid-cols-5 gap-2 mb-4">
                {[
                  { label: "Current", value: aging?.buckets.current ?? 0, color: "bg-blue-500" },
                  { label: "1–30 days", value: aging?.buckets.days1_30 ?? 0, color: "bg-amber-500" },
                  { label: "31–60 days", value: aging?.buckets.days31_60 ?? 0, color: "bg-orange-500" },
                  { label: "61–90 days", value: aging?.buckets.days61_90 ?? 0, color: "bg-red-500" },
                  { label: "90+ days", value: aging?.buckets.over90 ?? 0, color: "bg-red-800" },
                ].map(b => (
                  <div key={b.label} className="text-center">
                    <div className="h-1.5 rounded-full bg-secondary mb-2 overflow-hidden">
                      <div
                        className={cn("h-full rounded-full", b.color)}
                        style={{ width: totalAging > 0 ? `${(b.value / totalAging) * 100}%` : "0%" }}
                      />
                    </div>
                    <p className="text-xs font-bold">{fmtC(b.value)}</p>
                    <p className="text-xs text-muted-foreground">{b.label}</p>
                  </div>
                ))}
              </div>

              {/* Per-vendor breakdown */}
              {(aging?.vendors ?? []).length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow className="border-border">
                      <TableHead className="text-xs">Vendor</TableHead>
                      <TableHead className="text-xs text-right">Current</TableHead>
                      <TableHead className="text-xs text-right">1–30d</TableHead>
                      <TableHead className="text-xs text-right">31–60d</TableHead>
                      <TableHead className="text-xs text-right">61–90d</TableHead>
                      <TableHead className="text-xs text-right">90+d</TableHead>
                      <TableHead className="text-xs text-right font-bold">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {aging?.vendors.map((v, i) => (
                      <TableRow key={i} className="border-border">
                        <TableCell className="text-sm font-medium">{v.vendorName ?? "Unknown"}</TableCell>
                        <TableCell className="text-xs text-right">{fmtC(v.current)}</TableCell>
                        <TableCell className={cn("text-xs text-right", v.days1_30 > 0 && "text-amber-400")}>{fmtC(v.days1_30)}</TableCell>
                        <TableCell className={cn("text-xs text-right", v.days31_60 > 0 && "text-orange-400")}>{fmtC(v.days31_60)}</TableCell>
                        <TableCell className={cn("text-xs text-right", v.days61_90 > 0 && "text-red-400")}>{fmtC(v.days61_90)}</TableCell>
                        <TableCell className={cn("text-xs text-right", v.over90 > 0 && "text-red-600 font-bold")}>{fmtC(v.over90)}</TableCell>
                        <TableCell className="text-xs text-right font-bold">{fmtC(v.total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Supplier Ledger */}
      <Card className="bg-secondary/30 border-border">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <BookOpen className="h-4 w-4 text-violet-400" /> Supplier Ledger
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Select value={selectedVendorId ? String(selectedVendorId) : ""} onValueChange={v => setSelectedVendorId(parseInt(v))}>
            <SelectTrigger className="bg-secondary/40"><SelectValue placeholder="Select a vendor…" /></SelectTrigger>
            <SelectContent>
              {vendors.map(v => <SelectItem key={v.id} value={String(v.id)}>{v.name}</SelectItem>)}
            </SelectContent>
          </Select>

          {selectedVendorId && (
            ledgerLoading ? (
              <div className="text-center text-muted-foreground py-8 text-sm">Loading ledger…</div>
            ) : ledger ? (
              <div className="space-y-4">
                {/* Summary */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: "Total Purchased", value: ledger.summary.totalPurchased, color: "text-foreground" },
                    { label: "Total Paid",       value: ledger.summary.totalPaid,      color: "text-emerald-400" },
                    { label: "Balance Owed",     value: ledger.summary.totalBalance,   color: "text-red-400" },
                    { label: "Credits",          value: ledger.summary.totalCredits,   color: "text-blue-400" },
                  ].map(s => (
                    <div key={s.label} className="rounded-lg bg-secondary/40 p-3">
                      <p className={cn("font-bold", s.color)}>{fmtC(s.value)}</p>
                      <p className="text-xs text-muted-foreground">{s.label}</p>
                    </div>
                  ))}
                </div>

                {/* Entries */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Invoices</p>
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border">
                        <TableHead className="text-xs">Date</TableHead>
                        <TableHead className="text-xs">Invoice</TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                        <TableHead className="text-xs text-right">Total</TableHead>
                        <TableHead className="text-xs text-right">Paid</TableHead>
                        <TableHead className="text-xs text-right">Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ledger.entries.map(e => {
                        const st = STATUS_STYLES[e.status] ?? STATUS_STYLES.pending;
                        return (
                          <TableRow key={e.id} className="border-border">
                            <TableCell className="text-xs">{fmtDate(e.entryDate)}</TableCell>
                            <TableCell className="text-xs font-medium">{e.invoiceRef || `AP-${e.id}`}</TableCell>
                            <TableCell><Badge variant="outline" className={cn("text-xs", st.badge)}>{st.label}</Badge></TableCell>
                            <TableCell className="text-xs text-right">{fmtC(e.amountTotal)}</TableCell>
                            <TableCell className="text-xs text-right text-emerald-400">{fmtC(e.amountPaid)}</TableCell>
                            <TableCell className={cn("text-xs text-right font-bold", e.amountBalance > 0 ? "text-red-400" : "text-muted-foreground")}>{fmtC(e.amountBalance)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : null
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ─── Main Page ─── */
type Tab = "overview" | "payables" | "payments" | "reports" | "vendors";

const TABS: { id: Tab; label: string; icon: React.ElementType; color: string }[] = [
  { id: "overview",  label: "Overview",  icon: Landmark,      color: "text-blue-400" },
  { id: "payables",  label: "Payables",  icon: FileText,      color: "text-red-400" },
  { id: "payments",  label: "Payments",  icon: CreditCard,    color: "text-emerald-400" },
  { id: "vendors",   label: "Vendors",   icon: Truck,         color: "text-sky-400" },
  { id: "reports",   label: "Reports",   icon: BarChart3,     color: "text-amber-400" },
];

export function AccountsPayable() {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const { data: summary } = useApSummary();

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="shrink-0 flex items-center gap-1 px-4 sm:px-6 pt-4 border-b border-border pb-0">
        <div className="flex items-center gap-1 -mb-px flex-wrap">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium rounded-t-md border-b-2 transition-all relative",
                  active ? "border-primary text-foreground bg-primary/5" : "border-transparent text-muted-foreground hover:text-foreground hover:bg-secondary/40"
                )}
              >
                <Icon className={cn("h-4 w-4", active ? tab.color : "text-muted-foreground")} />
                {tab.label}
                {tab.id === "payables" && (summary?.overdueCount ?? 0) > 0 && (
                  <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-white text-xs flex items-center justify-center font-bold">
                    {summary?.overdueCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "overview"  && <div className="h-full overflow-y-auto"><OverviewTab /></div>}
        {activeTab === "payables"  && <PayablesTab />}
        {activeTab === "payments"  && <PaymentsTab />}
        {activeTab === "vendors"   && <div className="h-full overflow-y-auto p-4 sm:p-6"><Vendors /></div>}
        {activeTab === "reports"   && <div className="h-full overflow-y-auto"><ReportsTab /></div>}
      </div>
    </div>
  );
}
