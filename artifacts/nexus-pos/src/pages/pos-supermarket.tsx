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
  useListHeldOrders,
  useCreateHeldOrder,
  useDeleteHeldOrder,
  getListHeldOrdersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient, useQueries } from "@tanstack/react-query";
import { useStaff } from "@/contexts/StaffContext";
import { usePosChrome } from "@/contexts/PosChromeContext";
import { ZoomControls } from "@/components/ZoomControls";
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
  Tag,
  ArrowLeftRight,
  UserRound,
  ChevronRight,
  RefreshCw,
  Banknote,
  BookOpen,
  CreditCard,
  SplitSquareHorizontal,
  ChevronDown,
  ChevronUp,
  PauseCircle,
  PlayCircle,
} from "lucide-react";
import { buildReceiptHtml, receiptOrderFrom } from "@/lib/receipt";
import { CardTypeDialog, type CardType } from "@/components/card-type-dialog";
import { SplitPaymentDialog } from "@/components/split-payment-dialog";
import { printOrderReceipt } from "@/lib/print-receipt";
import { fetchCustomerReceiptInfo, type CustomerReceiptInfo, lookupGiftVoucher, type VoucherLookupResult, ApiError, getPricingTiers, previewTierPrice, type PricingTier } from "@/lib/saas-api";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

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

/**
 * Quick cash-tender suggestions for the amount due: the exact amount rounded up
 * to the next whole unit, plus the next round denominations (50/100/500/1000/5000)
 * that are >= the total. Deduped, ascending, capped to a handful of buttons.
 */
function cashSuggestions(total: number): number[] {
  if (total <= 0) return [];
  const set = new Set<number>();
  set.add(Number(total.toFixed(2)));
  for (const step of [50, 100, 500, 1000, 5000]) {
    set.add(Math.ceil(total / step) * step);
  }
  return Array.from(set)
    .filter((v) => v >= total)
    .sort((a, b) => a - b)
    .slice(0, 5);
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

export function PosSupermarket({
  enableNameSearch = false,
  retailLayout = false,
}: { enableNameSearch?: boolean; retailLayout?: boolean } = {}) {
  // Retail Store Mode is the supermarket layout + item-name search, with the
  // scan box moved into the wide left area (larger, centered) so the product
  // suggestion dropdown has room to open freely.
  const nameSearch = enableNameSearch || retailLayout;
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

  // The active cash session's location drives per-location pricing (so a product
  // with a location-specific price_override is rung up at that price, not the
  // global default). Set from the cash session once it loads (below).
  const [sessionLocationId, setSessionLocationId] = useState<number | null>(null);
  const { data: products } = useListProducts(
    sessionLocationId ? { locationId: sessionLocationId } : undefined,
  );
  const { data: customers } = useListCustomers();
  const createOrder = useCreateOrder();
  const createCustomer = useCreateCustomer();
  const { data: heldOrders } = useListHeldOrders();
  const createHeldOrder = useCreateHeldOrder();
  const deleteHeldOrder = useDeleteHeldOrder();
  const [heldSheetOpen, setHeldSheetOpen] = useState(false);
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

  // Always follow the active cash session's location so products are priced for
  // that location. Unlike the standard POS there is no manual location picker
  // here, so we track the session value directly (and stay correct across a
  // cashier/shift switch without a full remount).
  useEffect(() => {
    const locId = cashSession?.session?.locationId ?? null;
    setSessionLocationId((prev) => (prev === locId ? prev : locId));
  }, [cashSession?.session?.locationId]);

  /* ── Search / scanner ───────────────────────────────────────────────── */
  const [searchTerm, setSearchTerm] = useState("");
  const { headerHidden, toggleHeader } = usePosChrome();
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Re-focus the scan box so USB scanners keep working after any interaction
  // (keypad, cart buttons, dialog close). rAF avoids racing focus-capturing UI.
  const focusScanInput = () => {
    requestAnimationFrame(() => searchInputRef.current?.focus());
  };
  useEffect(() => {
    focusScanInput();
  }, []);

  /* ── Price Check (lookup-only popup: no sale, no stock change, no PIN) ── */
  const [priceCheckOpen, setPriceCheckOpen] = useState(false);
  const [priceCheckSearch, setPriceCheckSearch] = useState("");
  const [priceCheckResult, setPriceCheckResult] = useState<{
    name: string;
    barcode: string | null;
    sku: string | null;
    price: number;
    isTaxable: boolean;
    sellingUnit: string | null;
    size: string | null;
  } | null>(null);
  const [priceCheckNotFound, setPriceCheckNotFound] = useState<string | null>(null);
  const priceCheckInputRef = useRef<HTMLInputElement>(null);

  const focusPriceCheckInput = () => {
    requestAnimationFrame(() => priceCheckInputRef.current?.focus());
  };

  const openPriceCheck = () => {
    setPriceCheckResult(null);
    setPriceCheckNotFound(null);
    setPriceCheckSearch("");
    setPriceCheckOpen(true);
    focusPriceCheckInput();
  };

  // Closing never requires a manager PIN — a price check is not a sale.
  const closePriceCheck = () => {
    setPriceCheckOpen(false);
    setPriceCheckResult(null);
    setPriceCheckNotFound(null);
    setPriceCheckSearch("");
    focusScanInput();
  };

  const handlePriceCheckKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    const code = priceCheckSearch.trim();
    if (!code) return;
    const norm = code.toLowerCase();
    // Look up by exact barcode / SKU first (scanner path).
    const match =
      productList.find((p) => (p.barcode ?? "").toLowerCase() === norm) ??
      productList.find((p) => (p.sku ?? "").toLowerCase() === norm);
    if (!match) {
      setPriceCheckResult(null);
      setPriceCheckNotFound(code);
      setPriceCheckSearch("");
      focusPriceCheckInput();
      return;
    }
    setPriceCheckResult({
      name: match.name,
      barcode: match.barcode ?? null,
      sku: match.sku ?? null,
      price: match.price,
      isTaxable: match.isTaxable,
      sellingUnit: match.sellingUnit ?? null,
      size: match.size ?? null,
    });
    setPriceCheckNotFound(null);
    setPriceCheckSearch("");
    focusPriceCheckInput();
  };

  /* ── Cart ──────────────────────────────────────────────────────────────── */
  const [cart, setCart] = useState<CartLine[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "split">("cash");
  // Debit/credit choice for card (and the card portion of a split); printed on the receipt.
  const [cardType, setCardType] = useState<CardType | null>(null);
  const [cardTypeDialogOpen, setCardTypeDialogOpen] = useState(false);
  const [cashTenderedInput, setCashTenderedInput] = useState("");
  const [splitCashInput, setSplitCashInput] = useState("");
  const [splitCardInput, setSplitCardInput] = useState("");
  const [splitDialogOpen, setSplitDialogOpen] = useState(false);
  // Gift voucher redemption (a tender, not a discount).
  const [voucherCodeInput, setVoucherCodeInput] = useState("");
  const [appliedVoucher, setAppliedVoucher] = useState<VoucherLookupResult | null>(null);
  const [voucherLookupBusy, setVoucherLookupBusy] = useState(false);
  const isOnline = useOnlineStatus();

  // Numeric keypad: quantity for the next scanned item (or for a selected line).
  const [qtyInput, setQtyInput] = useState("");

  const cartBottomRef = useRef<HTMLDivElement>(null);

  // ── Volume / tier pricing ────────────────────────────────────────────────
  // Fetch pricing tiers for every product currently in the cart so the cart
  // display, subtotal, and tax all reflect the correct tiered unit price.
  // (The checkout payload sends {productId, quantity} and the server applies
  // tiers authoritatively — this only makes the pre-checkout display accurate.)
  const cartProductIds = useMemo(
    () => Array.from(new Set(cart.map((c) => c.productId))),
    [cart],
  );
  const tierQueries = useQueries({
    queries: cartProductIds.map((pid) => ({
      queryKey: ["pricing-tiers", pid],
      queryFn: () => getPricingTiers(pid),
      staleTime: 60_000,
    })),
  });
  const pricingTiersByProduct = useMemo(() => {
    const m = new Map<number, PricingTier[]>();
    cartProductIds.forEach((pid, i) => {
      m.set(pid, (tierQueries[i]?.data as PricingTier[] | undefined) ?? []);
    });
    return m;
  }, [cartProductIds, tierQueries]);

  /** Tier-adjusted unit price for a cart line (falls back to base price). */
  const effectiveUnitPrice = (c: CartLine) =>
    previewTierPrice(c.price, c.quantity, pricingTiersByProduct.get(c.productId) ?? []).unitPrice;
  useEffect(() => {
    if (cart.length > 0) cartBottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [cart.length]);

  const productList = products ?? [];

  // Item-name search results (only when the "with item name search" mode is on).
  // Matches product name, SKU, or barcode by substring so a cashier can find a
  // product without an exact scan. Capped so the dropdown stays fast/readable.
  const searchResults = useMemo(() => {
    if (!nameSearch) return [];
    const q = searchTerm.trim().toLowerCase();
    if (!q) return [];
    return productList
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.sku ?? "").toLowerCase().includes(q) ||
          (p.barcode ?? "").toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [nameSearch, searchTerm, productList]);

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
    setSplitCashInput("");
    setSplitCardInput("");
    setSplitDialogOpen(false);
    setPaymentMethod("cash");
    setCardType(null);
    setCardTypeDialogOpen(false);
    setQtyInput("");
    setVoucherCodeInput("");
    setAppliedVoucher(null);
    setVoucherLookupBusy(false);
  };

  /* ── Hold / recall bill ───────────────────────────────────────────────────
     Routine cashier actions in supermarket mode (no manager PIN): holding saves
     the current bill and clears the lane, recalling reloads a saved bill. */
  const handleHoldBill = () => {
    if (cart.length === 0) {
      toast({ title: "Bill is empty", description: "Scan items before holding a bill.", variant: "destructive" });
      return;
    }
    createHeldOrder.mutate(
      {
        data: {
          items: cart.map((c) => ({
            productId: c.productId,
            productName: c.productName,
            price: c.price,
            quantity: c.quantity,
          })),
        },
      },
      {
        onSuccess: () => {
          resetCart();
          toast({ title: "Bill held", description: "Lane cleared. Recall it any time with Recall." });
          queryClient.invalidateQueries({ queryKey: getListHeldOrdersQueryKey() });
          focusScanInput();
        },
        onError: () => {
          toast({ title: "Could not hold bill", variant: "destructive" });
        },
      },
    );
  };

  const handleRecallBill = (id: number) => {
    const held = heldOrders?.find((h) => h.id === id);
    if (!held) return;
    if (cart.length > 0) {
      const ok = window.confirm("This will replace the current bill. Continue?");
      if (!ok) return;
    }
    const productMap = new Map(productList.map((p) => [p.id, p]));
    setCart(
      held.items.map((item, idx) => {
        const p = productMap.get(item.productId);
        return {
          cartKey: `${item.productId}:recall:${Date.now()}:${idx}`,
          productId: item.productId,
          productName: item.productName,
          barcode: p?.barcode ?? null,
          price: item.price,
          quantity: item.quantity,
          isTaxable: p?.isTaxable ?? true,
        };
      }),
    );
    setSelectedKey(null);
    setHeldSheetOpen(false);
    focusScanInput();
    deleteHeldOrder.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Bill recalled" });
          queryClient.invalidateQueries({ queryKey: getListHeldOrdersQueryKey() });
        },
        onError: () => {
          // Cart is already restored; warn that the stale held bill couldn't be
          // removed so the cashier doesn't accidentally recall it twice.
          toast({
            title: "Bill recalled, but cleanup failed",
            description: "The held bill may still appear in the list — refresh before recalling it again.",
            variant: "destructive",
          });
          queryClient.invalidateQueries({ queryKey: getListHeldOrdersQueryKey() });
        },
      },
    );
  };

  /* ── Numeric keypad ───────────────────────────────────────────────────── */
  const keypadPress = (k: string) => {
    // When cash is selected, route digits to the cash tendered field.
    if (paymentMethod === "cash") {
      if (k === "clear") {
        setCashTenderedInput("");
      } else if (k === "back") {
        setCashTenderedInput((prev) => prev.slice(0, -1));
      } else {
        setCashTenderedInput((prev) => {
          const next = (prev + k).replace(/^0+(?=\d)/, "");
          return next.slice(0, 10);
        });
      }
      return;
    }
    // Otherwise route to qty input (for scanning / set-qty).
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

  // Add a product (respecting the numeric quantity keypad) and reset the scan box.
  const addFromSearch = (productId: number) => {
    const qty = parseInt(qtyInput, 10);
    addToCart(productId, Number.isFinite(qty) ? qty : 1);
    setSearchTerm("");
    setQtyInput("");
    focusScanInput();
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
    if (matches.length === 1) {
      addFromSearch(matches[0]!.id);
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
    // No exact barcode/SKU match. With item-name search on, add the single result
    // outright, or leave the dropdown open for the cashier to pick from several.
    if (nameSearch) {
      if (searchResults.length === 1) {
        addFromSearch(searchResults[0]!.id);
        return;
      }
      if (searchResults.length > 1) return;
    }
    toast({
      title: "No product found",
      description: `Nothing matches “${code}”.`,
      variant: "destructive",
    });
  };

  // Shared scan / search box (with optional name-search dropdown). Rendered in
  // ONE place at a time — the right panel (supermarket) or the wide left area
  // (retail, `large`) — so `searchInputRef` stays unique.
  const renderScanBox = (large = false) => (
    <div className={large ? "w-full max-w-2xl" : ""}>
      <Label className="text-xs text-muted-foreground mb-1.5 block">
        {nameSearch ? "Search by name, SKU, or barcode" : "Scan or type SKU / barcode"}
      </Label>
      <div className="relative">
        <ScanBarcode className={`absolute left-3 top-1/2 -translate-y-1/2 text-cyan-500 pointer-events-none ${large ? "h-6 w-6" : "h-5 w-5"}`} />
        <Input
          ref={searchInputRef}
          autoFocus
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyDown={handleSearchKey}
          placeholder={nameSearch ? "Search or scan a product…" : "Scan a barcode…"}
          className={`bg-white border-cyan-500/40 focus-visible:border-cyan-500 focus-visible:ring-cyan-500/20 text-gray-900 placeholder:text-gray-400 rounded-xl ${large ? "pl-12 pr-11 h-16 text-xl" : "pl-11 pr-10 h-14 text-lg"}`}
          autoComplete="off"
        />
        {searchTerm && (
          <button
            onClick={() => { setSearchTerm(""); searchInputRef.current?.focus(); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {nameSearch && searchResults.length > 0 && (
        <div className="mt-1.5 rounded-xl border border-cyan-500/40 bg-white shadow-lg overflow-hidden divide-y divide-gray-100 max-h-72 overflow-y-auto">
          {searchResults.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => addFromSearch(p.id)}
              className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-cyan-50 transition"
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium text-gray-900 truncate">{p.name}</span>
                <span className="block text-xs text-gray-500 truncate">{p.barcode ?? p.sku ?? `#${p.id}`}</span>
              </span>
              <span className="text-sm font-bold text-gray-900 shrink-0">{formatCurrency(p.price, baseCurrency)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );

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
  const subtotal = cart.reduce((s, c) => s + effectiveUnitPrice(c) * c.quantity, 0);
  const taxBase = cart.reduce((s, c) => (c.isTaxable ? s + effectiveUnitPrice(c) * c.quantity : s), 0);
  const tax =
    taxMode === "inclusive" ? (taxBase * taxRate) / (1 + taxRate) : taxBase * taxRate;
  const total = subtotal + (taxMode === "exclusive" ? tax : 0);
  const itemCount = cart.reduce((s, c) => s + c.quantity, 0);

  const cashTendered =
    paymentMethod === "cash" && cashTenderedInput && parseFloat(cashTenderedInput) > 0
      ? parseFloat(cashTenderedInput)
      : undefined;

  // A gift voucher is a TENDER: it pays down `voucherApplied` of the total and
  // the customer settles the remaining `amountDue` with a normal method. The
  // sale subtotal/tax/total are unchanged.
  const voucherApplied = appliedVoucher
    ? Math.round(Math.min(appliedVoucher.balance, total) * 100) / 100
    : 0;
  const amountDue = Math.max(0, Math.round((total - voucherApplied) * 100) / 100);
  const voucherCoversAll = appliedVoucher != null && amountDue <= 0;
  const changeDue = cashTendered != null ? Math.max(0, cashTendered - amountDue) : 0;

  /* ── Split payment ─────────────────────────────────────────────────────── */
  const splitCash = parseFloat(splitCashInput) || 0;
  const splitCard = parseFloat(splitCardInput) || 0;
  const splitSum = splitCash + splitCard;
  // The on-account leg is whatever remains after the card + cash portions.
  const splitCredit = Math.max(0, Math.round((amountDue - splitSum) * 100) / 100);
  const splitRemaining = amountDue - splitSum;
  const isSplitValid =
    paymentMethod === "split" &&
    splitCash >= 0 &&
    splitCard >= 0 &&
    splitCash + splitCard <= amountDue + 0.01 &&
    amountDue > 0 &&
    (splitCredit < 0.005 || !!selectedCustomerId) &&
    (splitCard < 0.005 || !!cardType);

  // Pick a payment method; the split popup collects card type + card + cash.
  const selectPayment = (m: "cash" | "card" | "split") => {
    setPaymentMethod(m);
    if (m === "card") { setCardType(null); setCardTypeDialogOpen(true); }
    else if (m === "split") {
      setCardType(null);
      setSplitCashInput("");
      setSplitCardInput("");
      setSplitDialogOpen(true);
    }
    else { setCardType(null); }
    focusScanInput();
  };

  const handleApplyVoucher = async () => {
    const code = voucherCodeInput.trim().toUpperCase();
    if (!code) return;
    if (!isOnline) {
      toast({ title: "Voucher needs a connection", description: "Gift vouchers can only be redeemed while online.", variant: "destructive" });
      return;
    }
    setVoucherLookupBusy(true);
    try {
      const v = await lookupGiftVoucher(code);
      if (v.status === "cancelled") {
        toast({ title: "Voucher cancelled", description: "This gift voucher has been cancelled.", variant: "destructive" });
        return;
      }
      if (v.expiryDate && new Date(v.expiryDate).getTime() < Date.now()) {
        toast({ title: "Voucher expired", description: "This gift voucher has expired.", variant: "destructive" });
        return;
      }
      if (v.status === "redeemed" || v.balance <= 0) {
        toast({ title: "No balance", description: "This gift voucher has no remaining balance.", variant: "destructive" });
        return;
      }
      setAppliedVoucher(v);
      toast({ title: "Voucher applied", description: `${v.code} · balance ${formatCurrency(v.balance, baseCurrency)}` });
    } catch (e) {
      const msg = e instanceof ApiError && e.status === 404
        ? `No voucher found for "${code}".`
        : "Could not look up that voucher. Please try again.";
      toast({ title: "Voucher not found", description: msg, variant: "destructive" });
    } finally {
      setVoucherLookupBusy(false);
    }
  };

  /* ── Checkout ──────────────────────────────────────────────────────────── */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [receiptOrder, setReceiptOrder] = useState<any>(null);
  const [receiptCustomerInfo, setReceiptCustomerInfo] = useState<CustomerReceiptInfo | null>(null);

  const handleCheckout = () => {
    if (cart.length === 0) {
      toast({ title: "Cart is empty", variant: "destructive" });
      return;
    }
    // Gift voucher redemption is server-authoritative (row-locked balance) and
    // cannot be safely queued offline, so block it when disconnected.
    if (appliedVoucher && !isOnline) {
      toast({ title: "Voucher needs a connection", description: "Gift vouchers can only be redeemed while online. Remove the voucher to continue.", variant: "destructive" });
      return;
    }
    // When a voucher fully covers the sale, the remainder method is irrelevant —
    // send the "gift_voucher" sentinel and skip remainder-method validation.
    const effectivePaymentMethod = voucherCoversAll ? "gift_voucher" : paymentMethod;
    if (!voucherCoversAll && paymentMethod === "split" && !isSplitValid) {
      setSplitDialogOpen(true);
      toast({
        title: "Finish the split",
        description: "Card + cash can't exceed the total, and any on-account leftover needs a customer.",
        variant: "destructive",
      });
      return;
    }
    // A card is involved (pure card, or the card portion of a split): require
    // the debit/credit choice so it prints on the receipt. For a split the card
    // type is only needed when there is actually a card portion.
    const cardTypeNeeded = !voucherCoversAll && (
      paymentMethod === "card" ||
      (paymentMethod === "split" && splitCard > 0.005)
    );
    if (cardTypeNeeded && !cardType) {
      if (paymentMethod === "split") setSplitDialogOpen(true);
      else setCardTypeDialogOpen(true);
      toast({ title: "Card type required", description: "Choose Debit or Credit to continue.", variant: "destructive" });
      return;
    }
    createOrder.mutate(
      {
        // `cashTendered` / split amounts are accepted by the API but missing from
        // the generated CreateOrderBody type, so the body is cast (same pattern as
        // the other layouts).
        data: {
          paymentMethod: effectivePaymentMethod,
          cardType: !voucherCoversAll && (paymentMethod === "card" || paymentMethod === "split") ? cardType ?? undefined : undefined,
          staffId: sessionStaff?.id ?? undefined,
          items: cart.map((c) => ({ productId: c.productId, quantity: c.quantity })),
          cashTendered: !voucherCoversAll && paymentMethod === "cash" ? cashTendered : undefined,
          splitCashAmount: !voucherCoversAll && paymentMethod === "split" ? splitCash : undefined,
          splitCardAmount: !voucherCoversAll && paymentMethod === "split" ? splitCard : undefined,
          splitCreditAmount: !voucherCoversAll && paymentMethod === "split" ? splitCredit : undefined,
          giftVoucherCode: appliedVoucher ? appliedVoucher.code : undefined,
          notes: undefined,
          customerId: selectedCustomerId ?? undefined,
          orderType: "counter",
          // Location drives per-location pricing + stock on the server.
          locationId: sessionLocationId ?? undefined,
          // Station number is set once at shift open and must stay constant for
          // every receipt in that cashier's shift (see standard POS layout).
          stationNumber: cashSession?.session?.stationNumber ?? undefined,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      },
      {
        onSuccess: (data) => {
          setReceiptOrder(data);
          if (settings?.auto_print_receipt === "true") {
            const ro = receiptOrderFrom(data, {
              name: selectedCustomer?.name ?? null,
              phone: selectedCustomer?.phone ?? null,
              email: selectedCustomer?.email ?? null,
              loyaltyPoints: selectedCustomer?.loyaltyPoints ?? null,
              outstandingBalance: null,
            });
            printOrderReceipt(buildReceiptHtml(ro, settings), ro, settings);
          }
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
          const name = payload?.productName;
          const avail = payload?.available;
          let title = "Payment failed";
          let description = "The payment couldn't be completed. Please check the cart and try again.";
          if (name !== undefined && avail !== undefined) {
            if (avail === 0) {
              title = "Out of stock";
              description = `"${name}" is out of stock and can't be sold.`;
            } else {
              title = "Not enough stock";
              description = `Only ${avail} of "${name}" left in stock. Reduce the quantity and try again.`;
            }
          }
          toast({ title, description, variant: "destructive" });
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
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-8 w-full max-w-xs">
          <div className="flex flex-col items-center gap-2 mb-2">
            {businessLogoUrl ? (
              <>
                <img src={businessLogoUrl} alt={businessDisplayName || "Business Logo"} className="max-h-24 max-w-48 object-contain" />
                {businessDisplayName && <p className="text-sm text-muted-foreground text-center">{businessDisplayName}</p>}
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
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground animate-pulse">Checking shift status…</p>
      </div>
    );
  }

  if (noOpenShift || !cashSession) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background gap-6 px-6 text-center">
        <div className="h-16 w-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
          <Store className="h-8 w-8 text-amber-500" />
        </div>
        <div className="max-w-sm">
          <h2 className="text-xl font-bold mb-1 text-foreground">No Open Shift</h2>
          <p className="text-sm text-muted-foreground">A cash drawer shift must be opened before you can process sales.</p>
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
    <div className="flex flex-col h-full min-h-0 bg-background text-foreground">
      {/* ── Top bar ──────────────────────────────────────────────────── */}
      <div className="shrink-0 px-4 py-3 border-b border-border bg-card flex items-center gap-3">
        <div className="flex items-center gap-3 shrink-0">
          <img src={nexxusLogoUrl} alt="NEXXUS POS" className="h-9 w-auto" />
          <div className="hidden md:flex items-center gap-1.5 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 px-3 py-1 shadow-sm">
            <Store className="h-3.5 w-3.5 text-white" />
            <span className="text-xs font-semibold text-white tracking-wide">Supermarket Mode</span>
          </div>
          {cashSession?.session?.stationNumber != null && (
            <div className="flex items-center gap-1.5 rounded-full bg-amber-500 px-3 py-1 shadow-sm">
              <span className="text-xs font-bold text-white tracking-wide">Station #{cashSession.session.stationNumber}</span>
            </div>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2 shrink-0">
          <ZoomControls
            buttonClassName="inline-flex items-center justify-center rounded-xl border border-border bg-card hover:bg-muted px-2.5 h-11 text-foreground shadow-sm transition"
            labelClassName="text-foreground"
          />
          <button
            onClick={toggleHeader}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card hover:bg-muted px-3 h-11 text-xs font-semibold text-foreground shadow-sm transition"
            title={headerHidden ? "Show menu" : "Hide menu"}
          >
            {headerHidden ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            <span className="hidden sm:inline">{headerHidden ? "Menu" : "Hide"}</span>
          </button>
          <button
            onClick={() => navigate("/dashboard")}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 px-3 h-11 text-xs font-semibold text-white shadow transition"
          >
            <ArrowLeftRight className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Dashboard</span>
          </button>
          <div className="flex items-center gap-2 rounded-xl bg-muted border border-border px-3 h-11">
            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-xs font-bold text-white">
              {sessionStaff?.name?.charAt(0).toUpperCase() ?? "U"}
            </div>
            <div className="hidden lg:flex flex-col leading-tight">
              <span className="text-xs font-semibold text-foreground">{sessionStaff?.name ?? "—"}</span>
              <span className="text-[10px] text-muted-foreground capitalize">{sessionStaff?.role ?? ""}</span>
            </div>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="h-11 w-11 inline-flex items-center justify-center rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white shadow transition"
            title="Reload screen"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            onClick={() => { setLocked(true); clearStaff(); }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-violet-500 hover:bg-violet-600 px-3 h-11 text-xs font-semibold text-white shadow transition"
            title="Switch user"
          >
            <UserRound className="h-4 w-4" />
            <span className="hidden sm:inline">Switch User</span>
          </button>
          <button
            onClick={() => { setLocked(true); clearStaff(); }}
            className="h-11 w-11 inline-flex items-center justify-center rounded-xl bg-amber-500 hover:bg-amber-600 text-white shadow transition"
            title="Lock"
          >
            <LockKeyhole className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── Body: big bill (left) + controls (right) ─────────────────── */}
      <div className="flex flex-1 min-h-0">
        {/* ── LEFT: bold bill preview ───────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-border">
          {retailLayout && (
            <div className="shrink-0 px-6 py-4 border-b border-border bg-muted/40 flex justify-center">
              {renderScanBox(true)}
            </div>
          )}
          <div className="shrink-0 px-6 py-4 border-b border-border flex items-center justify-between bg-muted/40">
            <h2 className="text-lg font-extrabold text-foreground tracking-wide flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-cyan-500" />
              CURRENT BILL
              <span className="text-sm font-semibold text-muted-foreground">
                ({itemCount} {itemCount === 1 ? "item" : "items"})
              </span>
            </h2>
            <div className="flex items-center gap-2">
              {cart.length > 0 && (
                <button
                  onClick={handleHoldBill}
                  disabled={createHeldOrder.isPending}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 h-9 text-sm font-semibold text-white bg-amber-500 hover:bg-amber-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Hold this bill and clear the lane"
                >
                  <PauseCircle className="h-4 w-4" />
                  Hold
                </button>
              )}
              {heldOrders && heldOrders.length > 0 && (
                <button
                  onClick={() => setHeldSheetOpen(true)}
                  className="relative inline-flex items-center gap-1.5 rounded-lg px-3 h-9 text-sm font-semibold text-white bg-teal-500 hover:bg-teal-600 transition"
                  title={`${heldOrders.length} held bill(s)`}
                >
                  <PlayCircle className="h-4 w-4" />
                  Recall
                  <span className="ml-0.5 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-white/25 text-white text-[11px] font-mono font-bold">
                    {heldOrders.length}
                  </span>
                </button>
              )}
              {cart.length > 0 && (
                <button
                  onClick={() => requestSupermarketAction({ type: "clear" }, true)}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 h-9 text-sm font-semibold text-white bg-rose-500 hover:bg-rose-600 transition"
                  title="Clear bill"
                >
                  <Trash2 className="h-4 w-4" />
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Column headers */}
          <div className="shrink-0 grid grid-cols-[1fr_120px_160px_44px] gap-4 px-6 py-2 text-xs font-bold tracking-widest text-muted-foreground uppercase border-b border-border bg-muted/40">
            <div>Item</div>
            <div className="text-center">Qty</div>
            <div className="text-right">Amount</div>
            <div></div>
          </div>

          {/* Lines */}
          <div className="flex-1 overflow-y-auto">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-8">
                <ScanBarcode className="h-14 w-14 text-muted-foreground/40" />
                <p className="text-lg font-semibold text-muted-foreground">Scan an item to begin</p>
                <p className="text-sm text-muted-foreground/70">Use the scanner or type a barcode and press Enter.</p>
              </div>
            ) : (
              cart.map((c) => {
                const selected = c.cartKey === selectedKey;
                return (
                  <div
                    key={c.cartKey}
                    onClick={() => setSelectedKey(selected ? null : c.cartKey)}
                    className={`grid grid-cols-[1fr_120px_160px_44px] gap-4 px-6 py-3.5 items-center border-b border-border cursor-pointer transition ${
                      selected ? "bg-cyan-500/10 dark:bg-cyan-500/15" : "hover:bg-accent"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-xl font-bold text-foreground truncate flex items-center gap-2">
                        <span className="truncate">{c.productName}</span>
                        {(() => {
                          const su = products?.find((p) => p.id === c.productId)?.sellingUnit;
                          return su ? (
                            <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground uppercase tracking-wide">
                              {su}
                            </span>
                          ) : null;
                        })()}
                        {(() => {
                          const sz = products?.find((p) => p.id === c.productId)?.size;
                          return sz ? (
                            <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground uppercase tracking-wide">
                              {sz}
                            </span>
                          ) : null;
                        })()}
                      </div>
                      <div className="text-sm font-mono text-cyan-600 dark:text-cyan-300/80 truncate">
                        {c.barcode ?? `#${c.productId}`} · @ {formatCurrency(effectiveUnitPrice(c), baseCurrency)}
                        {effectiveUnitPrice(c) < c.price && (
                          <span className="ml-1.5 text-emerald-500 font-semibold">
                            ↓ Vol. {formatCurrency(c.price, baseCurrency)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => requestSupermarketAction({ type: "decrease", cartKey: c.cartKey }, true)}
                        className="h-9 w-9 rounded-lg bg-rose-500 text-white hover:bg-rose-600 transition flex items-center justify-center shadow-sm"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="font-mono text-xl font-extrabold w-10 text-center text-foreground">{c.quantity}</span>
                      <button
                        onClick={() => incQty(c.cartKey)}
                        className="h-9 w-9 rounded-lg bg-cyan-500 text-white hover:bg-cyan-600 transition flex items-center justify-center shadow-sm"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="text-right font-mono text-2xl font-extrabold text-foreground">
                      {formatCurrency(effectiveUnitPrice(c) * c.quantity, baseCurrency)}
                    </div>
                    <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => requestSupermarketAction({ type: "remove", cartKey: c.cartKey }, true)}
                        className="h-9 w-9 rounded-lg text-muted-foreground hover:text-white hover:bg-rose-500 transition flex items-center justify-center"
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
          <div className="shrink-0 px-6 py-4 border-t border-border bg-muted/40 space-y-1.5">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Subtotal</span>
              <span className="font-mono">{formatCurrency(subtotal, baseCurrency)}</span>
            </div>
            {taxMode === "exclusive" && (
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Tax ({taxPct}%)</span>
                <span className="font-mono">{formatCurrency(tax, baseCurrency)}</span>
              </div>
            )}
            <div className="flex items-center justify-between pt-2 mt-1 border-t border-border">
              <span className="text-2xl font-extrabold text-foreground">TOTAL</span>
              <span className="text-5xl font-extrabold font-mono bg-gradient-to-r from-cyan-500 to-blue-600 bg-clip-text text-transparent">
                {formatCurrency(total, baseCurrency)}
              </span>
            </div>
            {cashTendered != null && (
              <div className="flex items-center justify-between pt-1 text-emerald-600 dark:text-emerald-300">
                <span className="text-sm font-semibold">Change Due</span>
                <span className="font-mono text-2xl font-bold">{formatCurrency(changeDue, baseCurrency)}</span>
              </div>
            )}
          </div>
        </div>

        {/* ── MIDDLE/RIGHT: scan + keypad + customer + payment ──────── */}
        <div className="w-[440px] shrink-0 flex flex-col bg-card border-l border-border min-h-0 overflow-y-auto">
          <div className="p-4 space-y-4">
            {/* Scan / search box — hidden in retail (moved to the left area) */}
            {!retailLayout && renderScanBox()}

            {/* Price Check — lookup only, no sale / no stock change */}
            <button
              onClick={openPriceCheck}
              className="w-full rounded-xl border border-amber-600 bg-amber-500 px-3 h-12 text-sm font-bold text-white hover:bg-amber-600 transition flex items-center justify-center gap-2"
            >
              <Tag className="h-4 w-4" />
              Price Check
            </button>

            {/* Quantity / cash keypad */}
            <div className="rounded-2xl bg-muted/50 border border-border p-3">
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="text-xs font-semibold text-muted-foreground">
                  {paymentMethod === "cash"
                    ? "Cash tendered"
                    : selectedKey ? "Set qty for selected" : "Qty for next scan"}
                </span>
                <span className="font-mono text-2xl font-extrabold text-cyan-600 dark:text-cyan-300">
                  {paymentMethod === "cash"
                    ? (cashTenderedInput || "0")
                    : `× ${qtyInput || "1"}`}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"].map((k) => {
                  const isClear = k === "clear";
                  const isBack = k === "back";
                  const tone = isClear
                    ? "bg-rose-500 hover:bg-rose-600 text-white"
                    : isBack
                      ? "bg-amber-500 hover:bg-amber-600 text-white"
                      : "bg-secondary hover:bg-secondary/70 text-foreground";
                  return (
                    <Button
                      key={k}
                      className={`h-12 text-lg font-bold border-0 shadow-sm ${tone}`}
                      onClick={() => keypadPress(k)}
                    >
                      {isBack ? <Delete className="h-5 w-5" /> : isClear ? "C" : k}
                    </Button>
                  );
                })}
              </div>
              {paymentMethod !== "cash" && selectedKey && (
                <Button
                  onClick={applyQtyToSelected}
                  disabled={qtyInput === ""}
                  className="mt-2 w-full h-11 bg-cyan-600 hover:bg-cyan-500 text-white font-bold disabled:opacity-40"
                >
                  Set Quantity
                </Button>
              )}
            </div>

            {/* Customer */}
            {selectedCustomer ? (
              <div className="rounded-xl bg-cyan-500/10 border border-cyan-500/30 px-3 py-2.5 flex items-center gap-2">
                <div className="h-7 w-7 rounded-full bg-cyan-500 text-white flex items-center justify-center text-xs font-bold">
                  {selectedCustomer.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-foreground truncate text-sm">{selectedCustomer.name}</div>
                  {selectedCustomer.phone && (
                    <div className="text-xs text-muted-foreground truncate">{selectedCustomer.phone}</div>
                  )}
                </div>
                <button onClick={() => setSelectedCustomerId(null)} className="text-muted-foreground hover:text-rose-500" title="Clear customer">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setCustomerOpen(true)}
                className="w-full rounded-xl bg-cyan-600 hover:bg-cyan-700 px-3 py-2.5 text-sm font-semibold text-white shadow-md transition flex items-center justify-center gap-2"
              >
                <UserPlus className="h-4 w-4" />
                Add Customer (optional)
              </button>
            )}

            {/* Gift voucher (a tender) */}
            <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-3 space-y-2">
              <p className="text-xs font-semibold text-violet-600 dark:text-violet-300">Gift Voucher</p>
              {appliedVoucher ? (
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-mono font-semibold truncate text-violet-700 dark:text-violet-200">{appliedVoucher.code}</p>
                    <p className="text-[11px] text-muted-foreground">
                      Bal {formatCurrency(appliedVoucher.balance, baseCurrency)} · Applied {formatCurrency(voucherApplied, baseCurrency)}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 shrink-0"
                    onClick={() => { setAppliedVoucher(null); setVoucherCodeInput(""); }}
                  >
                    Remove
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input
                    placeholder="Voucher code"
                    value={voucherCodeInput}
                    onChange={(e) => setVoucherCodeInput(e.target.value.toUpperCase())}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleApplyVoucher(); } }}
                    className="h-10 bg-background border-border text-foreground font-mono"
                  />
                  <Button
                    className="h-10 shrink-0 bg-violet-600 hover:bg-violet-500 text-white"
                    disabled={!voucherCodeInput.trim() || voucherLookupBusy || !isOnline}
                    onClick={handleApplyVoucher}
                  >
                    {voucherLookupBusy ? "…" : "Apply"}
                  </Button>
                </div>
              )}
              {!isOnline && !appliedVoucher && (
                <p className="text-[10px] text-muted-foreground">Vouchers require a connection.</p>
              )}
              {appliedVoucher && (
                <div className="flex items-center justify-between text-xs font-semibold pt-1 border-t border-violet-500/20">
                  <span className="text-muted-foreground">Amount due</span>
                  <span className="font-mono text-violet-700 dark:text-violet-200">{formatCurrency(amountDue, baseCurrency)}</span>
                </div>
              )}
            </div>

            {/* Payment method */}
            <div className={`grid grid-cols-3 gap-2 ${voucherCoversAll ? "opacity-40 pointer-events-none" : ""}`}>
              <button
                onClick={() => selectPayment("cash")}
                className={`h-14 rounded-xl text-sm font-bold transition flex flex-col items-center justify-center gap-1 ${
                  paymentMethod === "cash"
                    ? "bg-emerald-500 text-white shadow-md shadow-emerald-500/30"
                    : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                <Banknote className="h-5 w-5" />
                Cash
              </button>
              <button
                onClick={() => selectPayment("card")}
                className={`h-14 rounded-xl text-sm font-bold transition flex flex-col items-center justify-center gap-1 ${
                  paymentMethod === "card"
                    ? "bg-blue-500 text-white shadow-md shadow-blue-500/30"
                    : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                <CreditCard className="h-5 w-5" />
                Card
              </button>
              <button
                onClick={() => selectPayment("split")}
                className={`h-14 rounded-xl text-sm font-bold transition flex flex-col items-center justify-center gap-1 ${
                  paymentMethod === "split"
                    ? "bg-violet-500 text-white shadow-md shadow-violet-500/30"
                    : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                <SplitSquareHorizontal className="h-5 w-5" />
                Split
              </button>
            </div>

            {/* Cash: tendered + quick suggestions */}
            {paymentMethod === "cash" && (
              <div className="space-y-2">
                <Input
                  type="number"
                  inputMode="decimal"
                  placeholder="Cash tendered"
                  value={cashTenderedInput}
                  onChange={(e) => setCashTenderedInput(e.target.value)}
                  className="h-12 bg-background border-border text-foreground placeholder:text-muted-foreground text-base"
                />
                {amountDue > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {cashSuggestions(amountDue).map((amt, i) => (
                      <button
                        key={amt}
                        onClick={() => { setCashTenderedInput(String(amt)); focusScanInput(); }}
                        className="h-11 rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-bold text-sm hover:bg-emerald-500 hover:text-white transition"
                      >
                        {i === 0 && Math.abs(amt - amountDue) < 0.01 ? "Exact" : formatCurrency(amt, baseCurrency)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Split: card + cash + on-account summary (edit in popup) */}
            {paymentMethod === "split" && (
              <button
                type="button"
                onClick={() => setSplitDialogOpen(true)}
                className="w-full text-left rounded-xl bg-muted/50 border border-border p-3 space-y-1.5 hover:border-violet-400/60 transition"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-muted-foreground"><CreditCard className="h-3.5 w-3.5 text-blue-500" /> Card{cardType ? ` (${cardType})` : ""}</span>
                  <span className="font-mono">{formatCurrency(splitCard, baseCurrency)}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-muted-foreground"><Banknote className="h-3.5 w-3.5 text-emerald-500" /> Cash</span>
                  <span className="font-mono">{formatCurrency(splitCash, baseCurrency)}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-300"><BookOpen className="h-3.5 w-3.5" /> On account</span>
                  <span className="font-mono text-amber-600 dark:text-amber-300">{formatCurrency(splitCredit, baseCurrency)}</span>
                </div>
                <div className="text-[10px] text-violet-500 pt-0.5">Tap to edit split</div>
              </button>
            )}

            {/* Checkout */}
            <button
              onClick={handleCheckout}
              disabled={cart.length === 0 || createOrder.isPending || (!voucherCoversAll && paymentMethod === "split" && !isSplitValid)}
              className="w-full h-16 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-lg font-extrabold shadow-lg shadow-cyan-500/20 hover:brightness-110 active:scale-[0.99] transition disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
            >
              <ShoppingCart className="h-6 w-6" />
              {createOrder.isPending
                ? "PROCESSING…"
                : voucherCoversAll
                  ? `CHECKOUT · Voucher ${formatCurrency(total, baseCurrency)}`
                  : `CHECKOUT · ${formatCurrency(amountDue, baseCurrency)}`}
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

      {/* ── Held bills dialog ────────────────────────────────────────── */}
      <Dialog open={heldSheetOpen} onOpenChange={(o) => { setHeldSheetOpen(o); if (!o) focusScanInput(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PlayCircle className="h-5 w-5 text-teal-500" />
              Held Bills
            </DialogTitle>
            <DialogDescription>Tap a bill to load it back into the lane.</DialogDescription>
          </DialogHeader>
          <div className="mt-1 space-y-2 max-h-[60vh] overflow-y-auto">
            {(!heldOrders || heldOrders.length === 0) ? (
              <p className="text-sm text-muted-foreground px-1 py-4 text-center">
                No held bills. Use Hold to park the current bill.
              </p>
            ) : (
              heldOrders.map((h) => {
                const lineTotal = h.items.reduce((s, it) => s + it.price * it.quantity, 0);
                return (
                  <button
                    key={h.id}
                    onClick={() => handleRecallBill(h.id)}
                    className="w-full text-left rounded-xl border border-border hover:border-teal-400/60 hover:bg-teal-500/5 transition px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-foreground">{h.label ?? `Bill #${h.id}`}</span>
                      <span className="font-mono font-bold text-teal-600 dark:text-teal-300">
                        {formatCurrency(lineTotal, baseCurrency)}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {h.items.length} {h.items.length === 1 ? "item" : "items"}
                    </div>
                  </button>
                );
              })
            )}
          </div>
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

      {/* Debit / Credit card-type prompt (card payments + split card portion) */}
      <CardTypeDialog
        open={cardTypeDialogOpen}
        onSelect={(t) => { setCardType(t); setCardTypeDialogOpen(false); }}
        onCancel={() => { setCardTypeDialogOpen(false); focusScanInput(); }}
      />

      {/* Single split-payment popup: card type + card + cash; leftover → on account */}
      <SplitPaymentDialog
        open={splitDialogOpen}
        amountDue={amountDue}
        baseCurrency={baseCurrency}
        hasCustomer={!!selectedCustomerId}
        initialCardType={cardType}
        initialCardAmount={splitCard}
        initialCashAmount={splitCash}
        formatCurrency={formatCurrency}
        onConfirm={(r) => {
          setSplitCardInput(r.cardAmount > 0 ? String(r.cardAmount) : "");
          setSplitCashInput(r.cashAmount > 0 ? String(r.cashAmount) : "");
          setCardType(r.cardType);
          setSplitDialogOpen(false);
          focusScanInput();
        }}
        onCancel={() => {
          setSplitDialogOpen(false);
          if (!isSplitValid) setPaymentMethod("cash");
          focusScanInput();
        }}
      />

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
              {receiptOrder.paymentMethod === "cash" && (() => {
                // Always show Tendered / Change on cash sales. When no amount was
                // entered at checkout, assume exact payment (tendered = total,
                // change = 0).
                const tendered = receiptOrder.cashTendered != null && receiptOrder.cashTendered > 0
                  ? receiptOrder.cashTendered
                  : receiptOrder.total;
                return (
                  <>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Cash Tendered</span>
                      <span className="font-mono">{fmtNum(tendered)}</span>
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Total</span>
                      <span className="font-mono">-{fmtNum(receiptOrder.total)}</span>
                    </div>
                    <div className="flex justify-between text-xs font-semibold text-emerald-500">
                      <span>Change Due</span>
                      <span className="font-mono">{fmtNum(Math.max(0, tendered - receiptOrder.total))}</span>
                    </div>
                  </>
                );
              })()}
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => { setReceiptOrder(null); focusScanInput(); }}>Done</Button>
            <Button onClick={printReceipt} className="bg-gradient-to-r from-cyan-500 to-blue-500">
              <Printer className="h-4 w-4 mr-1.5" />
              Print Receipt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Price Check dialog (lookup only — no sale, no stock change, no PIN) ── */}
      <Dialog open={priceCheckOpen} onOpenChange={(o) => { if (!o) closePriceCheck(); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-500">
              <Tag className="h-5 w-5" />
              Price Check
            </DialogTitle>
            <DialogDescription>
              Scan or type a barcode / SKU to see its price. This does not affect the current bill or stock.
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            <ScanBarcode className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-amber-500 pointer-events-none" />
            <Input
              ref={priceCheckInputRef}
              autoFocus
              value={priceCheckSearch}
              onChange={(e) => setPriceCheckSearch(e.target.value)}
              onKeyDown={handlePriceCheckKey}
              placeholder="Scan a barcode…"
              className="pl-11 h-14 text-lg bg-background border-amber-500/40 focus-visible:border-amber-500 focus-visible:ring-amber-500/20 rounded-xl"
              autoComplete="off"
            />
          </div>

          {priceCheckResult ? (
            <div className="rounded-xl border border-border bg-muted/40 p-4 text-center space-y-1">
              <div className="text-lg font-bold text-foreground">{priceCheckResult.name}</div>
              <div className="text-xs font-mono text-muted-foreground">
                {priceCheckResult.barcode ?? priceCheckResult.sku ?? "—"}
                {priceCheckResult.sellingUnit ? ` · ${priceCheckResult.sellingUnit}` : ""}
                {priceCheckResult.size ? ` · ${priceCheckResult.size}` : ""}
              </div>
              <div className="text-4xl font-extrabold font-mono bg-gradient-to-r from-cyan-500 to-blue-600 bg-clip-text text-transparent pt-1">
                {formatCurrency(priceCheckResult.price, baseCurrency)}
              </div>
              {priceCheckResult.isTaxable && taxMode === "exclusive" && (
                <div className="text-xs text-muted-foreground">
                  {formatCurrency(priceCheckResult.price * (1 + taxRate), baseCurrency)} incl. {taxPct}% tax
                </div>
              )}
              {priceCheckResult.isTaxable && taxMode === "inclusive" && (
                <div className="text-xs text-muted-foreground">includes {taxPct}% tax</div>
              )}
              {!priceCheckResult.isTaxable && (
                <div className="text-xs text-muted-foreground">tax-exempt</div>
              )}
            </div>
          ) : priceCheckNotFound ? (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-center text-sm text-rose-600 dark:text-rose-300">
              Nothing matches “{priceCheckNotFound}”.
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Waiting for a scan…
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closePriceCheck}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
