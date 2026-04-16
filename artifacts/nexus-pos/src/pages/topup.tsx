import { useState, useEffect, useCallback } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useStaff } from "@/contexts/StaffContext";
import { TENANT_TOKEN_KEY } from "@/lib/saas-api";
import { cn } from "@/lib/utils";
import {
  Smartphone, Wallet, ChevronRight, CheckCircle2, XCircle, Clock,
  RefreshCw, TrendingUp, ArrowUpRight, Search, Filter, Globe, Signal,
  AlertCircle, Loader2, Phone, DollarSign, Star, History, BarChart2,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { format } from "date-fns";

/* ── Types ──────────────────────────────────────────────────────────── */

interface DingCountry { Iso: string; Name: string; RegionCode: string; }
interface DingOperator { ProviderCode: string; Name: string; CountryIso: string; LogoUrl?: string; }
interface DingProduct {
  SkuCode: string; Name: string;
  LocalisedPrice?: { CustomerFee: number; SenderFee: number; CurrencyIso: string; };
  SendValue: number; SendCurrencyIso: string;
  ReceiverCurrencyIso: string;
  ValidityDays?: number;
  IsRangeTopUp?: boolean; Minimum?: number; Maximum?: number;
}

interface TopupTransaction {
  id: number; tenantId: number; dingTransactionId?: string; distributorRef: string;
  phoneNumber: string; countryCode: string; operatorId: string; operatorName: string;
  productSkuCode: string; productName: string; sendValue: number; sendCurrency: string;
  benefitValue: number; benefitCurrency: string; cost: number; commissionEarned: number;
  status: "pending" | "success" | "failed"; staffName?: string; errorMessage?: string;
  createdAt: string;
}

interface WalletInfo { id: number; tenantId: number; balance: number; totalTopups: number; totalCommission: number; }
interface Summary {
  today: { total: number; count: number; commission: number };
  month: { total: number; count: number; commission: number };
  allTime: { total: number; count: number; commission: number };
  wallet: { balance: number };
}

/* ── Helpers ────────────────────────────────────────────────────────── */

function authHeader() {
  return { Authorization: `Bearer ${localStorage.getItem(TENANT_TOKEN_KEY) ?? ""}` };
}

async function apiFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(path, { ...opts, headers: { ...authHeader(), "Content-Type": "application/json", ...(opts.headers ?? {}) } });
  const body = await res.json() as T & { error?: string };
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  return body;
}

const JMD = (v: number) => new Intl.NumberFormat("en-JM", { style: "currency", currency: "JMD", minimumFractionDigits: 2 }).format(v);

function StatusBadge({ status }: { status: string }) {
  if (status === "success") return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30"><CheckCircle2 className="h-3 w-3 mr-1" />Sent</Badge>;
  if (status === "pending") return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
  return <Badge className="bg-red-500/20 text-red-400 border-red-500/30"><XCircle className="h-3 w-3 mr-1" />Failed</Badge>;
}

/* ── Step indicators ─────────────────────────────────────────────────── */
const STEPS = ["Country", "Operator", "Phone", "Amount", "Confirm"];

function StepBar({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-1 text-xs">
      {STEPS.map((s, i) => (
        <div key={s} className="flex items-center gap-1">
          <div className={cn(
            "h-6 px-2.5 rounded-full flex items-center font-medium transition-all",
            i < step ? "bg-primary text-primary-foreground" :
            i === step ? "bg-primary/20 text-primary border border-primary" :
            "bg-muted text-muted-foreground"
          )}>{s}</div>
          {i < STEPS.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground/40" />}
        </div>
      ))}
    </div>
  );
}

/* ── Main Component ─────────────────────────────────────────────────── */

export function TopUp() {
  const { toast } = useToast();
  const { activeStaff } = useStaff();

  const [tab, setTab] = useState<"send" | "history" | "reports">("send");

  // Wallet & summary
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loadingWallet, setLoadingWallet] = useState(true);

  // Ding data
  const [countries, setCountries] = useState<DingCountry[]>([]);
  const [loadingCountries, setLoadingCountries] = useState(true);
  const [countriesError, setCountriesError] = useState<string | null>(null);
  const [operators, setOperators] = useState<DingOperator[]>([]);
  const [products, setProducts] = useState<DingProduct[]>([]);
  const [loadingOperators, setLoadingOperators] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);

  // Selection state
  const [step, setStep] = useState(0);
  const [selectedCountry, setSelectedCountry] = useState<DingCountry | null>(null);
  const [selectedOperator, setSelectedOperator] = useState<DingOperator | null>(null);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<DingProduct | null>(null);
  const [customAmount, setCustomAmount] = useState("");
  const [countrySearch, setCountrySearch] = useState("");
  const [operatorSearch, setOperatorSearch] = useState("");

  // Confirm/send
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState<{ success: boolean; txn: TopupTransaction } | null>(null);
  const [resultOpen, setResultOpen] = useState(false);

  // History
  const [transactions, setTransactions] = useState<TopupTransaction[]>([]);
  const [loadingTxns, setLoadingTxns] = useState(false);
  const [historyFilter, setHistoryFilter] = useState("all");
  const [checkingId, setCheckingId] = useState<number | null>(null);

  // Fund wallet dialog (admin)
  const [fundOpen, setFundOpen] = useState(false);
  const [fundAmount, setFundAmount] = useState("");
  const [fundDesc, setFundDesc] = useState("");
  const [funding, setFunding] = useState(false);

  /* ── Load wallet + summary ── */
  const loadWallet = useCallback(async () => {
    try {
      setLoadingWallet(true);
      const [w, s] = await Promise.all([
        apiFetch<WalletInfo>("/api/topup/wallet"),
        apiFetch<Summary>("/api/topup/summary"),
      ]);
      setWallet(w);
      setSummary(s);
    } catch { /* ignore */ }
    finally { setLoadingWallet(false); }
  }, []);

  /* ── Load countries ── */
  const loadCountries = useCallback(async () => {
    try {
      setLoadingCountries(true);
      setCountriesError(null);
      const data = await apiFetch<{ Countries?: DingCountry[] }>("/api/topup/countries");
      const list = data.Countries ?? [];
      setCountries(list);
      if (list.length === 0) {
        setCountriesError("no_countries");
      }
      const jm = list.find(c => c.Iso === "JM") ?? null;
      if (jm && !selectedCountry) {
        setSelectedCountry(jm);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("401") || msg.includes("403") || msg.includes("Unauthorized")) {
        setCountriesError("auth");
      } else {
        setCountriesError("api_key");
      }
    } finally {
      setLoadingCountries(false);
    }
  }, [selectedCountry]);

  useEffect(() => { loadWallet(); loadCountries(); }, [loadWallet, loadCountries]);

  /* ── Load operators when country selected ── */
  useEffect(() => {
    if (!selectedCountry) return;
    setLoadingOperators(true);
    setOperators([]); setSelectedOperator(null); setProducts([]); setSelectedProduct(null);
    apiFetch<{ Providers?: DingOperator[] }>(`/api/topup/operators?countryIso=${selectedCountry.Iso}`)
      .then(d => setOperators(d.Providers ?? []))
      .catch(() => {})
      .finally(() => setLoadingOperators(false));
  }, [selectedCountry]);

  /* ── Load products when operator selected ── */
  useEffect(() => {
    if (!selectedOperator) return;
    setLoadingProducts(true);
    setProducts([]); setSelectedProduct(null);
    apiFetch<{ Products?: DingProduct[] }>(`/api/topup/products?operatorId=${encodeURIComponent(selectedOperator.ProviderCode)}`)
      .then(d => setProducts(d.Products ?? []))
      .catch(() => {})
      .finally(() => setLoadingProducts(false));
  }, [selectedOperator]);

  /* ── Load history ── */
  const loadHistory = useCallback(async () => {
    setLoadingTxns(true);
    try {
      const data = await apiFetch<TopupTransaction[]>(`/api/topup/transactions?status=${historyFilter}&limit=100`);
      setTransactions(data);
    } catch { /* ignore */ }
    finally { setLoadingTxns(false); }
  }, [historyFilter]);

  useEffect(() => { if (tab === "history") loadHistory(); }, [tab, loadHistory]);

  /* ── Check pending status ── */
  async function checkStatus(id: number) {
    setCheckingId(id);
    try {
      const updated = await apiFetch<TopupTransaction>(`/api/topup/status/${id}`);
      setTransactions(prev => prev.map(t => t.id === id ? updated : t));
    } catch { /* ignore */ }
    finally { setCheckingId(null); }
  }

  /* ── Send top-up ── */
  async function handleSend() {
    if (!selectedOperator || !selectedProduct || !phoneNumber) return;
    const cost = selectedProduct.LocalisedPrice?.SenderFee ?? selectedProduct.SendValue;
    const face = selectedProduct.IsRangeTopUp ? parseFloat(customAmount) : selectedProduct.SendValue;

    setSending(true);
    setConfirmOpen(false);
    try {
      const result = await apiFetch<{ success: boolean; transaction: TopupTransaction; walletBalance: number }>("/api/topup/send", {
        method: "POST",
        body: JSON.stringify({
          phoneNumber, countryCode: selectedCountry?.Iso ?? "JM",
          operatorId: selectedOperator.ProviderCode, operatorName: selectedOperator.Name,
          productSkuCode: selectedProduct.SkuCode, productName: selectedProduct.Name,
          sendValue: face, sendCurrency: selectedProduct.SendCurrencyIso,
          benefitValue: face, benefitCurrency: selectedProduct.ReceiverCurrencyIso,
          cost, staffId: activeStaff?.id, staffName: activeStaff?.name,
        }),
      });
      setLastResult({ success: true, txn: result.transaction });
      if (wallet) setWallet({ ...wallet, balance: result.walletBalance });
      loadWallet();
    } catch (err) {
      setLastResult({ success: false, txn: { status: "failed", errorMessage: err instanceof Error ? err.message : "Unknown error", phoneNumber, productName: selectedProduct.Name, sendValue: face, sendCurrency: selectedProduct.SendCurrencyIso, operatorName: selectedOperator.Name } as TopupTransaction });
    }
    setSending(false);
    setResultOpen(true);
  }

  /* ── Reset flow ── */
  function resetFlow() {
    setStep(0);
    setSelectedOperator(null);
    setPhoneNumber("");
    setSelectedProduct(null);
    setCustomAmount("");
    setResultOpen(false);
    setLastResult(null);
  }

  const filteredCountries = countries.filter(c => !countrySearch || c.Name.toLowerCase().includes(countrySearch.toLowerCase()) || c.Iso.toLowerCase().includes(countrySearch.toLowerCase()));
  const filteredOperators = operators.filter(o => !operatorSearch || o.Name.toLowerCase().includes(operatorSearch.toLowerCase()));

  const face = selectedProduct?.IsRangeTopUp ? parseFloat(customAmount) || 0 : (selectedProduct?.SendValue ?? 0);
  const cost = selectedProduct?.LocalisedPrice?.SenderFee ?? face;
  const commission = face - cost;

  /* ── Render ── */
  return (
    <Layout title="Top-Up / Airtime">
      <div className="flex flex-col h-full gap-4 p-4 md:p-6 overflow-auto">

        {/* Header metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="bg-gradient-to-br from-primary/20 to-primary/5 border-primary/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">Wallet Balance</span>
                <Wallet className="h-4 w-4 text-primary" />
              </div>
              {loadingWallet ? <div className="h-7 w-24 bg-muted/30 animate-pulse rounded" /> :
                <p className="text-xl font-bold text-primary">{JMD(wallet?.balance ?? 0)}</p>}
              <button onClick={() => setFundOpen(true)} className="text-xs text-primary/70 hover:text-primary mt-1 underline underline-offset-2">Fund wallet</button>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">Today's Top-Ups</span>
                <ArrowUpRight className="h-4 w-4 text-emerald-400" />
              </div>
              {loadingWallet ? <div className="h-7 w-24 bg-muted/30 animate-pulse rounded" /> :
                <p className="text-xl font-bold">{summary?.today.count ?? 0} <span className="text-sm font-normal text-muted-foreground">sent</span></p>}
              <p className="text-xs text-muted-foreground mt-1">{JMD(summary?.today.total ?? 0)} value</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">Today's Commission</span>
                <TrendingUp className="h-4 w-4 text-amber-400" />
              </div>
              {loadingWallet ? <div className="h-7 w-24 bg-muted/30 animate-pulse rounded" /> :
                <p className="text-xl font-bold text-amber-400">{JMD(summary?.today.commission ?? 0)}</p>}
              <p className="text-xs text-muted-foreground mt-1">{JMD(summary?.month.commission ?? 0)} this month</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">All-Time Revenue</span>
                <DollarSign className="h-4 w-4 text-green-400" />
              </div>
              {loadingWallet ? <div className="h-7 w-24 bg-muted/30 animate-pulse rounded" /> :
                <p className="text-xl font-bold text-green-400">{JMD(summary?.allTime.total ?? 0)}</p>}
              <p className="text-xs text-muted-foreground mt-1">{summary?.allTime.count ?? 0} total transactions</p>
            </CardContent>
          </Card>
        </div>

        {/* Tab bar */}
        <div className="flex gap-2 border-b border-border pb-1">
          {[
            { id: "send", label: "Send Top-Up", icon: Smartphone },
            { id: "history", label: "History", icon: History },
            { id: "reports", label: "Reports", icon: BarChart2 },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as typeof tab)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-t-md border-b-2 transition-colors",
                tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <t.icon className="h-4 w-4" />{t.label}
            </button>
          ))}
        </div>

        {/* ── SEND TAB ── */}
        {tab === "send" && (
          <div className="grid md:grid-cols-2 gap-4 flex-1">

            {/* Left: Step flow */}
            <Card className="flex flex-col">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Smartphone className="h-4 w-4 text-primary" />
                    New Top-Up
                  </CardTitle>
                  {step > 0 && (
                    <Button variant="ghost" size="sm" onClick={resetFlow} className="text-xs h-7">Reset</Button>
                  )}
                </div>
                <StepBar step={step} />
              </CardHeader>
              <CardContent className="flex flex-col gap-4 flex-1">

                {/* Step 0: Country */}
                {step === 0 && (
                  <div className="space-y-3">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input className="pl-8" placeholder="Search country…" value={countrySearch} onChange={e => setCountrySearch(e.target.value)} />
                    </div>
                    {loadingCountries && (
                      <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground gap-2">
                        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                        <p className="text-xs">Loading countries…</p>
                      </div>
                    )}
                    {!loadingCountries && countriesError === "auth" && (
                      <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground gap-2">
                        <AlertCircle className="h-8 w-8 opacity-40" />
                        <p className="text-sm font-medium">Session expired</p>
                        <p className="text-xs">Please log in again to use Top-Up.</p>
                      </div>
                    )}
                    {!loadingCountries && countriesError === "api_key" && (
                      <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground gap-2">
                        <AlertCircle className="h-8 w-8 opacity-40" />
                        <p className="text-sm font-medium">Ding Connect API key not configured</p>
                        <p className="text-xs">Ask your system administrator to set the DING_API_KEY.</p>
                      </div>
                    )}
                    {!loadingCountries && !countriesError && countries.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground gap-2">
                        <AlertCircle className="h-8 w-8 opacity-40" />
                        <p className="text-sm font-medium">No countries available</p>
                        <p className="text-xs">Check your Ding Connect account configuration.</p>
                      </div>
                    )}
                    <div className="space-y-1 max-h-80 overflow-y-auto pr-1">
                      {filteredCountries.map(c => (
                        <button
                          key={c.Iso}
                          onClick={() => { setSelectedCountry(c); setStep(1); setCountrySearch(""); }}
                          className={cn(
                            "w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-accent/50 transition-colors text-sm",
                            selectedCountry?.Iso === c.Iso && "bg-primary/10 border border-primary/20"
                          )}
                        >
                          <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="font-medium flex-1 text-left">{c.Name}</span>
                          <Badge variant="outline" className="text-xs">{c.Iso}</Badge>
                          {c.Iso === "JM" && <Star className="h-3.5 w-3.5 text-yellow-400 fill-yellow-400" />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Step 1: Operator */}
                {step === 1 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Globe className="h-4 w-4" />
                      <span>{selectedCountry?.Name}</span>
                      <button onClick={() => setStep(0)} className="text-primary text-xs underline ml-auto">Change</button>
                    </div>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input className="pl-8" placeholder="Search operator…" value={operatorSearch} onChange={e => setOperatorSearch(e.target.value)} />
                    </div>
                    {loadingOperators && <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}
                    <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
                      {filteredOperators.map(op => (
                        <button
                          key={op.ProviderCode}
                          onClick={() => { setSelectedOperator(op); setStep(2); setOperatorSearch(""); }}
                          className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-accent/50 transition-colors text-sm"
                        >
                          <Signal className="h-5 w-5 text-primary shrink-0" />
                          <span className="font-medium flex-1 text-left">{op.Name}</span>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Step 2: Phone number */}
                {step === 2 && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Signal className="h-4 w-4" />
                      <span>{selectedOperator?.Name}</span>
                      <button onClick={() => setStep(1)} className="text-primary text-xs underline ml-auto">Change</button>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">Phone Number</Label>
                      <div className="flex gap-2">
                        <div className="flex h-9 items-center rounded-md border border-input bg-muted/30 px-3 text-sm text-muted-foreground whitespace-nowrap">
                          {selectedCountry?.Iso === "JM" ? "+1 (876)" : `+${selectedCountry?.Iso}`}
                        </div>
                        <Input
                          id="phone"
                          type="tel"
                          placeholder="XXX-XXXX"
                          value={phoneNumber}
                          onChange={e => setPhoneNumber(e.target.value.replace(/\D/g, "").slice(0, 10))}
                          className="flex-1"
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">Enter the recipient's mobile number</p>
                    </div>
                    <Button
                      className="w-full"
                      disabled={phoneNumber.length < 7}
                      onClick={() => setStep(3)}
                    >
                      Continue <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                )}

                {/* Step 3: Amount/Product */}
                {step === 3 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Phone className="h-4 w-4" />
                      <span>{phoneNumber}</span>
                      <button onClick={() => setStep(2)} className="text-primary text-xs underline ml-auto">Change</button>
                    </div>
                    {loadingProducts && <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}
                    <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
                      {products.map(p => {
                        const price = p.LocalisedPrice?.CustomerFee ?? p.SendValue;
                        const isSelected = selectedProduct?.SkuCode === p.SkuCode;
                        return (
                          <button
                            key={p.SkuCode}
                            onClick={() => { setSelectedProduct(p); if (!p.IsRangeTopUp) setStep(4); }}
                            className={cn(
                              "flex flex-col items-start p-3 rounded-lg border transition-all text-left",
                              isSelected
                                ? "border-primary bg-primary/10"
                                : "border-border hover:border-primary/40 hover:bg-accent/30"
                            )}
                          >
                            <span className="text-base font-bold text-primary">{JMD(price)}</span>
                            <span className="text-xs text-muted-foreground line-clamp-1">{p.Name}</span>
                            {p.ValidityDays && <span className="text-xs text-muted-foreground/60 mt-0.5">{p.ValidityDays}d validity</span>}
                            {p.IsRangeTopUp && <span className="text-xs text-primary/70 mt-0.5">Custom amount</span>}
                          </button>
                        );
                      })}
                    </div>
                    {selectedProduct?.IsRangeTopUp && (
                      <div className="space-y-2">
                        <Label>Custom Amount ({selectedProduct.SendCurrencyIso})</Label>
                        <Input type="number" placeholder={`${selectedProduct.Minimum ?? 100} – ${selectedProduct.Maximum ?? 99999}`} value={customAmount} onChange={e => setCustomAmount(e.target.value)} />
                        <Button className="w-full" disabled={!customAmount || parseFloat(customAmount) <= 0} onClick={() => setStep(4)}>
                          Continue
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {/* Step 4: Confirm */}
                {step === 4 && selectedProduct && (
                  <div className="space-y-4">
                    <div className="rounded-lg border border-border/60 bg-muted/20 p-4 space-y-3">
                      <h3 className="text-sm font-semibold text-foreground">Transaction Summary</h3>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between"><span className="text-muted-foreground">Recipient</span><span className="font-medium">{phoneNumber}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Operator</span><span className="font-medium">{selectedOperator?.Name}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Product</span><span className="font-medium">{selectedProduct.Name}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Top-Up Value</span><span className="font-bold text-primary">{JMD(face)}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Cost to You</span><span className="font-medium">{JMD(cost)}</span></div>
                        <div className="flex justify-between border-t border-border/40 pt-2">
                          <span className="text-muted-foreground">Commission Earned</span>
                          <span className={cn("font-medium", commission > 0 ? "text-emerald-400" : "text-muted-foreground")}>{JMD(commission > 0 ? commission : 0)}</span>
                        </div>
                      </div>
                    </div>

                    {wallet && wallet.balance < cost && (
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        <span>Insufficient wallet balance ({JMD(wallet.balance)}). Please fund your wallet.</span>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => setStep(3)} className="flex-1">Back</Button>
                      <Button
                        onClick={() => setConfirmOpen(true)}
                        disabled={sending || (!!wallet && wallet.balance < cost)}
                        className="flex-2 flex-1 bg-emerald-600 hover:bg-emerald-700"
                      >
                        {sending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending…</> : "Send Top-Up"}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Right: Recent transactions */}
            <Card className="flex flex-col">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <History className="h-4 w-4 text-primary" />
                  Recent Transactions
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 overflow-auto space-y-2 max-h-[500px]">
                {loadingWallet ? (
                  <div className="space-y-2">
                    {[1,2,3].map(i => <div key={i} className="h-16 rounded-lg bg-muted/30 animate-pulse" />)}
                  </div>
                ) : (
                  <RecentList />
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── HISTORY TAB ── */}
        {tab === "history" && (
          <Card className="flex-1">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <History className="h-4 w-4 text-primary" />
                  Transaction History
                </CardTitle>
                <div className="flex items-center gap-2">
                  <select
                    value={historyFilter}
                    onChange={e => setHistoryFilter(e.target.value)}
                    className="text-xs h-8 rounded-md border border-input bg-transparent px-2 focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="all">All</option>
                    <option value="success">Sent</option>
                    <option value="pending">Pending</option>
                    <option value="failed">Failed</option>
                  </select>
                  <Button variant="outline" size="sm" onClick={loadHistory} disabled={loadingTxns} className="h-8 gap-1.5 text-xs">
                    <RefreshCw className={cn("h-3.5 w-3.5", loadingTxns && "animate-spin")} />Refresh
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loadingTxns ? (
                <div className="space-y-2">{[1,2,3,4,5].map(i => <div key={i} className="h-14 rounded-lg bg-muted/30 animate-pulse" />)}</div>
              ) : transactions.length === 0 ? (
                <div className="flex flex-col items-center py-16 text-muted-foreground gap-2">
                  <Smartphone className="h-10 w-10 opacity-20" />
                  <p className="text-sm">No transactions yet</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground text-xs">
                        <th className="text-left py-2 px-3 font-medium">Phone</th>
                        <th className="text-left py-2 px-3 font-medium">Operator</th>
                        <th className="text-left py-2 px-3 font-medium">Product</th>
                        <th className="text-right py-2 px-3 font-medium">Value</th>
                        <th className="text-right py-2 px-3 font-medium">Commission</th>
                        <th className="text-center py-2 px-3 font-medium">Status</th>
                        <th className="text-right py-2 px-3 font-medium">Date</th>
                        <th className="py-2 px-3"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.map(t => (
                        <tr key={t.id} className="border-b border-border/40 hover:bg-accent/20">
                          <td className="py-2.5 px-3 font-medium">{t.phoneNumber}</td>
                          <td className="py-2.5 px-3 text-muted-foreground">{t.operatorName}</td>
                          <td className="py-2.5 px-3 text-muted-foreground text-xs">{t.productName}</td>
                          <td className="py-2.5 px-3 text-right font-semibold">{JMD(t.sendValue)}</td>
                          <td className="py-2.5 px-3 text-right text-emerald-400">{t.commissionEarned > 0 ? JMD(t.commissionEarned) : "—"}</td>
                          <td className="py-2.5 px-3 text-center"><StatusBadge status={t.status} /></td>
                          <td className="py-2.5 px-3 text-right text-xs text-muted-foreground">{format(new Date(t.createdAt), "MMM d, h:mm a")}</td>
                          <td className="py-2.5 px-3">
                            {t.status === "pending" && (
                              <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => checkStatus(t.id)} disabled={checkingId === t.id}>
                                {checkingId === t.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── REPORTS TAB ── */}
        {tab === "reports" && (
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" /> Commission Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { label: "Today", data: summary?.today },
                  { label: "This Month", data: summary?.month },
                  { label: "All Time", data: summary?.allTime },
                ].map(({ label, data }) => (
                  <div key={label} className="rounded-lg border border-border/60 p-4 space-y-2">
                    <p className="text-sm font-semibold text-muted-foreground">{label}</p>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <p className="text-xs text-muted-foreground">Transactions</p>
                        <p className="text-lg font-bold">{data?.count ?? 0}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Revenue</p>
                        <p className="text-lg font-bold">{JMD(data?.total ?? 0)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Commission</p>
                        <p className="text-lg font-bold text-emerald-400">{JMD(data?.commission ?? 0)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-primary" /> Wallet Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-2">
                  <p className="text-xs text-muted-foreground">Current Balance</p>
                  <p className="text-3xl font-bold text-primary">{JMD(wallet?.balance ?? 0)}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-border/60 p-3">
                    <p className="text-xs text-muted-foreground">Total Top-Ups Sent</p>
                    <p className="text-xl font-bold mt-1">{wallet?.totalTopups ?? 0}</p>
                  </div>
                  <div className="rounded-lg border border-border/60 p-3">
                    <p className="text-xs text-muted-foreground">Total Commission Earned</p>
                    <p className="text-xl font-bold mt-1 text-emerald-400">{JMD(wallet?.totalCommission ?? 0)}</p>
                  </div>
                </div>
                <Button variant="outline" onClick={() => setFundOpen(true)} className="w-full gap-2">
                  <Wallet className="h-4 w-4" />Fund Wallet
                </Button>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* ── Confirm dialog ── */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-primary" />Confirm Top-Up
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="rounded-lg bg-muted/30 p-4 space-y-2">
              <div className="flex justify-between"><span className="text-muted-foreground">Phone</span><span className="font-semibold">{phoneNumber}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Operator</span><span className="font-semibold">{selectedOperator?.Name}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Amount</span><span className="font-bold text-primary text-base">{JMD(face)}</span></div>
              {commission > 0 && <div className="flex justify-between border-t border-border/40 pt-2"><span className="text-muted-foreground">Commission</span><span className="font-medium text-emerald-400">{JMD(commission)}</span></div>}
            </div>
            <p className="text-xs text-muted-foreground text-center">This action cannot be undone. The top-up will be sent immediately.</p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button onClick={handleSend} disabled={sending} className="bg-emerald-600 hover:bg-emerald-700 gap-2">
              {sending ? <><Loader2 className="h-4 w-4 animate-spin" />Sending…</> : <><CheckCircle2 className="h-4 w-4" />Confirm & Send</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Result dialog ── */}
      <Dialog open={resultOpen} onOpenChange={setResultOpen}>
        <DialogContent className="max-w-sm text-center">
          <div className="flex flex-col items-center gap-4 py-4">
            {lastResult?.success ? (
              <CheckCircle2 className="h-16 w-16 text-emerald-400" />
            ) : (
              <XCircle className="h-16 w-16 text-red-400" />
            )}
            <div>
              <h2 className="text-xl font-bold">{lastResult?.success ? "Top-Up Sent!" : "Top-Up Failed"}</h2>
              {lastResult?.success ? (
                <p className="text-muted-foreground text-sm mt-1">
                  {JMD(lastResult.txn.sendValue)} sent to {lastResult.txn.phoneNumber}
                </p>
              ) : (
                <p className="text-red-400 text-sm mt-1">{lastResult?.txn.errorMessage ?? "An error occurred"}</p>
              )}
            </div>
            {lastResult?.success && lastResult.txn.commissionEarned > 0 && (
              <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-4 py-2 text-sm">
                <span className="text-muted-foreground">Commission earned: </span>
                <span className="font-bold text-emerald-400">{JMD(lastResult.txn.commissionEarned)}</span>
              </div>
            )}
            {lastResult?.success && (
              <div className="text-xs text-muted-foreground">
                Ref: {lastResult.txn.distributorRef}
                {lastResult.txn.dingTransactionId && <><br />Ding ID: {lastResult.txn.dingTransactionId}</>}
              </div>
            )}
          </div>
          <DialogFooter className="flex-col gap-2">
            <Button onClick={resetFlow} className="w-full">New Top-Up</Button>
            {lastResult?.success && (
              <Button variant="outline" onClick={() => { setResultOpen(false); setTab("history"); }} className="w-full">View History</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Fund wallet dialog ── */}
      <Dialog open={fundOpen} onOpenChange={setFundOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-primary" />Fund Wallet
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Add credit to your top-up wallet. Contact your account manager to arrange a transfer.</p>
            <div className="space-y-2">
              <Label>Amount (JMD)</Label>
              <Input type="number" placeholder="e.g. 10000" value={fundAmount} onChange={e => setFundAmount(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Input placeholder="e.g. Bank transfer ref #1234" value={fundDesc} onChange={e => setFundDesc(e.target.value)} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setFundOpen(false)}>Cancel</Button>
            <Button
              onClick={async () => {
                if (!fundAmount || parseFloat(fundAmount) <= 0) return;
                setFunding(true);
                try {
                  const r = await apiFetch<{ success: boolean; balance: number }>("/api/topup/wallet/fund", {
                    method: "POST",
                    body: JSON.stringify({ amount: parseFloat(fundAmount), description: fundDesc || "Manual wallet top-up" }),
                  });
                  if (wallet) setWallet({ ...wallet, balance: r.balance });
                  toast({ title: "Wallet funded", description: `Balance: ${JMD(r.balance)}` });
                  setFundOpen(false); setFundAmount(""); setFundDesc("");
                } catch (err) {
                  toast({ title: "Failed", description: err instanceof Error ? err.message : "Error", variant: "destructive" });
                }
                setFunding(false);
              }}
              disabled={funding || !fundAmount || parseFloat(fundAmount) <= 0}
              className="gap-2"
            >
              {funding ? <><Loader2 className="h-4 w-4 animate-spin" />Adding…</> : "Add Funds"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

/* ── Recent list sub-component ── */
function RecentList() {
  const [txns, setTxns] = useState<TopupTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<TopupTransaction[]>("/api/topup/transactions?limit=10")
      .then(d => setTxns(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-14 rounded-lg bg-muted/30 animate-pulse" />)}</div>;
  if (txns.length === 0) return (
    <div className="flex flex-col items-center py-10 text-muted-foreground gap-2">
      <Smartphone className="h-8 w-8 opacity-20" />
      <p className="text-xs">No transactions yet</p>
    </div>
  );

  return (
    <div className="space-y-2">
      {txns.map(t => (
        <div key={t.id} className="flex items-center gap-3 p-2.5 rounded-lg border border-border/40 hover:bg-accent/20 transition-colors">
          <div className={cn(
            "h-8 w-8 rounded-full flex items-center justify-center shrink-0",
            t.status === "success" ? "bg-emerald-500/20" : t.status === "pending" ? "bg-yellow-500/20" : "bg-red-500/20"
          )}>
            <Smartphone className={cn("h-4 w-4", t.status === "success" ? "text-emerald-400" : t.status === "pending" ? "text-yellow-400" : "text-red-400")} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{t.phoneNumber}</p>
            <p className="text-xs text-muted-foreground truncate">{t.operatorName} · {t.productName}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm font-semibold">{new Intl.NumberFormat("en-JM", { style: "currency", currency: "JMD", minimumFractionDigits: 0 }).format(t.sendValue)}</p>
            <p className="text-xs text-muted-foreground">{format(new Date(t.createdAt), "h:mm a")}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
