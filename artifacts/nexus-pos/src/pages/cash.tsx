import { useState } from "react";
import {
  useGetCurrentCashSession,
  useOpenCashSession,
  useAddCashPayout,
  useCloseCashSession,
  useListCashSessions,
  useGetCashSession,
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
  ArrowDownLeft, UserCheck, ArrowLeft,
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
  salesSummary: { cashSales: number; cardSales: number; splitSales: number; totalSales: number };
  onClose: () => void;
  onClosed: () => void;
}) {
  const [actualCash, setActualCash] = useState("");
  const [actualCard, setActualCard] = useState("");
  const [notes, setNotes] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const closeSession = useCloseCashSession();

  const parsedCash = parseFloat(actualCash) || 0;
  const parsedCard = parseFloat(actualCard) || 0;
  const cashVariance = parsedCash - expectedCash;
  const cardVariance = parsedCard - salesSummary.cardSales;

  const handleClose = () => {
    if (actualCash === "" || actualCard === "") return;
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
          onClosed();
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
            End of Shift Report
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <p className="text-xs text-muted-foreground">Count your drawer and enter the actual amounts collected. Discrepancies will be recorded for your records.</p>

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
            disabled={actualCash === "" || actualCard === "" || closeSession.isPending}
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

/* ─── Active Session Panel ─── */
function ActiveSessionPanel({ staffName }: { staffName: string }) {
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
        onClosed={() => setCloseOpen(false)}
      />
    </div>
  );
}

/* ─── Session History Row ─── */
function SessionHistoryItem({ sessionId }: { sessionId: number }) {
  const { data } = useGetCashSession({ id: sessionId });
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
            <ActiveSessionPanel staffName={current!.session.staffName} />
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
    </div>
  );
}
