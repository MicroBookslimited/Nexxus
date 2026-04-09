import { useState } from "react";
import {
  useGetCurrentCashSession,
  useOpenCashSession,
  useAddCashPayout,
  useCloseCashSession,
  useListCashSessions,
  useGetCashSession,
  useSendEodReportEmail,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { PinPad } from "@/components/PinPad";
import {
  Coins, DollarSign, TrendingUp, TrendingDown, CreditCard, Banknote,
  SplitSquareHorizontal, Plus, CheckCircle2, History,
  ArrowDownLeft, UserCheck, ArrowLeft, Mail, BookOpen, ShoppingBag,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

function formatCurrency(amount: number) {
  return `$${Math.abs(amount).toFixed(2)}`;
}

function VarianceBadge({ variance }: { variance: number }) {
  if (Math.abs(variance) < 0.01) {
    return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Balanced ✓</Badge>;
  }
  if (variance > 0) {
    return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">+{formatCurrency(variance)} Over</Badge>;
  }
  return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">-{formatCurrency(Math.abs(variance))} Short</Badge>;
}

/* ─── Open Shift Panel ─── */
function OpenShiftPanel({ onOpen }: { onOpen: (openingCash: number, staffName: string) => void }) {
  const [step, setStep] = useState<"pin" | "cash">("pin");
  const [staff, setStaff] = useState<{ id: number; name: string; role: string } | null>(null);
  const [cash, setCash] = useState("");

  const handlePinSuccess = (s: { id: number; name: string; role: string }) => {
    setStaff(s);
    setStep("cash");
  };

  const handleSubmit = () => {
    const amount = parseFloat(cash);
    if (isNaN(amount) || amount < 0 || !staff) return;
    onOpen(amount, staff.name);
  };

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 border border-primary/20">
            <Coins className="h-7 w-7 text-primary" />
          </div>
          <CardTitle className="text-xl">Open Cash Drawer</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {step === "pin" ? "Enter your PIN to identify yourself and begin your shift." : "Count and record the opening cash balance."}
          </p>
        </CardHeader>
        <CardContent className="pt-2">
          {step === "pin" ? (
            <PinPad onSuccess={handlePinSuccess} title="" />
          ) : (
            <div className="space-y-4 pt-2">
              <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5">
                <UserCheck className="h-4 w-4 text-emerald-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-emerald-300">{staff?.name}</p>
                  <p className="text-xs text-emerald-400/70 capitalize">{staff?.role}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => { setStep("pin"); setStaff(null); setCash(""); }}
                >
                  <ArrowLeft className="h-3 w-3 mr-1" />
                  Change
                </Button>
              </div>
              <div className="space-y-1.5">
                <Label>Opening Cash on Hand</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    autoFocus
                    className="pl-8 text-lg font-mono"
                    value={cash}
                    onChange={(e) => setCash(e.target.value)}
                    placeholder="0.00"
                    onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                  />
                </div>
                <p className="text-xs text-muted-foreground">Count bills and coins in the drawer before any sales.</p>
              </div>
              <Button
                className="w-full"
                size="lg"
                onClick={handleSubmit}
                disabled={!cash || isNaN(parseFloat(cash))}
              >
                <Coins className="h-4 w-4 mr-2" />
                Open Shift
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ─── Add Payout Dialog ─── */
function AddPayoutDialog({
  open,
  sessionId,
  staffName,
  onClose,
}: {
  open: boolean;
  sessionId: number;
  staffName: string;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const addPayout = useAddCashPayout();

  const handleSubmit = () => {
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0 || !reason.trim()) return;
    addPayout.mutate(
      { id: sessionId, data: { amount: amt, reason: reason.trim(), staffName } },
      {
        onSuccess: () => {
          toast({ title: "Payout recorded", description: `${formatCurrency(amt)} — ${reason}` });
          queryClient.invalidateQueries({ queryKey: ["/api/cash/sessions/current"] });
          setAmount("");
          setReason("");
          onClose();
        },
        onError: () => toast({ title: "Error", description: "Could not record payout", variant: "destructive" }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowDownLeft className="h-4 w-4 text-amber-400" />
            Record Payout
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <p className="text-xs text-muted-foreground">Payouts are cash taken out of the drawer (e.g. supplier payments, petty cash).</p>
          <div className="space-y-1.5">
            <Label>Amount</Label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input type="number" min="0.01" step="0.01" className="pl-8" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Reason</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Petty cash, Supply run…" onKeyDown={(e) => e.key === "Enter" && handleSubmit()} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!amount || isNaN(parseFloat(amount)) || !reason.trim() || addPayout.isPending} className="bg-amber-500 hover:bg-amber-600 text-white">
            Record Payout
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Close Shift Dialog ─── */
function CloseShiftDialog({
  open,
  sessionId,
  expectedCash,
  salesSummary,
  onClose,
  onClosed,
}: {
  open: boolean;
  sessionId: number;
  expectedCash: number;
  salesSummary: { cashSales: number; cardSales: number; splitSales: number; creditSales?: number; totalSales: number };
  onClose: () => void;
  onClosed: (closedSessionId: number) => void;
}) {
  const [actualCash, setActualCash] = useState("");
  const [actualCard, setActualCard] = useState(() => salesSummary.cardSales.toFixed(2));
  const [notes, setNotes] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const closeSession = useCloseCashSession();

  const parsedCash = parseFloat(actualCash) || 0;
  const parsedCard = parseFloat(actualCard) || 0;
  const cashVariance = parsedCash - expectedCash;
  const cardVariance = parsedCard - salesSummary.cardSales;

  const handleClose = () => {
    if (actualCash === "") return;
    closeSession.mutate(
      { id: sessionId, data: { actualCash: parsedCash, actualCard: parsedCard, closingNotes: notes || undefined } },
      {
        onSuccess: () => {
          toast({ title: "Shift closed", description: "End-of-day report saved successfully." });
          queryClient.removeQueries({ queryKey: ["/api/cash/sessions/current"] });
          queryClient.invalidateQueries({ queryKey: ["/api/cash/sessions"] });
          setActualCash("");
          setActualCard("");
          setNotes("");
          onClosed(sessionId);
        },
        onError: () => toast({ title: "Error", description: "Could not close session", variant: "destructive" }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            Close Shift
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <p className="text-xs text-muted-foreground">Count your drawer and enter the actual amounts collected. Discrepancies will be recorded.</p>

          {/* Expected amounts summary */}
          <div className="rounded-lg bg-muted/30 border border-border p-3 space-y-2 text-sm">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Expected from System</p>
            <div className="flex justify-between"><span className="text-muted-foreground flex items-center gap-1"><Banknote className="h-3.5 w-3.5" />Cash sales</span><span className="font-mono">{formatCurrency(salesSummary.cashSales)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground flex items-center gap-1"><CreditCard className="h-3.5 w-3.5" />Card sales</span><span className="font-mono">{formatCurrency(salesSummary.cardSales)}</span></div>
            {salesSummary.splitSales > 0 && (
              <div className="flex justify-between"><span className="text-muted-foreground flex items-center gap-1"><SplitSquareHorizontal className="h-3.5 w-3.5" />Split sales</span><span className="font-mono">{formatCurrency(salesSummary.splitSales)}</span></div>
            )}
            <Separator />
            <div className="flex justify-between font-semibold"><span>Expected cash in drawer</span><span className="font-mono text-primary">{formatCurrency(expectedCash)}</span></div>
          </div>

          {/* Actual counts */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5"><Banknote className="h-3.5 w-3.5 text-emerald-400" />Actual Cash Counted</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input type="number" min="0" step="0.01" className="pl-8 font-mono" value={actualCash} onChange={(e) => setActualCash(e.target.value)} placeholder="0.00" />
              </div>
              {actualCash !== "" && (
                <p className={cn("text-xs font-mono", cashVariance === 0 ? "text-emerald-400" : cashVariance > 0 ? "text-blue-400" : "text-red-400")}>
                  {cashVariance >= 0 ? "+" : ""}{formatCurrency(cashVariance)} variance
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5"><CreditCard className="h-3.5 w-3.5 text-blue-400" />Actual Card Total</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input type="number" min="0" step="0.01" className="pl-8 font-mono" value={actualCard} onChange={(e) => setActualCard(e.target.value)} placeholder="0.00" />
              </div>
              {actualCard !== "" && (
                <p className={cn("text-xs font-mono", cardVariance === 0 ? "text-emerald-400" : cardVariance > 0 ? "text-blue-400" : "text-red-400")}>
                  {cardVariance >= 0 ? "+" : ""}{formatCurrency(cardVariance)} variance
                </p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Notes (optional)</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any discrepancies or notes for the manager…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleClose}
            disabled={actualCash === "" || closeSession.isPending}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Close Shift
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Print helpers ─── */
type ItemSummaryRow = { productName: string; totalQty: number; totalRevenue: number };

type CreditOrderRow = { orderNumber: string; total: number; customerName: string | null; customerPhone: string | null; arId: number | null; amountPaid: number | null; arStatus: string | null; createdAt: string };

type SessionDetail = {
  session: { staffName: string; openedAt: string; closedAt?: string | null; openingCash: number; actualCash?: number | null; actualCard?: number | null; closingNotes?: string | null };
  payouts: { reason: string; amount: number; staffName: string; createdAt: string }[];
  orders: { orderNumber: string; total: number; paymentMethod: string; createdAt: string }[];
  salesSummary: { cashSales: number; cardSales: number; splitSales: number; creditSales?: number; totalSales: number };
  expectedCash: number;
  totalPayouts: number;
  itemSummary?: ItemSummaryRow[];
  creditOrders?: CreditOrderRow[];
};

function buildReportHtml(d: SessionDetail, withDetail: boolean): string {
  const fmt = (n: number) => `$${Math.abs(n).toFixed(2)}`;
  const variance = (d.session.actualCash ?? 0) - d.expectedCash;
  const openedAt = new Date(d.session.openedAt).toLocaleString();
  const closedAt = d.session.closedAt ? new Date(d.session.closedAt).toLocaleString() : "—";

  const orderRows = withDetail
    ? d.orders.map((o) => `
        <tr>
          <td>${new Date(o.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td>
          <td>${o.orderNumber}</td>
          <td style="text-transform:capitalize">${o.paymentMethod}</td>
          <td style="text-align:right">${fmt(o.total)}</td>
        </tr>`).join("")
    : "";

  return `
    <div style="max-width:340px;margin:0 auto;font-family:monospace;font-size:12px;line-height:1.6">
      <h2 style="text-align:center;font-size:15px;margin:0 0 2px">NEXXUS POS</h2>
      <p style="text-align:center;font-size:11px;margin:0 0 10px;color:#555">End of Day Report</p>
      <div style="border-top:1px dashed #000;margin:6px 0"></div>
      <div style="display:flex;justify-content:space-between"><span>Cashier:</span><span>${d.session.staffName}</span></div>
      <div style="display:flex;justify-content:space-between"><span>Opened:</span><span>${openedAt}</span></div>
      <div style="display:flex;justify-content:space-between"><span>Closed:</span><span>${closedAt}</span></div>
      <div style="border-top:1px dashed #000;margin:8px 0"></div>
      <b>Sales Summary</b>
      <div style="display:flex;justify-content:space-between"><span>Cash sales:</span><span>${fmt(d.salesSummary.cashSales)}</span></div>
      <div style="display:flex;justify-content:space-between"><span>Card sales:</span><span>${fmt(d.salesSummary.cardSales)}</span></div>
      ${d.salesSummary.splitSales > 0 ? `<div style="display:flex;justify-content:space-between"><span>Split sales:</span><span>${fmt(d.salesSummary.splitSales)}</span></div>` : ""}
      ${(d.salesSummary.creditSales ?? 0) > 0 ? `<div style="display:flex;justify-content:space-between"><span>Credit sales:</span><span>${fmt(d.salesSummary.creditSales ?? 0)}</span></div>` : ""}
      <div style="display:flex;justify-content:space-between;font-weight:bold"><span>Total sales:</span><span>${fmt(d.salesSummary.totalSales)}</span></div>
      <div style="border-top:1px dashed #000;margin:8px 0"></div>
      <b>Cash Reconciliation</b>
      <div style="display:flex;justify-content:space-between"><span>Opening cash:</span><span>${fmt(d.session.openingCash)}</span></div>
      <div style="display:flex;justify-content:space-between"><span>+ Cash sales:</span><span>${fmt(d.salesSummary.cashSales)}</span></div>
      <div style="display:flex;justify-content:space-between"><span>- Payouts:</span><span>-${fmt(d.totalPayouts)}</span></div>
      <div style="display:flex;justify-content:space-between;font-weight:bold"><span>Expected cash:</span><span>${fmt(d.expectedCash)}</span></div>
      <div style="display:flex;justify-content:space-between"><span>Actual cash counted:</span><span>${fmt(d.session.actualCash ?? 0)}</span></div>
      <div style="display:flex;justify-content:space-between;font-weight:bold"><span>Variance:</span><span>${variance >= 0 ? "+" : ""}${fmt(variance)}</span></div>
      ${d.session.actualCard != null ? `<div style="display:flex;justify-content:space-between"><span>Actual card total:</span><span>${fmt(d.session.actualCard)}</span></div>` : ""}
      ${d.payouts.length > 0 ? `
      <div style="border-top:1px dashed #000;margin:8px 0"></div>
      <b>Payouts (${d.payouts.length})</b>
      ${d.payouts.map((p) => `<div style="display:flex;justify-content:space-between"><span>${p.reason}</span><span>-${fmt(p.amount)}</span></div>`).join("")}
      ` : ""}
      ${d.session.closingNotes ? `<div style="margin-top:6px;font-size:11px;color:#444">Notes: ${d.session.closingNotes}</div>` : ""}
      ${d.itemSummary && d.itemSummary.length > 0 ? `
      <div style="border-top:1px dashed #000;margin:8px 0"></div>
      <b>Items Sold</b>
      <table style="width:100%;border-collapse:collapse;margin-top:4px;font-size:11px">
        <thead><tr style="border-bottom:1px solid #000">
          <th style="text-align:left">Item</th>
          <th style="text-align:right">Qty</th>
          <th style="text-align:right">Revenue</th>
        </tr></thead>
        <tbody>${d.itemSummary.map(r => `
          <tr>
            <td>${r.productName}</td>
            <td style="text-align:right">${r.totalQty}</td>
            <td style="text-align:right">${fmt(r.totalRevenue)}</td>
          </tr>`).join("")}
        </tbody>
      </table>` : ""}
      ${d.creditOrders && d.creditOrders.length > 0 ? `
      <div style="border-top:1px dashed #000;margin:8px 0"></div>
      <b>Credit Customers (${d.creditOrders.length})</b>
      <table style="width:100%;border-collapse:collapse;margin-top:4px;font-size:11px">
        <thead><tr style="border-bottom:1px solid #000">
          <th style="text-align:left">Customer</th>
          <th style="text-align:left">Order</th>
          <th style="text-align:right">Amount</th>
          <th style="text-align:right">Status</th>
        </tr></thead>
        <tbody>${d.creditOrders.map(r => `
          <tr>
            <td>${r.customerName ?? "—"}</td>
            <td>${r.orderNumber}</td>
            <td style="text-align:right">${fmt(r.total)}</td>
            <td style="text-align:right;text-transform:capitalize">${r.arStatus ?? "open"}</td>
          </tr>`).join("")}
        </tbody>
      </table>` : ""}
      ${withDetail && d.orders.length > 0 ? `
      <div style="border-top:1px dashed #000;margin:8px 0"></div>
      <b>Transactions (${d.orders.length})</b>
      <table style="width:100%;border-collapse:collapse;margin-top:4px;font-size:11px">
        <thead><tr style="border-bottom:1px solid #000">
          <th style="text-align:left">Time</th>
          <th style="text-align:left">Order</th>
          <th style="text-align:left">Method</th>
          <th style="text-align:right">Total</th>
        </tr></thead>
        <tbody>${orderRows}</tbody>
      </table>` : ""}
      <div style="border-top:1px dashed #000;margin:10px 0"></div>
      <p style="text-align:center;font-size:10px;color:#888">Powered by MicroBooks</p>
    </div>
  `;
}

function printEodReport(d: SessionDetail, withDetail: boolean) {
  const w = window.open("", "_blank", "width=420,height=760");
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html><head><title>End of Day Report</title>
    <style>
      @page { size: 80mm auto; margin: 4mm; }
      body { margin: 0; padding: 8px; font-family: 'Courier New', Courier, monospace; font-size: 11px; line-height: 1.4; }
      table { width: 100%; border-collapse: collapse; font-size: 10px; }
      th, td { padding: 1px 2px; }
    </style>
  </head><body>${buildReportHtml(d, withDetail)}
    <script>window.onload=()=>{window.print();window.onafterprint=()=>window.close();}<\/script>
  </body></html>`);
  w.document.close();
}

/* ─── EOD Report Modal ─── */
function EodReportModal({ sessionId, onClose }: { sessionId: number; onClose: () => void }) {
  const { data, isLoading, isError } = useGetCashSession(sessionId);
  const [expanded, setExpanded] = useState(false);
  const [eodEmailOpen, setEodEmailOpen] = useState(false);
  const [eodEmailAddr, setEodEmailAddr] = useState("");
  const sendEodEmail = useSendEodReportEmail();
  const { toast } = useToast();

  if (isLoading) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="sm:max-w-2xl">
          <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">Loading report…</div>
        </DialogContent>
      </Dialog>
    );
  }

  if (isError || !data) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="sm:max-w-2xl">
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <p className="text-sm text-muted-foreground">Could not load report. Please check Shift History.</p>
            <Button size="sm" onClick={onClose}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const { session, payouts, orders, salesSummary, expectedCash, totalPayouts } = data;
  const cashVariance = (session.actualCash ?? 0) - expectedCash;
  const cardVariance = (session.actualCard ?? 0) - salesSummary.cardSales;

  const detail: SessionDetail = { session, payouts, orders, salesSummary, expectedCash, totalPayouts, itemSummary: data.itemSummary, creditOrders: data.creditOrders };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            End of Day Report
            <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs ml-1">Shift Closed</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {/* Header info */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Cashier</p>
              <p className="font-medium">{session.staffName}</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Shift Duration</p>
              <p className="font-medium text-xs">{format(new Date(session.openedAt), "h:mm a")} → {session.closedAt ? format(new Date(session.closedAt), "h:mm a") : "—"}</p>
            </div>
          </div>

          {/* Sales summary */}
          <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2 text-sm">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Sales Summary ({orders.length} transactions)</p>
            <div className="flex justify-between"><span className="flex items-center gap-1.5 text-muted-foreground"><Banknote className="h-3.5 w-3.5 text-emerald-400" />Cash</span><span className="font-mono font-medium">{formatCurrency(salesSummary.cashSales)}</span></div>
            <div className="flex justify-between"><span className="flex items-center gap-1.5 text-muted-foreground"><CreditCard className="h-3.5 w-3.5 text-blue-400" />Card</span><span className="font-mono font-medium">{formatCurrency(salesSummary.cardSales)}</span></div>
            {salesSummary.splitSales > 0 && <div className="flex justify-between"><span className="flex items-center gap-1.5 text-muted-foreground"><SplitSquareHorizontal className="h-3.5 w-3.5 text-purple-400" />Split</span><span className="font-mono font-medium">{formatCurrency(salesSummary.splitSales)}</span></div>}
            {(salesSummary.creditSales ?? 0) > 0 && <div className="flex justify-between"><span className="flex items-center gap-1.5 text-muted-foreground"><BookOpen className="h-3.5 w-3.5 text-amber-400" />Credit</span><span className="font-mono font-medium text-amber-400">{formatCurrency(salesSummary.creditSales ?? 0)}</span></div>}
            <Separator />
            <div className="flex justify-between font-bold"><span>Total Sales</span><span className="font-mono text-primary">{formatCurrency(salesSummary.totalSales)}</span></div>
          </div>

          {/* Cash reconciliation */}
          <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2 text-sm">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cash Reconciliation</p>
            <div className="flex justify-between"><span className="text-muted-foreground">Opening cash</span><span className="font-mono">{formatCurrency(session.openingCash)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">+ Cash sales</span><span className="font-mono">{formatCurrency(salesSummary.cashSales)}</span></div>
            {totalPayouts > 0 && <div className="flex justify-between"><span className="text-muted-foreground">− Payouts</span><span className="font-mono text-amber-400">−{formatCurrency(totalPayouts)}</span></div>}
            <Separator />
            <div className="flex justify-between font-semibold"><span>Expected cash</span><span className="font-mono">{formatCurrency(expectedCash)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Actual cash counted</span><span className="font-mono">{formatCurrency(session.actualCash ?? 0)}</span></div>
            <div className="flex justify-between font-bold">
              <span>Cash variance</span>
              <span className={cn("font-mono", cashVariance === 0 ? "text-emerald-400" : cashVariance > 0 ? "text-blue-400" : "text-red-400")}>
                {cashVariance >= 0 ? "+" : ""}{formatCurrency(cashVariance)} {cashVariance === 0 ? "✓" : cashVariance > 0 ? "over" : "short"}
              </span>
            </div>
            {session.actualCard != null && (
              <>
                <Separator />
                <div className="flex justify-between"><span className="text-muted-foreground">Card sales (system)</span><span className="font-mono">{formatCurrency(salesSummary.cardSales)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Actual card total</span><span className="font-mono">{formatCurrency(session.actualCard)}</span></div>
                <div className="flex justify-between font-bold">
                  <span>Card variance</span>
                  <span className={cn("font-mono", cardVariance === 0 ? "text-emerald-400" : cardVariance > 0 ? "text-blue-400" : "text-red-400")}>
                    {cardVariance >= 0 ? "+" : ""}{formatCurrency(cardVariance)}
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Payouts */}
          {payouts.length > 0 && (
            <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2 text-sm">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Payouts ({payouts.length})</p>
              {payouts.map((p, i) => (
                <div key={i} className="flex justify-between">
                  <span className="text-muted-foreground">{p.reason}</span>
                  <span className="font-mono text-amber-400">−{formatCurrency(p.amount)}</span>
                </div>
              ))}
              <Separator />
              <div className="flex justify-between font-semibold"><span>Total payouts</span><span className="font-mono text-amber-400">−{formatCurrency(totalPayouts)}</span></div>
            </div>
          )}

          {/* Items sold summary */}
          {data.itemSummary && data.itemSummary.length > 0 && (
            <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2 text-sm">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Items Sold This Shift</p>
              <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide pb-1 border-b border-border/40">
                <span>Item</span><span className="text-right">Qty</span><span className="text-right">Revenue</span>
              </div>
              {data.itemSummary.map((row, i) => (
                <div key={i} className="grid grid-cols-[1fr_auto_auto] gap-x-3 text-sm">
                  <span className="text-foreground truncate">{row.productName}</span>
                  <span className="font-mono font-semibold text-right tabular-nums">{row.totalQty}</span>
                  <span className="font-mono text-right tabular-nums text-muted-foreground">{formatCurrency(row.totalRevenue)}</span>
                </div>
              ))}
              <Separator />
              <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 text-sm font-bold">
                <span>Total</span>
                <span className="font-mono text-right tabular-nums">{data.itemSummary.reduce((s, r) => s + r.totalQty, 0)}</span>
                <span className="font-mono text-right tabular-nums text-primary">{formatCurrency(data.itemSummary.reduce((s, r) => s + r.totalRevenue, 0))}</span>
              </div>
            </div>
          )}

          {/* Credit customers section */}
          {data.creditOrders && data.creditOrders.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-2 text-sm">
              <p className="text-xs font-semibold text-amber-400 uppercase tracking-wide">Credit Customers This Shift</p>
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide pb-1 border-b border-amber-500/20">
                <span>Customer</span><span className="text-right">Order</span><span className="text-right">Amount</span><span className="text-right">Status</span>
              </div>
              {data.creditOrders.map((row, i) => (
                <div key={i} className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 text-sm">
                  <div className="min-w-0">
                    <span className="text-foreground truncate block">{row.customerName ?? "—"}</span>
                    {row.customerPhone && <span className="text-[10px] text-muted-foreground">{row.customerPhone}</span>}
                  </div>
                  <span className="font-mono text-right tabular-nums text-xs">{row.orderNumber}</span>
                  <span className="font-mono text-right tabular-nums">{formatCurrency(row.total)}</span>
                  <span className={`text-right text-xs capitalize font-semibold ${row.arStatus === "paid" ? "text-emerald-400" : row.arStatus === "partial" ? "text-amber-400" : "text-red-400"}`}>{row.arStatus ?? "open"}</span>
                </div>
              ))}
              <Separator />
              <div className="flex justify-between font-bold">
                <span>Total Credit</span>
                <span className="font-mono text-amber-400">{formatCurrency(data.creditOrders.reduce((s, r) => s + r.total, 0))}</span>
              </div>
            </div>
          )}

          {/* Transaction detail (expandable) */}
          {orders.length > 0 && (
            <div className="rounded-lg border border-border bg-muted/20">
              <button
                className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-semibold hover:bg-secondary/30 transition-colors rounded-lg"
                onClick={() => setExpanded((e) => !e)}
              >
                <span className="flex items-center gap-2">
                  <History className="h-3.5 w-3.5 text-muted-foreground" />
                  Sales Detail ({orders.length} transactions)
                </span>
                <span className="text-xs text-muted-foreground">{expanded ? "▲ collapse" : "▼ expand"}</span>
              </button>
              {expanded && (
                <div className="border-t border-border">
                  <div className="grid grid-cols-[auto_1fr_auto_auto] gap-x-3 px-3 py-1.5 bg-secondary/30 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    <span>Time</span><span>Order</span><span>Method</span><span className="text-right">Total</span>
                  </div>
                  {orders.map((o) => (
                    <div key={o.id} className="grid grid-cols-[auto_1fr_auto_auto] gap-x-3 px-3 py-2 text-sm border-t border-border/40">
                      <span className="text-muted-foreground text-xs">{format(new Date(o.createdAt), "h:mm a")}</span>
                      <span className="font-mono text-xs">{o.orderNumber}</span>
                      <span className="capitalize text-xs text-muted-foreground">{o.paymentMethod}</span>
                      <span className="font-mono text-right text-xs">{formatCurrency(o.total)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {session.closingNotes && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-sm">
              <p className="text-xs font-semibold text-amber-400 mb-1">Notes</p>
              <p className="text-muted-foreground">{session.closingNotes}</p>
            </div>
          )}
        </div>

        {eodEmailOpen && (
          <div className="border border-border rounded-lg p-3 bg-muted/40 space-y-2 mt-2">
            <p className="text-xs font-medium text-muted-foreground">Email report to:</p>
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="manager@business.com"
                value={eodEmailAddr}
                onChange={(e) => setEodEmailAddr(e.target.value)}
                className="h-8 text-sm"
              />
              <Button
                size="sm"
                disabled={!eodEmailAddr || sendEodEmail.isPending}
                onClick={() => {
                  sendEodEmail.mutate(
                    { data: { sessionId, to: eodEmailAddr } },
                    {
                      onSuccess: () => {
                        toast({ title: "Report sent!", description: `Sent to ${eodEmailAddr}` });
                        setEodEmailOpen(false);
                        setEodEmailAddr("");
                      },
                      onError: () => toast({ title: "Failed to send", description: "Check that email is configured.", variant: "destructive" }),
                    }
                  );
                }}
              >
                {sendEodEmail.isPending ? "Sending…" : "Send"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEodEmailOpen(false)}>✕</Button>
            </div>
          </div>
        )}

        <DialogFooter className="flex flex-col sm:flex-row gap-2 pt-3 border-t border-border mt-2">
          <Button variant="outline" size="sm" onClick={() => printEodReport(detail, false)} className="flex-1 sm:flex-none">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5 mr-1.5"><path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z"/></svg>
            Print Summary
          </Button>
          <Button variant="outline" size="sm" onClick={() => printEodReport(detail, true)} className="flex-1 sm:flex-none">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5 mr-1.5"><path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z"/></svg>
            Print with Sales Detail
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setEodEmailOpen(true); setEodEmailAddr(""); }}
            className="flex-1 sm:flex-none gap-1.5"
          >
            <Mail className="h-3.5 w-3.5" />Email Report
          </Button>
          <Button size="sm" onClick={onClose} className="flex-1 sm:flex-none">Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Active Session Panel ─── */
function ActiveSessionPanel({ staffName, onShiftClosed }: { staffName: string; onShiftClosed: (id: number) => void }) {
  const { data, isLoading, isError } = useGetCurrentCashSession({ query: { refetchInterval: 15000, retry: false } });
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);

  if (isLoading && !isError) {
    return <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">Loading session…</div>;
  }
  if (!data) return null;

  const { session, payouts, salesSummary, expectedCash, totalPayouts } = data;

  return (
    <div className="flex-1 overflow-auto p-6 space-y-5">
      {/* Session header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <h2 className="text-lg font-bold">Shift Active</h2>
            <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs">Open</Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Opened {format(new Date(session.openedAt), "h:mm a")} by {session.staffName}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setPayoutOpen(true)}>
            <ArrowDownLeft className="h-3.5 w-3.5 mr-1.5 text-amber-400" />
            Add Payout
          </Button>
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setCloseOpen(true)}>
            <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
            Close Shift
          </Button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Opening Cash</p>
            <p className="text-xl font-bold font-mono mt-1">{formatCurrency(session.openingCash)}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1"><Banknote className="h-3 w-3" />Cash Sales</p>
            <p className="text-xl font-bold font-mono text-emerald-400 mt-1">{formatCurrency(salesSummary.cashSales)}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1"><ArrowDownLeft className="h-3 w-3 text-amber-400" />Payouts</p>
            <p className="text-xl font-bold font-mono text-amber-400 mt-1">-{formatCurrency(totalPayouts)}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Expected Cash</p>
            <p className="text-xl font-bold font-mono text-primary mt-1">{formatCurrency(expectedCash)}</p>
            <p className="text-[10px] text-muted-foreground/60">Opening + Cash Sales - Payouts</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Sales breakdown */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Sales Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-muted-foreground"><Banknote className="h-3.5 w-3.5 text-emerald-400" />Cash</span>
              <span className="font-mono font-medium">{formatCurrency(salesSummary.cashSales)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-muted-foreground"><CreditCard className="h-3.5 w-3.5 text-blue-400" />Card</span>
              <span className="font-mono font-medium">{formatCurrency(salesSummary.cardSales)}</span>
            </div>
            {salesSummary.splitSales > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-muted-foreground"><SplitSquareHorizontal className="h-3.5 w-3.5 text-purple-400" />Split</span>
                <span className="font-mono font-medium">{formatCurrency(salesSummary.splitSales)}</span>
              </div>
            )}
            <Separator />
            <div className="flex items-center justify-between font-semibold">
              <span>Total Sales</span>
              <span className="font-mono">{formatCurrency(salesSummary.totalSales)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Payouts list */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <ArrowDownLeft className="h-4 w-4 text-amber-400" />
              Payouts ({payouts.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {payouts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No payouts recorded this shift.</p>
            ) : (
              <div className="space-y-2">
                {payouts.map((p) => (
                  <div key={p.id} className="flex items-center justify-between text-sm">
                    <div>
                      <p className="font-medium">{p.reason}</p>
                      <p className="text-xs text-muted-foreground">{p.staffName} · {format(new Date(p.createdAt), "h:mm a")}</p>
                    </div>
                    <span className="font-mono text-amber-400">-{formatCurrency(p.amount)}</span>
                  </div>
                ))}
              </div>
            )}
            <Button variant="ghost" size="sm" className="w-full mt-3 text-xs text-muted-foreground" onClick={() => setPayoutOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add Payout
            </Button>
          </CardContent>
        </Card>
      </div>

      <AddPayoutDialog
        open={payoutOpen}
        sessionId={session.id}
        staffName={staffName}
        onClose={() => setPayoutOpen(false)}
      />
      <CloseShiftDialog
        open={closeOpen}
        sessionId={session.id}
        expectedCash={expectedCash}
        salesSummary={salesSummary}
        onClose={() => setCloseOpen(false)}
        onClosed={(id) => { setCloseOpen(false); onShiftClosed(id); }}
      />
    </div>
  );
}

/* ─── Session History Row ─── */
function SessionHistoryItem({ sessionId }: { sessionId: number }) {
  const { data } = useGetCashSession(sessionId);
  if (!data) return null;
  const { session, salesSummary, expectedCash } = data;
  const cashVariance = (session.actualCash ?? 0) - expectedCash;
  return (
    <div className="flex items-center gap-4 p-3 rounded-lg border border-border hover:bg-secondary/20 transition-colors text-sm">
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{session.staffName}</p>
        <p className="text-xs text-muted-foreground">
          {format(new Date(session.openedAt), "MMM d, h:mm a")}
          {session.closedAt && ` → ${format(new Date(session.closedAt), "h:mm a")}`}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="font-mono font-medium">{formatCurrency(salesSummary.totalSales)}</p>
        <p className="text-xs text-muted-foreground">total sales</p>
      </div>
      <div className="text-right shrink-0 w-24">
        <VarianceBadge variance={cashVariance} />
      </div>
    </div>
  );
}

/* ─── Main Cash Management Page ─── */
export function CashManagement() {
  const { data: current, isLoading: loadingCurrent, isError: noSession } = useGetCurrentCashSession({
    query: { retry: false },
  });
  const { data: sessions } = useListCashSessions();
  const openSession = useOpenCashSession();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [eodSessionId, setEodSessionId] = useState<number | null>(null);

  const hasOpenSession = !!current?.session;
  const closedSessions = (sessions ?? []).filter((s) => s.status === "closed").slice(0, 10);

  const handleOpenShift = (openingCash: number, name: string) => {
    openSession.mutate(
      { data: { staffName: name, openingCash } },
      {
        onSuccess: () => {
          toast({ title: "Shift opened", description: `Opening cash: ${formatCurrency(openingCash)}` });
          queryClient.removeQueries({ queryKey: ["/api/cash/sessions/current"] });
          queryClient.invalidateQueries({ queryKey: ["/api/cash/sessions"] });
        },
        onError: (err: any) => {
          if (err?.response?.status === 409) {
            toast({ title: "Session already open", description: "Another shift is currently open.", variant: "destructive" });
            queryClient.invalidateQueries({ queryKey: ["/api/cash/sessions/current"] });
          } else {
            toast({ title: "Error", description: "Could not open shift", variant: "destructive" });
          }
        },
      },
    );
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b border-border px-6 py-4 flex items-center justify-between bg-card shrink-0">
        <div className="flex items-center gap-3">
          <Coins className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-lg font-bold">Cash Management</h1>
            <p className="text-xs text-muted-foreground">Shift tracking, payouts, and end-of-day reconciliation</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasOpenSession && (
            <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
              Shift Active
            </Badge>
          )}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Main content area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {loadingCurrent && !noSession ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">Loading…</div>
          ) : hasOpenSession ? (
            <ActiveSessionPanel staffName={current!.session.staffName} onShiftClosed={(id) => setEodSessionId(id)} />
          ) : (
            <OpenShiftPanel onOpen={handleOpenShift} />
          )}
        </div>

        {/* Right sidebar: session history */}
        {closedSessions.length > 0 && (
          <div className="w-80 border-l border-border flex flex-col shrink-0">
            <div className="px-4 py-3 border-b border-border">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <History className="h-4 w-4 text-muted-foreground" />
                Shift History
              </h2>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {closedSessions.map((s) => (
                <SessionHistoryItem key={s.id} sessionId={s.id} />
              ))}
            </div>
          </div>
        )}
      </div>

      {eodSessionId !== null && (
        <EodReportModal sessionId={eodSessionId} onClose={() => setEodSessionId(null)} />
      )}
    </div>
  );
}
