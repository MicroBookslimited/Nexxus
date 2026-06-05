import { useState, useMemo, useRef, useEffect, KeyboardEvent } from "react";
import { useLocation } from "wouter";
import nexxusLogoUrl from "@assets/EB8B578F-2602-4DD8-AB97-D02AF59C49D3_1775943434994.png";
import {
  useListProducts,
  useCreateOrder,
  useListCustomers,
  useCreateCustomer,
  useGetSettings,
  useGetCurrentCashSession,
  getListCustomersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useStaff } from "@/contexts/StaffContext";
import { useToast } from "@/hooks/use-toast";
import { PinPad } from "@/components/PinPad";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ScanBarcode,
  Plus,
  Minus,
  ShoppingCart,
  UserPlus,
  X,
  Trash2,
  Printer,
  CheckCircle2,
  LockKeyhole,
  Delete,
  Store,
  ArrowLeftRight,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { buildReceiptHtml, receiptOrderFrom } from "@/lib/receipt";
import { printOrderReceipt } from "@/lib/print-receipt";
import { fetchCustomerReceiptInfo, type CustomerReceiptInfo } from "@/lib/saas-api";

/* ────────────────────────────────────────────────────────────────────────── */
/* Helpers                                                                    */
/* ────────────────────────────────────────────────────────────────────────── */

const MANAGEMENT_ROLES = ["admin", "manager", "supervisor"];

function fmtNum(val: number) {
  return Math.abs(val).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatCurrency(val: number, currency = "JMD") {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
    }).format(val);
  } catch {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(val);
  }
}

type CartLine = {
  cartKey: string;
  productId: number;
  productName: string;
  barcode: string | null;
  price: number;
  quantity: number;
  isTaxable: boolean;
};

/* ────────────────────────────────────────────────────────────────────────── */
/* Main component                                                             */
/* ────────────────────────────────────────────────────────────────────────── */

export function PosSupermarket() {
  const [, navigate] = useLocation();
  const { staff: sessionStaff, setStaff, clearStaff } = useStaff();
  const [locked, setLocked] = useState(() => !sessionStaff);

  const { data: settings } = useGetSettings();
  const baseCurrency = settings?.base_currency || "JMD";
  const taxRate = parseFloat(settings?.tax_rate || "15") / 100;
  const taxMode = (settings?.tax_mode as "exclusive" | "inclusive") ?? "exclusive";
  const taxPct = Math.round(taxRate * 100);
  const businessLogoUrl = settings?.business_logo_url;
  const businessDisplayName = settings?.business_name;
  const supermarketMode = settings?.supermarket_mode === "true";

  const { data: products } = useListProducts();
  const { data: customers } = useListCustomers();
  const createOrder = useCreateOrder();
  const createCustomer = useCreateCustomer();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const {
    data: cashSession,
    isError: noOpenShift,
    isLoading: checkingShift,
  } = useGetCurrentCashSession({
    query: { retry: false, enabled: !locked, queryKey: ["/api/cash/sessions/current", sessionStaff?.id ?? null] },
    request: sessionStaff?.id ? { headers: { "x-staff-id": String(sessionStaff.id) } } : undefined,
  });

  // ── Auto-unlock if staff already set externally ──
  useEffect(() => {
    if (sessionStaff && locked) setLocked(false);
  }, [sessionStaff?.id]);

  /* ── Search / scanner ───────────────────────────────────────────────── */
  const [searchTerm, setSearchTerm] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Re-focus the scan box so USB scanners keep working after any interaction
  // (keypad, cart buttons, dialog close). rAF avoids racing focus-capturing UI.
  const focusScanInput = () => {
    requestAnimationFrame(() => searchInputRef.current?.focus());
  };
  useEffect(() => {
    focusScanInput();
  }, []);

  /* ── Cart ──────────────────────────────────────────────────────────────── */
  const [cart, setCart] = useState<CartLine[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card">("cash");
  const [cashTenderedInput, setCashTenderedInput] = useState("");

  // Numeric keypad: quantity for the next scanned item (or for a selected line).
  const [qtyInput, setQtyInput] = useState("");

  const cartBottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (cart.length > 0) cartBottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [cart.length]);

  const productList = products ?? [];

  /* ── Supermarket Mode gate (decrease / remove / clear when a cashier is on) ── */
  const isCashierUser = sessionStaff
    ? !MANAGEMENT_ROLES.some((r) => sessionStaff.role.toLowerCase().includes(r))
    : true;
  const needsSupermarketAuth = supermarketMode && isCashierUser;

  type SupermarketAction =
    | { type: "decrease"; cartKey: string }
    | { type: "remove"; cartKey: string }
    | { type: "clear" }
    | { type: "setqty"; cartKey: string; qty: number };

  const [supermarketAuthOpen, setSupermarketAuthOpen] = useState(false);
  const [pendingSupermarketAction, setPendingSupermarketAction] = useState<SupermarketAction | null>(null);

  const executeSupermarketAction = (action: SupermarketAction) => {
    if (action.type === "decrease") {
      setCart((prev) =>
        prev
          .map((c) => (c.cartKey === action.cartKey ? { ...c, quantity: c.quantity - 1 } : c))
          .filter((c) => c.quantity > 0),
      );
    } else if (action.type === "remove") {
      setCart((prev) => prev.filter((c) => c.cartKey !== action.cartKey));
      setSelectedKey((k) => (k === action.cartKey ? null : k));
    } else if (action.type === "clear") {
      resetCart();
    } else if (action.type === "setqty") {
      setCart((prev) =>
        prev
          .map((c) => (c.cartKey === action.cartKey ? { ...c, quantity: action.qty } : c))
          .filter((c) => c.quantity > 0),
      );
      setSelectedKey((k) => (action.qty <= 0 && k === action.cartKey ? null : k));
    }
    focusScanInput();
  };

  // Runs the action directly, or opens the manager-PIN gate first when required.
  const requestSupermarketAction = (action: SupermarketAction, isReduction: boolean) => {
    if (!needsSupermarketAuth || !isReduction) {
      executeSupermarketAction(action);
      return;
    }
    setPendingSupermarketAction(action);
    setSupermarketAuthOpen(true);
  };

  const handlePinSuccess = (staff: { id: number; name: string; role: string; permissions?: string[] }) => {
    setStaff({ id: staff.id, name: staff.name, role: staff.role, permissions: staff.permissions ?? [] });
    setLocked(false);
  };

  /* ── Add / change cart lines ──────────────────────────────────────────── */
  const addToCart = (productId: number, qty: number) => {
    const p = productList.find((x) => x.id === productId);
    if (!p) return;
    if (p.hasVariants || p.hasModifiers) {
      toast({
        title: "Item has options",
        description: "Variant / modifier items use the standard POS — switch it in Settings → POS Interface.",
        variant: "destructive",
      });
      return;
    }
    const addQty = qty > 0 ? qty : 1;
    setCart((prev) => {
      const idx = prev.findIndex((c) => c.productId === productId);
      if (idx >= 0) {
        return prev.map((c, i) => (i === idx ? { ...c, quantity: c.quantity + addQty } : c));
      }
      return [
        ...prev,
        {
          cartKey: `${productId}:${Date.now()}`,
          productId: p.id,
          productName: p.name,
          barcode: p.barcode ?? null,
          price: p.price,
          quantity: addQty,
          isTaxable: p.isTaxable,
        },
      ];
    });
  };

  const incQty = (cartKey: string) => {
    setCart((prev) => prev.map((c) => (c.cartKey === cartKey ? { ...c, quantity: c.quantity + 1 } : c)));
    focusScanInput();
  };

  const resetCart = () => {
    setCart([]);
    setSelectedKey(null);
    setCashTenderedInput("");
    setQtyInput("");
  };

  /* ── Numeric keypad ───────────────────────────────────────────────────── */
  const keypadPress = (k: string) => {
    focusScanInput();
    if (k === "clear") {
      setQtyInput("");
      return;
    }
    if (k === "back") {
      setQtyInput((prev) => prev.slice(0, -1));
      return;
    }
    setQtyInput((prev) => {
      const next = (prev + k).replace(/^0+(?=\d)/, "");
      // Cap at a sane 4 digits to avoid absurd quantities.
      return next.slice(0, 4);
    });
  };

  const applyQtyToSelected = () => {
    if (!selectedKey) return;
    const qty = parseInt(qtyInput, 10);
    if (!Number.isFinite(qty) || qty < 0) return;
    const line = cart.find((c) => c.cartKey === selectedKey);
    if (!line) return;
    requestSupermarketAction({ type: "setqty", cartKey: selectedKey, qty }, qty < line.quantity);
    setQtyInput("");
  };

  /* ── Scanner: Enter on a code adds the matching product ───────────────── */
  const handleSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    const code = searchTerm.trim();
    if (!code) return;
    const norm = code.toLowerCase();
    const matches = productList.filter(
      (p) => (p.barcode ?? "").toLowerCase() === norm || (p.sku ?? "").toLowerCase() === norm,
    );
    if (matches.length === 0) {
      toast({
        title: "No product found",
        description: `Nothing matches “${code}”.`,
        variant: "destructive",
      });
      return;
    }
    if (matches.length > 1) {
      toast({
        title: "Multiple products share this code",
        description: "Resolve the duplicate barcode before scanning.",
        variant: "destructive",
      });
      return;
    }
    const qty = parseInt(qtyInput, 10);
    addToCart(matches[0]!.id, Number.isFinite(qty) ? qty : 1);
    setSearchTerm("");
    setQtyInput("");
  };

  /* ── Customer selection ────────────────────────────────────────────────── */
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const selectedCustomer = customers?.find((c) => c.id === selectedCustomerId) ?? null;
  const [customerOpen, setCustomerOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [newCustomerForm, setNewCustomerForm] = useState({ name: "", phone: "", email: "" });
  const customerMatches = useMemo(() => {
    if (!customers) return [];
    const q = customerSearch.trim().toLowerCase();
    if (!q) return customers.slice(0, 25);
    return customers
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.phone ?? "").toLowerCase().includes(q) ||
          (c.email ?? "").toLowerCase().includes(q),
      )
      .slice(0, 25);
  }, [customers, customerSearch]);

  const handleCreateCustomer = () => {
    const name = newCustomerForm.name.trim();
    if (!name) {
      toast({ title: "Customer name required", variant: "destructive" });
      return;
    }
    createCustomer.mutate(
      {
        data: {
          name,
          phone: newCustomerForm.phone.trim() || undefined,
          email: newCustomerForm.email.trim() || undefined,
        },
      },
      {
        onSuccess: (created) => {
          queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() });
          setSelectedCustomerId(created.id);
          setCustomerOpen(false);
          setNewCustomerForm({ name: "", phone: "", email: "" });
          toast({ title: "Customer added", description: created.name });
        },
        onError: () => toast({ title: "Could not add customer", variant: "destructive" }),
      },
    );
  };

  /* ── Totals ────────────────────────────────────────────────────────────── */
  const subtotal = cart.reduce((s, c) => s + c.price * c.quantity, 0);
  const taxBase = cart.reduce((s, c) => (c.isTaxable ? s + c.price * c.quantity : s), 0);
  const tax =
    taxMode === "inclusive" ? (taxBase * taxRate) / (1 + taxRate) : taxBase * taxRate;
  const total = subtotal + (taxMode === "exclusive" ? tax : 0);
  const itemCount = cart.reduce((s, c) => s + c.quantity, 0);

  const cashTendered =
    paymentMethod === "cash" && cashTenderedInput && parseFloat(cashTenderedInput) > 0
      ? parseFloat(cashTenderedInput)
      : undefined;
  const changeDue = cashTendered != null ? Math.max(0, cashTendered - total) : 0;

  /* ── Checkout ──────────────────────────────────────────────────────────── */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [receiptOrder, setReceiptOrder] = useState<any>(null);
  const [receiptCustomerInfo, setReceiptCustomerInfo] = useState<CustomerReceiptInfo | null>(null);

  const handleCheckout = () => {
    if (cart.length === 0) {
      toast({ title: "Cart is empty", variant: "destructive" });
      return;
    }
    createOrder.mutate(
      {
        // `cashTendered` is accepted by the API but missing from the generated
        // CreateOrderBody type, so the body is cast (same pattern as the other layouts).
        data: {
          paymentMethod,
          staffId: sessionStaff?.id ?? undefined,
          items: cart.map((c) => ({ productId: c.productId, quantity: c.quantity })),
          cashTendered,
          notes: undefined,
          customerId: selectedCustomerId ?? undefined,
          orderType: "counter",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      },
      {
        onSuccess: (data) => {
          setReceiptOrder(data);
          if (data?.customerId && selectedCustomer) {
            setReceiptCustomerInfo({
              id: selectedCustomer.id,
              name: selectedCustomer.name,
              phone: selectedCustomer.phone ?? null,
              email: selectedCustomer.email ?? null,
              loyaltyPoints: selectedCustomer.loyaltyPoints,
              outstandingBalance: 0,
            } as CustomerReceiptInfo);
            fetchCustomerReceiptInfo(data.customerId)
              .then((fresh) => setReceiptCustomerInfo(fresh))
              .catch(() => {});
          } else {
            setReceiptCustomerInfo(null);
          }
          resetCart();
          setSelectedCustomerId(null);
          queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
        },
        onError: (err: unknown) => {
          const apiErr = err as { status?: number; body?: unknown; data?: unknown; message?: string } | undefined;
          const payload = (apiErr?.body ?? apiErr?.data) as
            | { error?: string; message?: string; productName?: string; available?: number; requested?: number }
            | undefined;
          toast({
            title: "Payment failed",
            description: payload?.message ?? apiErr?.message ?? "Could not complete the sale.",
            variant: "destructive",
          });
        },
      },
    );
  };

  const printReceipt = () => {
    if (!receiptOrder) return;
    const ro = receiptOrderFrom(receiptOrder, {
      name: receiptCustomerInfo?.name ?? null,
      phone: receiptCustomerInfo?.phone ?? null,
      email: receiptCustomerInfo?.email ?? null,
      loyaltyPoints: receiptCustomerInfo?.loyaltyPoints ?? null,
      outstandingBalance: receiptCustomerInfo?.outstandingBalance ?? null,
    });
    const html = buildReceiptHtml(ro, settings);
    printOrderReceipt(html, ro, settings);
  };

  /* ────────────────────────────────────────────────────────────────────── */
  /* Locked / no-shift gates                                                 */
  /* ────────────────────────────────────────────────────────────────────── */
  if (locked) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0B1E2D]">
        <div className="flex flex-col items-center gap-8 w-full max-w-xs">
          <div className="flex flex-col items-center gap-2 mb-2">
            {businessLogoUrl ? (
              <>
                <img src={businessLogoUrl} alt={businessDisplayName || "Business Logo"} className="max-h-24 max-w-48 object-contain" />
                {businessDisplayName && <p className="text-sm text-slate-300 text-center">{businessDisplayName}</p>}
              </>
            ) : (
              <>
                <img src={nexxusLogoUrl} alt="NEXXUS POS" className="h-16 w-auto" />
                <p className="text-sm text-cyan-300">Supermarket Mode</p>
              </>
            )}
          </div>
          <PinPad onSuccess={handlePinSuccess} title="Staff PIN Required" pinLength={4} />
        </div>
      </div>
    );
  }

  if (checkingShift) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B1E2D]">
        <p className="text-sm text-slate-400 animate-pulse">Checking shift status…</p>
      </div>
    );
  }

  if (noOpenShift || !cashSession) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0B1E2D] gap-6 px-6 text-center">
        <div className="h-16 w-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
          <Store className="h-8 w-8 text-amber-400" />
        </div>
        <div className="max-w-sm">
          <h2 className="text-xl font-bold mb-1 text-white">No Open Shift</h2>
          <p className="text-sm text-slate-400">A cash drawer shift must be opened before you can process sales.</p>
        </div>
        <button
          onClick={() => navigate("/cash")}
          className="rounded-md bg-gradient-to-r from-cyan-500 to-blue-500 px-5 py-2.5 text-sm font-semibold text-white shadow hover:brightness-110 transition"
        >
          Open Shift in Cash Management
        </button>
      </div>
    );
  }

  /* ────────────────────────────────────────────────────────────────────── */
  /* Main render                                                             */
  /* ────────────────────────────────────────────────────────────────────── */
  return (
    <div className="flex flex-col h-full min-h-0 bg-[#0B1E2D] text-slate-100">
      {/* ── Top bar ──────────────────────────────────────────────────── */}
      <div className="shrink-0 px-4 py-3 border-b border-white/5 bg-gradient-to-r from-[#0B1E2D] via-[#0d2238] to-[#0B1E2D] flex items-center gap-3">
        <div className="flex items-center gap-3 shrink-0">
          <img src={nexxusLogoUrl} alt="NEXXUS POS" className="h-9 w-auto" />
          <div className="hidden md:flex items-center gap-1.5 rounded-full bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border border-cyan-400/30 px-3 py-1">
            <Store className="h-3.5 w-3.5 text-cyan-300" />
            <span className="text-xs font-semibold text-cyan-200 tracking-wide">Supermarket Mode</span>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2 shrink-0">
          <button
            onClick={() => navigate("/dashboard")}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#0a1a2a] border border-white/10 px-3 h-11 text-xs text-slate-300 hover:bg-white/5 transition"
          >
            <ArrowLeftRight className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Dashboard</span>
          </button>
          <div className="flex items-center gap-2 rounded-xl bg-[#0a1a2a] border border-white/10 px-3 h-11">
            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-xs font-bold text-[#0B1E2D]">
              {sessionStaff?.name?.charAt(0).toUpperCase() ?? "U"}
            </div>
            <div className="hidden lg:flex flex-col leading-tight">
              <span className="text-xs font-semibold text-slate-100">{sessionStaff?.name ?? "—"}</span>
              <span className="text-[10px] text-slate-400 capitalize">{sessionStaff?.role ?? ""}</span>
            </div>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="h-11 w-11 inline-flex items-center justify-center rounded-xl bg-[#0a1a2a] border border-white/10 text-slate-300 hover:bg-cyan-500/10 hover:text-cyan-300 transition"
            title="Reload screen"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            onClick={() => { setLocked(true); clearStaff(); }}
            className="h-11 w-11 inline-flex items-center justify-center rounded-xl bg-[#0a1a2a] border border-white/10 text-slate-300 hover:bg-amber-500/10 hover:text-amber-300 transition"
            title="Lock"
          >
            <LockKeyhole className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── Body: big bill (left) + controls (right) ─────────────────── */}
      <div className="flex flex-1 min-h-0">
        {/* ── LEFT: bold bill preview ───────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-white/5">
          <div className="shrink-0 px-6 py-4 border-b border-white/5 flex items-center justify-between bg-[#0d2238]/40">
            <h2 className="text-lg font-extrabold text-slate-100 tracking-wide flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-cyan-300" />
              CURRENT BILL
              <span className="text-sm font-semibold text-slate-400">
                ({itemCount} {itemCount === 1 ? "item" : "items"})
              </span>
            </h2>
            {cart.length > 0 && (
              <button
                onClick={() => requestSupermarketAction({ type: "clear" }, true)}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 h-9 text-sm text-slate-300 hover:bg-rose-500/10 hover:text-rose-300 transition"
                title="Clear bill"
              >
                <Trash2 className="h-4 w-4" />
                Clear
              </button>
            )}
          </div>

          {/* Column headers */}
          <div className="shrink-0 grid grid-cols-[1fr_120px_160px_44px] gap-4 px-6 py-2 text-xs font-bold tracking-widest text-slate-400 uppercase border-b border-white/5 bg-[#0a1a2a]/50">
            <div>Item</div>
            <div className="text-center">Qty</div>
            <div className="text-right">Amount</div>
            <div></div>
          </div>

          {/* Lines */}
          <div className="flex-1 overflow-y-auto">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-8">
                <ScanBarcode className="h-14 w-14 text-slate-700" />
                <p className="text-lg font-semibold text-slate-500">Scan an item to begin</p>
                <p className="text-sm text-slate-600">Use the scanner or type a barcode and press Enter.</p>
              </div>
            ) : (
              cart.map((c) => {
                const selected = c.cartKey === selectedKey;
                return (
                  <div
                    key={c.cartKey}
                    onClick={() => setSelectedKey(selected ? null : c.cartKey)}
                    className={`grid grid-cols-[1fr_120px_160px_44px] gap-4 px-6 py-3.5 items-center border-b border-white/5 cursor-pointer transition ${
                      selected ? "bg-cyan-500/10" : "hover:bg-white/5"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-xl font-bold text-slate-50 truncate">{c.productName}</div>
                      <div className="text-sm font-mono text-cyan-300/80 truncate">
                        {c.barcode ?? `#${c.productId}`} · @ {formatCurrency(c.price, baseCurrency)}
                      </div>
                    </div>
                    <div className="flex items-center justify-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => requestSupermarketAction({ type: "decrease", cartKey: c.cartKey }, true)}
                        className="h-9 w-9 rounded-lg bg-[#0a1a2a] border border-white/10 text-slate-300 hover:bg-rose-500/10 hover:text-rose-300 transition flex items-center justify-center"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="font-mono text-xl font-extrabold w-10 text-center text-slate-50">{c.quantity}</span>
                      <button
                        onClick={() => incQty(c.cartKey)}
                        className="h-9 w-9 rounded-lg bg-[#0a1a2a] border border-white/10 text-slate-300 hover:bg-cyan-500/10 hover:text-cyan-300 transition flex items-center justify-center"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="text-right font-mono text-2xl font-extrabold text-slate-50">
                      {formatCurrency(c.price * c.quantity, baseCurrency)}
                    </div>
                    <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => requestSupermarketAction({ type: "remove", cartKey: c.cartKey }, true)}
                        className="h-9 w-9 rounded-lg text-slate-500 hover:text-rose-300 hover:bg-rose-500/10 transition flex items-center justify-center"
                        title="Remove"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={cartBottomRef} />
          </div>

          {/* Big totals footer */}
          <div className="shrink-0 px-6 py-4 border-t border-white/10 bg-[#0a1a2a]/60 space-y-1.5">
            <div className="flex justify-between text-sm text-slate-400">
              <span>Subtotal</span>
              <span className="font-mono">{formatCurrency(subtotal, baseCurrency)}</span>
            </div>
            {taxMode === "exclusive" && (
              <div className="flex justify-between text-sm text-slate-400">
                <span>Tax ({taxPct}%)</span>
                <span className="font-mono">{formatCurrency(tax, baseCurrency)}</span>
              </div>
            )}
            <div className="flex items-center justify-between pt-2 mt-1 border-t border-white/10">
              <span className="text-2xl font-extrabold text-slate-100">TOTAL</span>
              <span className="text-5xl font-extrabold font-mono bg-gradient-to-r from-cyan-300 to-blue-300 bg-clip-text text-transparent">
                {formatCurrency(total, baseCurrency)}
              </span>
            </div>
            {cashTendered != null && (
              <div className="flex items-center justify-between pt-1 text-emerald-300">
                <span className="text-sm font-semibold">Change Due</span>
                <span className="font-mono text-2xl font-bold">{formatCurrency(changeDue, baseCurrency)}</span>
              </div>
            )}
          </div>
        </div>

        {/* ── MIDDLE/RIGHT: scan + keypad + customer + payment ──────── */}
        <div className="w-[440px] shrink-0 flex flex-col bg-[#0a1a2a]/60 min-h-0 overflow-y-auto">
          <div className="p-4 space-y-4">
            {/* Scan box */}
            <div>
              <Label className="text-xs text-slate-400 mb-1.5 block">Scan or type SKU / barcode</Label>
              <div className="relative">
                <ScanBarcode className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-cyan-400 pointer-events-none" />
                <Input
                  ref={searchInputRef}
                  autoFocus
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={handleSearchKey}
                  placeholder="Scan a barcode…"
                  className="pl-11 pr-10 h-14 text-lg bg-[#0d2238] border-cyan-400/30 focus-visible:border-cyan-400 focus-visible:ring-cyan-400/20 text-slate-100 placeholder:text-slate-500 rounded-xl"
                  autoComplete="off"
                />
                {searchTerm && (
                  <button
                    onClick={() => { setSearchTerm(""); searchInputRef.current?.focus(); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-200"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Quantity keypad */}
            <div className="rounded-2xl bg-[#0d2238] border border-white/5 p-3">
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="text-xs font-semibold text-slate-400">
                  {selectedKey ? "Set qty for selected" : "Qty for next scan"}
                </span>
                <span className="font-mono text-2xl font-extrabold text-cyan-300">× {qtyInput || "1"}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"].map((k) => (
                  <Button
                    key={k}
                    variant="outline"
                    className="h-12 text-lg font-bold bg-[#0a1a2a] border-white/10 text-slate-100 hover:bg-cyan-500/10 hover:text-cyan-200"
                    onClick={() => keypadPress(k)}
                  >
                    {k === "back" ? <Delete className="h-5 w-5" /> : k === "clear" ? "C" : k}
                  </Button>
                ))}
              </div>
              {selectedKey && (
                <Button
                  onClick={applyQtyToSelected}
                  disabled={qtyInput === ""}
                  className="mt-2 w-full h-11 bg-cyan-600 hover:bg-cyan-500 font-bold disabled:opacity-40"
                >
                  Set Quantity
                </Button>
              )}
            </div>

            {/* Customer */}
            {selectedCustomer ? (
              <div className="rounded-xl bg-cyan-500/10 border border-cyan-400/20 px-3 py-2.5 flex items-center gap-2">
                <div className="h-7 w-7 rounded-full bg-cyan-400 text-[#0B1E2D] flex items-center justify-center text-xs font-bold">
                  {selectedCustomer.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-cyan-100 truncate text-sm">{selectedCustomer.name}</div>
                  {selectedCustomer.phone && (
                    <div className="text-xs text-cyan-300/70 truncate">{selectedCustomer.phone}</div>
                  )}
                </div>
                <button onClick={() => setSelectedCustomerId(null)} className="text-slate-400 hover:text-rose-300" title="Clear customer">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setCustomerOpen(true)}
                className="w-full rounded-xl border border-dashed border-cyan-400/30 px-3 py-2.5 text-sm text-slate-400 hover:bg-cyan-500/5 hover:text-cyan-200 transition flex items-center justify-center gap-2"
              >
                <UserPlus className="h-4 w-4" />
                Add Customer (optional)
              </button>
            )}

            {/* Payment method */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setPaymentMethod("cash")}
                className={`h-12 rounded-xl text-sm font-bold transition border ${
                  paymentMethod === "cash"
                    ? "bg-cyan-500/20 border-cyan-400/50 text-cyan-100"
                    : "bg-[#0d2238] border-white/10 text-slate-400 hover:text-slate-200"
                }`}
              >
                Cash
              </button>
              <button
                onClick={() => setPaymentMethod("card")}
                className={`h-12 rounded-xl text-sm font-bold transition border ${
                  paymentMethod === "card"
                    ? "bg-cyan-500/20 border-cyan-400/50 text-cyan-100"
                    : "bg-[#0d2238] border-white/10 text-slate-400 hover:text-slate-200"
                }`}
              >
                Card
              </button>
            </div>
            {paymentMethod === "cash" && (
              <Input
                type="number"
                inputMode="decimal"
                placeholder="Cash tendered"
                value={cashTenderedInput}
                onChange={(e) => setCashTenderedInput(e.target.value)}
                className="h-12 bg-[#0d2238] border-white/10 text-slate-100 placeholder:text-slate-500 text-base"
              />
            )}

            {/* Checkout */}
            <button
              onClick={handleCheckout}
              disabled={cart.length === 0 || createOrder.isPending}
              className="w-full h-16 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-lg font-extrabold shadow-lg shadow-cyan-500/20 hover:brightness-110 active:scale-[0.99] transition disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
            >
              <ShoppingCart className="h-6 w-6" />
              {createOrder.isPending ? "PROCESSING…" : `CHECKOUT · ${formatCurrency(total, baseCurrency)}`}
            </button>
          </div>
        </div>
      </div>

      {/* ── Supermarket Mode — manager PIN gate ──────────────────────── */}
      <Dialog
        open={supermarketAuthOpen}
        onOpenChange={(o) => { if (!o) { setSupermarketAuthOpen(false); setPendingSupermarketAction(null); focusScanInput(); } }}
      >
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-400">
              <Trash2 className="h-4 w-4" />
              Supermarket Mode — Override Required
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground text-center -mt-2 mb-2">
            {pendingSupermarketAction?.type === "decrease" && "A manager or supervisor PIN is required to decrease quantity."}
            {pendingSupermarketAction?.type === "setqty" && "A manager or supervisor PIN is required to reduce quantity."}
            {pendingSupermarketAction?.type === "remove" && "A manager or supervisor PIN is required to remove an item."}
            {pendingSupermarketAction?.type === "clear" && "A manager or supervisor PIN is required to clear the bill."}
          </p>
          <PinPad
            title=""
            requiredRoles={["manager", "admin", "supervisor"]}
            onSuccess={(staff) => {
              const action = pendingSupermarketAction;
              setSupermarketAuthOpen(false);
              setPendingSupermarketAction(null);
              if (action) executeSupermarketAction(action);
              toast({ title: "Override approved", description: `Authorized by ${staff.name}` });
            }}
          />
        </DialogContent>
      </Dialog>

      {/* ── Customer dialog ──────────────────────────────────────────── */}
      <Dialog open={customerOpen} onOpenChange={(o) => { setCustomerOpen(o); if (!o) focusScanInput(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Select or Add Customer</DialogTitle>
            <DialogDescription>Search existing customers or create a new one.</DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Search by name, phone, or email…"
            value={customerSearch}
            onChange={(e) => setCustomerSearch(e.target.value)}
            autoFocus
          />
          <div className="max-h-56 overflow-y-auto border border-border rounded-md divide-y divide-border">
            {customerMatches.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground text-center">No matches.</p>
            ) : (
              customerMatches.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setSelectedCustomerId(c.id);
                    setCustomerOpen(false);
                    setCustomerSearch("");
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-secondary/60 text-sm flex items-center justify-between"
                >
                  <div>
                    <div className="font-medium">{c.name}</div>
                    {c.phone && <div className="text-xs text-muted-foreground">{c.phone}</div>}
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              ))
            )}
          </div>
          <div className="border-t border-border pt-3 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">Or add a new customer</p>
            <div className="space-y-1.5">
              <Label htmlFor="new-cust-name">Name</Label>
              <Input
                id="new-cust-name"
                value={newCustomerForm.name}
                onChange={(e) => setNewCustomerForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Customer name"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="new-cust-phone">Phone</Label>
                <Input
                  id="new-cust-phone"
                  value={newCustomerForm.phone}
                  onChange={(e) => setNewCustomerForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-cust-email">Email</Label>
                <Input
                  id="new-cust-email"
                  type="email"
                  value={newCustomerForm.email}
                  onChange={(e) => setNewCustomerForm((f) => ({ ...f, email: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCustomerOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateCustomer} disabled={createCustomer.isPending}>
              {createCustomer.isPending ? "Saving…" : "Add Customer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Receipt dialog ──────────────────────────────────────────── */}
      <Dialog open={!!receiptOrder} onOpenChange={(o) => { if (!o) { setReceiptOrder(null); focusScanInput(); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-500">
              <CheckCircle2 className="h-5 w-5" />
              Sale Complete
            </DialogTitle>
            <DialogDescription>Order #{receiptOrder?.id}</DialogDescription>
          </DialogHeader>
          {receiptOrder && (
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-mono">{fmtNum(receiptOrder.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tax</span>
                <span className="font-mono">{fmtNum(receiptOrder.tax)}</span>
              </div>
              <div className="flex justify-between font-bold text-base pt-1.5 border-t border-border">
                <span>Total</span>
                <span className="font-mono">{fmtNum(receiptOrder.total)}</span>
              </div>
              {receiptOrder.paymentMethod === "cash" &&
                receiptOrder.cashTendered != null &&
                receiptOrder.cashTendered > 0 && (
                  <div className="flex justify-between text-xs font-semibold text-emerald-500">
                    <span>Change Due</span>
                    <span className="font-mono">{fmtNum(Math.max(0, receiptOrder.cashTendered - receiptOrder.total))}</span>
                  </div>
                )}
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setReceiptOrder(null)}>Done</Button>
            <Button onClick={printReceipt} className="bg-gradient-to-r from-cyan-500 to-blue-500">
              <Printer className="h-4 w-4 mr-1.5" />
              Print Receipt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
