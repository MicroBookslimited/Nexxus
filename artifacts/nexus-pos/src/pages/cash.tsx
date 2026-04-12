import { useState, useEffect } from "react";
import { useStaff } from "@/contexts/StaffContext";
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
  ArrowDownLeft, UserCheck, ArrowLeft, Mail, BookOpen, ShoppingBag, MapPin,
  ListChecks, ChevronRight, SkipForward,
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
function OpenShiftPanel({ onOpen }: { onOpen: (openingCash: number, staffName: string, locationId?: number, locationName?: string) => void }) {
  const [step, setStep] = useState<"pin" | "location" | "cash">("pin");
  const [staff, setStaff] = useState<{ id: number; name: string; role: string } | null>(null);
  const [cash, setCash] = useState("");
  const [locations, setLocations] = useState<{ id: number; name: string }[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("nexus_tenant_token");
    fetch("/api/locations", { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => r.ok ? r.json() : [])
      .then((locs: { id: number; name: string; isActive: boolean }[]) => {
        const active = locs.filter(l => l.isActive);
        setLocations(active);
        if (active.length === 1) setSelectedLocationId(active[0].id);
      })
      .catch(() => {});
  }, []);

  const handlePinSuccess = (s: { id: number; name: string; role: string }) => {
    setStaff(s);
    setStep(locations.length > 0 ? "location" : "cash");
  };

  const handleLocationNext = () => {
    setStep("cash");
  };

  const handleSubmit = () => {
    const amount = parseFloat(cash);
    if (isNaN(amount) || amount < 0 || !staff) return;
    const loc = locations.find(l => l.id === selectedLocationId);
    onOpen(amount, staff.name, selectedLocationId ?? undefined, loc?.name);
  };

  const stepLabel = step === "pin"
    ? "Enter your PIN to identify yourself and begin your shift."
    : step === "location"
      ? "Select the branch location for this shift."
      : "Count and record the opening cash balance.";

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 border border-primary/20">
            <Coins className="h-7 w-7 text-primary" />
          </div>
          <CardTitle className="text-xl">Open Cash Drawer</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">{stepLabel}</p>
        </CardHeader>
        <CardContent className="pt-2">
          {step === "pin" ? (
            <PinPad onSuccess={handlePinSuccess} title="" />
          ) : step === "location" ? (
            <div className="space-y-4 pt-2">
              {/* Staff badge */}
              <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5">
                <UserCheck className="h-4 w-4 text-emerald-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-emerald-300">{staff?.name}</p>
                  <p className="text-xs text-emerald-400/70 capitalize">{staff?.role}</p>
                </div>
                <Button variant="ghost" size="sm" className="ml-auto h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => { setStep("pin"); setStaff(null); setCash(""); }}>
                  <ArrowLeft className="h-3 w-3 mr-1" />Change
                </Button>
              </div>
              {/* Location selection */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />Branch / Location</Label>
                <div className="grid gap-2">
                  {locations.map(loc => (
                    <button
                      key={loc.id}
                      type="button"
                      onClick={() => setSelectedLocationId(loc.id)}
                      className={cn(
                        "flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors",
                        selectedLocationId === loc.id
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border hover:border-primary/40 hover:bg-secondary/40"
                      )}
                    >
                      <MapPin className="h-4 w-4 shrink-0" />
                      <span className="text-sm font-medium">{loc.name}</span>
                      {selectedLocationId === loc.id && (
                        <CheckCircle2 className="h-4 w-4 ml-auto text-primary" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
              <Button className="w-full" size="lg" onClick={handleLocationNext} disabled={!selectedLocationId}>
                Continue
              </Button>
            </div>
          ) : (
            <div className="space-y-4 pt-2">
              {/* Staff badge */}
              <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5">
                <UserCheck className="h-4 w-4 text-emerald-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-emerald-300">{staff?.name}</p>
                  <p className="text-xs text-emerald-400/70 capitalize">{staff?.role}</p>
                </div>
              </div>
              {/* Selected location badge */}
              {selectedLocationId && (
                <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2.5">
                  <MapPin className="h-4 w-4 text-primary shrink-0" />
                  <p className="text-sm font-medium text-primary">
                    {locations.find(l => l.id === selectedLocationId)?.name}
                  </p>
                  <Button variant="ghost" size="sm" className="ml-auto h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setStep("location")}>
                    <ArrowLeft className="h-3 w-3 mr-1" />Change
                  </Button>
                </div>
              )}
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
              <Button className="w-full" size="lg" onClick={handleSubmit} disabled={!cash || isNaN(parseFloat(cash))}>
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

/* ─── Cash Denomination Breakdown ─── */
const JMD_BILLS = [
  { value: 5000, label: "$5,000" },
  { value: 2000, label: "$2,000" },
  { value: 1000, label: "$1,000" },
  { value: 500,  label: "$500"   },
  { value: 100,  label: "$100"   },
  { value: 50,   label: "$50"    },
];
const JMD_COINS = [
  { value: 20,   label: "$20"    },
  { value: 10,   label: "$10"    },
  { value: 5,    label: "$5"     },
  { value: 1,    label: "$1"     },
  { value: 0.50, label: "50¢"   },
  { value: 0.25, label: "25¢"   },
  { value: 0.10, label: "10¢"   },
];

function DenomRow({
  denom,
  qty,
  onChange,
}: {
  denom: { value: number; label: string };
  qty: number;
  onChange: (v: number) => void;
}) {
  const subtotal = denom.value * qty;
  return (
    <div className="grid grid-cols-[56px_1fr_72px] items-center gap-2">
      <span className="text-xs font-mono font-semibold text-right text-foreground/90">{denom.label}</span>
      <Input
        type="number"
        min="0"
        step="1"
        value={qty === 0 ? "" : qty}
        onChange={(e) => onChange(Math.max(0, parseInt(e.target.value) || 0))}
        placeholder="0"
        className="h-8 text-center font-mono text-sm px-2"
      />
      <span className={cn("text-xs font-mono text-right", subtotal > 0 ? "text-emerald-400" : "text-muted-foreground/40")}>
        {subtotal > 0 ? `$${subtotal.toFixed(subtotal % 1 === 0 ? 0 : 2)}` : "—"}
      </span>
    </div>
  );
}

/* ─── Close Shift Dialog ─── */
type CloseStep = "choice" | "breakdown" | "confirm";

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
  salesSummary: { cashSales: number; cardSales: number; splitSales: number; creditSales?: number; totalSales: number; refundedCash?: number; refundedCard?: number; totalRefunds?: number; voidedCount?: number };
  onClose: () => void;
  onClosed: (closedSessionId: number) => void;
}) {
  const [step, setStep] = useState<CloseStep>("choice");
  const [billQtys, setBillQtys] = useState<Record<number, number>>({});
  const [coinQtys, setCoinQtys] = useState<Record<number, number>>({});
  const [actualCash, setActualCash] = useState("");
  const [actualCard, setActualCard] = useState(() => salesSummary.cardSales.toFixed(2));
  const [notes, setNotes] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const closeSession = useCloseCashSession();

  /* reset when dialog opens/closes */
  useEffect(() => {
    if (open) {
      setStep("choice");
      setBillQtys({});
      setCoinQtys({});
      setActualCash("");
      setActualCard(salesSummary.cardSales.toFixed(2));
      setNotes("");
    }
  }, [open]);

  const breakdownTotal = [
    ...JMD_BILLS.map((d) => d.value * (billQtys[d.value] ?? 0)),
    ...JMD_COINS.map((d) => d.value * (coinQtys[d.value] ?? 0)),
  ].reduce((a, b) => a + b, 0);

  const parsedCash = parseFloat(actualCash) || 0;
  const parsedCard = parseFloat(actualCard) || 0;
  const cashVariance = parsedCash - expectedCash;
  const cardVariance = parsedCard - salesSummary.cardSales;

  const handleBreakdownNext = () => {
    setActualCash(breakdownTotal.toFixed(2));
    setStep("confirm");
  };

  const buildBreakdownJson = () => {
    const bills: Record<string, number> = {};
    const coins: Record<string, number> = {};
    JMD_BILLS.forEach((d) => { if ((billQtys[d.value] ?? 0) > 0) bills[d.label] = billQtys[d.value]; });
    JMD_COINS.forEach((d) => { if ((coinQtys[d.value] ?? 0) > 0) coins[d.label] = coinQtys[d.value]; });
    return JSON.stringify({ bills, coins, total: breakdownTotal });
  };

  const handleClose = (withBreakdown: boolean) => {
    if (actualCash === "") return;
    closeSession.mutate(
      {
        id: sessionId,
        data: {
          actualCash: parsedCash,
          actualCard: parsedCard,
          closingNotes: notes || undefined,
          denominationBreakdown: withBreakdown ? buildBreakdownJson() : undefined,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Shift closed", description: "End-of-day report saved successfully." });
          queryClient.removeQueries({ queryKey: ["/api/cash/sessions/current"] });
          queryClient.invalidateQueries({ queryKey: ["/api/cash/sessions"] });
          onClosed(sessionId);
        },
        onError: () => toast({ title: "Error", description: "Could not close session", variant: "destructive" }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={cn("transition-all duration-200", step === "breakdown" ? "sm:max-w-xl" : "sm:max-w-lg")}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            Close Shift
            {step !== "choice" && (
              <button
                type="button"
                onClick={() => setStep(step === "confirm" ? "breakdown" : "choice")}
                className="ml-auto text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 font-normal"
              >
                <ArrowLeft className="h-3 w-3" /> Back
              </button>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* ── Step 1: Choice ── */}
        {step === "choice" && (
          <div className="space-y-4 py-1">
            <p className="text-sm text-muted-foreground">
              Would you like to count and record each denomination in the drawer, or enter the total cash directly?
            </p>
            <div className="rounded-lg bg-muted/30 border border-border p-3 space-y-1.5 text-sm">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Expected from System</p>
              <div className="flex justify-between"><span className="text-muted-foreground flex items-center gap-1"><Banknote className="h-3.5 w-3.5" />Cash sales</span><span className="font-mono">{formatCurrency(salesSummary.cashSales)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground flex items-center gap-1"><CreditCard className="h-3.5 w-3.5" />Card sales</span><span className="font-mono">{formatCurrency(salesSummary.cardSales)}</span></div>
              {salesSummary.splitSales > 0 && <div className="flex justify-between"><span className="text-muted-foreground flex items-center gap-1"><SplitSquareHorizontal className="h-3.5 w-3.5" />Split sales</span><span className="font-mono">{formatCurrency(salesSummary.splitSales)}</span></div>}
              {(salesSummary.totalRefunds ?? 0) > 0 && (
                <div className="flex justify-between text-red-400"><span className="flex items-center gap-1"><ArrowDownLeft className="h-3.5 w-3.5" />Refunds</span><span className="font-mono">-{formatCurrency(salesSummary.totalRefunds ?? 0)}</span></div>
              )}
              <Separator />
              <div className="flex justify-between font-semibold"><span>Expected cash in drawer</span><span className="font-mono text-primary">{formatCurrency(expectedCash)}</span></div>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                onClick={() => setStep("breakdown")}
                className="flex flex-col items-center gap-2 rounded-xl border-2 border-primary/40 bg-primary/5 hover:bg-primary/10 hover:border-primary/60 transition-colors p-4 text-left"
              >
                <ListChecks className="h-7 w-7 text-primary" />
                <span className="text-sm font-semibold text-primary">Cash Breakdown</span>
                <span className="text-xs text-muted-foreground text-center leading-snug">Count each bill &amp; coin denomination</span>
                <ChevronRight className="h-4 w-4 text-primary mt-auto" />
              </button>
              <button
                type="button"
                onClick={() => { setActualCash(""); setStep("confirm"); }}
                className="flex flex-col items-center gap-2 rounded-xl border-2 border-border hover:border-primary/30 hover:bg-muted/40 transition-colors p-4 text-left"
              >
                <DollarSign className="h-7 w-7 text-muted-foreground" />
                <span className="text-sm font-semibold">Enter Total Directly</span>
                <span className="text-xs text-muted-foreground text-center leading-snug">Type the total cash counted</span>
                <SkipForward className="h-4 w-4 text-muted-foreground mt-auto" />
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: Denomination Breakdown ── */}
        {step === "breakdown" && (
          <div className="space-y-3 py-1">
            <p className="text-xs text-muted-foreground">Enter the quantity of each bill and coin in the drawer.</p>
            <div className="grid grid-cols-2 gap-x-5 gap-y-3">
              {/* Bills column */}
              <div className="space-y-2">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                  <Banknote className="h-3 w-3" />Bills
                </p>
                {JMD_BILLS.map((d) => (
                  <DenomRow
                    key={d.value}
                    denom={d}
                    qty={billQtys[d.value] ?? 0}
                    onChange={(v) => setBillQtys((prev) => ({ ...prev, [d.value]: v }))}
                  />
                ))}
              </div>
              {/* Coins column */}
              <div className="space-y-2">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                  <Coins className="h-3 w-3" />Coins
                </p>
                {JMD_COINS.map((d) => (
                  <DenomRow
                    key={d.value}
                    denom={d}
                    qty={coinQtys[d.value] ?? 0}
                    onChange={(v) => setCoinQtys((prev) => ({ ...prev, [d.value]: v }))}
                  />
                ))}
              </div>
            </div>
            <Separator />
            <div className="flex items-center justify-between px-1">
              <span className="text-sm font-semibold">Total Counted</span>
              <span className={cn("text-lg font-bold font-mono", breakdownTotal > 0 ? "text-emerald-400" : "text-muted-foreground")}>
                {formatCurrency(breakdownTotal)}
              </span>
            </div>
          </div>
        )}

        {/* ── Step 3: Confirm & Close ── */}
        {step === "confirm" && (
          <div className="space-y-4 py-1">
            <p className="text-xs text-muted-foreground">Review the amounts and add any notes before closing the shift.</p>

            {/* Expected summary */}
            <div className="rounded-lg bg-muted/30 border border-border p-3 space-y-1.5 text-sm">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Expected from System</p>
              <div className="flex justify-between"><span className="text-muted-foreground">Expected cash</span><span className="font-mono">{formatCurrency(expectedCash)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Card sales</span><span className="font-mono">{formatCurrency(salesSummary.cardSales)}</span></div>
            </div>

            {/* Actual counts */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-xs">
                  <Banknote className="h-3.5 w-3.5 text-emerald-400" />
                  Actual Cash Counted
                  {step === "confirm" && actualCash && parseFloat(actualCash) === breakdownTotal && breakdownTotal > 0 && (
                    <span className="text-[10px] text-primary ml-auto">from breakdown</span>
                  )}
                </Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="number" min="0" step="0.01"
                    className="pl-8 font-mono"
                    value={actualCash}
                    onChange={(e) => setActualCash(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                {actualCash !== "" && (
                  <p className={cn("text-xs font-mono", cashVariance === 0 ? "text-emerald-400" : cashVariance > 0 ? "text-blue-400" : "text-red-400")}>
                    {cashVariance >= 0 ? "+" : ""}{formatCurrency(cashVariance)} variance
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-xs"><CreditCard className="h-3.5 w-3.5 text-blue-400" />Actual Card Total</Label>
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
              <Label className="text-xs">Notes (optional)</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any discrepancies or notes for the manager…" />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={step === "choice" ? onClose : () => setStep(step === "confirm" ? (breakdownTotal > 0 ? "breakdown" : "choice") : "choice")}>
            {step === "choice" ? "Cancel" : <><ArrowLeft className="h-3.5 w-3.5 mr-1" />Back</>}
          </Button>
          {step === "breakdown" && (
            <Button onClick={handleBreakdownNext} className="bg-primary hover:bg-primary/90 text-white">
              Continue <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          )}
          {step === "confirm" && (
            <Button
              onClick={() => handleClose(breakdownTotal > 0)}
              disabled={actualCash === "" || closeSession.isPending}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Close Shift
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Print helpers ─── */
type ItemSummaryRow = { productName: string; totalQty: number; totalRevenue: number };

type CreditOrderRow = { orderNumber: string; total: number; customerName: string | null; customerPhone: string | null; arId: number | null; amountPaid: number | null; arStatus: string | null; createdAt: string };

type SessionDetail = {
  session: { staffName: string; openedAt: string; closedAt?: string | null; openingCash: number; actualCash?: number | null; actualCard?: number | null; closingNotes?: string | null; denominationBreakdown?: string | null };
  payouts: { reason: string; amount: number; staffName: string; createdAt: string }[];
  orders: { orderNumber: string; total: number; paymentMethod: string; createdAt: string }[];
  salesSummary: { cashSales: number; cardSales: number; splitSales: number; creditSales?: number; totalSales: number; refundedCash?: number; refundedCard?: number; totalRefunds?: number; voidedCount?: number };
  expectedCash: number;
  totalPayouts: number;
  itemSummary?: ItemSummaryRow[];
  creditOrders?: CreditOrderRow[];
};

function buildReportHtml(d: SessionDetail, withDetail: boolean): string {
  const fmt = (n: number) => `$${Math.abs(n).toFixed(2)}`;
  const variance = (d.session.actualCash ?? 0) - d.expectedCash;
  const fmtJM = (dt: string | Date) => new Date(dt).toLocaleString("en-JM", { day: "2-digit", month: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
  const openedAt = fmtJM(d.session.openedAt);
  const closedAt = d.session.closedAt ? fmtJM(d.session.closedAt) : "—";

  const orderRows = withDetail
    ? d.orders.map((o) => `
        <tr>
          <td>${new Date(o.createdAt).toLocaleTimeString("en-JM", { hour: "numeric", minute: "2-digit", hour12: true })}</td>
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
      ${(d.salesSummary.totalRefunds ?? 0) > 0 ? `<div style="display:flex;justify-content:space-between;color:#c00"><span>Refunds:</span><span>-${fmt(d.salesSummary.totalRefunds ?? 0)}</span></div>` : ""}
      <div style="display:flex;justify-content:space-between;font-weight:bold"><span>Total sales:</span><span>${fmt(d.salesSummary.totalSales)}</span></div>
      <div style="border-top:1px dashed #000;margin:8px 0"></div>
      <b>Cash Reconciliation</b>
      <div style="display:flex;justify-content:space-between"><span>Opening cash:</span><span>${fmt(d.session.openingCash)}</span></div>
      <div style="display:flex;justify-content:space-between"><span>+ Cash sales:</span><span>${fmt(d.salesSummary.cashSales)}</span></div>
      ${(d.salesSummary.refundedCash ?? 0) > 0 ? `<div style="display:flex;justify-content:space-between;color:#c00"><span>- Cash refunds:</span><span>-${fmt(d.salesSummary.refundedCash ?? 0)}</span></div>` : ""}
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
      ${(() => {
        if (!d.session.denominationBreakdown) return "";
        try {
          const bd = JSON.parse(d.session.denominationBreakdown) as { bills?: Record<string, number>; coins?: Record<string, number>; total?: number };
          const rows = [
            ...Object.entries(bd.bills ?? {}).map(([k, v]) => `<div style="display:flex;justify-content:space-between"><span>${k} × ${v}</span><span>$${(parseFloat(k.replace(/[^0-9.]/g, "")) * v).toFixed(0)}</span></div>`),
            ...Object.entries(bd.coins ?? {}).map(([k, v]) => `<div style="display:flex;justify-content:space-between"><span>${k} × ${v}</span><span>$${(parseFloat(k.replace(/[^0-9.]/g, "")) * v).toFixed(2)}</span></div>`),
          ];
          return rows.length > 0 ? `
          <div style="border-top:1px dashed #000;margin:8px 0"></div>
          <b>Cash Denomination Breakdown</b>
          ${rows.join("")}
          <div style="display:flex;justify-content:space-between;font-weight:bold;margin-top:4px"><span>Breakdown Total:</span><span>$${Number(bd.total ?? 0).toFixed(2)}</span></div>` : "";
        } catch { return ""; }
      })()}
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
            {(salesSummary.totalRefunds ?? 0) > 0 && <div className="flex justify-between"><span className="flex items-center gap-1.5 text-red-400"><ArrowDownLeft className="h-3.5 w-3.5" />Refunds</span><span className="font-mono font-medium text-red-400">−{formatCurrency(salesSummary.totalRefunds ?? 0)}</span></div>}
            <Separator />
            <div className="flex justify-between font-bold"><span>Total Sales</span><span className="font-mono text-primary">{formatCurrency(salesSummary.totalSales)}</span></div>
          </div>

          {/* Cash reconciliation */}
          <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2 text-sm">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cash Reconciliation</p>
            <div className="flex justify-between"><span className="text-muted-foreground">Opening cash</span><span className="font-mono">{formatCurrency(session.openingCash)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">+ Cash sales</span><span className="font-mono">{formatCurrency(salesSummary.cashSales)}</span></div>
            {(salesSummary.refundedCash ?? 0) > 0 && <div className="flex justify-between"><span className="text-muted-foreground text-red-400">− Cash refunds</span><span className="font-mono text-red-400">−{formatCurrency(salesSummary.refundedCash ?? 0)}</span></div>}
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
  const { can } = useStaff();

  if (isLoading && !isError) {
    return <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">Loading session…</div>;
  }
  if (!data) return null;

  const { session, payouts, salesSummary, expectedCash, totalPayouts } = data;

  return (
    <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-4 sm:space-y-5">
      {/* Session header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <h2 className="text-lg font-bold">Shift Active</h2>
            <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs">Open</Badge>
            {session.locationName && (
              <Badge className="bg-primary/10 text-primary border-primary/30 text-xs flex items-center gap-1">
                <MapPin className="h-2.5 w-2.5" />{session.locationName}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Opened {format(new Date(session.openedAt), "h:mm a")} by {session.staffName}
          </p>
        </div>
        <div className="flex gap-2">
          {can("cash.manage_payouts") && (
            <Button variant="outline" size="sm" onClick={() => setPayoutOpen(true)}>
              <ArrowDownLeft className="h-3.5 w-3.5 mr-1.5 text-amber-400" />
              Add Payout
            </Button>
          )}
          {can("cash.close_session") ? (
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setCloseOpen(true)}>
              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
              Close Shift
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled title="Manager approval required to close shift">
              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
              Close Shift
            </Button>
          )}
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
function SessionHistoryItem({ sessionId, staffFilter }: { sessionId: number; staffFilter?: string }) {
  const { data } = useGetCashSession(sessionId);
  if (!data) return null;
  const { session, salesSummary, expectedCash } = data;
  // If a staffFilter is set, only show sessions belonging to that staff member
  if (staffFilter && session.staffName !== staffFilter) return null;
  const cashVariance = (session.actualCash ?? 0) - expectedCash;
  return (
    <div className="flex items-center gap-4 p-3 rounded-lg border border-border hover:bg-secondary/20 transition-colors text-sm">
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{session.staffName}</p>
        <p className="text-xs text-muted-foreground">
          {format(new Date(session.openedAt), "dd/MM, h:mm a")}
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
  const { can, staff: sessionStaff } = useStaff();
  const canViewAllHistory = can("reports.view");

  const { data: current, isLoading: loadingCurrent, isError: noSession } = useGetCurrentCashSession({
    query: { retry: false },
  });
  const { data: sessions } = useListCashSessions();
  const openSession = useOpenCashSession();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [eodSessionId, setEodSessionId] = useState<number | null>(null);

  const hasOpenSession = !!current?.session;
  const closedSessions = (sessions ?? []).filter((s) => s.status === "closed").slice(0, 20);
  // Cashiers only see their own shift history; managers see all
  const staffFilter = canViewAllHistory ? undefined : (sessionStaff?.name ?? undefined);

  const handleOpenShift = (openingCash: number, name: string, locationId?: number, locationName?: string) => {
    openSession.mutate(
      { data: { staffName: name, openingCash, locationId, locationName } },
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
                <SessionHistoryItem key={s.id} sessionId={s.id} staffFilter={staffFilter} />
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
