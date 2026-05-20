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
  getListCustomersQueryKey,
  getListHeldOrdersQueryKey,
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
} from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { buildReceiptHtml, openReceiptWindow, receiptOrderFrom } from "@/lib/receipt";
import { fetchCustomerReceiptInfo, type CustomerReceiptInfo } from "@/lib/saas-api";

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
  price: number;
  quantity: number;
  isTaxable: boolean;
  imageUrl: string | null;
};

/* Category → icon map (hardware-store flavoured). Falls back to a box icon. */
const CATEGORY_ICONS: Record<string, { Icon: React.ComponentType<{ className?: string }>; tint: string }> = {
  tools:         { Icon: Wrench,     tint: "from-amber-500/30  to-amber-700/10" },
  hardware:      { Icon: Bolt,       tint: "from-zinc-400/30   to-zinc-700/10"  },
  electrical:    { Icon: Lightbulb,  tint: "from-yellow-400/30 to-yellow-700/10" },
  plumbing:      { Icon: Droplets,   tint: "from-sky-400/30    to-sky-700/10"   },
  lumber:        { Icon: Hammer,     tint: "from-orange-500/30 to-orange-800/10" },
  paint:         { Icon: PaintBucket,tint: "from-rose-500/30   to-rose-800/10"   },
  garden:        { Icon: Trees,      tint: "from-emerald-500/30 to-emerald-800/10" },
  "garden & outdoor": { Icon: Trees, tint: "from-emerald-500/30 to-emerald-800/10" },
  "building materials":{ Icon: Boxes,tint: "from-slate-400/30  to-slate-700/10" },
  outdoor:       { Icon: Trees,      tint: "from-emerald-500/30 to-emerald-800/10" },
};

function getCategoryIcon(name: string) {
  return CATEGORY_ICONS[name.toLowerCase()] ?? {
    Icon: Package,
    tint: "from-teal-500/30 to-teal-800/10",
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

  const handlePinSuccess = (staff: { id: number; name: string; role: string; permissions?: string[] }) => {
    setStaff({ id: staff.id, name: staff.name, role: staff.role, permissions: staff.permissions ?? [] });
    setLocked(false);
  };

  /* ── Search / categories ─────────────────────────────────────────────── */
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Always re-focus the search bar so scanners keep working.
  useEffect(() => {
    const t = setTimeout(() => searchInputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, []);

  /* ── Cart ──────────────────────────────────────────────────────────────── */
  const [cart, setCart] = useState<CartLine[]>([]);
  const [notes, setNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card">("cash");
  const [cashTenderedInput, setCashTenderedInput] = useState("");
  const cartBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (cart.length > 0) cartBottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [cart.length]);

  const addToCart = (productId: number) => {
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
    setCart((prev) => {
      const idx = prev.findIndex((c) => c.productId === productId);
      if (idx >= 0) {
        return prev.map((c, i) => (i === idx ? { ...c, quantity: c.quantity + 1 } : c));
      }
      return [
        ...prev,
        {
          cartKey: `${productId}:${Date.now()}`,
          productId: p.id,
          productName: p.name,
          barcode: p.barcode ?? null,
          price: p.price,
          quantity: 1,
          isTaxable: p.isTaxable,
          imageUrl: p.imageUrl ?? null,
        },
      ];
    });
  };

  const changeQty = (cartKey: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((c) => (c.cartKey === cartKey ? { ...c, quantity: Math.max(0, c.quantity + delta) } : c))
        .filter((c) => c.quantity > 0),
    );
  };

  const removeLine = (cartKey: string) => setCart((prev) => prev.filter((c) => c.cartKey !== cartKey));

  const resetCart = () => {
    setCart([]);
    setNotes("");
    setCashTenderedInput("");
    setDiscountAmount(0);
    setSelectedCustomerId(null);
  };

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
        return {
          cartKey: `${item.productId}:recall:${Date.now()}:${idx}`,
          productId: item.productId,
          productName: item.productName,
          barcode: p?.barcode ?? null,
          imageUrl: p?.imageUrl ?? null,
          price: item.price,
          quantity: item.quantity,
          isTaxable: p?.isTaxable ?? true,
        };
      }),
    );
    if (held.discountAmount && held.discountAmount > 0) setDiscountAmount(held.discountAmount);
    if (held.notes) setNotes(held.notes);
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
        (p.category ?? "").toLowerCase().includes(q)
      );
    });
  }, [productList, searchTerm, categoryFilter]);

  /* ── Scanner: enter on a unique barcode adds to cart ──────────────────── */
  const handleSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    const code = searchTerm.trim();
    if (!code) return;
    const match = productList.find((p) => (p.barcode ?? "").toLowerCase() === code.toLowerCase());
    if (match) {
      addToCart(match.id);
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

  const handleCheckout = () => {
    if (cart.length === 0) {
      toast({ title: "Cart is empty", variant: "destructive" });
      return;
    }
    const cashTendered =
      paymentMethod === "cash" && cashTenderedInput && parseFloat(cashTenderedInput) > 0
        ? parseFloat(cashTenderedInput)
        : undefined;

    createOrder.mutate(
      {
        // `cashTendered` is accepted by the API but missing from the generated
        // CreateOrderBody type, so the body is cast to bypass that staleness
        // (same pattern as the standard POS).
        data: {
          paymentMethod,
          staffId: sessionStaff?.id ?? undefined,
          items: cart.map((c) => ({ productId: c.productId, quantity: c.quantity })),
          cashTendered,
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
    const html = buildReceiptHtml(
      receiptOrderFrom(receiptOrder, {
        name: receiptCustomerInfo?.name ?? null,
        phone: receiptCustomerInfo?.phone ?? null,
        email: receiptCustomerInfo?.email ?? null,
        loyaltyPoints: receiptCustomerInfo?.loyaltyPoints ?? null,
        outstandingBalance: receiptCustomerInfo?.outstandingBalance ?? null,
      }),
      settings,
    );
    openReceiptWindow(html);
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
              className="pl-10 pr-10 h-11 text-sm bg-[#0a1a2a] border-teal-400/30 focus-visible:border-teal-400 focus-visible:ring-teal-400/20 text-slate-100 placeholder:text-slate-500 rounded-xl"
              autoComplete="off"
            />
            {searchTerm ? (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            ) : (
              <ScanBarcode className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
            )}
          </div>

          {/* Add customer */}
          <button
            onClick={() => setCustomerOpen(true)}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-[#0a1a2a] border border-teal-400/30 px-3 h-11 text-sm font-medium text-teal-200 hover:bg-teal-500/10 transition"
          >
            <UserPlus className="h-4 w-4" />
            <span className="hidden sm:inline">{selectedCustomer ? selectedCustomer.name : "Add Customer"}</span>
          </button>

          {/* User badge */}
          <div className="shrink-0 flex items-center gap-2">
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
              onClick={() => { setLocked(true); clearStaff(); }}
              className="h-11 w-11 inline-flex items-center justify-center rounded-xl bg-[#0a1a2a] border border-white/10 text-slate-300 hover:bg-amber-500/10 hover:text-amber-300 transition"
              title="Lock"
            >
              <LockKeyhole className="h-4 w-4" />
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
            tint="from-teal-500/30 to-cyan-700/10"
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
                    <div className="font-mono text-xs text-teal-300 truncate">
                      {p.barcode ?? `#${p.id}`}
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
                    <div className="text-xs font-semibold text-slate-100 truncate">{c.productName}</div>
                    <div className="text-[10px] font-mono text-teal-300 truncate">
                      {c.barcode ?? `#${c.productId}`}
                    </div>
                    <div className="mt-1 flex items-center gap-1">
                      <button
                        onClick={() => changeQty(c.cartKey, -1)}
                        className="h-6 w-6 rounded-md bg-[#0a1a2a] border border-white/10 text-slate-300 hover:bg-rose-500/10 hover:text-rose-300 transition flex items-center justify-center"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="font-mono text-xs font-semibold w-7 text-center text-slate-100">
                        {c.quantity}
                      </span>
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
                      @ {formatCurrency(c.price, baseCurrency)}
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
                onClick={() => setPaymentMethod("cash")}
                className={`h-9 rounded-lg text-xs font-semibold transition border ${
                  paymentMethod === "cash"
                    ? "bg-teal-500/20 border-teal-400/50 text-teal-100"
                    : "bg-[#0d2238] border-white/10 text-slate-400 hover:text-slate-200"
                }`}
              >
                Cash
              </button>
              <button
                onClick={() => setPaymentMethod("card")}
                className={`h-9 rounded-lg text-xs font-semibold transition border ${
                  paymentMethod === "card"
                    ? "bg-teal-500/20 border-teal-400/50 text-teal-100"
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
                className="h-9 mt-1 bg-[#0d2238] border-white/10 text-slate-100 placeholder:text-slate-500 text-xs"
              />
            )}

            <button
              onClick={handleCheckout}
              disabled={cart.length === 0 || createOrder.isPending}
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
          onClick={() => searchInputRef.current?.focus()}
        />
        <QuickAction
          Icon={ClipboardList}
          label="Recent Items"
          sub={`${cart.length} in cart`}
          onClick={() => cartBottomRef.current?.scrollIntoView({ behavior: "smooth" })}
        />
        <QuickAction
          Icon={Tag}
          label="Discount"
          sub={discount > 0 ? `-${fmtNum(discount)}` : "Apply"}
          onClick={() => {
            setDiscountInput(discount > 0 ? String(discount) : "");
            setDiscountOpen(true);
          }}
        />
        <QuickAction
          Icon={Calculator}
          label="Price Check"
          sub="Scan to view"
          onClick={() => searchInputRef.current?.focus()}
        />
        <QuickAction
          Icon={PenLine}
          label="Notes"
          sub={notes ? "Has note" : "Add note"}
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

      {/* ── Customer dialog ──────────────────────────────────────────── */}
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
          ? "border-teal-400 shadow-[0_0_24px_-4px_rgba(45,212,191,0.55)]"
          : "border-white/10 hover:border-teal-400/40"
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
}: {
  Icon: React.ComponentType<{ className?: string }>;
  label: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="shrink-0 inline-flex items-center gap-2 rounded-xl bg-[#0a1a2a] border border-white/10 px-3 h-10 text-xs text-slate-300 hover:bg-teal-500/10 hover:border-teal-400/30 transition"
    >
      <Icon className="h-3.5 w-3.5 text-teal-300" />
      <div className="flex flex-col items-start leading-tight">
        <span className="font-semibold text-slate-100">{label}</span>
        <span className="text-[10px] text-slate-500">{sub}</span>
      </div>
    </button>
  );
}
