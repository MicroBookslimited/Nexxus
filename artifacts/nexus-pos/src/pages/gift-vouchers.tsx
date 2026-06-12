import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListGiftVouchers,
  useCreateGiftVoucher,
  useGetGiftVoucher,
  useGetGiftVoucherReports,
  useListCustomers,
  useGetSettings,
  getListGiftVouchersQueryKey,
  getGetGiftVoucherQueryKey,
} from "@workspace/api-client-react";
import type {
  GiftVoucher,
  CreateGiftVoucherBody,
  CreateGiftVoucherBodyPaymentMethod,
} from "@workspace/api-client-react";
import { useStaff } from "@/contexts/StaffContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { printVoucher } from "@/lib/voucher-doc";
import { Ticket, Search, Printer, Plus, Eye, Copy, Gift } from "lucide-react";

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

/** A <input type="date"> yields "YYYY-MM-DD". new Date(str) parses that as
 *  midnight UTC, which is the previous evening in negative-offset zones (e.g.
 *  UTC-5), making a voucher read as expired a day early. Anchor to end-of-day
 *  in the browser's local timezone so "expires Dec 31" stays valid all of the
 *  31st locally. */
function endOfDayIso(dateStr: string): string | null {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 23, 59, 59, 999).toISOString();
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

type DisplayStatus = "active" | "partially_redeemed" | "redeemed" | "expired" | "cancelled";

/** Vouchers stored "active"/"partially_redeemed" but past expiry show as expired. */
function displayStatus(v: GiftVoucher): DisplayStatus {
  if ((v.status === "active" || v.status === "partially_redeemed") && v.expiryDate) {
    const exp = new Date(v.expiryDate).getTime();
    if (!Number.isNaN(exp) && exp < Date.now()) return "expired";
  }
  return v.status as DisplayStatus;
}

const STATUS_STYLES: Record<DisplayStatus, string> = {
  active: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  partially_redeemed: "bg-sky-500/15 text-sky-600 border-sky-500/30",
  redeemed: "bg-slate-500/15 text-slate-500 border-slate-500/30",
  expired: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  cancelled: "bg-rose-500/15 text-rose-600 border-rose-500/30",
};

const STATUS_LABEL: Record<DisplayStatus, string> = {
  active: "Active",
  partially_redeemed: "Partial",
  redeemed: "Redeemed",
  expired: "Expired",
  cancelled: "Cancelled",
};

const PAYMENT_METHODS: { value: CreateGiftVoucherBodyPaymentMethod; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "other", label: "Other" },
];

const EMPTY_FORM = {
  value: "",
  paymentMethod: "cash" as CreateGiftVoucherBodyPaymentMethod,
  customerId: "",
  customerName: "",
  customerPhone: "",
  customerEmail: "",
  expiryDate: "",
  notes: "",
  code: "",
};

export default function GiftVouchersPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { staff } = useStaff();

  const { data: vouchers, isLoading } = useListGiftVouchers();
  const { data: customers } = useListCustomers();
  const { data: settings } = useGetSettings();
  const { data: reports } = useGetGiftVoucherReports();
  const createVoucher = useCreateGiftVoucher();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | DisplayStatus>("all");
  const [issueOpen, setIssueOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [justIssued, setJustIssued] = useState<GiftVoucher | null>(null);
  const [viewingId, setViewingId] = useState<number | null>(null);

  const currency = settings?.base_currency || "JMD";

  const { data: viewing } = useGetGiftVoucher(viewingId ?? 0, {
    query: {
      enabled: !!viewingId,
      queryKey: getGetGiftVoucherQueryKey(viewingId ?? 0),
    },
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListGiftVouchersQueryKey() });

  const filtered = useMemo(() => {
    const list = vouchers ?? [];
    const q = search.trim().toLowerCase();
    return list.filter((v) => {
      if (statusFilter !== "all" && displayStatus(v) !== statusFilter) return false;
      if (!q) return true;
      return (
        v.code.toLowerCase().includes(q) ||
        (v.customerName ?? "").toLowerCase().includes(q) ||
        (v.customerPhone ?? "").toLowerCase().includes(q)
      );
    });
  }, [vouchers, search, statusFilter]);

  const settingsForDoc = settings ?? {};

  const handlePrint = (v: GiftVoucher) =>
    printVoucher(
      {
        code: v.code,
        originalValue: v.originalValue,
        balance: v.balance,
        status: v.status,
        expiryDate: v.expiryDate,
        createdAt: v.createdAt,
        customerName: v.customerName,
        customerPhone: v.customerPhone,
        notes: v.notes,
      },
      settingsForDoc,
    );

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast({ title: "Code copied", description: code });
    } catch {
      toast({ title: "Could not copy", variant: "destructive" });
    }
  };

  const submit = () => {
    const value = parseFloat(form.value);
    if (!(value > 0)) {
      toast({ title: "Enter a voucher value greater than zero", variant: "destructive" });
      return;
    }
    const chosen = form.customerId
      ? customers?.find((c) => c.id === Number(form.customerId))
      : null;

    const data: CreateGiftVoucherBody = {
      originalValue: value,
      paymentMethod: form.paymentMethod,
      ...(form.customerId ? { customerId: Number(form.customerId) } : {}),
      customerName: (chosen?.name ?? form.customerName.trim()) || undefined,
      customerPhone: (chosen?.phone ?? form.customerPhone.trim()) || undefined,
      customerEmail: (chosen?.email ?? form.customerEmail.trim()) || undefined,
      expiryDate: form.expiryDate ? endOfDayIso(form.expiryDate) : null,
      notes: form.notes.trim() || undefined,
      code: form.code.trim() ? form.code.trim() : undefined,
      ...(staff?.id ? { staffId: staff.id } : {}),
    };

    createVoucher.mutate(
      { data },
      {
        onSuccess: (created) => {
          toast({ title: "Gift voucher issued", description: created.code });
          invalidate();
          setIssueOpen(false);
          setForm({ ...EMPTY_FORM });
          setJustIssued(created);
        },
        onError: (e: unknown) => {
          const msg =
            (e as { response?: { data?: { error?: string } } })?.response?.data?.error ??
            "Could not issue voucher";
          toast({ title: msg, variant: "destructive" });
        },
      },
    );
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-fuchsia-500/15 text-fuchsia-500">
          <Ticket className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Gift Vouchers</h1>
          <p className="text-sm text-muted-foreground">
            Issue prepaid store credit. No tax is charged on a voucher — tax applies when it's
            redeemed.
          </p>
        </div>
        <Button onClick={() => setIssueOpen(true)} className="gap-1.5" data-testid="button-issue-voucher">
          <Plus className="h-4 w-4" />
          Issue Voucher
        </Button>
      </div>

      {/* Liability snapshot — outstanding voucher balances are a store liability
          (money owed in future goods), tracked here instead of via auto journal
          entries. */}
      {reports && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Outstanding liability</p>
              <p className="text-2xl font-bold tabular-nums mt-1">
                {formatCurrency(reports.liability.outstandingBalance, currency)}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {reports.liability.outstandingCount} active voucher
                {reports.liability.outstandingCount === 1 ? "" : "s"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Total issued</p>
              <p className="text-2xl font-bold tabular-nums mt-1">
                {formatCurrency(reports.liability.issuedTotal, currency)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Total redeemed</p>
              <p className="text-2xl font-bold tabular-nums mt-1">
                {formatCurrency(reports.liability.redeemedTotal, currency)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Redemption rate</p>
              <p className="text-2xl font-bold tabular-nums mt-1">
                {reports.liability.issuedTotal > 0
                  ? `${Math.round((reports.liability.redeemedTotal / reports.liability.issuedTotal) * 100)}%`
                  : "—"}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {reports && reports.byCashier.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="px-4 py-3 border-b">
              <h2 className="text-sm font-semibold">By cashier</h2>
              <p className="text-xs text-muted-foreground">Vouchers issued and redeemed per staff member.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b">
                    <th className="px-4 py-2 font-medium">Cashier</th>
                    <th className="px-4 py-2 font-medium text-right">Issued</th>
                    <th className="px-4 py-2 font-medium text-right">Issued value</th>
                    <th className="px-4 py-2 font-medium text-right">Redeemed</th>
                    <th className="px-4 py-2 font-medium text-right">Redeemed value</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.byCashier.map((row, i) => (
                    <tr key={`${row.staffName}-${i}`} className="border-b last:border-0">
                      <td className="px-4 py-2 font-medium">{row.staffName}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{row.issuedCount}</td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {formatCurrency(row.issuedTotal, currency)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">{row.redeemedCount}</td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {formatCurrency(row.redeemedTotal, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by code, customer name or phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-vouchers"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {(["all", "active", "partially_redeemed", "redeemed", "expired", "cancelled"] as const).map(
            (s) => (
              <Button
                key={s}
                size="sm"
                variant={statusFilter === s ? "default" : "outline"}
                onClick={() => setStatusFilter(s)}
              >
                {s === "all" ? "All" : STATUS_LABEL[s]}
              </Button>
            ),
          )}
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground py-12 text-center">Loading vouchers…</p>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Gift className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">No gift vouchers found</p>
            <p className="text-sm">Issue one with the button above.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((v) => {
            const st = displayStatus(v);
            const redeemed = v.originalValue - v.balance;
            return (
              <Card key={v.id} className="overflow-hidden" data-testid={`card-voucher-${v.id}`}>
                <CardContent className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-bold tracking-wide">{v.code}</span>
                      <Badge variant="outline" className={`${STATUS_STYLES[st]}`}>
                        {STATUS_LABEL[st]}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground mt-0.5">
                      {v.customerName ? `${v.customerName} · ` : ""}
                      Issued {fmtDate(v.createdAt)}
                      {v.expiryDate ? ` · Expires ${fmtDate(v.expiryDate)}` : ""}
                      {redeemed > 0 ? ` · Redeemed ${formatCurrency(redeemed, currency)}` : ""}
                    </div>
                  </div>
                  <div className="sm:text-right">
                    <div className="text-lg font-bold tabular-nums">
                      {formatCurrency(v.balance, currency)}
                    </div>
                    {v.balance !== v.originalValue && (
                      <div className="text-xs text-muted-foreground">
                        of {formatCurrency(v.originalValue, currency)}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => copyCode(v.code)}
                      title="Copy code"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setViewingId(v.id)}
                      title="View history"
                      data-testid={`button-view-voucher-${v.id}`}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handlePrint(v)}
                      title="Print"
                    >
                      <Printer className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Issue dialog */}
      <Dialog open={issueOpen} onOpenChange={(o) => !o && setIssueOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Issue Gift Voucher</DialogTitle>
            <DialogDescription>
              Prepaid store credit. No tax is charged now — tax applies when it's redeemed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Value *</label>
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={form.value}
                onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
                data-testid="input-voucher-value"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Payment method *</label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.paymentMethod}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    paymentMethod: e.target.value as CreateGiftVoucherBodyPaymentMethod,
                  }))
                }
                data-testid="select-voucher-payment"
              >
                {PAYMENT_METHODS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Recipient (optional)</label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.customerId}
                onChange={(e) => setForm((f) => ({ ...f, customerId: e.target.value }))}
                data-testid="select-voucher-customer"
              >
                <option value="">Walk-in / unassigned</option>
                {customers?.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name}
                    {c.phone ? ` · ${c.phone}` : ""}
                  </option>
                ))}
              </select>
            </div>
            {!form.customerId && (
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="Recipient name"
                  value={form.customerName}
                  onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))}
                />
                <Input
                  placeholder="Phone"
                  value={form.customerPhone}
                  onChange={(e) => setForm((f) => ({ ...f, customerPhone: e.target.value }))}
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-sm font-medium">Expiry (optional)</label>
                <Input
                  type="date"
                  value={form.expiryDate}
                  onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))}
                  data-testid="input-voucher-expiry"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Custom code (optional)</label>
                <Input
                  placeholder="Auto-generated"
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                  data-testid="input-voucher-code"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Notes (optional)</label>
              <Input
                placeholder="e.g. Birthday gift"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIssueOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={createVoucher.isPending} data-testid="button-submit-voucher">
              {createVoucher.isPending ? "Issuing…" : "Issue Voucher"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Just-issued confirmation with print */}
      <Dialog open={!!justIssued} onOpenChange={(o) => !o && setJustIssued(null)}>
        <DialogContent className="max-w-sm">
          {justIssued && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Gift className="h-5 w-5 text-fuchsia-500" />
                  Voucher issued
                </DialogTitle>
                <DialogDescription>Hand the printed voucher to the customer.</DialogDescription>
              </DialogHeader>
              <div className="text-center py-2">
                <div className="text-3xl font-bold text-fuchsia-600">
                  {formatCurrency(justIssued.originalValue, currency)}
                </div>
                <div className="font-mono text-lg font-bold tracking-widest mt-2">
                  {justIssued.code}
                </div>
              </div>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => copyCode(justIssued.code)} className="gap-1.5">
                  <Copy className="h-4 w-4" />
                  Copy
                </Button>
                <Button onClick={() => handlePrint(justIssued)} className="gap-1.5">
                  <Printer className="h-4 w-4" />
                  Print
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* History dialog */}
      <Dialog open={!!viewingId} onOpenChange={(o) => !o && setViewingId(null)}>
        <DialogContent className="max-w-lg">
          {viewing && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span className="font-mono tracking-wide">{viewing.code}</span>
                  <Badge variant="outline" className={`${STATUS_STYLES[displayStatus(viewing)]}`}>
                    {STATUS_LABEL[displayStatus(viewing)]}
                  </Badge>
                </DialogTitle>
                <DialogDescription>
                  {viewing.customerName ? `${viewing.customerName} · ` : ""}
                  Balance {formatCurrency(viewing.balance, currency)} of{" "}
                  {formatCurrency(viewing.originalValue, currency)}
                  {viewing.expiryDate ? ` · Expires ${fmtDate(viewing.expiryDate)}` : ""}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-1 max-h-80 overflow-y-auto">
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                  Transaction history
                </div>
                {(viewing.transactions ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No transactions.</p>
                ) : (
                  (viewing.transactions ?? []).map((t) => (
                    <div
                      key={t.id}
                      className="flex justify-between items-center text-sm py-2 border-b last:border-0"
                    >
                      <div>
                        <div className="font-medium capitalize">{t.action}</div>
                        <div className="text-xs text-muted-foreground">
                          {fmtDate(t.createdAt)}
                          {t.staffName ? ` · ${t.staffName}` : ""}
                          {t.notes ? ` · ${t.notes}` : ""}
                        </div>
                      </div>
                      <div className="text-right tabular-nums">
                        <div className={t.action === "issue" ? "text-emerald-600" : ""}>
                          {t.action === "redeem" ? "-" : "+"}
                          {formatCurrency(Math.abs(t.amount), currency)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          → {formatCurrency(t.balanceAfter, currency)}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => handlePrint(viewing)} className="gap-1.5">
                  <Printer className="h-4 w-4" />
                  Print
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
