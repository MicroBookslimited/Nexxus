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
  useListHeldOrders,
  useCreateHeldOrder,
  useDeleteHeldOrder,
  useCreateQuotation,
  useUpdateQuotation,
  getListCustomersQueryKey,
  getListHeldOrdersQueryKey,
  getListQuotationsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useStaff } from "@/contexts/StaffContext";
import { usePosChrome } from "@/contexts/PosChromeContext";
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
  Search,
  ScanBarcode,
  Plus,
  Minus,
  ShoppingCart,
  UserPlus,
  X,
  Trash2,
  Printer,
  CheckCircle2,
  Tag,
  ClipboardList,
  PenLine,
  Calculator,
  Delete,
  LockKeyhole,
  ArrowLeftRight,
  StickyNote,
  ChevronRight,
  Wrench,
  Hammer,
  Lightbulb,
  Droplets,
  Trees,
  Boxes,
  PaintBucket,
  Bolt,
  Package,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Banknote,
  CreditCard,
  SplitSquareHorizontal,
  FileText,
  BookOpen,
} from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { buildReceiptHtml, openReceiptWindow, receiptOrderFrom } from "@/lib/receipt";
import { printQuotation } from "@/lib/quotation-doc";
import { printOrderReceipt } from "@/lib/print-receipt";
import { fetchCustomerReceiptInfo, type CustomerReceiptInfo, getPurchaseUnits, type PurchaseUnit } from "@/lib/saas-api";

/* ────────────────────────────────────────────────────────────────────────── */
/* Helpers                                                                    */
/* ────────────────────────────────────────────────────────────────────────── */

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
  /** Price per BASE unit. Line total is always `price * quantity`. */
  price: number;
  /** Quantity in BASE units (e.g. 1 Dozen of 12 is stored as quantity 12). */
  quantity: number;
  isTaxable: boolean;
  imageUrl: string | null;
  /** Cashier-selected sale unit (Dozen, Case, etc.). When set, the row shows a
   * badge, displays the count in whole units (`quantity / unitFactor`), and the
   * +/- buttons step by `unitFactor`. Absent = sold as single base units. */
  unitLabel?: string;
  unitFactor?: number;
  unitId?: number;
  /** A custom / miscellaneous item entered via the calculator (not in the catalog).
   * Sent to the server with no productId; productId is the sentinel 0 locally. */
  isCustom?: boolean;
};

/* Category → icon map (hardware-store flavoured). Falls back to a box icon. */
const CATEGORY_ICONS: Record<string, { Icon: React.ComponentType<{ className?: string }>; tint: string }> = {
  tools:         { Icon: Wrench,     tint: "from-amber-500   to-amber-700" },
  hardware:      { Icon: Bolt,       tint: "from-zinc-500    to-zinc-700"  },
  electrical:    { Icon: Lightbulb,  tint: "from-yellow-500  to-yellow-700" },
  plumbing:      { Icon: Droplets,   tint: "from-sky-500     to-sky-700"   },
  lumber:        { Icon: Hammer,     tint: "from-orange-500  to-orange-700" },
  paint:         { Icon: PaintBucket,tint: "from-rose-500    to-rose-700"   },
  garden:        { Icon: Trees,      tint: "from-emerald-500 to-emerald-700" },
  "garden & outdoor": { Icon: Trees, tint: "from-emerald-500 to-emerald-700" },
  "building materials":{ Icon: Boxes,tint: "from-slate-500   to-slate-700" },
  outdoor:       { Icon: Trees,      tint: "from-emerald-500 to-emerald-700" },
};

/* Vivid fallback palette so categories not in the map above still each get a
   distinct, colourful card (picked deterministically from the category name). */
const FALLBACK_TINTS = [
  "from-rose-500    to-rose-700",
  "from-orange-500  to-orange-700",
  "from-amber-500   to-amber-700",
  "from-lime-500    to-lime-700",
  "from-emerald-500 to-emerald-700",
  "from-teal-500    to-teal-700",
  "from-cyan-500    to-cyan-700",
  "from-sky-500     to-sky-700",
  "from-blue-500    to-blue-700",
  "from-indigo-500  to-indigo-700",
  "from-violet-500  to-violet-700",
  "from-fuchsia-500 to-fuchsia-700",
  "from-pink-500    to-pink-700",
];

function hashString(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function getCategoryIcon(name: string) {
  const known = CATEGORY_ICONS[name.toLowerCase()];
  if (known) return known;
  return {
    Icon: Package,
    tint: FALLBACK_TINTS[hashString(name) % FALLBACK_TINTS.length],
  };
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Main component                                                             */
/* ────────────────────────────────────────────────────────────────────────── */

export function PosHardware() {
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

  const { data: products } = useListProducts();
  const { data: customers } = useListCustomers();
  const { data: heldOrders } = useListHeldOrders();
  const createOrder = useCreateOrder();
  const createCustomer = useCreateCustomer();
  const createHeldOrder = useCreateHeldOrder();
  const deleteHeldOrder = useDeleteHeldOrder();
  const createQuotation = useCreateQuotation();
  const updateQuotation = useUpdateQuotation();
  const [heldSheetOpen, setHeldSheetOpen] = useState(false);
  // When a quote was loaded into the cart (from the Quotations page), its id is
  // held here so a successful checkout marks the quote "converted".
  const [loadedQuoteId, setLoadedQuoteId] = useState<number | null>(null);
  const [saveQuoteOpen, setSaveQuoteOpen] = useState(false);
  const [quoteExpiry, setQuoteExpiry] = useState("");
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

  const handlePinSuccess = (staff: { id: number; name: string; role: string; permissions?: string[] }) => {
    setStaff({ id: staff.id, name: staff.name, role: staff.role, permissions: staff.permissions ?? [] });
    setLocked(false);
  };

  /* ── Search / categories ─────────────────────────────────────────────── */
  const [searchTerm, setSearchTerm] = useState("");
  const { headerHidden, toggleHeader } = usePosChrome();
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Always re-focus the search bar so scanners keep working.
  useEffect(() => {
    const t = setTimeout(() => searchInputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, []);

  /* ── Cart ──────────────────────────────────────────────────────────────── */
  const [cart, setCart] = useState<CartLine[]>([]);
  /** Raw string value while a qty input is being edited (keyed by cartKey). */
  const [qtyEdit, setQtyEdit] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "split" | "credit">("cash");
  const [splitCashInput, setSplitCashInput] = useState("");
  const [splitCardInput, setSplitCardInput] = useState("");
  const [cashTenderedInput, setCashTenderedInput] = useState("");
  const [cashDialogOpen, setCashDialogOpen] = useState(false);
  // Misc/custom-item calculator: sell something not in the catalog.
  const [miscOpen, setMiscOpen] = useState(false);
  const [miscPrice, setMiscPrice] = useState("");
  const [miscName, setMiscName] = useState("");
  const [miscQty, setMiscQty] = useState(1);

  const miscKeyPress = (k: string) => {
    setMiscPrice((prev) => {
      if (k === "back") return prev.slice(0, -1);
      if (k === "clear") return "";
      if (k === ".") {
        if (prev.includes(".")) return prev;
        return prev === "" ? "0." : prev + ".";
      }
      if (prev.includes(".")) {
        const dec = prev.split(".")[1] ?? "";
        if (dec.length >= 2) return prev;
      }
      if (prev === "0") return k;
      return prev + k;
    });
  };

  const confirmMiscItem = () => {
    const price = parseFloat(miscPrice);
    if (!Number.isFinite(price) || price < 0) return;
    if (!(miscQty > 0)) return;
    const name = miscName.trim() || "Custom Item";
    setCart((prev) => [
      ...prev,
      {
        cartKey: `custom:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`,
        productId: 0,
        productName: name,
        barcode: null,
        price,
        quantity: miscQty,
        isTaxable: true,
        imageUrl: null,
        isCustom: true,
      },
    ]);
    toast({ title: "Added custom item", description: `${name} — ${formatCurrency(price * miscQty, baseCurrency)}` });
    setMiscOpen(false);
    setMiscPrice("");
    setMiscName("");
    setMiscQty(1);
  };
  const cartBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (cart.length > 0) cartBottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [cart.length]);

  /** Minimal product shape carried into the unit picker. */
  type PickerProduct = {
    id: number;
    name: string;
    price: number;
    barcode: string | null;
    isTaxable: boolean;
    imageUrl: string | null;
  };
  const [unitPickerState, setUnitPickerState] = useState<{
    product: PickerProduct;
    units: PurchaseUnit[];
  } | null>(null);

  /**
   * Insert (or stack onto) a cart line for a product, optionally as a chosen
   * sale unit. Quantity is stored in BASE units; a unit line stacks only with
   * another line of the SAME product AND unit. Stepping adds one whole unit.
   */
  const addLineWithUnit = (
    p: PickerProduct,
    unit: { unitId?: number; unitLabel: string; unitFactor: number } | null,
  ) => {
    const unitFactor = unit && unit.unitFactor !== 1 ? unit.unitFactor : undefined;
    const unitLabel = unitFactor ? unit!.unitLabel : undefined;
    const unitId = unitFactor ? unit!.unitId : undefined;
    const stepQty = unitFactor ?? 1;
    const unitSuffix = unitFactor ? `:u${unitId ?? `f${unitFactor}`}` : "";
    setCart((prev) => {
      const idx = prev.findIndex(
        (c) =>
          c.productId === p.id &&
          (c.unitFactor ?? 0) === (unitFactor ?? 0) &&
          (c.unitId ?? 0) === (unitId ?? 0),
      );
      if (idx >= 0) {
        return prev.map((c, i) => (i === idx ? { ...c, quantity: c.quantity + stepQty } : c));
      }
      return [
        ...prev,
        {
          cartKey: `${p.id}${unitSuffix}:${Date.now()}`,
          productId: p.id,
          productName: p.name,
          barcode: p.barcode,
          price: p.price,
          quantity: stepQty,
          isTaxable: p.isTaxable,
          imageUrl: p.imageUrl,
          unitLabel,
          unitFactor,
          unitId,
        },
      ];
    });
  };

  const toPicker = (productId: number): PickerProduct | null => {
    const p = products?.find((x) => x.id === productId);
    if (!p) return null;
    return {
      id: p.id,
      name: p.name,
      price: p.price,
      barcode: p.barcode ?? null,
      isTaxable: p.isTaxable,
      imageUrl: p.imageUrl ?? null,
    };
  };

  /**
   * Click path: if the product has sale-eligible units (Dozen, Case, …) open a
   * picker so the cashier chooses the unit; otherwise add a single base unit.
   * A failed unit lookup falls back to a single-unit add so a flaky network
   * can't block checkout.
   */
  const addToCart = async (productId: number) => {
    const p = products?.find((x) => x.id === productId);
    if (!p) return;
    if (p.hasVariants || p.hasModifiers) {
      toast({
        title: "Item has options",
        description: "Variant/modifier items use the standard POS — open it from Settings → POS Interface.",
        variant: "destructive",
      });
      return;
    }
    const picker = toPicker(productId);
    if (!picker) return;
    try {
      const allUnits = await getPurchaseUnits(p.id);
      const saleUnits = allUnits.filter((u) => u.isSale && u.conversionFactor && u.conversionFactor !== 1);
      if (saleUnits.length > 0) {
        setUnitPickerState({ product: picker, units: saleUnits });
        return;
      }
    } catch {
      toast({
        title: "Unit options unavailable",
        description: `Adding ${p.name} as a single unit. Check connection if it has Dozen/Case pricing.`,
      });
    }
    addLineWithUnit(picker, null);
  };

  /** Confirm the picker selection (a sale unit, or "each" for the base unit). */
  const continueAddWithUnit = (
    unit: { unitId?: number; unitName: string; conversionFactor: number } | null,
  ) => {
    if (!unitPickerState) return;
    const prod = unitPickerState.product;
    setUnitPickerState(null);
    addLineWithUnit(
      prod,
      unit && unit.conversionFactor !== 1
        ? { unitId: unit.unitId, unitLabel: unit.unitName, unitFactor: unit.conversionFactor }
        : null,
    );
    requestAnimationFrame(() => searchInputRef.current?.focus());
  };

  /** +/- steps by one whole sale unit (or one base unit when no unit is set). */
  const changeQty = (cartKey: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((c) =>
          c.cartKey === cartKey
            ? { ...c, quantity: Math.max(0, c.quantity + delta * (c.unitFactor ?? 1)) }
            : c,
        )
        .filter((c) => c.quantity > 0),
    );
  };

  const removeLine = (cartKey: string) => setCart((prev) => prev.filter((c) => c.cartKey !== cartKey));

  /** Set an absolute display-unit quantity on a cart line, converting back to
   *  base units and snapping to whole multiples (multi-unit gotcha). */
  const setAbsoluteQty = (cartKey: string, displayQty: number) => {
    const factor = cart.find((c) => c.cartKey === cartKey)?.unitFactor ?? 1;
    const baseQty = Math.max(0, Math.round(displayQty)) * factor;
    if (baseQty <= 0) {
      removeLine(cartKey);
    } else {
      setCart((prev) => prev.map((c) => (c.cartKey === cartKey ? { ...c, quantity: baseQty } : c)));
    }
    setQtyEdit((prev) => { const next = { ...prev }; delete next[cartKey]; return next; });
  };

  const resetCart = () => {
    setCart([]);
    setNotes("");
    setCashTenderedInput("");
    setSplitCashInput("");
    setSplitCardInput("");
    setPaymentMethod("cash");
    setDiscountAmount(0);
    setSelectedCustomerId(null);
    setLoadedQuoteId(null);
  };

  /* ── Load a pending quote (handed over from the Quotations page) ───────── */
  const quoteLoadedRef = useRef(false);
  useEffect(() => {
    if (quoteLoadedRef.current) return;
    const raw = sessionStorage.getItem("nexxus_pending_quote");
    if (!raw) return;
    quoteLoadedRef.current = true;
    sessionStorage.removeItem("nexxus_pending_quote");
    try {
      const pending = JSON.parse(raw) as {
        id: number;
        quoteNumber?: string;
        items: Array<{
          productId: number;
          productName: string;
          price: number;
          quantity: number;
          isTaxable?: boolean;
          isCustom?: boolean;
          unitLabel?: string;
          unitFactor?: number;
          unitId?: number;
        }>;
        discountAmount?: number;
        notes?: string;
        customerId?: number | null;
      };
      const productMap = new Map((products ?? []).map((p) => [p.id, p]));
      setCart(
        pending.items.map((item, idx) => {
          const p = productMap.get(item.productId);
          const isCustom = item.isCustom ?? item.productId === 0;
          return {
            cartKey: `${item.productId}:quote:${Date.now()}:${idx}`,
            productId: item.productId,
            productName: item.productName,
            barcode: p?.barcode ?? null,
            imageUrl: p?.imageUrl ?? null,
            price: item.price,
            quantity: item.quantity,
            isTaxable: isCustom ? true : (item.isTaxable ?? p?.isTaxable ?? true),
            ...(isCustom ? { isCustom: true } : {}),
            ...(item.unitLabel ? { unitLabel: item.unitLabel } : {}),
            ...(item.unitFactor ? { unitFactor: item.unitFactor } : {}),
            ...(item.unitId ? { unitId: item.unitId } : {}),
          };
        }),
      );
      if (pending.discountAmount && pending.discountAmount > 0) setDiscountAmount(pending.discountAmount);
      if (pending.notes) setNotes(pending.notes);
      if (pending.customerId) setSelectedCustomerId(pending.customerId);
      setLoadedQuoteId(pending.id);
      toast({
        title: "Quote loaded",
        description: `${pending.quoteNumber ?? "Quotation"} loaded into cart — complete checkout to convert it to a sale.`,
      });
    } catch {
      toast({ title: "Could not load quote", variant: "destructive" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products]);

  const handleHoldBill = () => {
    if (cart.length === 0) {
      toast({ title: "Cart is empty", description: "Add items before holding a bill.", variant: "destructive" });
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
          notes: notes || undefined,
          discountType: discountAmount > 0 ? "fixed" : undefined,
          discountAmount: discountAmount > 0 ? discountAmount : undefined,
        },
      },
      {
        onSuccess: () => {
          resetCart();
          toast({ title: "Bill held", description: "Cart cleared. Recall it any time with Unhold Bill." });
          queryClient.invalidateQueries({ queryKey: getListHeldOrdersQueryKey() });
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
      const ok = window.confirm("This will replace the current cart. Continue?");
      if (!ok) return;
    }
    const productMap = new Map((products ?? []).map((p) => [p.id, p]));
    setCart(
      held.items.map((item, idx) => {
        const p = productMap.get(item.productId);
        // Custom/misc lines were held with the sentinel productId 0; restore the
        // isCustom flag so checkout sends customName/customPrice (not productId 0).
        const isCustom = item.productId === 0;
        return {
          cartKey: `${item.productId}:recall:${Date.now()}:${idx}`,
          productId: item.productId,
          productName: item.productName,
          barcode: p?.barcode ?? null,
          imageUrl: p?.imageUrl ?? null,
          price: item.price,
          quantity: item.quantity,
          isTaxable: isCustom ? true : (p?.isTaxable ?? true),
          ...(isCustom ? { isCustom: true } : {}),
        };
      }),
    );
    if (held.discountAmount && held.discountAmount > 0) setDiscountAmount(held.discountAmount);
    if (held.notes) setNotes(held.notes);
    // Recalling a held bill replaces the cart, so any previously loaded quote no
    // longer applies — clear it so checkout can't convert the wrong quotation.
    setLoadedQuoteId(null);
    deleteHeldOrder.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Bill recalled" });
          queryClient.invalidateQueries({ queryKey: getListHeldOrdersQueryKey() });
          setHeldSheetOpen(false);
        },
      },
    );
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

  /* ── Discount (manager would normally PIN-gate; for hardware UI keep simple) ── */
  const [discountAmount, setDiscountAmount] = useState(0);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [discountInput, setDiscountInput] = useState("");

  /* ── Filtered product list ─────────────────────────────────────────────── */
  const productList = products ?? [];

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of productList) {
      if (p.category) set.add(p.category);
    }
    return Array.from(set).sort();
  }, [productList]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of productList) {
      if (!p.category) continue;
      counts[p.category] = (counts[p.category] ?? 0) + 1;
    }
    return counts;
  }, [productList]);

  const filteredProducts = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return productList.filter((p) => {
      if (categoryFilter && p.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.barcode ?? "").toLowerCase().includes(q) ||
        (p.sku ?? "").toLowerCase().includes(q) ||
        (p.category ?? "").toLowerCase().includes(q)
      );
    });
  }, [productList, searchTerm, categoryFilter]);

  /* ── Scanner: enter on a unique barcode adds to cart ──────────────────── */
  const handleSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    const code = searchTerm.trim();
    if (!code) return;
    const lc = code.toLowerCase();
    const match = productList.find(
      (p) => (p.barcode ?? "").toLowerCase() === lc || (p.sku ?? "").toLowerCase() === lc,
    );
    if (match) {
      // Scans are fast-path: add a single base unit. Multi-unit selling is via
      // tapping the product (which opens the unit picker).
      const picker = toPicker(match.id);
      if (picker && !match.hasVariants && !match.hasModifiers) {
        addLineWithUnit(picker, null);
      } else {
        addToCart(match.id);
      }
      setSearchTerm("");
    }
  };

  /* ── Totals ────────────────────────────────────────────────────────────── */
  const subtotal = cart.reduce((s, c) => s + c.price * c.quantity, 0);
  const discount = Math.min(discountAmount, subtotal);
  const taxBase = cart.reduce((s, c) => (c.isTaxable ? s + c.price * c.quantity : s), 0);
  // Proportionally apply the discount to the taxable portion only.
  // Default to 1 (whole cart is taxable) for an empty cart, matching pos.tsx.
  const taxableShare = subtotal > 0 ? taxBase / subtotal : 1;
  const taxableAfterDiscount = Math.max(0, taxBase - discount * taxableShare);
  // Inclusive mode: tax is the portion already baked into the price.
  // Exclusive mode: tax is added on top.
  const tax =
    taxMode === "inclusive"
      ? (taxableAfterDiscount * taxRate) / (1 + taxRate)
      : taxableAfterDiscount * taxRate;
  const total = subtotal - discount + (taxMode === "exclusive" ? tax : 0);

  /* ── Checkout ──────────────────────────────────────────────────────────── */
  // Receipt state uses the mutation response shape; widened to `any` to avoid
  // a cross-package type-export quirk seen in this monorepo (same workaround
  // used elsewhere in this app).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [receiptOrder, setReceiptOrder] = useState<any>(null);
  const [receiptCustomerInfo, setReceiptCustomerInfo] = useState<CustomerReceiptInfo | null>(null);

  /* ── Split payment ─────────────────────────────────────────────────────── */
  const splitCash = parseFloat(splitCashInput) || 0;
  const splitCard = parseFloat(splitCardInput) || 0;
  const splitRemaining = total - (splitCash + splitCard);
  const isSplitValid =
    paymentMethod === "split" &&
    splitCash >= 0 &&
    splitCard >= 0 &&
    Math.abs(splitRemaining) < 0.01 &&
    total > 0;

  // Pick a payment method; pre-fill a balanced 50/50 split for convenience.
  const selectPayment = (m: "cash" | "card" | "split" | "credit") => {
    setPaymentMethod(m);
    if (m === "split") {
      const half = Number((total / 2).toFixed(2));
      setSplitCashInput(half > 0 ? String(half) : "");
      setSplitCardInput(total - half > 0 ? String(Number((total - half).toFixed(2))) : "");
    }
    if (m === "cash") {
      setCashDialogOpen(true);
    }
  };

  // Cash-tendered popup keypad.
  const cashKeyPress = (k: string) => {
    setCashTenderedInput((prev) => {
      if (k === "back") return prev.slice(0, -1);
      if (k === "clear") return "";
      if (k === ".") return prev.includes(".") ? prev : prev === "" ? "0." : prev + ".";
      return prev + k;
    });
  };
  const cashTenderedValue = parseFloat(cashTenderedInput) || 0;
  const cashChangeDue = Math.max(0, cashTenderedValue - total);

  const handleCheckout = () => {
    if (cart.length === 0) {
      toast({ title: "Cart is empty", variant: "destructive" });
      return;
    }
    if (paymentMethod === "split" && !isSplitValid) {
      toast({
        title: "Invalid split",
        description: "Cash + card portions must add up to the total.",
        variant: "destructive",
      });
      return;
    }
    if (paymentMethod === "credit" && !selectedCustomerId) {
      toast({
        title: "Customer required",
        description: "Select a customer to process a credit sale.",
        variant: "destructive",
      });
      return;
    }
    const cashTendered =
      paymentMethod === "cash" && cashTenderedInput && parseFloat(cashTenderedInput) > 0
        ? parseFloat(cashTenderedInput)
        : undefined;

    createOrder.mutate(
      {
        // `cashTendered` / split amounts are accepted by the API but missing
        // from the generated CreateOrderBody type, so the body is cast to
        // bypass that staleness (same pattern as the standard POS).
        data: {
          paymentMethod,
          staffId: sessionStaff?.id ?? undefined,
          items: cart.map((c) =>
            c.isCustom
              ? { customName: c.productName, customPrice: c.price, quantity: c.quantity }
              : { productId: c.productId, quantity: c.quantity },
          ),
          cashTendered: paymentMethod === "split" ? undefined : cashTendered,
          splitCashAmount: paymentMethod === "split" ? splitCash : undefined,
          splitCardAmount: paymentMethod === "split" ? splitCard : undefined,
          discountType: discount > 0 ? "fixed" : undefined,
          discountAmount: discount > 0 ? discount : undefined,
          notes: notes.trim() || undefined,
          customerId: selectedCustomerId ?? undefined,
          orderType: "counter",
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
          // If this sale was started by loading a quote, mark that quote
          // converted and link it to the new order.
          if (loadedQuoteId) {
            updateQuotation.mutate(
              { id: loadedQuoteId, data: { status: "converted", convertedOrderId: data.id } },
              {
                onSuccess: () =>
                  queryClient.invalidateQueries({ queryKey: getListQuotationsQueryKey() }),
              },
            );
          }
          resetCart();
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

  /* ── Save the current cart as a quotation ──────────────────────────────── */
  const handleSaveAsQuote = () => {
    if (cart.length === 0) {
      toast({ title: "Cart is empty", description: "Add items before saving a quote.", variant: "destructive" });
      return;
    }
    const expiryIso = quoteExpiry ? new Date(`${quoteExpiry}T23:59:59`).toISOString() : null;
    createQuotation.mutate(
      {
        data: {
          customerId: selectedCustomerId ?? undefined,
          items: cart.map((c) => ({
            productId: c.productId,
            productName: c.productName,
            price: c.price,
            quantity: c.quantity,
            isTaxable: c.isTaxable,
            ...(c.isCustom ? { isCustom: true } : {}),
            ...(c.unitLabel ? { unitLabel: c.unitLabel } : {}),
            ...(c.unitFactor ? { unitFactor: c.unitFactor } : {}),
            ...(c.unitId ? { unitId: c.unitId } : {}),
          })),
          discountType: discount > 0 ? "fixed" : undefined,
          discountAmount: discount > 0 ? discount : undefined,
          notes: notes.trim() || undefined,
          expiryDate: expiryIso,
        },
      },
      {
        onSuccess: (data) => {
          toast({ title: "Quote saved", description: `${data.quoteNumber} created.` });
          const cust = selectedCustomer;
          printQuotation(
            data,
            settings ?? {},
            cust
              ? { name: cust.name, phone: cust.phone, email: cust.email, address: cust.address }
              : null,
          );
          queryClient.invalidateQueries({ queryKey: getListQuotationsQueryKey() });
          setSaveQuoteOpen(false);
          setQuoteExpiry("");
          resetCart();
        },
        onError: () => toast({ title: "Could not save quote", variant: "destructive" }),
      },
    );
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
                <img
                  src={businessLogoUrl}
                  alt={businessDisplayName || "Business Logo"}
                  className="max-h-24 max-w-48 object-contain"
                />
                {businessDisplayName && (
                  <p className="text-sm text-slate-300 text-center">{businessDisplayName}</p>
                )}
              </>
            ) : (
              <>
                <img src={nexxusLogoUrl} alt="NEXXUS POS" className="h-16 w-auto" />
                <p className="text-sm text-teal-300">Hardware Store Mode</p>
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
          <Boxes className="h-8 w-8 text-amber-400" />
        </div>
        <div className="max-w-sm">
          <h2 className="text-xl font-bold mb-1 text-white">No Open Shift</h2>
          <p className="text-sm text-slate-400">
            A cash drawer shift must be opened before you can process sales.
          </p>
        </div>
        <button
          onClick={() => navigate("/cash")}
          className="rounded-md bg-gradient-to-r from-teal-500 to-cyan-500 px-5 py-2.5 text-sm font-semibold text-white shadow hover:brightness-110 transition"
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
      <div className="shrink-0 px-4 py-3 border-b border-white/5 bg-gradient-to-r from-[#0B1E2D] via-[#0d2238] to-[#0B1E2D]">
        <div className="flex items-center gap-3">
          {/* Logo + mode pill */}
          <div className="flex items-center gap-3 shrink-0">
            <img src={nexxusLogoUrl} alt="NEXXUS POS" className="h-9 w-auto" />
            <div className="hidden md:flex items-center gap-1.5 rounded-full bg-gradient-to-r from-teal-500/20 to-cyan-500/20 border border-teal-400/30 px-3 py-1">
              <Wrench className="h-3.5 w-3.5 text-teal-300" />
              <span className="text-xs font-semibold text-teal-200 tracking-wide">Hardware Store Mode</span>
            </div>
          </div>

          {/* Search bar */}
          <div className="relative flex-1 max-w-3xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-teal-400 pointer-events-none" />
            <Input
              ref={searchInputRef}
              autoFocus
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={handleSearchKey}
              placeholder="Search SKU / Barcode / Product Name…"
              className="pl-10 pr-10 h-11 text-sm bg-white border-teal-400/30 focus-visible:border-teal-400 focus-visible:ring-teal-400/20 text-slate-900 placeholder:text-slate-400 rounded-xl"
              autoComplete="off"
            />
            {searchTerm ? (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            ) : (
              <ScanBarcode className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
            )}
          </div>

          {/* Misc / custom item */}
          <button
            onClick={() => setMiscOpen(true)}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 px-3 h-11 text-sm font-bold text-white shadow-md hover:brightness-110 active:scale-[0.98] transition"
            title="Sell a miscellaneous item not in the system"
          >
            <Calculator className="h-4 w-4" />
            <span className="hidden sm:inline">Misc</span>
          </button>

          {/* Add customer */}
          <button
            onClick={() => setCustomerOpen(true)}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 px-3 h-11 text-sm font-bold text-white shadow-md hover:brightness-110 active:scale-[0.98] transition"
          >
            <UserPlus className="h-4 w-4" />
            <span className="hidden sm:inline">{selectedCustomer ? selectedCustomer.name : "Add Customer"}</span>
          </button>

          {/* User badge */}
          <div className="shrink-0 flex items-center gap-2">
            <button
              onClick={toggleHeader}
              className="h-11 inline-flex items-center gap-1.5 rounded-xl bg-[#0a1a2a] border border-white/10 px-3 text-sm font-medium text-slate-300 hover:bg-white/5 transition"
              title={headerHidden ? "Show menu" : "Hide menu"}
            >
              {headerHidden ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
              <span className="hidden sm:inline">{headerHidden ? "Menu" : "Hide"}</span>
            </button>
            <div className="flex items-center gap-2 rounded-xl bg-[#0a1a2a] border border-white/10 px-3 h-11">
              <div className="h-7 w-7 rounded-full bg-gradient-to-br from-teal-400 to-cyan-500 flex items-center justify-center text-xs font-bold text-[#0B1E2D]">
                {sessionStaff?.name?.charAt(0).toUpperCase() ?? "U"}
              </div>
              <div className="hidden lg:flex flex-col leading-tight">
                <span className="text-xs font-semibold text-slate-100">{sessionStaff?.name ?? "—"}</span>
                <span className="text-[10px] text-slate-400 capitalize">{sessionStaff?.role ?? ""}</span>
              </div>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="h-11 w-11 inline-flex items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-sky-600 text-white shadow-md hover:brightness-110 active:scale-[0.98] transition"
              title="Reload screen"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              onClick={() => { setLocked(true); clearStaff(); }}
              className="h-11 w-11 inline-flex items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-md hover:brightness-110 active:scale-[0.98] transition"
              title="Lock"
            >
              <LockKeyhole className="h-4 w-4" />
            </button>
            <button
              onClick={() => navigate("/cash?close=1")}
              className="h-11 w-11 inline-flex items-center justify-center rounded-xl bg-gradient-to-br from-red-500 to-rose-600 text-white shadow-md hover:brightness-110 active:scale-[0.98] transition"
              title="Close shift"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Category cards row ───────────────────────────────────────── */}
      <div className="shrink-0 border-b border-white/5 bg-[#0d2238]/40">
        <div className="flex gap-3 overflow-x-auto px-4 py-3 scrollbar-hide">
          <CategoryCard
            label="All"
            sublabel={`${productList.length}`}
            Icon={Boxes}
            active={categoryFilter === null}
            tint="from-teal-500 to-cyan-600"
            onClick={() => setCategoryFilter(null)}
          />
          {categories.map((cat) => {
            const meta = getCategoryIcon(cat);
            return (
              <CategoryCard
                key={cat}
                label={cat.toUpperCase()}
                sublabel={`${categoryCounts[cat] ?? 0}`}
                Icon={meta.Icon}
                active={categoryFilter === cat}
                tint={meta.tint}
                onClick={() => setCategoryFilter(categoryFilter === cat ? null : cat)}
              />
            );
          })}
        </div>
      </div>

      {/* ── Main body ─────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">
        {/* Products list */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-white/5">
          <div className="shrink-0 px-4 py-2.5 border-b border-white/5 flex items-center justify-between bg-[#0d2238]/40">
            <h2 className="text-sm font-bold text-slate-200 tracking-wide flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-teal-300" />
              PRODUCTS
              <span className="text-xs font-normal text-slate-400">({filteredProducts.length})</span>
            </h2>
          </div>

          {/* Column headers */}
          <div className="shrink-0 grid grid-cols-[60px_120px_1fr_140px_110px_100px_56px] gap-3 px-4 py-2 text-[10px] font-bold tracking-widest text-slate-400 uppercase border-b border-white/5 bg-[#0a1a2a]/60">
            <div></div>
            <div>SKU</div>
            <div>Product Name</div>
            <div>Category</div>
            <div className="text-right">Price</div>
            <div className="text-center">Stock</div>
            <div></div>
          </div>

          {/* Product rows */}
          <div className="flex-1 overflow-y-auto">
            {filteredProducts.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500">
                {searchTerm || categoryFilter ? "No products match the current filter." : "No products yet."}
              </div>
            ) : (
              filteredProducts.map((p) => {
                const stockTone =
                  p.stockCount <= 0
                    ? "text-rose-400"
                    : p.stockCount <= 10
                    ? "text-amber-400"
                    : "text-emerald-400";
                const stockLabel = p.stockCount <= 0 ? "Out of Stock" : p.stockCount <= 10 ? "Low Stock" : "In Stock";
                return (
                  <div
                    key={p.id}
                    onClick={() => addToCart(p.id)}
                    className="grid grid-cols-[60px_120px_1fr_140px_110px_100px_56px] gap-3 px-4 py-2.5 items-center text-sm border-b border-white/5 hover:bg-teal-500/5 cursor-pointer transition"
                  >
                    <div className="h-11 w-11 rounded-lg bg-[#0a1a2a] border border-white/10 overflow-hidden flex items-center justify-center">
                      {p.imageUrl ? (
                        <img src={p.imageUrl} alt={p.name} className="h-full w-full object-cover" />
                      ) : (
                        <Package className="h-5 w-5 text-slate-600" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="font-mono text-xs text-teal-300 truncate">
                        {p.sku ?? p.barcode ?? `#${p.id}`}
                      </div>
                      {p.sku && p.barcode && (
                        <div className="font-mono text-[10px] text-slate-500 truncate">{p.barcode}</div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-100 truncate">{p.name}</div>
                      {p.description && (
                        <div className="text-xs text-slate-500 truncate">{p.description}</div>
                      )}
                    </div>
                    <div className="text-xs text-slate-300 truncate">{p.category}</div>
                    <div className="text-right font-mono font-semibold text-slate-100">
                      {formatCurrency(p.price, baseCurrency)}
                    </div>
                    <div className="text-center">
                      <div className={`font-mono font-semibold ${stockTone}`}>{p.stockCount}</div>
                      <div className={`text-[10px] ${stockTone}`}>{stockLabel}</div>
                    </div>
                    <div className="flex justify-end">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          addToCart(p.id);
                        }}
                        className="h-9 w-9 inline-flex items-center justify-center rounded-lg bg-gradient-to-br from-teal-500 to-cyan-600 text-white shadow hover:brightness-110 active:scale-95 transition"
                        title="Add to cart"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Cart panel */}
        <div className="w-1/3 shrink-0 flex flex-col bg-[#0a1a2a]/60 min-h-0">
          <div className="shrink-0 px-4 py-2.5 border-b border-white/5 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-200 tracking-wide flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-teal-300" />
              CART ({cart.length} {cart.length === 1 ? "ITEM" : "ITEMS"})
            </h2>
            {cart.length > 0 && (
              <button
                onClick={resetCart}
                className="h-7 w-7 inline-flex items-center justify-center rounded-md text-slate-400 hover:bg-rose-500/10 hover:text-rose-300 transition"
                title="Clear cart"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
            {cart.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                Cart is empty. Click a product or scan a barcode to add items.
              </div>
            ) : (
              cart.map((c) => (
                <div
                  key={c.cartKey}
                  className="rounded-xl bg-[#0d2238] border border-white/5 p-2.5 flex items-center gap-2.5"
                >
                  <div className="h-11 w-11 rounded-lg bg-[#0a1a2a] border border-white/10 overflow-hidden shrink-0 flex items-center justify-center">
                    {c.imageUrl ? (
                      <img src={c.imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <Package className="h-5 w-5 text-slate-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-xs font-semibold text-slate-100 truncate">{c.productName}</span>
                      {c.unitLabel && c.unitFactor && (
                        <span className="shrink-0 rounded-md bg-amber-500/20 border border-amber-400/40 px-1.5 py-0.5 text-[9px] font-bold text-amber-200 uppercase tracking-wide">
                          {c.unitLabel}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] font-mono text-teal-300 truncate">
                      {c.unitLabel && c.unitFactor
                        ? `1 ${c.unitLabel} = ${c.unitFactor} × ${c.barcode ?? `#${c.productId}`}`
                        : c.barcode ?? `#${c.productId}`}
                    </div>
                    <div className="mt-1 flex items-center gap-1">
                      <button
                        onClick={() => changeQty(c.cartKey, -1)}
                        className="h-6 w-6 rounded-md bg-[#0a1a2a] border border-white/10 text-slate-300 hover:bg-rose-500/10 hover:text-rose-300 transition flex items-center justify-center"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        className="font-mono text-xs font-semibold w-14 text-center text-slate-100 bg-[#0a1a2a] border border-white/10 rounded-md h-6 px-1 focus:outline-none focus:ring-1 focus:ring-teal-500/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        value={
                          qtyEdit[c.cartKey] ??
                          String(c.unitFactor ? c.quantity / c.unitFactor : c.quantity)
                        }
                        onChange={(e) =>
                          setQtyEdit((prev) => ({ ...prev, [c.cartKey]: e.target.value }))
                        }
                        onFocus={(e) => {
                          e.target.select();
                          setQtyEdit((prev) => ({
                            ...prev,
                            [c.cartKey]: String(
                              c.unitFactor ? c.quantity / c.unitFactor : c.quantity,
                            ),
                          }));
                        }}
                        onBlur={(e) => {
                          const n = parseFloat(e.target.value);
                          if (!isNaN(n) && n >= 0) setAbsoluteQty(c.cartKey, n);
                          else
                            setQtyEdit((prev) => {
                              const next = { ...prev };
                              delete next[c.cartKey];
                              return next;
                            });
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                          e.stopPropagation();
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <button
                        onClick={() => changeQty(c.cartKey, +1)}
                        className="h-6 w-6 rounded-md bg-[#0a1a2a] border border-white/10 text-slate-300 hover:bg-teal-500/10 hover:text-teal-300 transition flex items-center justify-center"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => removeLine(c.cartKey)}
                        className="ml-auto h-6 w-6 rounded-md text-slate-500 hover:text-rose-300 hover:bg-rose-500/10 transition flex items-center justify-center"
                        title="Remove"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-sm font-bold text-slate-100">
                      {formatCurrency(c.price * c.quantity, baseCurrency)}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      @ {formatCurrency(c.unitFactor ? c.price * c.unitFactor : c.price, baseCurrency)}
                      {c.unitLabel ? ` / ${c.unitLabel}` : ""}
                    </div>
                  </div>
                </div>
              ))
            )}
            <div ref={cartBottomRef} />
          </div>

          {/* Customer (when none selected) */}
          {!selectedCustomer && (
            <button
              onClick={() => setCustomerOpen(true)}
              className="mx-3 mb-2 rounded-xl border border-dashed border-teal-400/30 px-3 py-2.5 text-xs text-slate-400 hover:bg-teal-500/5 hover:text-teal-200 transition flex items-center justify-center gap-2"
            >
              <UserPlus className="h-3.5 w-3.5" />
              No Customer Selected — Click to add
            </button>
          )}
          {selectedCustomer && (
            <div className="mx-3 mb-2 rounded-xl bg-teal-500/10 border border-teal-400/20 px-3 py-2 text-xs flex items-center gap-2">
              <div className="h-6 w-6 rounded-full bg-teal-400 text-[#0B1E2D] flex items-center justify-center text-[10px] font-bold">
                {selectedCustomer.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-teal-100 truncate">{selectedCustomer.name}</div>
                {selectedCustomer.phone && (
                  <div className="text-[10px] text-teal-300/70 truncate">{selectedCustomer.phone}</div>
                )}
              </div>
              <button
                onClick={() => setSelectedCustomerId(null)}
                className="text-slate-400 hover:text-rose-300"
                title="Clear customer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Totals + checkout */}
          <div className="shrink-0 px-4 py-3 border-t border-white/5 space-y-1.5">
            <div className="flex justify-between text-xs text-slate-400">
              <span>Subtotal</span>
              <span className="font-mono">{formatCurrency(subtotal, baseCurrency)}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-xs text-rose-300">
                <span>Discount</span>
                <span className="font-mono">-{fmtNum(discount)}</span>
              </div>
            )}
            {taxMode === "exclusive" && (
              <div className="flex justify-between text-xs text-slate-400">
                <span>Tax ({taxPct}%)</span>
                <span className="font-mono">{formatCurrency(tax, baseCurrency)}</span>
              </div>
            )}

            <div className="flex items-center justify-between pt-1.5 mt-1.5 border-t border-white/10">
              <span className="text-sm font-bold text-slate-200">TOTAL</span>
              <span className="text-2xl font-bold font-mono bg-gradient-to-r from-teal-300 to-cyan-300 bg-clip-text text-transparent">
                {formatCurrency(total, baseCurrency)}
              </span>
            </div>

            {/* Payment method */}
            <div className="grid grid-cols-2 gap-1.5 pt-1.5">
              <button
                onClick={() => selectPayment("cash")}
                className={`h-11 rounded-lg text-xs font-bold transition flex flex-col items-center justify-center gap-0.5 ${
                  paymentMethod === "cash"
                    ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/30"
                    : "bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/30"
                }`}
              >
                <Banknote className="h-4 w-4" />
                Cash
              </button>
              <button
                onClick={() => selectPayment("card")}
                className={`h-11 rounded-lg text-xs font-bold transition flex flex-col items-center justify-center gap-0.5 ${
                  paymentMethod === "card"
                    ? "bg-blue-500 text-white shadow-lg shadow-blue-500/30"
                    : "bg-blue-500/15 text-blue-200 hover:bg-blue-500/30"
                }`}
              >
                <CreditCard className="h-4 w-4" />
                Card
              </button>
              <button
                onClick={() => selectPayment("split")}
                className={`h-11 rounded-lg text-xs font-bold transition flex flex-col items-center justify-center gap-0.5 ${
                  paymentMethod === "split"
                    ? "bg-violet-500 text-white shadow-lg shadow-violet-500/30"
                    : "bg-violet-500/15 text-violet-200 hover:bg-violet-500/30"
                }`}
              >
                <SplitSquareHorizontal className="h-4 w-4" />
                Split
              </button>
              <button
                onClick={() => selectPayment("credit")}
                className={`h-11 rounded-lg text-xs font-bold transition flex flex-col items-center justify-center gap-0.5 ${
                  paymentMethod === "credit"
                    ? "bg-amber-500 text-white shadow-lg shadow-amber-500/30"
                    : "bg-amber-500/15 text-amber-200 hover:bg-amber-500/30"
                }`}
              >
                <BookOpen className="h-4 w-4" />
                Credit
              </button>
            </div>
            {paymentMethod === "credit" && (
              <div
                className={`mt-1 rounded-lg border px-3 py-2 text-[11px] font-semibold ${
                  selectedCustomerId
                    ? "border-amber-400/40 bg-amber-500/10 text-amber-200"
                    : "border-amber-500/50 bg-amber-500/15 text-amber-300"
                }`}
              >
                {selectedCustomerId ? (
                  <span>On account — full balance added to {selectedCustomer?.name ?? "customer"}'s account.</span>
                ) : (
                  <span>⚠ Select a customer above to enable this credit sale.</span>
                )}
              </div>
            )}
            {paymentMethod === "cash" && (
              <button
                onClick={() => setCashDialogOpen(true)}
                className="mt-1 w-full rounded-lg bg-[#0d2238] border border-white/10 px-3 py-2 text-left hover:border-emerald-400/50 transition"
              >
                {cashTenderedValue > 0 ? (
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-col leading-tight">
                      <span className="text-[10px] text-slate-400">Cash tendered</span>
                      <span className="text-sm font-mono font-bold text-slate-100">
                        {formatCurrency(cashTenderedValue, baseCurrency)}
                      </span>
                    </div>
                    <div className="flex flex-col leading-tight text-right">
                      <span className={`text-[10px] ${cashTenderedValue >= total ? "text-emerald-400" : "text-amber-400"}`}>
                        {cashTenderedValue >= total ? "Change due" : "Still owed"}
                      </span>
                      <span className={`text-sm font-mono font-bold ${cashTenderedValue >= total ? "text-emerald-300" : "text-amber-300"}`}>
                        {formatCurrency(
                          cashTenderedValue >= total ? cashChangeDue : total - cashTenderedValue,
                          baseCurrency,
                        )}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-emerald-300">
                    <Banknote className="h-4 w-4" />
                    Enter cash tendered
                  </div>
                )}
              </button>
            )}
            {paymentMethod === "split" && (
              <div className="mt-1 rounded-lg bg-[#0d2238] border border-white/10 p-2.5 space-y-2">
                <div>
                  <Label className="text-[10px] text-slate-400 mb-1 flex items-center gap-1.5">
                    <Banknote className="h-3 w-3 text-emerald-400" /> Cash portion
                  </Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={splitCashInput}
                    onChange={(e) => {
                      const v = e.target.value;
                      setSplitCashInput(v);
                      const cash = parseFloat(v) || 0;
                      setSplitCardInput(total - cash > 0 ? String(Number((total - cash).toFixed(2))) : "0");
                    }}
                    className="h-9 bg-[#0a1a2a] border-white/10 text-slate-100 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-slate-400 mb-1 flex items-center gap-1.5">
                    <CreditCard className="h-3 w-3 text-blue-400" /> Card portion
                  </Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={splitCardInput}
                    onChange={(e) => {
                      const v = e.target.value;
                      setSplitCardInput(v);
                      const card = parseFloat(v) || 0;
                      setSplitCashInput(total - card > 0 ? String(Number((total - card).toFixed(2))) : "0");
                    }}
                    className="h-9 bg-[#0a1a2a] border-white/10 text-slate-100 text-xs"
                  />
                </div>
                <div
                  className={`flex items-center justify-between text-[11px] font-semibold rounded-md px-2 py-1.5 ${
                    isSplitValid
                      ? "bg-emerald-500/15 text-emerald-300"
                      : "bg-amber-500/15 text-amber-300"
                  }`}
                >
                  <span>{isSplitValid ? "Balanced" : "Remaining"}</span>
                  <span className="font-mono">
                    {isSplitValid
                      ? formatCurrency(splitCash + splitCard, baseCurrency)
                      : formatCurrency(splitRemaining, baseCurrency)}
                  </span>
                </div>
              </div>
            )}

            <button
              onClick={handleCheckout}
              disabled={
                cart.length === 0 ||
                createOrder.isPending ||
                (paymentMethod === "split" && !isSplitValid) ||
                (paymentMethod === "credit" && !selectedCustomerId)
              }
              className="mt-2 w-full h-12 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 text-white font-bold shadow-lg shadow-teal-500/20 hover:brightness-110 active:scale-[0.99] transition disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
            >
              <ShoppingCart className="h-5 w-5" />
              {createOrder.isPending ? "PROCESSING…" : "CHECKOUT"}
            </button>
          </div>
        </div>
      </div>

      {/* ── Quick action bar (bottom) ────────────────────────────────── */}
      <div className="shrink-0 border-t border-white/5 bg-[#0d2238]/60 px-3 py-2 flex items-center gap-2 overflow-x-auto">
        <QuickAction
          Icon={ScanBarcode}
          label="Quick Add"
          sub="SKU / Barcode"
          color="from-cyan-500 to-cyan-700"
          onClick={() => searchInputRef.current?.focus()}
        />
        <QuickAction
          Icon={ClipboardList}
          label="Recent Items"
          sub={`${cart.length} in cart`}
          color="from-indigo-500 to-indigo-700"
          onClick={() => cartBottomRef.current?.scrollIntoView({ behavior: "smooth" })}
        />
        <QuickAction
          Icon={Tag}
          label="Discount"
          sub={discount > 0 ? `-${fmtNum(discount)}` : "Apply"}
          color="from-rose-500 to-rose-700"
          onClick={() => {
            setDiscountInput(discount > 0 ? String(discount) : "");
            setDiscountOpen(true);
          }}
        />
        <QuickAction
          Icon={Calculator}
          label="Price Check"
          sub="Scan to view"
          color="from-emerald-500 to-emerald-700"
          onClick={() => searchInputRef.current?.focus()}
        />
        <QuickAction
          Icon={PenLine}
          label="Notes"
          sub={notes ? "Has note" : "Add note"}
          color="from-amber-500 to-amber-600"
          onClick={() => {
            const n = prompt("Order note:", notes);
            if (n !== null) setNotes(n);
          }}
        />
        <div className="ml-auto flex items-center gap-2 shrink-0">
          {/* Hold Bill — solid pill */}
          <button
            onClick={handleHoldBill}
            disabled={cart.length === 0 || createHeldOrder.isPending}
            className="inline-flex items-center gap-1.5 rounded-full bg-amber-500 hover:bg-amber-400 active:scale-[0.98] text-[#0B1E2D] font-bold px-4 h-10 text-xs shadow-lg shadow-amber-500/20 transition disabled:opacity-40 disabled:cursor-not-allowed"
            title="Save current cart as a held bill"
          >
            <PauseCircle className="h-4 w-4" />
            Hold Bill
          </button>

          {/* Save as Quote — solid pill */}
          <button
            onClick={() => setSaveQuoteOpen(true)}
            disabled={cart.length === 0 || createQuotation.isPending}
            className="inline-flex items-center gap-1.5 rounded-full bg-sky-500 hover:bg-sky-400 active:scale-[0.98] text-[#0B1E2D] font-bold px-4 h-10 text-xs shadow-lg shadow-sky-500/20 transition disabled:opacity-40 disabled:cursor-not-allowed"
            title="Save current cart as a quotation"
          >
            <FileText className="h-4 w-4" />
            Save as Quote
          </button>

          {/* Unhold Bill — solid pill with Sheet trigger */}
          <Sheet open={heldSheetOpen} onOpenChange={setHeldSheetOpen}>
            <SheetTrigger asChild>
              <button
                disabled={!heldOrders || heldOrders.length === 0}
                className="inline-flex items-center gap-1.5 rounded-full bg-teal-500 hover:bg-teal-400 active:scale-[0.98] text-[#0B1E2D] font-bold px-4 h-10 text-xs shadow-lg shadow-teal-500/20 transition disabled:opacity-40 disabled:cursor-not-allowed relative"
                title={
                  heldOrders && heldOrders.length > 0
                    ? `${heldOrders.length} held bill(s)`
                    : "No held bills"
                }
              >
                <PlayCircle className="h-4 w-4" />
                Unhold Bill
                {heldOrders && heldOrders.length > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-[#0B1E2D] text-teal-300 text-[10px] font-mono font-bold">
                    {heldOrders.length}
                  </span>
                )}
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="w-96 bg-[#0a1a2a] border-l border-white/10 text-slate-100">
              <SheetHeader>
                <SheetTitle className="text-slate-100 flex items-center gap-2">
                  <PlayCircle className="h-5 w-5 text-teal-300" />
                  Held Bills
                </SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-2 overflow-y-auto max-h-[calc(100vh-100px)]">
                {(!heldOrders || heldOrders.length === 0) ? (
                  <p className="text-xs text-slate-500 px-2">No held bills yet. Use Hold Bill to save the current cart.</p>
                ) : (
                  heldOrders.map((h) => {
                    const lineTotal = h.items.reduce((s, it) => s + it.price * it.quantity, 0);
                    return (
                      <button
                        key={h.id}
                        onClick={() => handleRecallBill(h.id)}
                        className="w-full text-left rounded-xl bg-[#0d2238] border border-white/10 hover:border-teal-400/40 hover:bg-teal-500/5 transition px-3 py-2.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-sm text-slate-100">
                            {h.label ?? `Bill #${h.id}`}
                          </span>
                          <span className="font-mono text-sm font-bold text-teal-300">
                            {formatCurrency(lineTotal, baseCurrency)}
                          </span>
                        </div>
                        <div className="mt-0.5 text-[11px] text-slate-400">
                          {h.items.length} {h.items.length === 1 ? "item" : "items"}
                          {h.notes ? ` · ${h.notes}` : ""}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </SheetContent>
          </Sheet>

          <button
            onClick={() => navigate("/dashboard")}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#0a1a2a] border border-white/10 px-3 h-10 text-xs text-slate-300 hover:bg-white/5 transition"
          >
            <ArrowLeftRight className="h-3.5 w-3.5" />
            Dashboard
          </button>
        </div>
      </div>

      {/* ── Misc / custom item calculator ───────────────────────────── */}
      <Dialog
        open={miscOpen}
        onOpenChange={(o) => { if (!o) { setMiscOpen(false); setMiscPrice(""); setMiscName(""); setMiscQty(1); } }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5 text-indigo-500" />
              Custom Item
            </DialogTitle>
            <DialogDescription>Sell something that isn't in your catalogue. Enter a price and an optional name.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Item name (optional)</Label>
              <Input
                value={miscName}
                onChange={(e) => setMiscName(e.target.value)}
                placeholder="Custom Item"
                className="mt-1"
              />
            </div>
            <div className="rounded-lg border-2 border-indigo-500/40 bg-muted/40 px-4 py-3 text-right">
              <div className="text-xs text-muted-foreground">Unit price</div>
              <div className="text-3xl font-mono font-bold tabular-nums">
                {formatCurrency(parseFloat(miscPrice) || 0, baseCurrency)}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "back"].map((k) => (
                <Button
                  key={k}
                  variant="outline"
                  className="h-14 text-xl font-semibold"
                  onClick={() => miscKeyPress(k)}
                >
                  {k === "back" ? <Delete className="h-5 w-5" /> : k}
                </Button>
              ))}
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Quantity</Label>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setMiscQty((q) => Math.max(1, q - 1))}>
                  <Minus className="h-4 w-4" />
                </Button>
                <span className="w-10 text-center text-lg font-bold tabular-nums">{miscQty}</span>
                <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setMiscQty((q) => q + 1)}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
            {parseFloat(miscPrice) > 0 && (
              <div className="text-right text-sm text-muted-foreground">
                Line total:{" "}
                <span className="text-foreground font-bold">
                  {formatCurrency((parseFloat(miscPrice) || 0) * miscQty, baseCurrency)}
                </span>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setMiscOpen(false); setMiscPrice(""); setMiscName(""); setMiscQty(1); }}>Cancel</Button>
            <Button onClick={confirmMiscItem} disabled={!(parseFloat(miscPrice) > 0)} className="bg-indigo-600 hover:bg-indigo-700">Add to Cart</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Cash tendered popup ─────────────────────────────────────── */}
      <Dialog open={cashDialogOpen} onOpenChange={setCashDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Banknote className="h-5 w-5 text-emerald-500" />
              Cash Payment
            </DialogTitle>
            <DialogDescription>Enter the cash received from the customer.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg bg-muted/40 px-4 py-2.5">
              <span className="text-sm text-muted-foreground">Total due</span>
              <span className="text-xl font-mono font-bold tabular-nums">
                {formatCurrency(total, baseCurrency)}
              </span>
            </div>
            <div className="rounded-lg border-2 border-emerald-500/40 bg-muted/40 px-4 py-3 text-right">
              <div className="text-xs text-muted-foreground">Cash tendered</div>
              <div className="text-3xl font-mono font-bold tabular-nums">
                {formatCurrency(cashTenderedValue, baseCurrency)}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "back"].map((k) => (
                <Button
                  key={k}
                  variant="outline"
                  className="h-14 text-xl font-semibold"
                  onClick={() => cashKeyPress(k)}
                >
                  {k === "back" ? <Delete className="h-5 w-5" /> : k}
                </Button>
              ))}
            </div>
            <div
              className={`flex items-center justify-between rounded-lg px-4 py-2.5 ${
                cashTenderedValue >= total && total > 0
                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300"
                  : "bg-amber-500/15 text-amber-600 dark:text-amber-300"
              }`}
            >
              <span className="text-sm font-semibold">
                {cashTenderedValue >= total ? "Change due" : "Still owed"}
              </span>
              <span className="text-lg font-mono font-bold tabular-nums">
                {formatCurrency(
                  cashTenderedValue >= total ? cashChangeDue : total - cashTenderedValue,
                  baseCurrency,
                )}
              </span>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setCashTenderedInput(""); setCashDialogOpen(false); }}>Clear</Button>
            <Button onClick={() => setCashDialogOpen(false)} className="bg-emerald-600 hover:bg-emerald-700">Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Unit-of-measure picker — multi-unit sales (Each / Dozen / Case …) ── */}
      <Dialog
        open={unitPickerState !== null}
        onOpenChange={(o) => { if (!o) { setUnitPickerState(null); requestAnimationFrame(() => searchInputRef.current?.focus()); } }}
      >
        <DialogContent className="sm:max-w-sm bg-[#0d2238] border-white/10 text-slate-100">
          <DialogHeader>
            <DialogTitle className="text-slate-100">Choose unit — {unitPickerState?.product.name}</DialogTitle>
            <DialogDescription className="text-slate-400">
              How is this being sold for this sale?
            </DialogDescription>
          </DialogHeader>
          {unitPickerState && (() => {
            const UNIT_COLORS = [
              "bg-blue-600 hover:bg-blue-700",
              "bg-emerald-600 hover:bg-emerald-700",
              "bg-amber-500 hover:bg-amber-600",
              "bg-rose-600 hover:bg-rose-700",
              "bg-violet-600 hover:bg-violet-700",
              "bg-cyan-600 hover:bg-cyan-700",
              "bg-orange-600 hover:bg-orange-700",
              "bg-pink-600 hover:bg-pink-700",
              "bg-teal-600 hover:bg-teal-700",
              "bg-indigo-600 hover:bg-indigo-700",
              "bg-lime-600 hover:bg-lime-700",
              "bg-fuchsia-600 hover:bg-fuchsia-700",
            ];
            const baseColor = UNIT_COLORS[0]!;
            return (
              <div className="space-y-2">
                <button
                  onClick={() => continueAddWithUnit(null)}
                  className={`w-full rounded-lg ${baseColor} text-white transition-colors p-3 text-left flex items-center justify-between gap-3 shadow-sm`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">Each (single unit)</p>
                    <p className="text-[11px] text-white/80">Base price per item</p>
                  </div>
                  <span className="font-mono text-sm text-white shrink-0">
                    {formatCurrency(unitPickerState.product.price, baseCurrency)}
                  </span>
                </button>
                {unitPickerState.units.map((u, idx) => {
                  const factor = u.conversionFactor || 1;
                  const unitPrice = unitPickerState.product.price * factor;
                  const color = UNIT_COLORS[(idx + 1) % UNIT_COLORS.length]!;
                  return (
                    <button
                      key={u.id ?? idx}
                      onClick={() => continueAddWithUnit({ unitId: u.id, unitName: u.unitName, conversionFactor: factor })}
                      className={`w-full rounded-lg ${color} text-white transition-colors p-3 text-left flex items-center justify-between gap-3 shadow-sm`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{u.unitName}</p>
                        <p className="text-[11px] text-white/80">
                          1 {u.unitName} = {factor} {factor === 1 ? "unit" : "units"}
                        </p>
                      </div>
                      <span className="font-mono text-sm text-white shrink-0">
                        {formatCurrency(unitPrice, baseCurrency)}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      <Dialog open={customerOpen} onOpenChange={setCustomerOpen}>
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
            <Button variant="outline" onClick={() => setCustomerOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateCustomer} disabled={createCustomer.isPending}>
              {createCustomer.isPending ? "Saving…" : "Add Customer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Discount dialog ──────────────────────────────────────────── */}
      <Dialog open={discountOpen} onOpenChange={setDiscountOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Apply Discount</DialogTitle>
            <DialogDescription>Fixed amount in {baseCurrency}.</DialogDescription>
          </DialogHeader>
          <Input
            type="number"
            inputMode="decimal"
            value={discountInput}
            onChange={(e) => setDiscountInput(e.target.value)}
            placeholder="0.00"
            autoFocus
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDiscountAmount(0);
                setDiscountOpen(false);
              }}
            >
              Clear
            </Button>
            <Button
              onClick={() => {
                const v = parseFloat(discountInput);
                setDiscountAmount(Number.isFinite(v) && v > 0 ? v : 0);
                setDiscountOpen(false);
              }}
            >
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Receipt dialog ──────────────────────────────────────────── */}
      <Dialog open={!!receiptOrder} onOpenChange={(o) => !o && setReceiptOrder(null)}>
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
              {receiptOrder.discountValue ? (
                <div className="flex justify-between text-rose-500">
                  <span>Discount</span>
                  <span className="font-mono">-{fmtNum(receiptOrder.discountValue)}</span>
                </div>
              ) : null}
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
                  <>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Cash Tendered</span>
                      <span className="font-mono">{fmtNum(receiptOrder.cashTendered)}</span>
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Total</span>
                      <span className="font-mono">-{fmtNum(receiptOrder.total)}</span>
                    </div>
                    <div className="flex justify-between text-xs font-semibold text-emerald-500">
                      <span>Change Due</span>
                      <span className="font-mono">
                        {fmtNum(Math.max(0, receiptOrder.cashTendered - receiptOrder.total))}
                      </span>
                    </div>
                  </>
                )}
              {receiptOrder.paymentMethod === "credit" && (
                <div className="flex justify-between text-xs font-semibold text-amber-500 pt-1.5 border-t border-border">
                  <span>Charged to account</span>
                  <span className="font-mono">{fmtNum(receiptOrder.total)}</span>
                </div>
              )}
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setReceiptOrder(null)}>
              Done
            </Button>
            <Button onClick={printReceipt} className="bg-gradient-to-r from-teal-500 to-cyan-500">
              <Printer className="h-4 w-4 mr-1.5" />
              Print Receipt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save as Quote dialog */}
      <Dialog open={saveQuoteOpen} onOpenChange={setSaveQuoteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-sky-500" />
              Save as Quote
            </DialogTitle>
            <DialogDescription>
              Saves the current cart as a quotation. No stock is deducted — load the quote later to
              complete the sale.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg bg-muted px-3 py-2 text-sm flex items-center justify-between">
              <span className="text-muted-foreground">Customer</span>
              <span className="font-medium">{selectedCustomer?.name ?? "Walk-in"}</span>
            </div>
            <div className="rounded-lg bg-muted px-3 py-2 text-sm flex items-center justify-between">
              <span className="text-muted-foreground">Total</span>
              <span className="font-bold">{formatCurrency(total, baseCurrency)}</span>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="quote-expiry">Valid until (optional)</Label>
              <Input
                id="quote-expiry"
                type="date"
                value={quoteExpiry}
                onChange={(e) => setQuoteExpiry(e.target.value)}
                min={new Date().toISOString().slice(0, 10)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="quote-notes">Notes / terms (optional)</Label>
              <textarea
                id="quote-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Payment terms, delivery notes, validity conditions…"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveQuoteOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveAsQuote} disabled={createQuotation.isPending} className="gap-1.5">
              <FileText className="h-4 w-4" />
              {createQuotation.isPending ? "Saving…" : "Save & Print"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Sub-components                                                             */
/* ────────────────────────────────────────────────────────────────────────── */

function CategoryCard({
  label,
  sublabel,
  Icon,
  active,
  tint,
  onClick,
}: {
  label: string;
  sublabel: string;
  Icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  tint: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 relative w-[120px] h-[88px] rounded-2xl border transition overflow-hidden flex flex-col items-center justify-center gap-1 active:scale-95 ${
        active
          ? "border-white ring-2 ring-white/80 shadow-[0_0_24px_-4px_rgba(255,255,255,0.55)] scale-[1.03]"
          : "border-white/10 hover:brightness-110"
      }`}
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${tint}`} />
      <div className="absolute top-1.5 right-2 text-[10px] font-bold text-slate-200/80 px-1.5 rounded-md bg-black/30">
        {sublabel}
      </div>
      <Icon className="relative h-7 w-7 text-white/90" />
      <span className="relative text-[10px] font-bold text-white/90 tracking-wider px-1 text-center leading-tight">
        {label}
      </span>
    </button>
  );
}

function QuickAction({
  Icon,
  label,
  sub,
  onClick,
  color,
}: {
  Icon: React.ComponentType<{ className?: string }>;
  label: string;
  sub: string;
  onClick: () => void;
  color: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 inline-flex items-center gap-2 rounded-xl px-3 h-10 text-xs text-white shadow-md hover:brightness-110 active:scale-[0.98] transition bg-gradient-to-br ${color}`}
    >
      <Icon className="h-3.5 w-3.5 text-white" />
      <div className="flex flex-col items-start leading-tight">
        <span className="font-bold text-white">{label}</span>
        <span className="text-[10px] text-white/70">{sub}</span>
      </div>
    </button>
  );
}
