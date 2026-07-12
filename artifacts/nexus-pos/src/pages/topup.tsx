import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useStaff } from "@/contexts/StaffContext";
import { useGetSettings } from "@workspace/api-client-react";
import { TENANT_TOKEN_KEY } from "@/lib/saas-api";
import { cn } from "@/lib/utils";
import {
  Smartphone, Wallet, ChevronRight, CheckCircle2, XCircle, Clock,
  RefreshCw, TrendingUp, ArrowUpRight, Search, Globe, Signal,
  AlertCircle, Loader2, DollarSign, Star, History, BarChart2,
  Printer, Delete, Zap, LayoutGrid, Gift, Copy,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { FundWalletDialog } from "@/components/topup/fund-wallet-dialog";
import { format } from "date-fns";

/* ── Types ──────────────────────────────────────────────────────────── */

type TopupCategory = "topup" | "plans" | "giftcards";

interface DingCountry { Iso: string; Name: string; RegionCode: string; }
interface DingOperator { ProviderCode: string; Name: string; CountryIso: string; LogoUrl?: string; Category?: TopupCategory; Categories?: TopupCategory[]; }
interface DingProduct {
  SkuCode: string; Name: string;
  ProductType?: TopupCategory; RedemptionMechanism?: string;
  LocalisedPrice?: { CustomerFee: number; SenderFee: number; CurrencyIso: string; };
  SendValue: number; SendCurrencyIso: string;
  ReceiveValue: number; ReceiverCurrencyIso: string;
  ValidityDays?: number;
  IsRangeTopUp?: boolean; Minimum?: number; Maximum?: number;
  ReceiveValueMin?: number; ReceiveValueMax?: number;
}

interface TopupTransaction {
  id: number; tenantId: number; dingTransactionId?: string; distributorRef: string;
  phoneNumber: string; countryCode: string; operatorId: string; operatorName: string;
  productSkuCode: string; productName: string; sendValue: number; sendCurrency: string;
  benefitValue: number; benefitCurrency: string; cost: number; commissionEarned: number;
  status: "pending" | "success" | "failed"; staffName?: string; errorMessage?: string;
  productType?: TopupCategory; redemptionInfo?: string;
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

/* Brand colours for common carriers (matched by name substring). Falls back
   to the NEXXUS accent blue for any operator not in the map. */
const CARRIER_BRAND: Record<string, string> = {
  digicel: "#E30613",
  flow: "#00AEEF",
  claro: "#DA291C",
  lime: "#8DC63F",
  "t-mobile": "#E20074",
  tmobile: "#E20074",
  "at&t": "#00A8E0",
  att: "#00A8E0",
  orange: "#FF7900",
  verizon: "#EE0000",
  vodafone: "#E60000",
  airtel: "#E40000",
};
function carrierColor(name: string): string {
  const n = name.toLowerCase();
  const key = Object.keys(CARRIER_BRAND).find(k => n.includes(k));
  return key ? CARRIER_BRAND[key] : "#2E86DE";
}

/* Vibrant palette for amount denomination buttons */
const AMOUNT_PALETTE = [
  "#E30613", "#FF7900", "#F59E0B", "#16A34A",
  "#00AEEF", "#7C3AED", "#EC4899", "#0EA5E9",
];

function money(v: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: v % 1 === 0 ? 0 : 2 }).format(v);
  } catch {
    return `${currency} ${v.toLocaleString()}`;
  }
}

/* Opens a print window with a voucher-style receipt (proof of a completed
   top-up). This is NOT a redeemable scratch-card PIN — Ding SendTransfer
   credits the recipient's phone directly — it is a printable record the
   cashier can hand to the customer. */
function printVoucher(v: {
  operatorName: string; amount: number; currency: string;
  phoneNumber: string; ref: string; dingId?: string | null; when: Date;
}): void {
  const rows = [
    `Carrier : ${v.operatorName}`,
    `Amount  : ${money(v.amount, v.currency)}`,
    `Number  : ${v.phoneNumber}`,
    `Date    : ${format(v.when, "MMM d, yyyy h:mm a")}`,
    `Ref     : ${v.ref}`,
    ...(v.dingId ? [`Txn ID  : ${v.dingId}`] : []),
  ];
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Top-Up Voucher</title>
    <style>
      @page { margin: 0; }
      body { font-family: 'Courier New', monospace; padding: 14px; width: 280px; color: #000; }
      .center { text-align: center; }
      .title { font-size: 15px; font-weight: 800; letter-spacing: 1px; }
      .sub { font-size: 10px; color: #333; margin-top: 2px; }
      .line { border-top: 1px dashed #000; margin: 8px 0; }
      .row { font-size: 12px; line-height: 1.9; white-space: pre; }
      .badge { font-size: 11px; font-weight: 700; margin-top: 6px; }
      .foot { font-size: 9px; color: #333; margin-top: 10px; }
    </style></head><body>
      <div class="center title">TOP-UP VOUCHER</div>
      <div class="center sub">NEXXUS POS</div>
      <div class="line"></div>
      ${rows.map(r => `<div class="row">${r.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</div>`).join("")}
      <div class="line"></div>
      <div class="center badge">✓ TOP-UP COMPLETED</div>
      <div class="center foot">Keep this voucher as proof of payment.<br/>Powered by NEXXUS POS</div>
      <script>window.onload=function(){window.print();setTimeout(function(){window.close();},300);};</script>
    </body></html>`;
  const w = window.open("", "_blank", "width=340,height=560");
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
}

function printGiftCard(txn: TopupTransaction): void {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const rows = [
    `Brand   : ${txn.operatorName}`,
    `Value   : ${money(txn.benefitValue, txn.benefitCurrency)}`,
    `Date    : ${format(new Date(txn.createdAt ?? Date.now()), "MMM d, yyyy h:mm a")}`,
    `Ref     : ${txn.distributorRef}`,
    ...(txn.dingTransactionId ? [`Txn ID  : ${txn.dingTransactionId}`] : []),
  ];
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Gift Card</title>
    <style>
      @page { margin: 0; }
      body { font-family: 'Courier New', monospace; padding: 14px; width: 280px; color: #000; }
      .center { text-align: center; }
      .title { font-size: 15px; font-weight: 800; letter-spacing: 1px; }
      .sub { font-size: 10px; color: #333; margin-top: 2px; }
      .line { border-top: 1px dashed #000; margin: 8px 0; }
      .row { font-size: 12px; line-height: 1.9; white-space: pre; }
      .codehdr { font-size: 10px; font-weight: 700; margin-top: 6px; text-align: center; }
      .code { font-size: 13px; font-weight: 800; white-space: pre-wrap; word-break: break-word; text-align: center; margin-top: 4px; }
      .foot { font-size: 9px; color: #333; margin-top: 10px; }
    </style></head><body>
      <div class="center title">GIFT CARD</div>
      <div class="center sub">NEXXUS POS</div>
      <div class="line"></div>
      ${rows.map(r => `<div class="row">${esc(r)}</div>`).join("")}
      <div class="line"></div>
      <div class="codehdr">REDEMPTION DETAILS</div>
      <div class="code">${esc(txn.redemptionInfo ?? "See email/SMS for code")}</div>
      <div class="line"></div>
      <div class="center foot">Keep this receipt safe.<br/>Powered by NEXXUS POS</div>
      <script>window.onload=function(){window.print();setTimeout(function(){window.close();},300);};</script>
    </body></html>`;
  const w = window.open("", "_blank", "width=340,height=560");
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
}

function StatusBadge({ status }: { status: string }) {
  if (status === "success") return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30"><CheckCircle2 className="h-3 w-3 mr-1" />Sent</Badge>;
  if (status === "pending") return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
  return <Badge className="bg-red-500/20 text-red-400 border-red-500/30"><XCircle className="h-3 w-3 mr-1" />Failed</Badge>;
}

/* ── Main Component ─────────────────────────────────────────────────── */

export function TopUp() {
  const { toast } = useToast();
  const { staff: activeStaff } = useStaff();
  const { data: settings } = useGetSettings();
  const baseCurrency = settings?.base_currency || "JMD";

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

  // Redesign: transaction mode + carrier picker + post-send preview
  const [txMode, setTxMode] = useState<"send" | "voucher">("send");
  const [moreOpen, setMoreOpen] = useState(false);
  const [postSend, setPostSend] = useState<{ mode: "send" | "voucher"; txn: TopupTransaction } | null>(null);

  // Top-Up vs Gift Cards section, and (within Top-Up) the Top-up vs Plans sub-toggle
  const [section, setSection] = useState<"topup" | "giftcards">("topup");
  const [topupSubMode, setTopupSubMode] = useState<"topup" | "plans">("topup");
  const effectiveCategory: TopupCategory = section === "giftcards" ? "giftcards" : topupSubMode;
  const isGiftCards = section === "giftcards";
  const opCategories = (o: DingOperator): TopupCategory[] => o.Categories ?? [o.Category ?? "topup"];
  const categoryOperators = operators.filter(o => opCategories(o).includes(effectiveCategory));

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

  /* ── Auto-select a default operator for the active category ──
     Runs when the operator list loads or the section/sub-toggle changes. Keeps
     the current selection if it still belongs to the category, else defaults to
     Flow (non-bundle) for top-up, or the first provider otherwise. */
  useEffect(() => {
    const inCategory = operators.filter(o => (o.Categories ?? [o.Category ?? "topup"]).includes(effectiveCategory));
    if (inCategory.length === 0) { setSelectedOperator(null); return; }
    setSelectedOperator(prev => {
      if (prev && inCategory.some(o => o.ProviderCode === prev.ProviderCode)) return prev;
      const def = effectiveCategory === "topup"
        ? (inCategory.find(op => /\bflow\b/i.test(op.Name) && !/bundle/i.test(op.Name)) ?? inCategory[0])
        : inCategory[0];
      return def;
    });
  }, [operators, effectiveCategory]);

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

  /* ── Send top-up / buy gift card ── */
  async function handleSend() {
    if (!selectedOperator || !selectedProduct) return;
    // Gift cards deliver a redemption code, so the recipient phone is optional —
    // Ding still needs an AccountNumber, so fall back to a placeholder.
    const effectivePhone = isGiftCards ? (phoneNumber || "0000000000") : phoneNumber;
    if (!effectivePhone) return;
    // Range custom amounts are entered in the home (receive) currency; convert
    // back to the send currency for wallet/cost accounting.
    const ratio = selectedProduct.ReceiveValue ? selectedProduct.SendValue / selectedProduct.ReceiveValue : 1;
    const receiveAmount = selectedProduct.IsRangeTopUp ? (parseFloat(customAmount) || 0) : selectedProduct.ReceiveValue;
    const face = selectedProduct.IsRangeTopUp ? receiveAmount * ratio : selectedProduct.SendValue;
    const cost = selectedProduct.LocalisedPrice?.SenderFee ?? face;

    setSending(true);
    setConfirmOpen(false);
    try {
      const result = await apiFetch<{ success: boolean; transaction: TopupTransaction; walletBalance: number }>("/api/topup/send", {
        method: "POST",
        body: JSON.stringify({
          phoneNumber: effectivePhone, countryCode: selectedCountry?.Iso ?? "JM",
          operatorId: selectedOperator.ProviderCode, operatorName: selectedOperator.Name,
          productSkuCode: selectedProduct.SkuCode, productName: selectedProduct.Name,
          sendValue: face, sendCurrency: selectedProduct.SendCurrencyIso,
          benefitValue: receiveAmount, benefitCurrency: selectedProduct.ReceiverCurrencyIso,
          cost, staffId: activeStaff?.id, staffName: activeStaff?.name,
          productType: effectiveCategory,
          dingSendValue: isGiftCards ? selectedProduct.SendValue : undefined,
          dingSendCurrency: isGiftCards ? selectedProduct.SendCurrencyIso : undefined,
        }),
      });
      setLastResult({ success: true, txn: result.transaction });
      setPostSend({ mode: txMode, txn: result.transaction });
      if (txMode === "voucher") {
        printVoucher({
          operatorName: result.transaction.operatorName,
          amount: result.transaction.benefitValue,
          currency: result.transaction.benefitCurrency,
          phoneNumber: result.transaction.phoneNumber,
          ref: result.transaction.distributorRef,
          dingId: result.transaction.dingTransactionId,
          when: new Date(result.transaction.createdAt ?? Date.now()),
        });
      }
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
    setSelectedOperator(null);
    setPhoneNumber("");
    setSelectedProduct(null);
    setCustomAmount("");
    setResultOpen(false);
    setLastResult(null);
    setPostSend(null);
  }

  const filteredCountries = countries.filter(c => !countrySearch || c.Name.toLowerCase().includes(countrySearch.toLowerCase()) || c.Iso.toLowerCase().includes(countrySearch.toLowerCase()));
  const filteredOperators = categoryOperators.filter(o => !operatorSearch || o.Name.toLowerCase().includes(operatorSearch.toLowerCase()));

  // Products belonging to the active category (a carrier can carry airtime AND
  // data bundles; only show the SKUs matching the current Top-up/Plans/Gift Card mode).
  const categoryProducts = products.filter(p => (p.ProductType ?? "topup") === effectiveCategory);

  // Dynamic labels for the shared builder UI (carrier vs brand, etc.)
  const brandLabel = isGiftCards ? "Brand" : "Carrier";
  const amountLabel = isGiftCards ? "Card Value" : "Amount";

  // Home-currency (receive) amount shown to the user. For range products the
  // custom amount is entered in the home currency; for fixed products it's the
  // Ding ReceiveValue (the credit delivered to the phone).
  const homeCurrency = selectedProduct?.ReceiverCurrencyIso || baseCurrency;
  const faceReceive = selectedProduct?.IsRangeTopUp
    ? (parseFloat(customAmount) || 0)
    : (selectedProduct?.ReceiveValue ?? 0);
  // Ratio to translate a home-currency amount back to the send currency (USD)
  // used for wallet/cost accounting. Defaults to 1 when receive data missing.
  const sendPerReceive = selectedProduct?.ReceiveValue
    ? selectedProduct.SendValue / selectedProduct.ReceiveValue
    : 1;
  const face = selectedProduct?.IsRangeTopUp
    ? faceReceive * sendPerReceive
    : (selectedProduct?.SendValue ?? 0);
  const cost = selectedProduct?.LocalisedPrice?.SenderFee ?? face;
  const commission = face - cost;
  const customerFee = selectedProduct?.LocalisedPrice?.CustomerFee ?? 0;
  const feeCurrency = selectedProduct?.LocalisedPrice?.CurrencyIso ?? selectedProduct?.SendCurrencyIso ?? "USD";
  const customerTotal = face + customerFee;

  const sendCurrency = selectedProduct?.SendCurrencyIso ?? "JMD";
  const dialingPrefix = selectedCountry?.Iso === "JM" ? "1876" : selectedCountry?.Iso ?? "";
  const canSubmit = !!selectedOperator && !!selectedProduct
    && (isGiftCards || phoneNumber.length >= 7)
    && (!selectedProduct?.IsRangeTopUp || (parseFloat(customAmount) || 0) > 0);
  const insufficient = !!wallet && wallet.balance < cost;

  // Live-preview state for the phone panel
  const previewStep: "idle" | "entering" | "confirm" | "success" | "voucher" =
    postSend ? (postSend.mode === "voucher" ? "voucher" : "success")
    : canSubmit ? "confirm"
    : (selectedOperator || phoneNumber || selectedProduct) ? "entering"
    : "idle";

  // Numpad key handler
  function pressKey(k: string) {
    if (postSend) return;
    if (k === "del") { setPhoneNumber(p => p.slice(0, -1)); return; }
    if (k === "clr") { setPhoneNumber(""); return; }
    setPhoneNumber(p => (p.length >= 10 ? p : p + k));
  }

  /* ── Render ── */
  return (
    <>
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
          <div className="grid lg:grid-cols-[1fr_340px_300px] gap-4 flex-1 min-h-0">

            {/* LEFT: product / carrier selection */}
            <Card className="flex flex-col min-h-0">
              <CardContent className="flex flex-col gap-5 p-5 overflow-auto">

                {/* Title */}
                <div>
                  <p className="text-[10px] font-bold tracking-[0.2em] text-amber-400 uppercase">International {isGiftCards ? "Gift Cards" : "Top-Up"}</p>
                  <h2 className="text-lg font-extrabold flex items-center gap-2"><Zap className="h-4 w-4 text-amber-400" />{isGiftCards ? "Ding Gift Cards" : "Ding Top-Up"}</h2>
                </div>

                {/* Section toggle: Top-Up vs Gift Cards */}
                <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-muted/40">
                  {([
                    { id: "topup", label: "Top-Up", icon: Smartphone },
                    { id: "giftcards", label: "Gift Cards", icon: Gift },
                  ] as const).map(s => (
                    <button
                      key={s.id}
                      onClick={() => { setSection(s.id); setSelectedProduct(null); setCustomAmount(""); setPostSend(null); if (s.id === "giftcards") setTxMode("send"); }}
                      className={cn(
                        "flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-bold transition-colors",
                        section === s.id ? "bg-primary text-primary-foreground shadow" : "bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted"
                      )}
                    >
                      <s.icon className="h-4 w-4" />{s.label}
                    </button>
                  ))}
                </div>

                {/* Sub-toggle: Top-up vs Plans (only within Top-Up) */}
                {section === "topup" && (
                  <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-muted/25">
                    {([
                      { id: "topup", label: "Top-up", icon: Zap },
                      { id: "plans", label: "Plans", icon: LayoutGrid },
                    ] as const).map(s => (
                      <button
                        key={s.id}
                        onClick={() => { setTopupSubMode(s.id); setSelectedProduct(null); setCustomAmount(""); setPostSend(null); }}
                        className={cn(
                          "flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-semibold transition-colors",
                          topupSubMode === s.id ? "bg-background text-foreground shadow-sm border border-border" : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <s.icon className="h-3.5 w-3.5" />{s.label}
                      </button>
                    ))}
                  </div>
                )}

                {/* Mode toggle (send vs print voucher) — top-up & plans only */}
                {section === "topup" && (
                  <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-muted/40">
                    {([
                      { id: "send", label: topupSubMode === "plans" ? "Send Plan" : "Send Top-Up", icon: Smartphone },
                      { id: "voucher", label: "Print Voucher", icon: Printer },
                    ] as const).map(m => (
                      <button
                        key={m.id}
                        onClick={() => setTxMode(m.id)}
                        className={cn(
                          "flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition-colors",
                          txMode === m.id ? "bg-primary text-primary-foreground shadow" : "bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted"
                        )}
                      >
                        <m.icon className="h-4 w-4" />{m.label}
                      </button>
                    ))}
                  </div>
                )}

                {/* 1. Carrier / Brand */}
                <div>
                  <div className="flex items-center justify-between mb-2.5">
                    <p className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">1. Select {brandLabel}</p>
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><Globe className="h-3 w-3" />{selectedCountry?.Name ?? "—"}</span>
                  </div>

                  {loadingCountries || (selectedCountry && loadingOperators) ? (
                    <div className="grid grid-cols-3 gap-2">{[...Array(6)].map((_, i) => <div key={i} className="h-16 rounded-xl bg-muted/30 animate-pulse" />)}</div>
                  ) : countriesError ? (
                    <div className="flex flex-col items-center justify-center py-6 text-center text-muted-foreground gap-1.5 rounded-xl border border-dashed border-border">
                      <AlertCircle className="h-7 w-7 opacity-40" />
                      <p className="text-sm font-medium">
                        {countriesError === "auth" ? "Session expired"
                          : countriesError === "api_key" ? "Ding not connected"
                          : countriesError === "no_countries" ? "No markets enabled"
                          : "Carriers unavailable"}
                      </p>
                      <p className="text-xs max-w-[240px]">
                        {countriesError === "auth" ? "Please log in again to use Top-Up."
                          : countriesError === "api_key" ? "Ask your administrator to set the DING_API_KEY."
                          : countriesError === "no_countries" ? "Your DingConnect account has no countries enabled. Log in to your Ding dashboard to activate markets."
                          : "DingConnect rejected the request. Check the IP whitelist and API key in your Ding dashboard."}
                      </p>
                      {countriesError !== "auth" && (
                        <button
                          onClick={() => loadCountries()}
                          disabled={loadingCountries}
                          className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted/50 disabled:opacity-50"
                        >
                          <RefreshCw className={`h-3.5 w-3.5 ${loadingCountries ? "animate-spin" : ""}`} />
                          Retry
                        </button>
                      )}
                    </div>
                  ) : categoryOperators.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-6 text-center text-muted-foreground gap-1.5 rounded-xl border border-dashed border-border">
                      {isGiftCards ? <Gift className="h-7 w-7 opacity-40" /> : <Signal className="h-7 w-7 opacity-40" />}
                      <p className="text-sm font-medium">No {isGiftCards ? "gift cards" : topupSubMode === "plans" ? "plans" : "carriers"} available</p>
                      <button onClick={() => setMoreOpen(true)} className="text-xs text-primary underline">{isGiftCards ? "Browse all brands" : "Choose another country"}</button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      {categoryOperators.slice(0, 5).map(op => {
                        const color = carrierColor(op.Name);
                        const active = selectedOperator?.ProviderCode === op.ProviderCode;
                        return (
                          <button
                            key={op.ProviderCode}
                            onClick={() => { setSelectedOperator(op); setPostSend(null); }}
                            className="flex flex-col items-center gap-1.5 rounded-xl p-2.5 border-[1.5px] transition-all text-[11px] font-bold"
                            style={{
                              borderColor: color,
                              background: active ? color : `${color}28`,
                              color: active ? "#fff" : color,
                              boxShadow: active ? `0 0 12px ${color}55` : "none",
                            }}
                          >
                            <span
                              className="h-7 w-7 rounded-lg flex items-center justify-center text-sm font-extrabold"
                              style={{ background: active ? "rgba(255,255,255,0.2)" : `${color}44`, color: active ? "#fff" : color }}
                            >{op.Name[0]?.toUpperCase()}</span>
                            <span className="line-clamp-1 max-w-full">{op.Name}</span>
                          </button>
                        );
                      })}
                      <button
                        onClick={() => setMoreOpen(true)}
                        className="flex flex-col items-center justify-center gap-1.5 rounded-xl p-2.5 border-[1.5px] border-primary/50 bg-primary/10 text-[11px] font-bold text-primary hover:bg-primary/20 transition-all"
                      >
                        <span className="h-7 w-7 rounded-lg flex items-center justify-center bg-primary/20"><LayoutGrid className="h-3.5 w-3.5" /></span>
                        More
                      </button>
                    </div>
                  )}
                </div>

                {/* 2. Amount / Card Value */}
                <div>
                  <p className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase mb-2.5">2. Select {amountLabel} ({homeCurrency})</p>
                  {!selectedOperator ? (
                    <p className="text-xs text-muted-foreground">Select a {brandLabel.toLowerCase()} first.</p>
                  ) : loadingProducts ? (
                    <div className="grid grid-cols-4 gap-2">{[...Array(8)].map((_, i) => <div key={i} className="h-10 rounded-lg bg-muted/30 animate-pulse" />)}</div>
                  ) : categoryProducts.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No {isGiftCards ? "card values" : topupSubMode === "plans" ? "plans" : "amounts"} available for this {brandLabel.toLowerCase()}.</p>
                  ) : effectiveCategory === "plans" ? (
                    <>
                      {/* Full plan details list */}
                      <div className="space-y-2">
                        {categoryProducts.map((p, idx) => {
                          const active = selectedProduct?.SkuCode === p.SkuCode;
                          const c = AMOUNT_PALETTE[idx % AMOUNT_PALETTE.length];
                          const priceLabel = p.IsRangeTopUp
                            ? `${money(p.ReceiveValueMin ?? 0, p.ReceiverCurrencyIso || homeCurrency)} – ${money(p.ReceiveValueMax ?? 0, p.ReceiverCurrencyIso || homeCurrency)}`
                            : money(p.ReceiveValue, p.ReceiverCurrencyIso || homeCurrency);
                          return (
                            <button
                              key={p.SkuCode}
                              onClick={() => { setSelectedProduct(p); setCustomAmount(""); setPostSend(null); }}
                              className="w-full text-left rounded-xl border-[1.5px] p-3 transition-all"
                              style={{
                                borderColor: active ? c : "hsl(var(--border))",
                                background: active ? `${c}18` : "transparent",
                                boxShadow: active ? `0 0 10px ${c}44` : "none",
                              }}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-sm font-bold leading-snug">{p.Name}</p>
                                <span className="text-sm font-extrabold shrink-0" style={{ color: c }}>{priceLabel}</span>
                              </div>
                              <div className="mt-1.5 space-y-1 text-[11px]">
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Customer receives</span>
                                  <span className="font-semibold">{priceLabel}</span>
                                </div>
                                {!p.IsRangeTopUp && p.SendValue > 0 && (
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Retail price</span>
                                    <span className="font-semibold">{money(p.SendValue, p.SendCurrencyIso || "USD")}</span>
                                  </div>
                                )}
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Validity</span>
                                  <span className="font-semibold">{p.ValidityDays ? `${p.ValidityDays} day${p.ValidityDays === 1 ? "" : "s"}` : "—"}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Redemption</span>
                                  <span className="font-semibold text-right">{p.RedemptionMechanism || "—"}</span>
                                </div>
                              </div>
                              {p.IsRangeTopUp ? (
                                <div className="mt-2">
                                  <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                                    Custom amount
                                  </span>
                                </div>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                      {selectedProduct?.IsRangeTopUp && (
                        <div className="mt-2.5 space-y-1.5">
                          <Label className="text-xs">Custom Amount ({homeCurrency})</Label>
                          <Input
                            type="number"
                            placeholder={`${Math.round(selectedProduct.ReceiveValueMin ?? 100)} – ${Math.round(selectedProduct.ReceiveValueMax ?? 99999)}`}
                            value={customAmount}
                            onChange={e => { setCustomAmount(e.target.value); setPostSend(null); }}
                          />
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="grid grid-cols-4 gap-2">
                        {categoryProducts.map((p, idx) => {
                          const active = selectedProduct?.SkuCode === p.SkuCode;
                          const v = p.ReceiveValue;
                          const label = p.IsRangeTopUp
                            ? "Custom"
                            : (v >= 1000 && v % 1000 === 0
                                ? `${v / 1000}K`
                                : (Number.isInteger(v) ? v.toLocaleString() : Math.round(v).toLocaleString()));
                          const c = AMOUNT_PALETTE[idx % AMOUNT_PALETTE.length];
                          return (
                            <button
                              key={p.SkuCode}
                              onClick={() => { setSelectedProduct(p); setCustomAmount(""); setPostSend(null); }}
                              title={p.Name}
                              className="h-10 rounded-lg border-[1.5px] text-xs font-bold transition-all"
                              style={{
                                borderColor: c,
                                background: active ? c : `${c}28`,
                                color: active ? "#fff" : c,
                                boxShadow: active ? `0 0 10px ${c}55` : "none",
                              }}
                            >{label}</button>
                          );
                        })}
                      </div>
                      {selectedProduct?.IsRangeTopUp && (
                        <div className="mt-2.5 space-y-1.5">
                          <Label className="text-xs">Custom Amount ({homeCurrency})</Label>
                          <Input
                            type="number"
                            placeholder={`${Math.round(selectedProduct.ReceiveValueMin ?? 100)} – ${Math.round(selectedProduct.ReceiveValueMax ?? 99999)}`}
                            value={customAmount}
                            onChange={e => { setCustomAmount(e.target.value); setPostSend(null); }}
                          />
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Recent */}
                <div>
                  <p className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase mb-2">Recent {isGiftCards ? "Gift Cards" : "Top-Ups"}</p>
                  {loadingWallet ? (
                    <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-14 rounded-lg bg-muted/30 animate-pulse" />)}</div>
                  ) : (
                    <RecentList />
                  )}
                </div>
              </CardContent>
            </Card>

            {/* MIDDLE: live phone preview */}
            <Card className="hidden lg:flex flex-col items-center justify-center gap-5 p-5" style={{ background: "#080E18" }}>
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" style={{ boxShadow: "0 0 8px #4ADE80" }} />
                <span className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">Live Preview</span>
              </div>

              <PhonePreview
                step={previewStep}
                carrierName={postSend ? postSend.txn.operatorName : (selectedOperator?.Name ?? "")}
                color={carrierColor(postSend ? postSend.txn.operatorName : (selectedOperator?.Name ?? ""))}
                amount={postSend ? postSend.txn.benefitValue : faceReceive}
                currency={postSend ? postSend.txn.benefitCurrency : homeCurrency}
                phone={postSend ? postSend.txn.phoneNumber : phoneNumber}
                prefix={dialingPrefix}
                mode={postSend?.mode ?? txMode}
                isGiftCard={postSend ? postSend.txn.productType === "giftcards" : isGiftCards}
                subMode={topupSubMode}
                txRef={postSend?.txn.distributorRef}
              />

              <div className="flex gap-1.5 flex-wrap justify-center">
                {[
                  { label: brandLabel, done: !!selectedOperator },
                  { label: amountLabel, done: !!selectedProduct },
                  { label: isGiftCards ? "Phone" : "Number", done: isGiftCards ? true : phoneNumber.length >= 7 },
                ].map(p => (
                  <div
                    key={p.label}
                    className={cn(
                      "flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-semibold",
                      p.done ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-400" : "bg-muted/20 border-border text-muted-foreground"
                    )}
                  >
                    <span className={cn("h-3.5 w-3.5 rounded-full flex items-center justify-center text-[8px]", p.done ? "bg-emerald-500 text-black" : "bg-muted-foreground/20")}>
                      {p.done && <CheckCircle2 className="h-2.5 w-2.5" />}
                    </span>
                    {p.label}
                  </div>
                ))}
              </div>
            </Card>

            {/* RIGHT: keypad (static entry column) */}
            <Card className="flex flex-col min-h-0">
              <CardContent className="flex flex-col gap-4 p-5 overflow-auto">
                {/* 3. Recipient number / delivery phone */}
                <div>
                  <p className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase mb-2.5">
                    3. {isGiftCards ? "Delivery Phone" : "Recipient Number"}
                    {isGiftCards && <span className="ml-1.5 normal-case tracking-normal text-muted-foreground/60">(optional)</span>}
                  </p>
                  <div
                    className="flex items-center gap-2 rounded-xl border-[1.5px] px-4 py-3 mb-2.5 transition-colors"
                    style={{ borderColor: phoneNumber.length >= 7 ? "#1A7A4A" : "hsl(var(--border))" }}
                  >
                    {dialingPrefix && <span className="text-xs font-mono text-muted-foreground">+{dialingPrefix}</span>}
                    <span className="flex-1 font-mono text-lg font-bold tracking-[0.15em] min-h-[24px] flex items-center">
                      {phoneNumber || <span className="text-muted-foreground/30">_ _ _ _ _ _ _</span>}
                    </span>
                    {phoneNumber && (
                      <button onClick={() => setPhoneNumber("")} className="text-muted-foreground hover:text-foreground"><XCircle className="h-4 w-4" /></button>
                    )}
                  </div>
                  {isGiftCards && (
                    <p className="text-[11px] text-muted-foreground mb-2.5">The redemption code is generated instantly — a delivery phone is only needed if you want the code texted to the customer.</p>
                  )}
                  <Numpad onKey={pressKey} />
                </div>

                {/* Credit breakdown */}
                {selectedProduct && faceReceive > 0 && (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 overflow-hidden">
                    <div className="px-4 py-3 text-center border-b border-emerald-500/20">
                      <p className="text-[9px] font-semibold tracking-widest text-emerald-400 uppercase">
                        {isGiftCards ? "Card value" : topupSubMode === "plans" ? "Plan credit" : "Credit to phone"}
                      </p>
                      <p className="text-2xl font-extrabold text-emerald-300 mt-1">{money(faceReceive, homeCurrency)}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {isGiftCards ? "Redeemable value the customer receives" : "Amount the customer's account will be credited"}
                      </p>
                    </div>
                    <div className="px-4 py-3 space-y-1.5 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{isGiftCards ? "Card value" : "Top-up value"}</span>
                        <span className="font-medium">{money(faceReceive, homeCurrency)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Retail price</span>
                        <span className="font-medium">{money(face, sendCurrency)}</span>
                      </div>
                      {customerFee > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Service fee</span>
                          <span className="font-medium">{money(customerFee, feeCurrency)}</span>
                        </div>
                      )}
                      <div className="flex justify-between border-t border-emerald-500/20 pt-1.5">
                        <span className="text-muted-foreground font-semibold">Customer pays</span>
                        <span className="font-bold text-foreground">{money(customerTotal, sendCurrency)}</span>
                      </div>
                      {commission > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Your commission</span>
                          <span className="font-medium text-emerald-400">{JMD(commission)}</span>
                        </div>
                      )}
                      <div className="flex justify-between border-t border-emerald-500/20 pt-1.5">
                        <span className="text-muted-foreground">Wallet after</span>
                        <span className={cn("font-mono", (wallet?.balance ?? 0) < cost ? "text-red-400" : "text-foreground")}>
                          {JMD(Math.max(0, (wallet?.balance ?? 0) - cost))}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {insufficient && (
                  <div className="flex items-center gap-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-3 py-2.5">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>Insufficient wallet balance ({JMD(wallet?.balance ?? 0)}).</span>
                    <button onClick={() => setFundOpen(true)} className="ml-auto underline shrink-0">Fund</button>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 mt-auto">
                  <Button variant="outline" onClick={resetFlow} className="px-5">Clear</Button>
                  <Button
                    onClick={() => setConfirmOpen(true)}
                    disabled={!canSubmit || sending || insufficient}
                    className={cn(
                      "flex-1 h-12 text-sm font-bold gap-2",
                      txMode === "voucher" && "bg-amber-500 hover:bg-amber-600 text-black"
                    )}
                  >
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" />
                      : isGiftCards ? <><Gift className="h-4 w-4" />Buy Gift Card</>
                      : txMode === "send" ? <><Smartphone className="h-4 w-4" />{topupSubMode === "plans" ? "Send Plan" : "Send Top-Up"}</>
                      : <><Printer className="h-4 w-4" />Print Voucher</>}
                  </Button>
                </div>
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
              {isGiftCards ? <Gift className="h-5 w-5 text-primary" /> : <Smartphone className="h-5 w-5 text-primary" />}
              {isGiftCards ? "Confirm Gift Card" : "Confirm Top-Up"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="rounded-lg bg-muted/30 p-4 space-y-2">
              {(!isGiftCards || phoneNumber) && (
                <div className="flex justify-between"><span className="text-muted-foreground">{isGiftCards ? "Delivery phone" : "Phone"}</span><span className="font-semibold">{phoneNumber || "—"}</span></div>
              )}
              <div className="flex justify-between"><span className="text-muted-foreground">{isGiftCards ? "Brand" : "Operator"}</span><span className="font-semibold">{selectedOperator?.Name}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{isGiftCards ? "Card value" : "Amount"}</span><span className="font-bold text-primary text-base">{money(faceReceive, homeCurrency)}</span></div>
              {commission > 0 && <div className="flex justify-between border-t border-border/40 pt-2"><span className="text-muted-foreground">Commission</span><span className="font-medium text-emerald-400">{JMD(commission)}</span></div>}
              <div className="flex justify-between border-t border-border/40 pt-2"><span className="text-muted-foreground">Wallet balance</span><span className={cn("font-mono", (wallet?.balance ?? 0) < cost ? "text-red-400" : "text-foreground")}>{JMD(wallet?.balance ?? 0)}</span></div>
            </div>
            {(wallet?.balance ?? 0) < cost ? (
              <div className="rounded-md border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-300 text-center">
                Insufficient wallet balance. Please add funds before sending.
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center">This action cannot be undone. The {isGiftCards ? "gift card will be purchased" : "top-up will be sent"} immediately.</p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button onClick={handleSend} disabled={sending || (wallet?.balance ?? 0) < cost} className="bg-emerald-600 hover:bg-emerald-700 gap-2">
              {sending ? <><Loader2 className="h-4 w-4 animate-spin" />Processing…</> : <><CheckCircle2 className="h-4 w-4" />{isGiftCards ? "Confirm & Buy" : "Confirm & Send"}</>}
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
              <h2 className="text-xl font-bold">{lastResult?.success ? (lastResult.txn.productType === "giftcards" ? "Gift Card Purchased!" : "Top-Up Sent!") : (lastResult?.txn.productType === "giftcards" ? "Purchase Failed" : "Top-Up Failed")}</h2>
              {lastResult?.success ? (
                <p className="text-muted-foreground text-sm mt-1">
                  {money(lastResult.txn.benefitValue, lastResult.txn.benefitCurrency)}{lastResult.txn.productType === "giftcards" ? ` ${lastResult.txn.operatorName} gift card` : ` sent to ${lastResult.txn.phoneNumber}`}
                </p>
              ) : (
                <p className="text-red-400 text-sm mt-1">{lastResult?.txn.errorMessage ?? "An error occurred"}</p>
              )}
            </div>
            {lastResult?.success && lastResult.txn.redemptionInfo && (
              <div className="w-full rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-left space-y-2">
                <p className="text-[10px] font-bold tracking-widest text-amber-400 uppercase">Redemption Details</p>
                <pre className="whitespace-pre-wrap break-words font-mono text-sm font-semibold text-foreground">{lastResult.txn.redemptionInfo}</pre>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1 gap-1.5"
                    onClick={() => { navigator.clipboard?.writeText(lastResult.txn.redemptionInfo ?? ""); toast({ title: "Copied", description: "Redemption details copied to clipboard." }); }}>
                    <Copy className="h-3.5 w-3.5" />Copy
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1 gap-1.5"
                    onClick={() => printGiftCard(lastResult.txn)}>
                    <Printer className="h-3.5 w-3.5" />Print
                  </Button>
                </div>
              </div>
            )}
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
            <Button onClick={resetFlow} className="w-full">{lastResult?.txn.productType === "giftcards" ? "New Gift Card" : "New Top-Up"}</Button>
            {lastResult?.success && (
              <Button variant="outline" onClick={() => { setResultOpen(false); setTab("history"); }} className="w-full">View History</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── More carriers dialog (full Ding list) ── */}
      <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LayoutGrid className="h-5 w-5 text-primary" />Choose {brandLabel}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            {/* Country picker */}
            <div className="space-y-2">
              <p className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">Country</p>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8 h-8 text-xs" placeholder="Search…" value={countrySearch} onChange={e => setCountrySearch(e.target.value)} />
              </div>
              <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
                {loadingCountries ? (
                  [...Array(6)].map((_, i) => <div key={i} className="h-9 rounded-md bg-muted/30 animate-pulse" />)
                ) : filteredCountries.map(c => (
                  <button
                    key={c.Iso}
                    onClick={() => { setSelectedCountry(c); setCountrySearch(""); }}
                    className={cn(
                      "w-full flex items-center gap-2 p-2 rounded-md text-xs transition-colors",
                      selectedCountry?.Iso === c.Iso ? "bg-primary/10 border border-primary/30" : "hover:bg-accent/50"
                    )}
                  >
                    <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="font-medium flex-1 text-left truncate">{c.Name}</span>
                    {c.Iso === "JM" && <Star className="h-3 w-3 text-yellow-400 fill-yellow-400" />}
                  </button>
                ))}
              </div>
            </div>
            {/* Operator picker */}
            <div className="space-y-2">
              <p className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">Carrier</p>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8 h-8 text-xs" placeholder="Search…" value={operatorSearch} onChange={e => setOperatorSearch(e.target.value)} />
              </div>
              <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
                {!selectedCountry ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">Pick a country first.</p>
                ) : loadingOperators ? (
                  [...Array(6)].map((_, i) => <div key={i} className="h-9 rounded-md bg-muted/30 animate-pulse" />)
                ) : filteredOperators.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">No carriers.</p>
                ) : filteredOperators.map(op => (
                  <button
                    key={op.ProviderCode}
                    onClick={() => { setSelectedOperator(op); setPostSend(null); setOperatorSearch(""); setMoreOpen(false); }}
                    className={cn(
                      "w-full flex items-center gap-2 p-2 rounded-md text-xs transition-colors",
                      selectedOperator?.ProviderCode === op.ProviderCode ? "bg-primary/10 border border-primary/30" : "hover:bg-accent/50"
                    )}
                  >
                    <span className="h-5 w-5 rounded flex items-center justify-center text-[10px] font-bold shrink-0" style={{ background: `${carrierColor(op.Name)}22`, color: carrierColor(op.Name) }}>{op.Name[0]?.toUpperCase()}</span>
                    <span className="font-medium flex-1 text-left truncate">{op.Name}</span>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Fund wallet dialog ── */}
      <FundWalletDialog
        open={fundOpen}
        onOpenChange={setFundOpen}
        onFunded={(balance) => {
          if (balance >= 0 && wallet) setWallet({ ...wallet, balance });
          else void loadWallet();
        }}
      />
    </>
  );
}

/* ── Numpad sub-component ── */
function Numpad({ onKey }: { onKey: (k: string) => void }) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clr", "0", "del"];
  const isAction = (k: string) => k === "clr" || k === "del";
  return (
    <div className="grid grid-cols-3 gap-2 max-w-[280px] mx-auto">
      {keys.map(k => (
        <button
          key={k}
          type="button"
          onClick={() => onKey(k)}
          className={cn(
            "aspect-[4/3] rounded-2xl active:scale-95 text-xl font-bold transition-all flex items-center justify-center select-none shadow-sm",
            isAction(k)
              ? "bg-secondary text-secondary-foreground hover:bg-secondary/90 active:bg-secondary"
              : "bg-card text-foreground border border-border hover:bg-accent active:bg-accent"
          )}
        >
          {k === "del" ? <Delete className="h-5 w-5" /> : k === "clr" ? <span className="text-xs font-bold tracking-wider">CLR</span> : k}
        </button>
      ))}
    </div>
  );
}

/* ── Live phone preview sub-component ── */
function PhonePreview({
  step, carrierName, color, amount, currency, phone, prefix, mode, isGiftCard, subMode, txRef,
}: {
  step: "idle" | "entering" | "confirm" | "success" | "voucher";
  carrierName: string; color: string; amount: number; currency: string;
  phone: string; prefix: string; mode: "send" | "voucher";
  isGiftCard?: boolean; subMode?: "topup" | "plans"; txRef?: string;
}) {
  const fullNumber = phone ? `+${prefix} ${phone}` : "—";
  const amtLabel = money(amount, currency);
  const successLabel = isGiftCard ? "Gift Card Purchased!" : subMode === "plans" ? "Plan Sent!" : "Top-Up Sent!";
  return (
    <div
      className="relative flex flex-col overflow-hidden shrink-0"
      style={{ width: 210, height: 420, borderRadius: 34, background: "#0A1628", border: "6px solid #1A2740", boxShadow: "0 20px 60px rgba(0,0,0,0.55)" }}
    >
      {/* notch */}
      <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: 88, height: 18, background: "#1A2740", borderRadius: "0 0 12px 12px" }} />
      {/* status bar */}
      <div className="flex justify-between items-center px-5 pt-3 text-[9px]" style={{ color: "#6B7280" }}>
        <span>9:41</span>
        <span className="font-semibold" style={{ color: carrierName ? color : "#6B7280" }}>{carrierName || "No carrier"}</span>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-3 px-5 text-center">
        {step === "idle" && (
          <>
            <div className="h-16 w-16 rounded-full flex items-center justify-center" style={{ background: "#12203A" }}>
              <Smartphone className="h-7 w-7" style={{ color: "#3B5680" }} />
            </div>
            <p className="text-sm font-semibold" style={{ color: "#8AA0C0" }}>Waiting for details</p>
            <p className="text-[11px]" style={{ color: "#54688A" }}>Build a top-up on the left to see a live preview.</p>
          </>
        )}

        {step === "entering" && (
          <>
            <div className="h-16 w-16 rounded-full flex items-center justify-center" style={{ background: `${color}22` }}>
              <Signal className="h-7 w-7" style={{ color }} />
            </div>
            <p className="text-sm font-bold" style={{ color: "#E6EDF7" }}>{carrierName || "Select carrier"}</p>
            {amount > 0 && <p className="text-2xl font-extrabold" style={{ color }}>{amtLabel}</p>}
            <p className="text-[11px] font-mono" style={{ color: "#8AA0C0" }}>{fullNumber}</p>
            <p className="text-[11px]" style={{ color: "#54688A" }}>Keep going…</p>
          </>
        )}

        {step === "confirm" && (
          <>
            <div className="h-14 w-14 rounded-2xl flex items-center justify-center text-lg font-extrabold" style={{ background: `${color}22`, color }}>
              {carrierName[0]?.toUpperCase()}
            </div>
            <p className="text-sm font-bold" style={{ color: "#E6EDF7" }}>{carrierName}</p>
            <p className="text-3xl font-extrabold" style={{ color }}>{amtLabel}</p>
            <p className="text-[11px] font-mono" style={{ color: "#8AA0C0" }}>{fullNumber}</p>
            <div className="mt-1 flex items-center gap-1.5 px-3 py-1 rounded-full" style={{ background: "#12203A", color: "#4ADE80" }}>
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span className="text-[10px] font-bold">Ready to {mode === "voucher" ? "print" : "send"}</span>
            </div>
          </>
        )}

        {(step === "success" || step === "voucher") && (
          <>
            <div className="h-16 w-16 rounded-full flex items-center justify-center" style={{ background: "rgba(74,222,128,0.15)" }}>
              {step === "voucher" ? <Printer className="h-8 w-8 text-emerald-400" /> : <CheckCircle2 className="h-8 w-8 text-emerald-400" />}
            </div>
            <p className="text-base font-extrabold text-emerald-400">{step === "voucher" ? "Voucher Printed" : successLabel}</p>
            <p className="text-2xl font-extrabold" style={{ color: "#E6EDF7" }}>{amtLabel}</p>
            <p className="text-[11px] font-mono" style={{ color: "#8AA0C0" }}>{fullNumber}</p>
            {txRef && <p className="text-[10px]" style={{ color: "#54688A" }}>Ref: {txRef}</p>}
          </>
        )}
      </div>

      {/* home indicator */}
      <div style={{ margin: "0 auto 10px", width: 90, height: 4, borderRadius: 4, background: "#2A3A55" }} />
    </div>
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
