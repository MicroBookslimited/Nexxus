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
  ListChecks, ChevronRight, ChevronDown, SkipForward, AlertTriangle, ShoppingCart,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { TENANT_TOKEN_KEY } from "@/lib/saas-api";

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
type OpenShiftStaff = { id: number; name: string; role: string; permissions: string[] };

function OpenShiftPanel({
  onOpen,
  onExistingShift,
}: {
  onOpen: (openingCash: number, staff: OpenShiftStaff, locationId?: number, locationName?: string) => void;
  onExistingShift: (staff: OpenShiftStaff) => void;
}) {
  const [step, setStep] = useState<"pin" | "location" | "cash" | "checking">("pin");
  const [staff, setStaff] = useState<OpenShiftStaff | null>(null);
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

  const handlePinSuccess = async (s: { id: number; name: string; role: string; permissions?: string[] }) => {
    const staffInfo: OpenShiftStaff = { id: s.id, name: s.name, role: s.role, permissions: s.permissions ?? [] };
    setStaff(staffInfo);
    setStep("checking");

    // Check if this staff member already has an open shift before proceeding
    try {
      const token = localStorage.getItem("nexus_tenant_token");
      const resp = await fetch("/api/cash/sessions/current", {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          "x-staff-id": String(s.id),
        },
      });
      if (resp.ok) {
        // Already has an open shift — hand off immediately without creating a new one
        onExistingShift(staffInfo);
        return;
      }
    } catch {}

    // No existing shift — continue to the location / cash steps
    setStep(locations.length > 0 ? "location" : "cash");
  };

  const handleLocationNext = () => {
    setStep("cash");
  };

  const handleSubmit = () => {
    const amount = parseFloat(cash);
    if (isNaN(amount) || amount < 0 || !staff) return;
    const loc = locations.find(l => l.id === selectedLocationId);
    onOpen(amount, staff, selectedLocationId ?? undefined, loc?.name);
  };

  const stepLabel = step === "pin"
    ? "Enter your PIN to identify yourself and begin your shift."
    : step === "checking"
      ? "Checking for an existing shift…"
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
          {step === "checking" ? (
            <div className="flex flex-col items-center gap-3 py-6">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <p className="text-sm text-muted-foreground">Checking shift status for <span className="font-medium text-foreground">{staff?.name}</span>…</p>
            </div>
          ) : step === "pin" ? (
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
  openingCash,
  totalPayouts,
  splitCashSales,
  onClose,
  onClosed,
  closingFor,
}: {
  open: boolean;
  sessionId: number;
  expectedCash: number;
  salesSummary: { cashSales: number; cardSales: number; splitSales: number; creditSales?: number; totalSales: number; refundedCash?: number; refundedCard?: number; totalRefunds?: number; voidedCount?: number; voidedTotal?: number };
  openingCash: number;
  totalPayouts: number;
  splitCashSales?: number;
  onClose: () => void;
  onClosed: (closedSessionId: number) => void;
  /** When an admin is closing another staff member's shift, show their name in a banner */
  closingFor?: string;
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
          // Bust the individual-session cache so EodReportModal gets the
          // freshly-saved actualCash value instead of the pre-close snapshot
          queryClient.invalidateQueries({ queryKey: [`/api/cash/sessions/${sessionId}`] });
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
            Close Shift{closingFor ? ` — ${closingFor}` : ""}
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

        {/* Admin banner — only shown when a manager is closing someone else's shift */}
        {closingFor && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex items-start gap-2.5 -mt-1">
            <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-300">Manager closing <span className="font-bold">{closingFor}</span>'s shift</p>
              <p className="text-xs text-amber-400/80 mt-0.5">Count and record the cash in the drawer as you would for any end-of-shift reconciliation.</p>
            </div>
          </div>
        )}

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
              {(salesSummary.voidedCount ?? 0) > 0 && (
                <div className="flex justify-between text-orange-400"><span className="flex items-center gap-1"><ArrowDownLeft className="h-3.5 w-3.5" />Voids ({salesSummary.voidedCount})</span><span className="font-mono">{formatCurrency(salesSummary.voidedTotal ?? 0)}</span></div>
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

            {/* Expected cash breakdown — full equation */}
            <div className="rounded-lg bg-muted/30 border border-border p-3 space-y-1.5 text-sm">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Expected Cash Calculation</p>
              <div className="flex justify-between">
                <span className="text-muted-foreground flex items-center gap-1"><Banknote className="h-3.5 w-3.5" />Opening float</span>
                <span className="font-mono">{formatCurrency(openingCash)}</span>
              </div>
              {salesSummary.cashSales > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground flex items-center gap-1"><span className="text-xs w-3.5 text-center">+</span>Cash sales</span>
                  <span className="font-mono">{formatCurrency(salesSummary.cashSales - (salesSummary.refundedCash ?? 0))}</span>
                </div>
              )}
              {(splitCashSales ?? 0) > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground flex items-center gap-1"><span className="text-xs w-3.5 text-center">+</span>Split (cash portion)</span>
                  <span className="font-mono">{formatCurrency(splitCashSales ?? 0)}</span>
                </div>
              )}
              {(salesSummary.refundedCash ?? 0) > 0 && (
                <div className="flex justify-between text-red-400">
                  <span className="flex items-center gap-1"><span className="text-xs w-3.5 text-center">−</span>Cash refunds</span>
                  <span className="font-mono">−{formatCurrency(salesSummary.refundedCash ?? 0)}</span>
                </div>
              )}
              {totalPayouts > 0 && (
                <div className="flex justify-between text-amber-400">
                  <span className="flex items-center gap-1"><span className="text-xs w-3.5 text-center">−</span>Payouts</span>
                  <span className="font-mono">−{formatCurrency(totalPayouts)}</span>
                </div>
              )}
              <Separator className="my-1" />
              <div className="flex justify-between font-semibold">
                <span>Expected in drawer</span>
                <span className="font-mono text-primary">{formatCurrency(expectedCash)}</span>
              </div>
            </div>

            {/* Cash reconciliation */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-xs">
                <Banknote className="h-3.5 w-3.5 text-emerald-400" />
                Actual Cash Counted
                {actualCash && parseFloat(actualCash) === breakdownTotal && breakdownTotal > 0 && (
                  <span className="text-[10px] text-primary ml-auto">from breakdown</span>
                )}
              </Label>
              <p className="text-[11px] text-muted-foreground -mt-0.5">
                Total cash in drawer — includes opening float + any cash received
              </p>
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
                <div className={cn(
                  "rounded-md px-3 py-2 text-sm flex items-center justify-between font-mono",
                  cashVariance === 0
                    ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400"
                    : cashVariance > 0
                    ? "bg-blue-500/10 border border-blue-500/30 text-blue-400"
                    : "bg-red-500/10 border border-red-500/30 text-red-400"
                )}>
                  <span className="text-xs font-sans font-medium">
                    {cashVariance === 0 ? "Cash balanced ✓" : cashVariance > 0 ? "Cash over" : "Cash short"}
                  </span>
                  <span className="font-bold">
                    {cashVariance >= 0 ? "+" : ""}{formatCurrency(cashVariance)}
                  </span>
                </div>
              )}
            </div>

            {/* Card reconciliation */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-xs"><CreditCard className="h-3.5 w-3.5 text-blue-400" />Actual Card Total</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input type="number" min="0" step="0.01" className="pl-8 font-mono" value={actualCard} onChange={(e) => setActualCard(e.target.value)} placeholder="0.00" />
              </div>
              {actualCard !== "" && salesSummary.cardSales > 0 && (
                <div className={cn(
                  "rounded-md px-3 py-2 text-sm flex items-center justify-between font-mono",
                  cardVariance === 0
                    ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400"
                    : cardVariance > 0
                    ? "bg-blue-500/10 border border-blue-500/30 text-blue-400"
                    : "bg-red-500/10 border border-red-500/30 text-red-400"
                )}>
                  <span className="text-xs font-sans font-medium">
                    {cardVariance === 0 ? "Card balanced ✓" : cardVariance > 0 ? "Card over" : "Card short"}
                  </span>
                  <span className="font-bold">
                    {cardVariance >= 0 ? "+" : ""}{formatCurrency(cardVariance)}
                  </span>
                </div>
              )}
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
type ItemSummaryRow = { productName: string; sku?: string | null; totalQty: number; totalRevenue: number; totalTax?: number | null };

type CreditOrderRow = { orderNumber: string; total: number; customerName: string | null; customerPhone: string | null; arId: number | null; amountPaid: number | null; arStatus: string | null; createdAt: string };

type SessionDetail = {
  session: { staffName: string; openedAt: string; closedAt?: string | null; openingCash: number; actualCash?: number | null; actualCard?: number | null; closingNotes?: string | null; denominationBreakdown?: string | null };
  payouts: { reason: string; amount: number; staffName: string; createdAt: string }[];
  orders: { orderNumber: string; total: number; paymentMethod: string; createdAt: string }[];
  salesSummary: { cashSales: number; cardSales: number; splitSales: number; creditSales?: number; totalSales: number; refundedCash?: number; refundedCard?: number; totalRefunds?: number; voidedCount?: number; voidedTotal?: number };
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
      ${(d.salesSummary.voidedCount ?? 0) > 0 ? `<div style="display:flex;justify-content:space-between;color:#b45309"><span>Voids (${d.salesSummary.voidedCount}):</span><span>${fmt(d.salesSummary.voidedTotal ?? 0)}</span></div>` : ""}
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
      <b>Details of Products Sold</b>
      <table style="width:100%;border-collapse:collapse;margin-top:4px;font-size:10px">
        <thead><tr style="border-bottom:1px solid #000">
          <th style="text-align:left;padding:1px 2px">#</th>
          <th style="text-align:left;padding:1px 2px">SKU</th>
          <th style="text-align:left;padding:1px 2px">Product</th>
          <th style="text-align:right;padding:1px 2px">Qty</th>
          <th style="text-align:right;padding:1px 2px">Total</th>
        </tr></thead>
        <tbody>${d.itemSummary.map((r, i) => `
          <tr>
            <td style="padding:1px 2px">${i + 1}.</td>
            <td style="padding:1px 2px;font-family:monospace">${r.sku ?? "—"}</td>
            <td style="padding:1px 2px">${r.productName}</td>
            <td style="text-align:right;padding:1px 2px">${r.totalQty.toFixed(2)}</td>
            <td style="text-align:right;padding:1px 2px">J$${(Math.abs(r.totalRevenue) + (r.totalTax ?? 0)).toFixed(2)}</td>
          </tr>`).join("")}
          <tr style="border-top:1px solid #000;font-weight:bold">
            <td style="padding:2px 2px">#</td>
            <td></td>
            <td></td>
            <td style="text-align:right;padding:2px 2px">${d.itemSummary.reduce((s, r) => s + r.totalQty, 0).toFixed(2)}</td>
            <td style="text-align:right;padding:2px 2px">Grand Total: J$${d.itemSummary.reduce((s, r) => s + r.totalRevenue + (r.totalTax ?? 0), 0).toFixed(2)}</td>
          </tr>
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
type EodRecipient = { name: string; email: string; checked: boolean };

function EodReportModal({ sessionId, onClose }: { sessionId: number; onClose: () => void }) {
  const { data, isLoading, isError } = useGetCashSession(sessionId);
  const [expanded, setExpanded] = useState(false);
  const [eodEmailOpen, setEodEmailOpen] = useState(false);
  const [eodRecipients, setEodRecipients] = useState<EodRecipient[]>([]);
  const [eodCustomEmail, setEodCustomEmail] = useState("");
  const [eodFetching, setEodFetching] = useState(false);
  const [eodSending, setEodSending] = useState(false);
  const sendEodEmail = useSendEodReportEmail();
  const { toast } = useToast();

  useEffect(() => {
    if (!eodEmailOpen) return;
    setEodFetching(true);
    const token = localStorage.getItem(TENANT_TOKEN_KEY) ?? "";
    const headers: HeadersInit = { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
    fetch("/api/admin-users", { headers })
      .then(r => r.ok ? r.json() : [])
      .then((users: { name: string; email: string; isPrimary: boolean; status: string }[]) => {
        const active = users.filter(u => u.status === "active" && u.email);
        const seen = new Set<string>();
        const list: EodRecipient[] = [];
        active.sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0)).forEach(u => {
          const key = u.email.toLowerCase();
          if (!seen.has(key)) { seen.add(key); list.push({ name: u.name + (u.isPrimary ? " (Primary)" : ""), email: u.email, checked: true }); }
        });
        setEodRecipients(list);
      })
      .catch(() => {})
      .finally(() => setEodFetching(false));
  }, [eodEmailOpen]);

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
            {(salesSummary.voidedCount ?? 0) > 0 && <div className="flex justify-between"><span className="flex items-center gap-1.5 text-orange-400"><ArrowDownLeft className="h-3.5 w-3.5" />Voids ({salesSummary.voidedCount})</span><span className="font-mono font-medium text-orange-400">{formatCurrency(salesSummary.voidedTotal ?? 0)}</span></div>}
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

          {/* Details of products sold */}
          {data.itemSummary && data.itemSummary.length > 0 && (
            <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2 text-sm">
              <p className="text-sm font-bold text-foreground">Details of products sold</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border/60">
                      <th className="text-left font-semibold text-muted-foreground py-1.5 pr-2 w-6">#</th>
                      <th className="text-left font-semibold text-muted-foreground py-1.5 pr-3">SKU</th>
                      <th className="text-left font-semibold text-muted-foreground py-1.5 pr-3">Product</th>
                      <th className="text-right font-semibold text-muted-foreground py-1.5 pr-3">Quantity</th>
                      <th className="text-right font-semibold text-muted-foreground py-1.5">Total amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.itemSummary.map((row, i) => (
                      <tr key={i} className="border-b border-border/30">
                        <td className="py-1.5 pr-2 text-muted-foreground">{i + 1}.</td>
                        <td className="py-1.5 pr-3 font-mono text-muted-foreground">{row.sku ?? "—"}</td>
                        <td className="py-1.5 pr-3 text-foreground">{row.productName}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{row.totalQty.toFixed(2)}</td>
                        <td className="py-1.5 text-right tabular-nums font-mono">
                          J$ {(Math.abs(row.totalRevenue) + (row.totalTax ?? 0)).toLocaleString("en-JM", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-border font-bold">
                      <td className="py-2 pr-2 text-muted-foreground">#</td>
                      <td></td>
                      <td></td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {data.itemSummary.reduce((s, r) => s + r.totalQty, 0).toFixed(2)}
                      </td>
                      <td className="py-2 text-right tabular-nums font-mono text-primary">
                        Grand Total: J$ {data.itemSummary.reduce((s, r) => s + r.totalRevenue + (r.totalTax ?? 0), 0).toLocaleString("en-JM", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tbody>
                </table>
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
          <div className="border border-border rounded-lg p-3 bg-muted/40 space-y-3 mt-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 text-primary" />
                Email report to:
              </p>
              <button onClick={() => setEodEmailOpen(false)} className="text-muted-foreground hover:text-foreground text-sm leading-none">✕</button>
            </div>

            {/* Recipient checklist */}
            {eodFetching ? (
              <p className="text-xs text-muted-foreground text-center py-2">Loading recipients…</p>
            ) : eodRecipients.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-1">No admin users found. Add a custom email below.</p>
            ) : (
              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                {eodRecipients.map((r, i) => (
                  <label key={r.email} className="flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-muted/60 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={r.checked}
                      onChange={() => setEodRecipients(prev => prev.map((x, xi) => xi === i ? { ...x, checked: !x.checked } : x))}
                      className="h-3.5 w-3.5 accent-primary"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{r.name}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{r.email}</p>
                    </div>
                  </label>
                ))}
              </div>
            )}

            {/* Add custom email */}
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="Add another email…"
                value={eodCustomEmail}
                onChange={e => setEodCustomEmail(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && eodCustomEmail.includes("@")) {
                    setEodRecipients(prev => {
                      if (prev.some(x => x.email.toLowerCase() === eodCustomEmail.toLowerCase())) return prev;
                      return [...prev, { name: eodCustomEmail, email: eodCustomEmail, checked: true }];
                    });
                    setEodCustomEmail("");
                  }
                }}
                className="h-8 text-xs"
              />
              <Button
                size="sm"
                variant="outline"
                className="shrink-0"
                disabled={!eodCustomEmail.includes("@")}
                onClick={() => {
                  setEodRecipients(prev => {
                    if (prev.some(x => x.email.toLowerCase() === eodCustomEmail.toLowerCase())) return prev;
                    return [...prev, { name: eodCustomEmail, email: eodCustomEmail, checked: true }];
                  });
                  setEodCustomEmail("");
                }}
              >
                Add
              </Button>
            </div>

            {/* Send button */}
            <Button
              size="sm"
              className="w-full"
              disabled={eodSending || eodRecipients.filter(r => r.checked).length === 0}
              onClick={async () => {
                const targets = eodRecipients.filter(r => r.checked);
                if (targets.length === 0) return;
                setEodSending(true);
                let sent = 0;
                for (const t of targets) {
                  await new Promise<void>(resolve => {
                    sendEodEmail.mutate(
                      { data: { sessionId, to: t.email } },
                      { onSuccess: () => { sent++; resolve(); }, onError: () => resolve() }
                    );
                  });
                }
                setEodSending(false);
                if (sent > 0) {
                  toast({ title: `Report sent to ${sent} recipient${sent > 1 ? "s" : ""}!` });
                  setEodEmailOpen(false);
                } else {
                  toast({ title: "Failed to send", description: "Check email settings.", variant: "destructive" });
                }
              }}
            >
              {eodSending ? "Sending…" : `Send to ${eodRecipients.filter(r => r.checked).length} recipient${eodRecipients.filter(r => r.checked).length !== 1 ? "s" : ""}`}
            </Button>
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

/* ─── Shift Orders Table (reused in active panel and history) ─── */
type ShiftOrder = {
  id: number;
  orderNumber: string;
  total: number;
  paymentMethod: string | null;
  status: string;
  createdAt: string;
};

function paymentBadge(method: string | null) {
  if (!method) return null;
  const map: Record<string, { label: string; cls: string }> = {
    cash:  { label: "Cash",  cls: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
    card:  { label: "Card",  cls: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
    split: { label: "Split", cls: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
    credit:{ label: "A/R",   cls: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  };
  const m = map[method.toLowerCase()] ?? { label: method, cls: "bg-secondary text-muted-foreground border-border" };
  return <Badge className={cn("text-[10px] px-1.5 py-0 font-medium border", m.cls)}>{m.label}</Badge>;
}

function ShiftOrdersTable({ orders, title = "Orders" }: { orders: ShiftOrder[]; title?: string }) {
  const [expanded, setExpanded] = useState(true);
  const visible = orders.filter((o) => o.status !== "voided");
  const grandTotal = visible.reduce((s, o) => s + o.total, 0);

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2 pt-3 px-4">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center justify-between w-full text-left"
        >
          <CardTitle className="text-sm flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-primary" />
            {title}
            <span className="text-xs text-muted-foreground font-normal ml-1">({visible.length} orders)</span>
          </CardTitle>
          {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </button>
      </CardHeader>
      {expanded && (
        <CardContent className="px-0 pb-2">
          {visible.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No orders recorded this shift.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="text-left font-medium px-4 py-2">Order #</th>
                    <th className="text-left font-medium px-4 py-2">Time</th>
                    <th className="text-left font-medium px-4 py-2">Method</th>
                    <th className="text-right font-medium px-4 py-2">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {visible.map((o) => (
                    <tr key={o.id} className="hover:bg-secondary/20 transition-colors">
                      <td className="px-4 py-2 font-mono font-medium">{o.orderNumber}</td>
                      <td className="px-4 py-2 text-muted-foreground tabular-nums">
                        {format(new Date(o.createdAt), "h:mm a")}
                      </td>
                      <td className="px-4 py-2">{paymentBadge(o.paymentMethod)}</td>
                      <td className="px-4 py-2 text-right font-mono">{formatCurrency(o.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border bg-secondary/10">
                    <td colSpan={3} className="px-4 py-2 font-semibold text-xs text-muted-foreground">Total</td>
                    <td className="px-4 py-2 text-right font-mono font-bold">{formatCurrency(grandTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

/* ─── Active Session Panel ─── */
function ActiveSessionPanel({ staffName, onShiftClosed, autoOpen = false }: { staffName: string; onShiftClosed: (id: number) => void; autoOpen?: boolean }) {
  const { can, staff: activeStaff } = useStaff();
  const canSeeSensitive = can("reports.view"); // managers / admins only
  const { data, isLoading, isError } = useGetCurrentCashSession({
    query: { refetchInterval: 15000, retry: false, queryKey: ["/api/cash/sessions/current", activeStaff?.id ?? null] },
    request: activeStaff?.id ? { headers: { "x-staff-id": String(activeStaff.id) } } : undefined,
  });
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);

  useEffect(() => {
    if (autoOpen && data?.session && can("cash.close_session")) {
      setCloseOpen(true);
    }
  }, [autoOpen, data?.session?.id]);

  if (isLoading && !isError) {
    return <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">Loading session…</div>;
  }
  if (!data) return null;

  const { session, payouts, salesSummary, expectedCash, totalPayouts, splitCashSales, orders } = data;

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

      {/* Stats row — cashiers see only opening cash; managers see all */}
      <div className={cn("grid gap-3", canSeeSensitive ? "grid-cols-2 md:grid-cols-4" : "grid-cols-1 max-w-xs")}>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Opening Cash</p>
            <p className="text-xl font-bold font-mono mt-1">{formatCurrency(session.openingCash)}</p>
          </CardContent>
        </Card>
        {canSeeSensitive && (
          <>
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
          </>
        )}
      </div>

      {/* Sales breakdown + payouts — managers/admins only */}
      {canSeeSensitive && (
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
              {can("cash.manage_payouts") && (
                <Button variant="ghost" size="sm" className="w-full mt-3 text-xs text-muted-foreground" onClick={() => setPayoutOpen(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add Payout
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Orders this shift */}
      <ShiftOrdersTable orders={orders as any[]} title="Orders This Shift" />

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
        openingCash={session.openingCash}
        totalPayouts={totalPayouts}
        splitCashSales={splitCashSales ?? 0}
        onClose={() => setCloseOpen(false)}
        onClosed={(id) => { setCloseOpen(false); onShiftClosed(id); }}
      />
    </div>
  );
}

/* ─── Open Session Card (manager view) ─── */
function OpenSessionManagerCard({
  session,
}: {
  session: { id: number; staffName: string; openedAt: string; locationName?: string | null };
}) {
  const { data } = useGetCashSession(session.id);
  const queryClient = useQueryClient();
  const [closeOpen, setCloseOpen] = useState(false);
  const totalSales = data?.salesSummary?.totalSales ?? null;

  return (
    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 overflow-hidden">
      <div className="flex items-center gap-3 p-3">
        <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{session.staffName}</p>
          <p className="text-xs text-muted-foreground">
            Opened {format(new Date(session.openedAt), "dd/MM, h:mm a")}
            {session.locationName && ` · ${session.locationName}`}
          </p>
          {totalSales !== null && (
            <p className="text-xs text-emerald-400 font-mono mt-0.5">{formatCurrency(totalSales)} total sales</p>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="shrink-0 border-amber-500/40 text-amber-300 hover:bg-amber-500/20 text-xs h-7 px-2"
          disabled={!data}
          onClick={() => setCloseOpen(true)}
        >
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Close
        </Button>
      </div>

      {/* Full cash-declaration close flow — same as self-close but with admin banner */}
      {data && (
        <CloseShiftDialog
          open={closeOpen}
          sessionId={session.id}
          expectedCash={data.expectedCash}
          salesSummary={data.salesSummary}
          openingCash={data.session.openingCash}
          totalPayouts={data.totalPayouts}
          splitCashSales={data.splitCashSales ?? 0}
          closingFor={session.staffName}
          onClose={() => setCloseOpen(false)}
          onClosed={() => {
            setCloseOpen(false);
            queryClient.invalidateQueries({ queryKey: ["/api/cash/sessions"] });
            queryClient.invalidateQueries({ queryKey: [`/api/cash/sessions/${session.id}`] });
          }}
        />
      )}
    </div>
  );
}

/* ─── Session History Row ─── */
function SessionHistoryItem({ sessionId, staffFilter }: { sessionId: number; staffFilter?: string }) {
  const { data } = useGetCashSession(sessionId);
  const [expanded, setExpanded] = useState(false);
  if (!data) return null;
  const { session, salesSummary, expectedCash, orders } = data;
  if (staffFilter && session.staffName !== staffFilter) return null;
  const cashVariance = (session.actualCash ?? 0) - expectedCash;
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-4 p-3 w-full text-left hover:bg-secondary/20 transition-colors text-sm"
      >
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
        <div className="shrink-0 text-muted-foreground">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </div>
      </button>
      {expanded && (
        <div className="border-t border-border bg-secondary/5 p-3">
          <ShiftOrdersTable orders={(orders ?? []) as any[]} title={`${session.staffName}'s Orders`} />
        </div>
      )}
    </div>
  );
}

/* ─── Main Cash Management Page ─── */
export function CashManagement() {
  const { can, staff: sessionStaff, setStaff, clearStaff } = useStaff();
  const canViewAllHistory = can("reports.view");
  const shouldAutoClose = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("close") === "1";

  const { data: current, isLoading: loadingCurrent, isError: noSession, refetch: refetchCurrent } = useGetCurrentCashSession({
    query: { retry: false, enabled: !!sessionStaff?.id, queryKey: ["/api/cash/sessions/current", sessionStaff?.id ?? null] },
    request: sessionStaff?.id ? { headers: { "x-staff-id": String(sessionStaff.id) } } : undefined,
  });
  const { data: sessions } = useListCashSessions();
  const openSession = useOpenCashSession();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [eodSessionId, setEodSessionId] = useState<number | null>(null);
  const [sessionConflict, setSessionConflict] = useState(false);
  const [forceClosing, setForceClosing] = useState(false);

  const hasOpenSession = !!current?.session;
  const closedSessions = (sessions ?? []).filter((s) => s.status === "closed").slice(0, 20);
  // Open sessions visible to managers (all open); cashiers see none in history
  const openSessions = canViewAllHistory
    ? (sessions ?? []).filter((s) => s.status === "open")
    : [];
  // Cashiers only see their own shift history; managers see all
  const staffFilter = canViewAllHistory ? undefined : (sessionStaff?.name ?? undefined);
  const handleExistingShift = (staff: OpenShiftStaff) => {
    // Staff already has an open shift — set their context so it is fetched and shown
    setStaff({ id: staff.id, name: staff.name, role: staff.role, permissions: staff.permissions });
    queryClient.removeQueries({ queryKey: ["/api/cash/sessions/current"] });
    queryClient.invalidateQueries({ queryKey: ["/api/cash/sessions"] });
  };

  const handleOpenShift = (openingCash: number, staff: OpenShiftStaff, locationId?: number, locationName?: string) => {
    openSession.mutate(
      { data: { staffName: staff.name, staffId: staff.id, openingCash, locationId, locationName } },
      {
        onSuccess: () => {
          // Store the cashier's identity in the staff context so subsequent
          // requests carry the correct x-staff-id header.
          setStaff({ id: staff.id, name: staff.name, role: staff.role, permissions: staff.permissions });
          toast({ title: "Shift opened", description: `Opening cash: ${formatCurrency(openingCash)}` });
          setSessionConflict(false);
          queryClient.removeQueries({ queryKey: ["/api/cash/sessions/current"] });
          queryClient.invalidateQueries({ queryKey: ["/api/cash/sessions"] });
        },
        onError: (err: any) => {
          if (err?.response?.status === 409) {
            // Same cashier already has an open session — identify them and show it
            setStaff({ id: staff.id, name: staff.name, role: staff.role, permissions: staff.permissions });
            setSessionConflict(true);
            queryClient.removeQueries({ queryKey: ["/api/cash/sessions/current"] });
            refetchCurrent();
          } else {
            toast({ title: "Error", description: "Could not open shift", variant: "destructive" });
          }
        },
      },
    );
  };

  const handleForceClose = async () => {
    if (!can("cash.close_session")) {
      toast({ title: "Permission denied", description: "Only managers can force-close a session.", variant: "destructive" });
      return;
    }
    setForceClosing(true);
    try {
      const token = localStorage.getItem("nexus_tenant_token");
      const resp = await fetch("/api/cash/sessions/force-close", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (resp.ok) {
        toast({ title: "Stuck session cleared", description: "You can now open a new shift." });
        setSessionConflict(false);
        queryClient.removeQueries({ queryKey: ["/api/cash/sessions/current"] });
        queryClient.invalidateQueries({ queryKey: ["/api/cash/sessions"] });
      } else {
        const err = await resp.json().catch(() => ({}));
        toast({ title: "Could not clear session", description: (err as any).error ?? "Please try again.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Network error", description: "Please try again.", variant: "destructive" });
    } finally {
      setForceClosing(false);
    }
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
          {/* Stuck session conflict banner */}
          {sessionConflict && !hasOpenSession && (
            <div className="shrink-0 mx-4 mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="flex items-start gap-2.5 flex-1">
                <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-amber-300">Stuck session detected</p>
                  <p className="text-xs text-amber-400/80 mt-0.5">
                    The system has a session marked as open but it isn't loading correctly.
                    {can("cash.close_session")
                      ? " As a manager, you can force-close it to clear the way."
                      : " Ask a manager to force-close it."}
                  </p>
                </div>
              </div>
              {can("cash.close_session") && (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-amber-500/40 text-amber-300 hover:bg-amber-500/20 shrink-0"
                  disabled={forceClosing}
                  onClick={handleForceClose}
                >
                  {forceClosing ? "Clearing…" : "Force Close Stuck Session"}
                </Button>
              )}
            </div>
          )}
          {loadingCurrent && !noSession ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">Loading…</div>
          ) : hasOpenSession ? (
            <ActiveSessionPanel staffName={current!.session.staffName} onShiftClosed={(id) => { clearStaff(); setEodSessionId(id); }} autoOpen={shouldAutoClose} />
          ) : (
            <OpenShiftPanel onOpen={handleOpenShift} onExistingShift={handleExistingShift} />
          )}
        </div>

        {/* Right sidebar: active shifts (managers) + session history */}
        {(closedSessions.length > 0 || openSessions.length > 0) && (
          <div className="w-80 border-l border-border flex flex-col shrink-0">
            {/* Active Shifts — managers only */}
            {openSessions.length > 0 && (
              <>
                <div className="px-4 py-3 border-b border-border">
                  <h2 className="text-sm font-semibold flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse inline-block" />
                    Active Shifts ({openSessions.length})
                  </h2>
                </div>
                <div className="p-3 space-y-2 border-b border-border">
                  {openSessions.map((s) => (
                    <OpenSessionManagerCard
                      key={s.id}
                      session={s}
                    />
                  ))}
                </div>
              </>
            )}

            {/* Shift History */}
            {closedSessions.length > 0 && (
              <>
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
              </>
            )}
          </div>
        )}
      </div>

      {eodSessionId !== null && (
        <EodReportModal sessionId={eodSessionId} onClose={() => setEodSessionId(null)} />
      )}
    </div>
  );
}
