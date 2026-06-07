import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListQuotations,
  useUpdateQuotation,
  useDeleteQuotation,
  useListCustomers,
  useGetSettings,
  getListQuotationsQueryKey,
} from "@workspace/api-client-react";
import type { Quotation } from "@workspace/api-client-react";
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
import { printQuotation } from "@/lib/quotation-doc";
import {
  FileText,
  Search,
  Printer,
  ShoppingCart,
  Ban,
  Trash2,
  Eye,
} from "lucide-react";

/** Key used to hand a quotation from this page to the POS cart loader. */
const PENDING_QUOTE_KEY = "nexxus_pending_quote";

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

type DisplayStatus = "active" | "converted" | "expired" | "cancelled";

/** Quotes stored "active" but past their expiry are shown as expired. */
function displayStatus(q: Quotation): DisplayStatus {
  if (q.status === "active" && q.expiryDate) {
    const exp = new Date(q.expiryDate).getTime();
    if (!Number.isNaN(exp) && exp < Date.now()) return "expired";
  }
  return q.status as DisplayStatus;
}

const STATUS_STYLES: Record<DisplayStatus, string> = {
  active: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  converted: "bg-sky-500/15 text-sky-600 border-sky-500/30",
  expired: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  cancelled: "bg-rose-500/15 text-rose-600 border-rose-500/30",
};

export default function QuotationsPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: quotations, isLoading } = useListQuotations();
  const { data: customers } = useListCustomers();
  const { data: settings } = useGetSettings();
  const updateQuotation = useUpdateQuotation();
  const deleteQuotation = useDeleteQuotation();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | DisplayStatus>("all");
  const [viewing, setViewing] = useState<Quotation | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Quotation | null>(null);

  const currency = settings?.base_currency || "JMD";

  const customerName = (id: number | null | undefined): string => {
    if (!id) return "Walk-in";
    return customers?.find((c) => c.id === id)?.name ?? `Customer #${id}`;
  };

  const filtered = useMemo(() => {
    const list = quotations ?? [];
    const q = search.trim().toLowerCase();
    return list.filter((quote) => {
      if (statusFilter !== "all" && displayStatus(quote) !== statusFilter) return false;
      if (!q) return true;
      return (
        quote.quoteNumber.toLowerCase().includes(q) ||
        customerName(quote.customerId).toLowerCase().includes(q)
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quotations, search, statusFilter, customers]);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListQuotationsQueryKey() });

  const handleLoadIntoPos = (quote: Quotation) => {
    sessionStorage.setItem(
      PENDING_QUOTE_KEY,
      JSON.stringify({
        id: quote.id,
        quoteNumber: quote.quoteNumber,
        items: quote.items,
        discountAmount: quote.discountAmount ?? 0,
        notes: quote.notes ?? "",
        customerId: quote.customerId ?? null,
      }),
    );
    setLocation("/pos");
  };

  const handlePrint = (quote: Quotation) => {
    printQuotation(
      quote,
      settings ?? {},
      quote.customerId
        ? (() => {
            const c = customers?.find((x) => x.id === quote.customerId);
            return c
              ? { name: c.name, phone: c.phone, email: c.email, address: c.address }
              : null;
          })()
        : null,
    );
  };

  const handleCancel = (quote: Quotation) => {
    updateQuotation.mutate(
      { id: quote.id, data: { status: "cancelled" } },
      {
        onSuccess: () => {
          toast({ title: "Quotation cancelled" });
          invalidate();
        },
        onError: () => toast({ title: "Could not cancel quotation", variant: "destructive" }),
      },
    );
  };

  const handleDelete = () => {
    if (!confirmDelete) return;
    deleteQuotation.mutate(
      { id: confirmDelete.id },
      {
        onSuccess: () => {
          toast({ title: "Quotation deleted" });
          setConfirmDelete(null);
          invalidate();
        },
        onError: () => toast({ title: "Could not delete quotation", variant: "destructive" }),
      },
    );
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-500/15 text-teal-500">
          <FileText className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Quotations</h1>
          <p className="text-sm text-muted-foreground">
            Saved quotes — load one into the POS to convert it to a sale.
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by quote number or customer…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {(["all", "active", "converted", "expired", "cancelled"] as const).map((s) => (
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
        <p className="text-sm text-muted-foreground py-12 text-center">Loading quotations…</p>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <FileText className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">No quotations found</p>
            <p className="text-sm">Create one from the Hardware POS with “Save as Quote”.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((quote) => {
            const st = displayStatus(quote);
            const canLoad = st === "active";
            return (
              <Card key={quote.id} className="overflow-hidden">
                <CardContent className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-bold">{quote.quoteNumber}</span>
                      <Badge variant="outline" className={`capitalize ${STATUS_STYLES[st]}`}>
                        {st}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground mt-0.5">
                      {customerName(quote.customerId)} · {quote.items.length} item
                      {quote.items.length === 1 ? "" : "s"} · Created {fmtDate(quote.createdAt)}
                      {quote.expiryDate ? ` · Valid until ${fmtDate(quote.expiryDate)}` : ""}
                    </div>
                  </div>
                  <div className="text-lg font-bold tabular-nums sm:text-right">
                    {formatCurrency(quote.total, currency)}
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Button size="sm" variant="ghost" onClick={() => setViewing(quote)} title="View">
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handlePrint(quote)} title="Print">
                      <Printer className="h-4 w-4" />
                    </Button>
                    {canLoad && (
                      <Button
                        size="sm"
                        onClick={() => handleLoadIntoPos(quote)}
                        className="gap-1.5"
                        title="Load into POS"
                      >
                        <ShoppingCart className="h-4 w-4" />
                        Load
                      </Button>
                    )}
                    {st === "active" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleCancel(quote)}
                        title="Cancel"
                        className="text-rose-500 hover:text-rose-600"
                      >
                        <Ban className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setConfirmDelete(quote)}
                      title="Delete"
                      className="text-muted-foreground hover:text-rose-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* View dialog */}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-lg">
          {viewing && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span className="font-mono">{viewing.quoteNumber}</span>
                  <Badge
                    variant="outline"
                    className={`capitalize ${STATUS_STYLES[displayStatus(viewing)]}`}
                  >
                    {displayStatus(viewing)}
                  </Badge>
                </DialogTitle>
                <DialogDescription>
                  {customerName(viewing.customerId)}
                  {viewing.expiryDate ? ` · Valid until ${fmtDate(viewing.expiryDate)}` : ""}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-1 max-h-72 overflow-y-auto">
                {viewing.items.map((it, i) => {
                  const qty =
                    it.unitLabel && it.unitFactor && it.unitFactor > 0
                      ? `${(it.quantity / it.unitFactor).toLocaleString("en-US", {
                          maximumFractionDigits: 2,
                        })} ${it.unitLabel}`
                      : String(it.quantity);
                  return (
                    <div key={i} className="flex justify-between text-sm py-1 border-b last:border-0">
                      <span className="flex-1">{it.productName}</span>
                      <span className="text-muted-foreground mx-3">
                        {qty} × {formatCurrency(it.price, currency)}
                      </span>
                      <span className="font-medium tabular-nums">
                        {formatCurrency(it.price * it.quantity, currency)}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="space-y-1 text-sm border-t pt-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatCurrency(viewing.subtotal, currency)}</span>
                </div>
                {viewing.discountAmount && viewing.discountAmount > 0 ? (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Discount</span>
                    <span>- {formatCurrency(viewing.discountAmount, currency)}</span>
                  </div>
                ) : null}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tax</span>
                  <span>{formatCurrency(viewing.tax, currency)}</span>
                </div>
                <div className="flex justify-between font-bold text-base pt-1">
                  <span>Total</span>
                  <span>{formatCurrency(viewing.total, currency)}</span>
                </div>
              </div>
              {viewing.notes ? (
                <div className="text-sm bg-muted rounded-lg p-3">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                    Notes / Terms
                  </div>
                  <div className="whitespace-pre-wrap">{viewing.notes}</div>
                </div>
              ) : null}
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => handlePrint(viewing)} className="gap-1.5">
                  <Printer className="h-4 w-4" />
                  Print
                </Button>
                {displayStatus(viewing) === "active" && (
                  <Button
                    onClick={() => {
                      handleLoadIntoPos(viewing);
                    }}
                    className="gap-1.5"
                  >
                    <ShoppingCart className="h-4 w-4" />
                    Load into POS
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete quotation?</DialogTitle>
            <DialogDescription>
              {confirmDelete?.quoteNumber} will be permanently removed. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteQuotation.isPending}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
