import { useState, useMemo, useRef, useEffect, KeyboardEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { buildReceiptHtml, openReceiptWindow, openWhatsAppReceipt } from "@/lib/receipt";
import {
  useListProducts,
  useCreateOrder,
  useListHeldOrders,
  useCreateHeldOrder,
  useDeleteHeldOrder,
  useGetProductCustomization,
  useListCustomers,
  useCreateCustomer,
  getListCustomersQueryKey,
  useListTables,
  useGetCurrentCashSession,
  useSendReceiptEmail,
  useGetSettings,
} from "@workspace/api-client-react";
import { PinPad } from "@/components/PinPad";
import type { GetOrderResponse } from "@workspace/api-zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Search, CreditCard, Banknote, Trash2, ShoppingCart, ScanBarcode,
  Minus, Plus, Percent, DollarSign, SplitSquareHorizontal, SaveAll,
  Download, Printer, CheckCircle2, Settings2, ChefHat,
  UtensilsCrossed, ShoppingBag, Truck, Mail, AlertTriangle, UserPlus, X, MapPin,
} from "lucide-react";
import { saasMe } from "@/lib/saas-api";
import { useLocation, Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { format } from "date-fns";

type ChoiceItem = {
  groupId: number;
  groupName: string;
  optionId: number;
  optionName: string;
  priceAdjustment: number;
};

type CartItem = {
  cartKey: string;
  productId: number;
  productName: string;
  basePrice: number;
  effectivePrice: number;
  quantity: number;
  itemDiscount: number;
  variantChoices: ChoiceItem[];
  modifierChoices: ChoiceItem[];
};

function makeCartKey(productId: number, variantChoices: ChoiceItem[], modifierChoices: ChoiceItem[]) {
  const vSig = variantChoices.map((c) => `v${c.optionId}`).join(",");
  const mSig = modifierChoices.map((c) => `m${c.optionId}`).sort().join(",");
  return `${productId}:${vSig}:${mSig}`;
}

function formatCurrency(val: number, currency = "JMD") {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(val);
  } catch {
    return `${currency} ${val.toFixed(2)}`;
  }
}

function choiceLabel(choices: ChoiceItem[]) {
  return choices.map((c) => c.optionName).join(", ");
}

const CARD_PALETTES = [
  { bg: "bg-blue-700", accent: "border-blue-600", dot: "bg-blue-300" },
  { bg: "bg-violet-700", accent: "border-violet-600", dot: "bg-violet-300" },
  { bg: "bg-emerald-700", accent: "border-emerald-600", dot: "bg-emerald-300" },
  { bg: "bg-amber-700", accent: "border-amber-600", dot: "bg-amber-300" },
  { bg: "bg-rose-700", accent: "border-rose-600", dot: "bg-rose-300" },
  { bg: "bg-cyan-700", accent: "border-cyan-600", dot: "bg-cyan-300" },
  { bg: "bg-pink-700", accent: "border-pink-600", dot: "bg-pink-300" },
  { bg: "bg-indigo-700", accent: "border-indigo-600", dot: "bg-indigo-300" },
  { bg: "bg-teal-700", accent: "border-teal-600", dot: "bg-teal-300" },
  { bg: "bg-orange-700", accent: "border-orange-600", dot: "bg-orange-300" },
];

function getProductPalette(id: number) {
  return CARD_PALETTES[id % CARD_PALETTES.length];
}

/* ─── Customization Dialog ─── */
function CustomizeDialog({
  productId,
  open,
  onClose,
  onConfirm,
}: {
  productId: number;
  open: boolean;
  onClose: () => void;
  onConfirm: (variantChoices: ChoiceItem[], modifierChoices: ChoiceItem[]) => void;
}) {
  const { data: customization, isLoading } = useGetProductCustomization(
    { id: productId },
    { query: { enabled: open } },
  );

  const [selectedVariants, setSelectedVariants] = useState<Record<number, ChoiceItem>>({});
  const [selectedModifiers, setSelectedModifiers] = useState<Set<number>>(new Set());

  // Reset when dialog opens
  const [lastProductId, setLastProductId] = useState<number | null>(null);
  if (open && productId !== lastProductId) {
    setLastProductId(productId);
    setSelectedVariants({});
    setSelectedModifiers(new Set());
  }

  const modifierMap = useMemo(() => {
    if (!customization) return new Map<number, ChoiceItem>();
    const m = new Map<number, ChoiceItem>();
    for (const group of customization.modifierGroups) {
      for (const opt of group.options) {
        m.set(opt.id, {
          groupId: group.id,
          groupName: group.name,
          optionId: opt.id,
          optionName: opt.name,
          priceAdjustment: opt.priceAdjustment,
        });
      }
    }
    return m;
  }, [customization]);

  const priceAdj = useMemo(() => {
    let adj = 0;
    for (const c of Object.values(selectedVariants)) adj += c.priceAdjustment;
    for (const id of selectedModifiers) {
      const m = modifierMap.get(id);
      if (m) adj += m.priceAdjustment;
    }
    return adj;
  }, [selectedVariants, selectedModifiers, modifierMap]);

  const isValid = useMemo(() => {
    if (!customization) return false;
    for (const g of customization.variantGroups) {
      if (g.required && !selectedVariants[g.id]) return false;
    }
    for (const g of customization.modifierGroups) {
      const count = [...selectedModifiers].filter((id) => modifierMap.get(id)?.groupId === g.id).length;
      if (g.required && g.minSelections > 0 && count < g.minSelections) return false;
    }
    return true;
  }, [customization, selectedVariants, selectedModifiers, modifierMap]);

  const handleConfirm = () => {
    const variantChoices = Object.values(selectedVariants);
    const modifierChoices = [...selectedModifiers].map((id) => modifierMap.get(id)!).filter(Boolean);
    onConfirm(variantChoices, modifierChoices);
  };

  const toggleModifier = (groupId: number, groupName: string, opt: { id: number; name: string; priceAdjustment: number }, maxSelections: number) => {
    setSelectedModifiers((prev) => {
      const next = new Set(prev);
      if (next.has(opt.id)) {
        next.delete(opt.id);
      } else {
        const groupCount = [...next].filter((id) => modifierMap.get(id)?.groupId === groupId).length;
        if (maxSelections > 0 && groupCount >= maxSelections) return prev;
        next.add(opt.id);
      }
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-primary" />
            {isLoading ? "Loading…" : customization?.productName ?? "Customize"}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground text-sm">Loading options…</div>
        ) : customization ? (
          <ScrollArea className="max-h-[60vh] pr-2">
            <div className="space-y-5 py-1">
              {customization.variantGroups.map((group) => (
                <div key={group.id}>
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-sm font-semibold">{group.name}</p>
                    {group.required && <Badge variant="destructive" className="text-[10px] h-4 px-1">Required</Badge>}
                  </div>
                  <RadioGroup
                    value={selectedVariants[group.id]?.optionId?.toString() ?? ""}
                    onValueChange={(val) => {
                      const opt = group.options.find((o) => o.id.toString() === val);
                      if (!opt) return;
                      setSelectedVariants((prev) => ({
                        ...prev,
                        [group.id]: { groupId: group.id, groupName: group.name, optionId: opt.id, optionName: opt.name, priceAdjustment: opt.priceAdjustment },
                      }));
                    }}
                    className="flex flex-wrap gap-2"
                  >
                    {group.options.map((opt) => (
                      <div key={opt.id} className="flex items-center gap-1.5">
                        <RadioGroupItem value={opt.id.toString()} id={`v-${opt.id}`} className="sr-only" />
                        <label
                          htmlFor={`v-${opt.id}`}
                          className={`cursor-pointer rounded-md border px-3 py-1.5 text-sm transition-colors ${
                            selectedVariants[group.id]?.optionId === opt.id
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border hover:border-primary/50"
                          }`}
                        >
                          {opt.name}
                          {opt.priceAdjustment !== 0 && (
                            <span className="ml-1 text-muted-foreground text-xs">
                              ({opt.priceAdjustment > 0 ? "+" : ""}{formatCurrency(opt.priceAdjustment)})
                            </span>
                          )}
                        </label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>
              ))}

              {customization.modifierGroups.map((group) => {
                const maxLabel = group.maxSelections > 0 ? ` (max ${group.maxSelections})` : "";
                return (
                  <div key={group.id}>
                    <div className="flex items-center gap-2 mb-2">
                      <p className="text-sm font-semibold">{group.name}</p>
                      {group.required && <Badge variant="destructive" className="text-[10px] h-4 px-1">Required</Badge>}
                      <span className="text-xs text-muted-foreground">{maxLabel}</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {group.options.map((opt) => (
                        <div
                          key={opt.id}
                          onClick={() => toggleModifier(group.id, group.name, opt, group.maxSelections)}
                          className={`cursor-pointer rounded-md border px-3 py-1.5 text-sm transition-colors select-none ${
                            selectedModifiers.has(opt.id)
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border hover:border-primary/50"
                          }`}
                        >
                          {opt.name}
                          {opt.priceAdjustment !== 0 && (
                            <span className="ml-1 text-muted-foreground text-xs">
                              ({opt.priceAdjustment > 0 ? "+" : ""}{formatCurrency(opt.priceAdjustment)})
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        ) : null}

        <div className="border-t border-border pt-3">
          <div className="flex items-center justify-between text-sm mb-3">
            <span className="text-muted-foreground">Base price</span>
            <span className="font-mono">{formatCurrency(customization?.basePrice ?? 0)}</span>
          </div>
          {priceAdj !== 0 && (
            <div className="flex items-center justify-between text-sm mb-3">
              <span className="text-muted-foreground">Adjustments</span>
              <span className={`font-mono ${priceAdj > 0 ? "text-primary" : "text-green-400"}`}>
                {priceAdj > 0 ? "+" : ""}{formatCurrency(priceAdj)}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between font-bold">
            <span>Item price</span>
            <span className="font-mono text-primary">{formatCurrency((customization?.basePrice ?? 0) + priceAdj)}</span>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          <Button onClick={handleConfirm} disabled={!isValid} className="flex-1">
            Add to Cart
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── 80mm Receipt Print Helper ─── */
function printReceiptWindow(
  order: GetOrderResponse,
  settings: Record<string, string> = {},
) {
  const html = buildReceiptHtml(
    {
      orderNumber: order.orderNumber,
      createdAt: order.createdAt,
      items: order.items,
      subtotal: order.subtotal,
      tax: order.tax,
      total: order.total,
      discountValue: order.discountValue,
      paymentMethod: order.paymentMethod,
      splitCardAmount: order.splitCardAmount,
      splitCashAmount: order.splitCashAmount,
      cashTendered: order.cashTendered,
      notes: order.notes,
      status: order.status,
    },
    settings,
  );
  openReceiptWindow(html);
}

/* ─── Main POS component ─── */
export function POS() {
  const { data: products, isLoading: loadingProducts } = useListProducts();
  const createOrder = useCreateOrder();
  const { data: settings } = useGetSettings();
  const baseCurrency = settings?.base_currency || "JMD";
  const secondaryCurrency = settings?.secondary_currency || "";
  const exchangeRate = parseFloat(settings?.currency_rate || "0");
  const taxRate = parseFloat(settings?.tax_rate || "15") / 100;
  const taxPct = Math.round(taxRate * 100);

  const { data: heldOrders } = useListHeldOrders();
  const createHeldOrder = useCreateHeldOrder();
  const deleteHeldOrder = useDeleteHeldOrder();

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const sendReceiptEmail = useSendReceiptEmail();

  const [, navigate] = useLocation();
  const [locked, setLocked] = useState(true);
  const [sessionStaff, setSessionStaff] = useState<{ id: number; name: string; role: string } | null>(null);
  const [sessionLocationId, setSessionLocationId] = useState<number | null>(null);
  const [posLocations, setPosLocations] = useState<{ id: number; name: string }[]>([]);

  useEffect(() => {
    const token = localStorage.getItem("nexus_tenant_token");
    fetch("/api/locations", { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => r.ok ? r.json() : [])
      .then((locs: { id: number; name: string; isActive: boolean }[]) => setPosLocations(locs.filter(l => l.isActive)))
      .catch(() => {});
  }, []);

  const [expiryPopupOpen, setExpiryPopupOpen] = useState(false);
  const [expiryTarget, setExpiryTarget] = useState<Date | null>(null);
  const [expiryCountdown, setExpiryCountdown] = useState<{ days: number; hours: number; minutes: number; seconds: number } | null>(null);

  useEffect(() => {
    if (!expiryTarget) { setExpiryCountdown(null); return; }
    const tick = () => {
      const diff = expiryTarget.getTime() - Date.now();
      if (diff <= 0) { setExpiryCountdown({ days: 0, hours: 0, minutes: 0, seconds: 0 }); return; }
      setExpiryCountdown({
        days: Math.floor(diff / 86400000),
        hours: Math.floor((diff % 86400000) / 3600000),
        minutes: Math.floor((diff % 3600000) / 60000),
        seconds: Math.floor((diff % 60000) / 1000),
      });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiryTarget]);

  const { data: cashSession, isError: noOpenShift, isLoading: checkingShift } = useGetCurrentCashSession({
    query: { retry: false, enabled: !locked },
  });

  const MANAGEMENT_ROLES = ["admin", "manager", "supervisor"];

  const handlePinSuccess = (staff: { id: number; name: string; role: string }) => {
    setSessionStaff(staff);
    setLocked(false);
    toast({ title: `Welcome, ${staff.name}!`, description: `Logged in as ${staff.role}` });

    const roleLower = staff.role.toLowerCase();
    if (MANAGEMENT_ROLES.some(r => roleLower.includes(r))) {
      saasMe().then((me) => {
        const sub = me.subscription;
        if (!sub) return;
        let expiry: Date | null = null;
        if (sub.status === "trial" && sub.trialEndsAt) expiry = new Date(sub.trialEndsAt);
        else if (sub.status === "active" && sub.currentPeriodEnd) expiry = new Date(sub.currentPeriodEnd);
        if (expiry) {
          const daysLeft = Math.ceil((expiry.getTime() - Date.now()) / 86400000);
          if (daysLeft <= 15 && daysLeft > 0) {
            setExpiryTarget(expiry);
            setExpiryPopupOpen(true);
          }
        }
      }).catch(() => {});
    }
  };

  const [searchTerm, setSearchTerm] = useState("");
  const [barcodeTerm, setBarcodeTerm] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const cartBottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (cart.length > 0) {
      cartBottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [cart.length]);
  const [paymentMethod, setPaymentMethod] = useState<"card" | "cash" | "split">("card");

  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  const [discountType, setDiscountType] = useState<"percent" | "fixed" | null>(null);
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [notes, setNotes] = useState("");

  const [splitCardAmount, setSplitCardAmount] = useState<number>(0);
  const [splitCashAmount, setSplitCashAmount] = useState<number>(0);
  const [receiptOrder, setReceiptOrder] = useState<GetOrderResponse | null>(null);
  const [receiptEmailOpen, setReceiptEmailOpen] = useState(false);
  const [receiptEmailAddr, setReceiptEmailAddr] = useState("");
  const [whatsappOpen, setWhatsappOpen] = useState(false);
  const [whatsappPhone, setWhatsappPhone] = useState("");

  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [selectedCustomerOverride, setSelectedCustomerOverride] = useState<{ id: number; name: string; phone?: string | null; email?: string | null; loyaltyPoints: number } | null>(null);
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [newCustName,  setNewCustName]  = useState("");
  const [newCustPhone, setNewCustPhone] = useState("");
  const [newCustEmail, setNewCustEmail] = useState("");
  const [loyaltyPointsToRedeem, setLoyaltyPointsToRedeem] = useState<number>(0);
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [orderMode, setOrderMode] = useState<"dine-in" | "takeout" | "delivery">("dine-in");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryPhone, setDeliveryPhone] = useState("");
  const [numpadValue, setNumpadValue] = useState("");
  const [deliveryDirections, setDeliveryDirections] = useState("");

  const { data: customers } = useListCustomers();
  const createCustomer = useCreateCustomer();
  const { data: tables } = useListTables();

  const handleAddCustomer = async () => {
    if (!newCustName.trim()) return;
    try {
      const created = await createCustomer.mutateAsync({
        data: { name: newCustName.trim(), phone: newCustPhone.trim() || undefined, email: newCustEmail.trim() || undefined },
      });
      await queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() });
      setSelectedCustomerOverride({
        id: created.id,
        name: created.name,
        phone: created.phone ?? null,
        email: created.email ?? null,
        loyaltyPoints: created.loyaltyPoints ?? 0,
      });
      setSelectedCustomerId(created.id);
      setAddingCustomer(false);
      setNewCustName(""); setNewCustPhone(""); setNewCustEmail("");
      setCustomerSearch("");
      toast({ title: "Customer added", description: `${created.name} added and selected.` });
    } catch {
      toast({ title: "Error", description: "Could not create customer.", variant: "destructive" });
    }
  };

  // Customization dialog state
  const [customizingProductId, setCustomizingProductId] = useState<number | null>(null);

  const categories = useMemo(() => {
    if (!products) return [];
    return Array.from(new Set(products.map((p) => p.category)));
  }, [products]);

  const filteredProducts = products?.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter ? p.category === categoryFilter : true;
    return matchesSearch && matchesCategory;
  });

  const handleProductTap = (product: NonNullable<typeof products>[0]) => {
    if (product.hasVariants || product.hasModifiers) {
      setCustomizingProductId(product.id);
    } else {
      addToCartDirect(product.id, product.name, product.price, [], []);
    }
  };

  const addToCartDirect = (
    productId: number,
    productName: string,
    basePrice: number,
    variantChoices: ChoiceItem[],
    modifierChoices: ChoiceItem[],
  ) => {
    const adj = [...variantChoices, ...modifierChoices].reduce((s, c) => s + c.priceAdjustment, 0);
    const effectivePrice = basePrice + adj;
    const cartKey = makeCartKey(productId, variantChoices, modifierChoices);

    setCart((prev) => {
      const existing = prev.find((item) => item.cartKey === cartKey);
      if (existing) {
        return prev.map((item) =>
          item.cartKey === cartKey ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }
      return [
        ...prev,
        { cartKey, productId, productName, basePrice, effectivePrice, quantity: 1, itemDiscount: 0, variantChoices, modifierChoices },
      ];
    });
  };

  const handleCustomizeConfirm = (variantChoices: ChoiceItem[], modifierChoices: ChoiceItem[]) => {
    const product = products?.find((p) => p.id === customizingProductId);
    if (!product) return;
    addToCartDirect(product.id, product.name, product.price, variantChoices, modifierChoices);
    setCustomizingProductId(null);
  };

  const handleBarcodeScan = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const product = products?.find((p) => p.barcode === barcodeTerm);
      if (product) {
        handleProductTap(product);
        if (!product.hasVariants && !product.hasModifiers) {
          toast({ title: "Product added", description: product.name });
        }
      } else {
        toast({ title: "Product not found", description: `Barcode: ${barcodeTerm}`, variant: "destructive" });
      }
      setBarcodeTerm("");
    }
  };

  const updateQuantity = (cartKey: string, delta: number) => {
    setCart((prev) =>
      prev.map((item) =>
        item.cartKey === cartKey ? { ...item, quantity: Math.max(1, item.quantity + delta) } : item,
      ),
    );
  };

  const removeFromCart = (cartKey: string) => {
    setCart((prev) => prev.filter((item) => item.cartKey !== cartKey));
  };

  const subtotal = cart.reduce((sum, item) => sum + item.effectivePrice * item.quantity - item.itemDiscount, 0);

  let cartDiscountValue = 0;
  if (discountType === "percent") cartDiscountValue = subtotal * ((discountAmount || 0) / 100);
  else if (discountType === "fixed") cartDiscountValue = discountAmount || 0;
  cartDiscountValue = Math.min(cartDiscountValue, subtotal);

  const selectedCustomer = (selectedCustomerId != null
    ? (customers?.find((c) => c.id === selectedCustomerId) ?? selectedCustomerOverride)
    : null);
  const maxRedeemable = selectedCustomer ? Math.min(selectedCustomer.loyaltyPoints, Math.floor((subtotal - cartDiscountValue) * 100)) : 0;
  const clampedPoints = Math.min(loyaltyPointsToRedeem, maxRedeemable);
  const loyaltyDiscountValue = clampedPoints > 0 ? clampedPoints / 100 : 0;

  const discountedSubtotal = Math.max(0, subtotal - cartDiscountValue - loyaltyDiscountValue);
  const tax = discountedSubtotal * taxRate;
  const total = discountedSubtotal + tax;

  const handleSplitClick = () => {
    setPaymentMethod("split");
    setSplitCardAmount(Number((total / 2).toFixed(2)));
    setSplitCashAmount(Number((total - Number((total / 2).toFixed(2))).toFixed(2)));
  };

  const isSplitValid = Math.abs(splitCardAmount + splitCashAmount - total) < 0.01;

  const resetCart = () => {
    setCart([]);
    setDiscountType(null);
    setDiscountAmount(0);
    setNotes("");
    setPaymentMethod("card");
    setSplitCardAmount(0);
    setSplitCashAmount(0);
    setSelectedCustomerId(null);
    setSelectedCustomerOverride(null);
    setAddingCustomer(false);
    setNewCustName(""); setNewCustPhone(""); setNewCustEmail("");
    setLoyaltyPointsToRedeem(0);
    setSelectedTableId(null);
    setCustomerSearch("");
    setOrderMode("dine-in");
    setDeliveryAddress("");
    setDeliveryPhone("");
    setDeliveryDirections("");
    setNumpadValue("");
  };

  const buildOrderNotes = () => {
    if (orderMode !== "delivery") return notes || undefined;
    const parts: string[] = [];
    if (deliveryAddress) parts.push(`Address: ${deliveryAddress}`);
    if (deliveryPhone) parts.push(`Phone: ${deliveryPhone}`);
    if (deliveryDirections) parts.push(`Directions: ${deliveryDirections}`);
    if (notes) parts.push(notes);
    return parts.length > 0 ? parts.join(" | ") : undefined;
  };

  const handleCharge = () => {
    if (cart.length === 0) return;
    if (orderMode === "delivery" && !deliveryAddress.trim()) {
      toast({ title: "Address required", description: "Please enter a delivery address.", variant: "destructive" });
      return;
    }
    if (paymentMethod === "split" && !isSplitValid) {
      toast({ title: "Invalid Split", description: "Card and cash amounts must equal total.", variant: "destructive" });
      return;
    }

    createOrder.mutate(
      {
        data: {
          paymentMethod,
          items: cart.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            discountAmount: item.itemDiscount || undefined,
            variantChoices: item.variantChoices.length > 0 ? item.variantChoices : undefined,
            modifierChoices: item.modifierChoices.length > 0 ? item.modifierChoices : undefined,
          })),
          splitCardAmount: paymentMethod === "split" ? splitCardAmount : undefined,
          splitCashAmount: paymentMethod === "split" ? splitCashAmount : undefined,
          cashTendered: paymentMethod === "cash" && numpadValue && parseFloat(numpadValue) > 0
            ? parseFloat(numpadValue)
            : undefined,
          discountType: discountType ?? undefined,
          discountAmount: discountAmount > 0 ? discountAmount : undefined,
          notes: buildOrderNotes(),
          customerId: selectedCustomerId ?? undefined,
          loyaltyPointsToRedeem: clampedPoints > 0 ? clampedPoints : undefined,
          tableId: orderMode === "dine-in" ? (selectedTableId ?? undefined) : undefined,
          orderType: orderMode,
          locationId: sessionLocationId ?? undefined,
        },
      },
      {
        onSuccess: (data) => {
          setReceiptOrder(data);
          resetCart();
        },
        onError: () => {
          toast({ title: "Payment Failed", description: "There was an error processing the payment.", variant: "destructive" });
        },
      },
    );
  };

  const handleSendToKitchen = () => {
    if (cart.length === 0) return;

    createOrder.mutate(
      {
        data: {
          items: cart.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            discountAmount: item.itemDiscount || undefined,
            variantChoices: item.variantChoices.length > 0 ? item.variantChoices : undefined,
            modifierChoices: item.modifierChoices.length > 0 ? item.modifierChoices : undefined,
          })),
          discountType: discountType ?? undefined,
          discountAmount: discountAmount > 0 ? discountAmount : undefined,
          notes: notes || undefined,
          customerId: selectedCustomerId ?? undefined,
          loyaltyPointsToRedeem: clampedPoints > 0 ? clampedPoints : undefined,
          tableId: selectedTableId ?? undefined,
          orderType: "dine-in",
          locationId: sessionLocationId ?? undefined,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Order Sent to Kitchen", description: "The order is now visible on the kitchen display." });
          queryClient.invalidateQueries({ queryKey: ["/api/tables"] });
          queryClient.invalidateQueries({ queryKey: ["/api/kitchen"] });
          resetCart();
        },
        onError: () => {
          toast({ title: "Failed to Send", description: "Could not send order to kitchen.", variant: "destructive" });
        },
      },
    );
  };

  const handleHoldOrder = () => {
    if (cart.length === 0) return;
    createHeldOrder.mutate(
      {
        data: {
          items: cart.map((item) => ({
            productId: item.productId,
            productName: item.productName,
            price: item.effectivePrice,
            quantity: item.quantity,
          })),
          notes: notes || undefined,
          discountType: discountType ?? undefined,
          discountAmount: discountAmount > 0 ? discountAmount : undefined,
        },
      },
      {
        onSuccess: () => {
          resetCart();
          toast({ title: "Order held" });
          queryClient.invalidateQueries({ queryKey: ["/api/held-orders"] });
        },
      },
    );
  };

  const handleRecallOrder = (id: number) => {
    const held = heldOrders?.find((h) => h.id === id);
    if (!held) return;
    setCart(
      held.items.map((item) => ({
        cartKey: makeCartKey(item.productId, [], []),
        productId: item.productId,
        productName: item.productName,
        basePrice: item.price,
        effectivePrice: item.price,
        quantity: item.quantity,
        itemDiscount: 0,
        variantChoices: [],
        modifierChoices: [],
      })),
    );
    if (held.discountType) setDiscountType(held.discountType as "percent" | "fixed");
    if (held.discountAmount) setDiscountAmount(held.discountAmount);
    if (held.notes) setNotes(held.notes);
    deleteHeldOrder.mutate({ id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/held-orders"] }) });
  };

  if (locked) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-8 w-full max-w-xs">
          {/* Brand */}
          <div className="flex flex-col items-center gap-2 mb-2">
            <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="h-8 w-8 text-primary fill-current">
                <path d="M19 7H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2Zm-9 7H6v-2h4v2Zm8-4H6V9h12v1Z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">NEXXUS POS</h1>
            <p className="text-sm text-muted-foreground">Your Business, Connected.</p>
          </div>

          <PinPad
            onSuccess={handlePinSuccess}
            title="Staff PIN Required"
            subtitle="Enter your 4-digit PIN to access the POS"
            pinLength={4}
          />

          <p className="text-xs text-muted-foreground text-center mt-2">
            Powered by MicroBooks
          </p>
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
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background gap-6">
        <div className="flex flex-col items-center gap-4 text-center max-w-sm px-6">
          <div className="h-16 w-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-8 w-8 text-amber-400">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4m0 4h.01" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-bold mb-1">No Open Shift</h2>
            <p className="text-sm text-muted-foreground">
              A cash drawer shift must be opened before you can process sales.
              {sessionStaff && <><br /><span className="text-foreground/70">Logged in as <strong>{sessionStaff.name}</strong></span></>}
            </p>
          </div>
          <div className="flex gap-3 mt-2">
            <Link
              to="/cash"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                <path d="M12 2a5 5 0 1 1 0 10A5 5 0 0 1 12 2zm0 12c-5.33 0-8 2.67-8 4v2h16v-2c0-1.33-2.67-4-8-4z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Open Shift in Cash Management
            </Link>
            <button
              onClick={() => { setLocked(true); setSessionStaff(null); }}
              className="rounded-md border border-border px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
            >
              Back
            </button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground absolute bottom-4">Powered by MicroBooks</p>
      </div>
    );
  }

  return (
    <>
      {/* Staff session badge */}
      {sessionStaff && (
        <div className="absolute top-3 right-4 z-10 flex items-center gap-2">
          {posLocations.length > 0 && (
            <div className="flex items-center gap-1 bg-muted/60 border border-border/50 rounded-md px-2 py-1">
              <MapPin className="h-3 w-3 text-primary shrink-0" />
              <select
                value={sessionLocationId ?? ""}
                onChange={e => setSessionLocationId(e.target.value ? Number(e.target.value) : null)}
                className="text-xs bg-transparent border-none outline-none text-foreground cursor-pointer max-w-[120px]"
              >
                <option value="">All Branches</option>
                {posLocations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
          )}
          <span className="text-xs text-muted-foreground">
            Logged in: <span className="font-semibold text-foreground">{sessionStaff.name}</span>
          </span>
          <button
            className="text-xs text-muted-foreground hover:text-destructive underline-offset-2 hover:underline transition-colors"
            onClick={() => { setLocked(true); setSessionStaff(null); setSessionLocationId(null); }}
          >
            Lock
          </button>
        </div>
      )}
      <div className="flex h-full">
        {/* Product grid */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-border">
          {/* Search & filters */}
          <div className="p-4 border-b border-border space-y-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input className="pl-9 w-full" placeholder="Search products…" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
              </div>
              <div className="relative flex-1">
                <ScanBarcode className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input className="pl-9 w-full" placeholder="Scan barcode…" value={barcodeTerm} onChange={(e) => setBarcodeTerm(e.target.value)} onKeyDown={handleBarcodeScan} />
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" variant={categoryFilter === null ? "default" : "outline"} onClick={() => setCategoryFilter(null)} className="h-7 text-xs">
                All
              </Button>
              {categories.map((cat) => (
                <Button key={cat} size="sm" variant={categoryFilter === cat ? "default" : "outline"} onClick={() => setCategoryFilter(cat)} className="h-7 text-xs">
                  {cat}
                </Button>
              ))}
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="grid grid-cols-4 sm:grid-cols-5 lg:grid-cols-5 gap-2 p-3">
              {loadingProducts
                ? Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="aspect-square rounded-xl bg-secondary/30 animate-pulse" />
                  ))
                : filteredProducts?.map((product) => {
                    const palette = getProductPalette(product.id);
                    return (
                      <motion.div key={product.id} whileTap={{ scale: 0.95 }} whileHover={{ scale: 1.02 }}>
                        <div
                          onClick={() => !product.inStock ? undefined : handleProductTap(product)}
                          className={`relative cursor-pointer rounded-xl border ${palette.bg} ${palette.accent} aspect-square p-2 flex flex-col justify-between transition-all duration-150 ${!product.inStock ? "opacity-40 grayscale cursor-not-allowed" : "hover:brightness-110 hover:shadow-lg hover:shadow-black/30 active:scale-95"}`}
                        >
                          <div className={`absolute top-2 right-2 h-1.5 w-1.5 rounded-full ${palette.dot} opacity-70`} />
                          <div className="pr-3">
                            <p className="text-xs font-bold leading-snug line-clamp-2 text-white">{product.name}</p>
                            <p className="text-[9px] text-white/50 mt-0.5">{product.category}</p>
                          </div>
                          <div className="flex items-end justify-between gap-1">
                            <p className="text-sm font-bold font-mono text-white leading-none">{formatCurrency(product.price)}</p>
                            <div className="flex flex-col items-end gap-0.5">
                              {(product.hasVariants || product.hasModifiers) && (
                                <Settings2 className="h-3 w-3 text-white/60" />
                              )}
                              {!product.inStock ? (
                                <span className="text-[9px] font-semibold bg-red-500/40 text-red-200 px-1 py-0.5 rounded leading-none">Out of stock</span>
                              ) : product.stockCount > 0 ? (
                                <span className={`text-[9px] font-semibold px-1 py-0.5 rounded leading-none ${product.stockCount <= 5 ? "bg-amber-500/40 text-amber-100" : "bg-black/30 text-white/70"}`}>
                                  {product.stockCount} left
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
            </div>
          </ScrollArea>
        </div>

        {/* ── MIDDLE: Order controls ── */}
        <div className="w-[360px] shrink-0 border-l border-border flex flex-col bg-card">
          {/* Order mode selector */}
          <div className="grid grid-cols-3 gap-1 p-2 border-b border-border shrink-0">
            {([
              { mode: "dine-in", label: "Dine In", icon: UtensilsCrossed },
              { mode: "takeout", label: "Takeout", icon: ShoppingBag },
              { mode: "delivery", label: "Delivery", icon: Truck },
            ] as const).map(({ mode, label, icon: Icon }) => (
              <button
                key={mode}
                onClick={() => { setOrderMode(mode); if (mode !== "dine-in") setSelectedTableId(null); }}
                className={`flex flex-col items-center gap-0.5 py-2 rounded-md text-xs font-medium transition-all ${orderMode === mode ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"}`}
              >
                <Icon className="h-4 w-4" />{label}
              </button>
            ))}
          </div>

          {/* Cart header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-primary" />
              <span className="font-semibold text-sm">Cart</span>
              {cart.length > 0 && <Badge className="h-5 text-[10px] px-1.5">{cart.reduce((s, i) => s + i.quantity, 0)}</Badge>}
            </div>
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" className="h-7 w-7" title="Hold order" onClick={handleHoldOrder} disabled={cart.length === 0}>
                <SaveAll className="h-3.5 w-3.5" />
              </Button>
              {heldOrders && heldOrders.length > 0 && (
                <Sheet>
                  <Button size="icon" variant="ghost" className="h-7 w-7" title="Recall order" asChild>
                    <label className="cursor-pointer">
                      <Download className="h-3.5 w-3.5" />
                    </label>
                  </Button>
                  <SheetContent side="right" className="w-80">
                    <SheetHeader>
                      <SheetTitle>Held Orders</SheetTitle>
                    </SheetHeader>
                    <div className="mt-4 space-y-2">
                      {heldOrders.map((h) => (
                        <Button key={h.id} variant="outline" className="w-full justify-start text-sm h-auto py-2" onClick={() => handleRecallOrder(h.id)}>
                          <div className="text-left">
                            <p className="font-medium">{h.label ?? `Order #${h.id}`}</p>
                            <p className="text-xs text-muted-foreground">{h.items.length} items · {format(new Date(h.createdAt), "h:mm a")}</p>
                          </div>
                        </Button>
                      ))}
                    </div>
                  </SheetContent>
                </Sheet>
              )}
              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" title="Clear cart" onClick={resetCart} disabled={cart.length === 0}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Cart items */}
          <ScrollArea className="flex-1">
            <div className="px-2 py-2 space-y-1.5">
              <AnimatePresence initial={false}>
                {cart.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 text-muted-foreground gap-2">
                    <ShoppingCart className="h-7 w-7 opacity-30" />
                    <p className="text-xs">Cart is empty</p>
                  </div>
                ) : (
                  cart.map((item) => (
                    <motion.div key={item.cartKey} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}>
                      <div className="rounded-lg bg-secondary/30 p-2">
                        <div className="flex items-start justify-between gap-1">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium leading-snug truncate">{item.productName}</p>
                            {item.variantChoices.length > 0 && <p className="text-[10px] text-primary/80">{choiceLabel(item.variantChoices)}</p>}
                            {item.modifierChoices.length > 0 && <p className="text-[10px] text-amber-400/90">+ {choiceLabel(item.modifierChoices)}</p>}
                            <p className="text-[10px] font-mono text-primary mt-0.5">{formatCurrency(item.effectivePrice)} ea</p>
                          </div>
                          <Button size="icon" variant="ghost" className="h-5 w-5 text-destructive shrink-0" onClick={() => removeFromCart(item.cartKey)}>
                            <Trash2 className="h-2.5 w-2.5" />
                          </Button>
                        </div>
                        <div className="flex items-center gap-1 mt-1.5">
                          <Button size="icon" variant="outline" className="h-5 w-5" onClick={() => updateQuantity(item.cartKey, -1)}><Minus className="h-2.5 w-2.5" /></Button>
                          <span className="text-xs font-bold w-4 text-center">{item.quantity}</span>
                          <Button size="icon" variant="outline" className="h-5 w-5" onClick={() => updateQuantity(item.cartKey, 1)}><Plus className="h-2.5 w-2.5" /></Button>
                          <span className="ml-auto text-xs font-mono font-semibold">{formatCurrency(item.effectivePrice * item.quantity - item.itemDiscount)}</span>
                        </div>
                      </div>
                    </motion.div>
                  ))
                )}
              </AnimatePresence>
              <div ref={cartBottomRef} />
            </div>
          </ScrollArea>

          {/* Order options — static, not scrollable */}
          <div className="px-3 py-2 space-y-2 border-t border-border shrink-0">
              {/* Discount */}
              <div className="flex gap-1.5">
                <Button size="sm" variant={discountType === "percent" ? "default" : "outline"} className="flex-1 h-7 text-xs" onClick={() => setDiscountType(discountType === "percent" ? null : "percent")}>
                  <Percent className="h-3 w-3 mr-1" />%
                </Button>
                <Button size="sm" variant={discountType === "fixed" ? "default" : "outline"} className="flex-1 h-7 text-xs" onClick={() => setDiscountType(discountType === "fixed" ? null : "fixed")}>
                  <DollarSign className="h-3 w-3 mr-1" />Fixed
                </Button>
                {discountType && (
                  <Input type="number" min={0} className="flex-1 h-7 text-xs font-mono" placeholder={discountType === "percent" ? "%" : "$"}
                    value={discountAmount || ""} onChange={(e) => setDiscountAmount(Number(e.target.value))} />
                )}
              </div>

              {/* Customer */}
              {selectedCustomer ? (
                <div className="flex items-center justify-between bg-primary/10 rounded-md px-2 py-1.5 border border-primary/20">
                  <div>
                    <p className="text-xs font-medium text-primary">{selectedCustomer.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {selectedCustomer.loyaltyPoints} pts
                      {selectedCustomer.phone && <> · {selectedCustomer.phone}</>}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" className="h-5 text-xs p-1 text-muted-foreground"
                    onClick={() => { setSelectedCustomerId(null); setSelectedCustomerOverride(null); setLoyaltyPointsToRedeem(0); }}>✕</Button>
                </div>
              ) : addingCustomer ? (
                /* ── Inline quick-add form ── */
                <div className="rounded-md border border-blue-500/30 bg-blue-500/5 p-2 space-y-1.5">
                  <div className="flex items-center justify-between mb-0.5">
                    <p className="text-[10px] font-semibold text-blue-400 uppercase tracking-wide">New Customer</p>
                    <button onClick={() => { setAddingCustomer(false); setNewCustName(""); setNewCustPhone(""); setNewCustEmail(""); }}
                      className="text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /></button>
                  </div>
                  <Input
                    autoFocus
                    className="text-xs h-7"
                    placeholder="Full name *"
                    value={newCustName}
                    onChange={e => setNewCustName(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") handleAddCustomer(); }}
                  />
                  <Input
                    className="text-xs h-7"
                    placeholder="Phone (optional)"
                    value={newCustPhone}
                    onChange={e => setNewCustPhone(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") handleAddCustomer(); }}
                  />
                  <Input
                    className="text-xs h-7"
                    placeholder="Email (optional)"
                    value={newCustEmail}
                    onChange={e => setNewCustEmail(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") handleAddCustomer(); }}
                  />
                  <Button size="sm" className="w-full h-7 text-xs" onClick={handleAddCustomer}
                    disabled={!newCustName.trim() || createCustomer.isPending}>
                    {createCustomer.isPending ? "Saving…" : "Add & Select"}
                  </Button>
                </div>
              ) : (
                /* ── Search + Add button ── */
                <div className="relative">
                  <div className="flex gap-1">
                    <Input className="text-xs h-7 flex-1" placeholder="Search customer…" value={customerSearch}
                      onChange={e => setCustomerSearch(e.target.value)} />
                    <Button size="sm" variant="outline" className="h-7 w-7 p-0 shrink-0" title="Add new customer"
                      onClick={() => { setAddingCustomer(true); setNewCustName(customerSearch); setCustomerSearch(""); }}>
                      <UserPlus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {customerSearch && customers && (
                    <div className="absolute z-10 w-full mt-0.5 bg-card border border-border rounded-md shadow-lg max-h-36 overflow-auto">
                      {customers
                        .filter(c => c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
                          (c.phone ?? "").includes(customerSearch))
                        .slice(0, 5)
                        .map(c => (
                          <button key={c.id} className="w-full text-left px-2 py-1.5 text-xs hover:bg-secondary/50 flex justify-between"
                            onClick={() => { setSelectedCustomerId(c.id); setSelectedCustomerOverride(null); setCustomerSearch(""); setLoyaltyPointsToRedeem(0); }}>
                            <span>{c.name}{c.phone ? <span className="text-muted-foreground ml-1">· {c.phone}</span> : null}</span>
                            <span className="text-muted-foreground">{c.loyaltyPoints} pts</span>
                          </button>
                        ))}
                      {customers.filter(c => c.name.toLowerCase().includes(customerSearch.toLowerCase()) || (c.phone ?? "").includes(customerSearch)).length === 0 && (
                        <button className="w-full text-left px-2 py-1.5 text-xs text-blue-400 hover:bg-secondary/50 flex items-center gap-1.5"
                          onClick={() => { setAddingCustomer(true); setNewCustName(customerSearch); setCustomerSearch(""); }}>
                          <UserPlus className="h-3 w-3" /> Add "{customerSearch}" as new customer
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Loyalty */}
              {selectedCustomer && selectedCustomer.loyaltyPoints > 0 && (
                <div className="bg-amber-500/5 border border-amber-500/20 rounded-md px-2 py-1.5 space-y-1">
                  <p className="text-[10px] font-medium text-amber-400">Loyalty · Max {maxRedeemable} pts</p>
                  <div className="flex gap-1.5 items-center">
                    <Input type="number" min={0} step={100} max={maxRedeemable} value={loyaltyPointsToRedeem || ""}
                      onChange={(e) => setLoyaltyPointsToRedeem(Math.min(Number(e.target.value), maxRedeemable))}
                      className="h-6 text-xs font-mono flex-1" placeholder="0 pts" />
                    <Button size="sm" variant="outline" className="h-6 text-xs px-1.5" onClick={() => setLoyaltyPointsToRedeem(maxRedeemable)}>Max</Button>
                  </div>
                </div>
              )}

              {/* Table */}
              {orderMode === "dine-in" && tables && tables.length > 0 && (
                <div>
                  <p className="text-[10px] font-medium text-muted-foreground mb-1">Table</p>
                  <div className="flex flex-wrap gap-1">
                    {tables.filter((t) => t.isActive && t.status !== "occupied").map((t) => (
                      <button key={t.id}
                        className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-all ${selectedTableId === t.id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}
                        style={selectedTableId === t.id ? { borderColor: t.color, color: t.color, backgroundColor: `${t.color}15` } : {}}
                        onClick={() => setSelectedTableId(selectedTableId === t.id ? null : t.id)}>
                        {t.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Delivery */}
              {orderMode === "delivery" && (
                <div className="space-y-1 rounded-md border border-primary/20 bg-primary/5 p-2">
                  <p className="text-[10px] font-semibold text-primary flex items-center gap-1"><Truck className="h-3 w-3" /> Delivery</p>
                  <Input className="h-7 text-xs" placeholder="Address *" value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} />
                  <Input className="h-7 text-xs" placeholder="Phone" type="tel" value={deliveryPhone} onChange={(e) => setDeliveryPhone(e.target.value)} />
                  <Input className="h-7 text-xs" placeholder="Directions (optional)" value={deliveryDirections} onChange={(e) => setDeliveryDirections(e.target.value)} />
                </div>
              )}

              {/* Notes */}
              <Textarea className="text-xs resize-none h-12" placeholder="Order notes…" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        {/* ── RIGHT: Bill preview + keypad ── */}
        <div className="w-[320px] shrink-0 border-l border-border flex flex-col bg-card">
          {/* Bill summary */}
          <div className="flex-1 overflow-y-auto p-3 border-b border-border">
            <div className="flex items-center gap-1.5 mb-2">
              <Printer className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-semibold text-primary">Bill Preview</span>
              {cart.length > 0 && <span className="ml-auto text-[10px] text-muted-foreground">{cart.reduce((s, i) => s + i.quantity, 0)} items</span>}
            </div>
            {cart.length === 0 ? (
              <p className="text-center text-[10px] text-muted-foreground py-1 opacity-50">Add items to see bill</p>
            ) : (
              <div className="space-y-0.5 text-xs">
                {cart.map((item) => (
                  <div key={item.cartKey} className="flex justify-between text-muted-foreground">
                    <span className="truncate max-w-[150px]">{item.quantity}× {item.productName}</span>
                    <span className="font-mono shrink-0 ml-1">{formatCurrency(item.effectivePrice * item.quantity - item.itemDiscount)}</span>
                  </div>
                ))}
                <div className="pt-1.5 mt-1 border-t border-border space-y-0.5">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Subtotal</span><span className="font-mono">{formatCurrency(subtotal)}</span>
                  </div>
                  {cartDiscountValue > 0 && (
                    <div className="flex justify-between text-amber-400">
                      <span>Discount</span><span className="font-mono">-{formatCurrency(cartDiscountValue)}</span>
                    </div>
                  )}
                  {loyaltyDiscountValue > 0 && (
                    <div className="flex justify-between text-amber-400">
                      <span>Loyalty</span><span className="font-mono">-{formatCurrency(loyaltyDiscountValue)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-muted-foreground">
                    <span>GCT {taxPct > 0 ? `(${taxPct}%)` : ""}</span><span className="font-mono">{formatCurrency(tax)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-sm pt-1 border-t border-border">
                    <span>Total</span><span className="font-mono text-primary">{formatCurrency(total, baseCurrency)}</span>
                  </div>
                  {secondaryCurrency && exchangeRate > 0 && (
                    <div className="flex justify-between text-xs text-muted-foreground italic">
                      <span>≈ {secondaryCurrency}</span>
                      <span className="font-mono">{formatCurrency(total * exchangeRate, secondaryCurrency)}</span>
                    </div>
                  )}
                  {paymentMethod === "cash" && numpadValue && parseFloat(numpadValue) > 0 && (
                    <>
                      <div className="flex justify-between text-muted-foreground">
                        <span>Tendered</span><span className="font-mono">{formatCurrency(parseFloat(numpadValue))}</span>
                      </div>
                      <div className={`flex justify-between font-semibold ${parseFloat(numpadValue) >= total ? "text-emerald-400" : "text-red-400"}`}>
                        <span>{parseFloat(numpadValue) >= total ? "Change" : "Short"}</span>
                        <span className="font-mono">{formatCurrency(Math.abs(parseFloat(numpadValue) - total))}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Numpad */}
          <div className="p-2 border-b border-border shrink-0">
            <div className="font-mono text-base font-bold text-center bg-secondary/50 rounded-md py-1.5 mb-2 tracking-wider">
              {paymentMethod === "cash"
                ? (numpadValue ? `${baseCurrency} ${numpadValue}` : "— Cash —")
                : <span className="text-muted-foreground text-xs font-normal">Select Cash to use keypad</span>}
            </div>
            <div className="grid grid-cols-3 gap-1">
              {(["7","8","9","4","5","6","1","2","3",".","0","⌫"] as const).map((k) => (
                <button key={k}
                  onClick={() => {
                    if (k === "⌫") { setNumpadValue((v) => v.slice(0, -1)); }
                    else if (k === ".") { setNumpadValue((v) => v.includes(".") ? v : v + "."); }
                    else {
                      setNumpadValue((v) => {
                        const next = v + k;
                        const [int, dec] = next.split(".");
                        if (dec !== undefined && dec.length > 2) return v;
                        if (int.length > 5) return v;
                        return next;
                      });
                    }
                  }}
                  disabled={paymentMethod !== "cash"}
                  className={`h-9 rounded-md text-sm font-semibold border border-border transition-all active:scale-95 ${k === "⌫" ? "text-red-400 hover:bg-red-500/10" : "hover:bg-secondary/80"} ${paymentMethod !== "cash" ? "opacity-25 cursor-not-allowed" : ""}`}
                >
                  {k}
                </button>
              ))}
            </div>
            {paymentMethod === "cash" && (
              <div className="grid grid-cols-4 gap-1 mt-1">
                {[
                  { label: "Exact", val: total.toFixed(2) },
                  { label: "$20", val: "20.00" },
                  { label: "$50", val: "50.00" },
                  { label: "$100", val: "100.00" },
                ].map(({ label, val }) => (
                  <button key={label} onClick={() => setNumpadValue(val)}
                    className="h-7 rounded text-[10px] font-medium border border-border hover:bg-secondary/80 active:scale-95 transition-all">
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Payment & action buttons */}
          <div className="p-2 space-y-1.5 shrink-0">
            <div className="flex gap-1.5">
              <Button variant={paymentMethod === "card" ? "default" : "outline"} onClick={() => { setPaymentMethod("card"); setNumpadValue(""); }} className="flex-1 h-9 text-xs">
                <CreditCard className="h-3.5 w-3.5 mr-1" />Card
              </Button>
              <Button variant={paymentMethod === "cash" ? "default" : "outline"} onClick={() => setPaymentMethod("cash")} className="flex-1 h-9 text-xs">
                <Banknote className="h-3.5 w-3.5 mr-1" />Cash
              </Button>
              <Button variant={paymentMethod === "split" ? "default" : "outline"} onClick={handleSplitClick} className="flex-1 h-9 text-xs">
                <SplitSquareHorizontal className="h-3.5 w-3.5 mr-1" />Split
              </Button>
            </div>

            {paymentMethod === "split" && (
              <div className="flex gap-1.5 bg-secondary/50 p-1.5 rounded-md">
                <div className="flex-1 space-y-0.5">
                  <label className="text-[10px] text-muted-foreground">Card $</label>
                  <Input type="number" value={splitCardAmount} onChange={(e) => setSplitCardAmount(Number(e.target.value))} className="h-7 font-mono text-xs" />
                </div>
                <div className="flex-1 space-y-0.5">
                  <label className="text-[10px] text-muted-foreground">Cash $</label>
                  <Input type="number" value={splitCashAmount} onChange={(e) => setSplitCashAmount(Number(e.target.value))} className="h-7 font-mono text-xs" />
                </div>
              </div>
            )}
            {paymentMethod === "split" && !isSplitValid && (
              <p className="text-amber-500 text-[10px] font-medium">Must equal {formatCurrency(total, baseCurrency)}</p>
            )}

            {orderMode === "dine-in" && (
              <Button variant="outline" className="w-full h-9 text-xs border-amber-500/50 text-amber-400 hover:bg-amber-500/10"
                onClick={handleSendToKitchen} disabled={cart.length === 0 || createOrder.isPending}>
                <ChefHat className="mr-1.5 h-3.5 w-3.5" />Send to Kitchen (Pay Later)
              </Button>
            )}
            <Button className="w-full h-12 text-base shadow-lg shadow-primary/20" size="lg" onClick={handleCharge}
              disabled={cart.length === 0 || createOrder.isPending || (paymentMethod === "split" && !isSplitValid)}>
              {createOrder.isPending ? "Processing…" : `Charge ${formatCurrency(total, baseCurrency)}`}
            </Button>
          </div>
        </div>
      </div>

      {/* Customization dialog */}
      {customizingProductId !== null && (
        <CustomizeDialog
          productId={customizingProductId}
          open={customizingProductId !== null}
          onClose={() => setCustomizingProductId(null)}
          onConfirm={handleCustomizeConfirm}
        />
      )}

      {/* Receipt Modal */}
      <Dialog open={!!receiptOrder} onOpenChange={(o) => !o && setReceiptOrder(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-400">
              <CheckCircle2 className="h-5 w-5" />
              Payment Successful
            </DialogTitle>
          </DialogHeader>

          {receiptOrder && (
            <div className="space-y-4 text-sm" id="receipt-print-area">
              <div className="text-center py-2 border-b border-border">
                <p className="font-bold text-base">NEXXUS POS</p>
                <p className="text-xs text-muted-foreground">Your Business, Connected.</p>
                <p className="text-xs text-muted-foreground mt-1">{format(new Date(receiptOrder.createdAt), "MMM d, yyyy h:mm a")}</p>
                <p className="font-mono text-xs mt-1">{receiptOrder.orderNumber}</p>
              </div>

              <div className="space-y-1">
                {receiptOrder.items.map((item) => (
                  <div key={item.id}>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{item.productName} × {item.quantity}</span>
                      <span className="font-mono">{formatCurrency(item.lineTotal)}</span>
                    </div>
                    {item.variantChoices && item.variantChoices.length > 0 && (
                      <p className="text-xs text-primary/70 pl-2">↳ {(item.variantChoices as ChoiceItem[]).map((c) => c.optionName).join(", ")}</p>
                    )}
                    {item.modifierChoices && item.modifierChoices.length > 0 && (
                      <p className="text-xs text-amber-400/80 pl-2">↳ + {(item.modifierChoices as ChoiceItem[]).map((c) => c.optionName).join(", ")}</p>
                    )}
                  </div>
                ))}
              </div>

              <div className="border-t border-dashed border-border pt-2 space-y-1">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span className="font-mono">{formatCurrency(receiptOrder.subtotal)}</span>
                </div>
                {receiptOrder.discountValue && receiptOrder.discountValue > 0 && (
                  <div className="flex justify-between text-amber-400">
                    <span>Discount</span>
                    <span className="font-mono">-{formatCurrency(receiptOrder.discountValue)}</span>
                  </div>
                )}
                <div className="flex justify-between text-muted-foreground">
                  <span>Tax</span>
                  <span className="font-mono">{formatCurrency(receiptOrder.tax)}</span>
                </div>
                <div className="flex justify-between font-bold text-base pt-1 border-t border-border">
                  <span>Total</span>
                  <span className="font-mono text-primary">{formatCurrency(receiptOrder.total, baseCurrency)}</span>
                </div>
                {secondaryCurrency && exchangeRate > 0 && (
                  <div className="flex justify-between text-xs text-muted-foreground italic pt-0.5">
                    <span>≈ {secondaryCurrency}</span>
                    <span className="font-mono">{formatCurrency(receiptOrder.total * exchangeRate, secondaryCurrency)}</span>
                  </div>
                )}
              </div>

              <div className="border-t border-border pt-2 space-y-1">
                {receiptOrder.paymentMethod === "split" ? (
                  <>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Card</span>
                      <span className="font-mono">{formatCurrency(receiptOrder.splitCardAmount ?? 0)}</span>
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Cash</span>
                      <span className="font-mono">{formatCurrency(receiptOrder.splitCashAmount ?? 0)}</span>
                    </div>
                  </>
                ) : (
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Payment</span>
                    <span className="capitalize">{receiptOrder.paymentMethod ?? "—"}</span>
                  </div>
                )}
                {receiptOrder.paymentMethod === "cash" && receiptOrder.cashTendered != null && receiptOrder.cashTendered > 0 && (
                  <>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Cash Tendered</span>
                      <span className="font-mono">{formatCurrency(receiptOrder.cashTendered)}</span>
                    </div>
                    <div className="flex justify-between text-xs font-semibold text-emerald-400">
                      <span>Change Due</span>
                      <span className="font-mono">{formatCurrency(Math.max(0, receiptOrder.cashTendered - receiptOrder.total))}</span>
                    </div>
                  </>
                )}
                {receiptOrder.notes && (
                  <div className="text-xs text-muted-foreground mt-1">
                    <span className="font-medium">Note:</span> {receiptOrder.notes}
                  </div>
                )}
              </div>

              <p className="text-center text-xs text-muted-foreground pt-2 border-t border-border">Powered by MicroBooks</p>
            </div>
          )}

          {receiptEmailOpen && receiptOrder && (
            <div className="border border-border rounded-lg p-3 bg-muted/40 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Email receipt to:</p>
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="customer@email.com"
                  value={receiptEmailAddr}
                  onChange={(e) => setReceiptEmailAddr(e.target.value)}
                  className="h-8 text-sm"
                />
                <Button
                  size="sm"
                  disabled={!receiptEmailAddr || sendReceiptEmail.isPending}
                  onClick={() => {
                    if (!receiptOrder) return;
                    sendReceiptEmail.mutate(
                      { data: { orderId: receiptOrder.id, to: receiptEmailAddr } },
                      {
                        onSuccess: () => {
                          toast({ title: "Receipt sent!", description: `Sent to ${receiptEmailAddr}` });
                          setReceiptEmailOpen(false);
                          setReceiptEmailAddr("");
                        },
                        onError: () => toast({ title: "Failed to send", description: "Check that email is configured.", variant: "destructive" }),
                      }
                    );
                  }}
                >
                  {sendReceiptEmail.isPending ? "Sending…" : "Send"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setReceiptEmailOpen(false)}>✕</Button>
              </div>
            </div>
          )}

          {whatsappOpen && receiptOrder && (
            <div className="border border-green-500/30 rounded-lg p-3 bg-green-500/5 space-y-2">
              <p className="text-xs font-medium text-green-400">WhatsApp receipt to:</p>
              <div className="flex gap-2">
                <Input
                  type="tel"
                  placeholder="+1 876 555 0123"
                  value={whatsappPhone}
                  onChange={(e) => setWhatsappPhone(e.target.value)}
                  className="h-8 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && whatsappPhone.replace(/\D/g, "").length >= 7) {
                      openWhatsAppReceipt(whatsappPhone, receiptOrder, settings ?? {});
                      setWhatsappOpen(false);
                    }
                  }}
                />
                <Button
                  size="sm"
                  disabled={whatsappPhone.replace(/\D/g, "").length < 7}
                  className="gap-1.5 bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => {
                    if (!receiptOrder) return;
                    openWhatsAppReceipt(whatsappPhone, receiptOrder, settings ?? {});
                    setWhatsappOpen(false);
                    toast({ title: "Opening WhatsApp…", description: "Receipt text is pre-filled and ready to send." });
                  }}
                >
                  Send
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setWhatsappOpen(false)}>✕</Button>
              </div>
              <p className="text-[10px] text-muted-foreground">Include country code, e.g. +1876 for Jamaica</p>
            </div>
          )}

          <DialogFooter className="flex-wrap gap-2 sm:gap-1.5">
            <Button variant="outline" onClick={() => receiptOrder && printReceiptWindow(receiptOrder, settings ?? {})} className="gap-2 flex-1">
              <Printer className="h-4 w-4" />Print
            </Button>
            <Button
              variant="outline"
              onClick={() => { setReceiptEmailOpen(v => !v); setWhatsappOpen(false); setReceiptEmailAddr(""); }}
              className="gap-2 flex-1"
            >
              <Mail className="h-4 w-4" />Email
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setWhatsappOpen(v => !v);
                setReceiptEmailOpen(false);
                if (!whatsappOpen) {
                  setWhatsappPhone(selectedCustomerOverride?.phone ?? "");
                }
              }}
              className="gap-1.5 flex-1 border-green-500/40 text-green-400 hover:bg-green-500/10 hover:text-green-300"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              WhatsApp
            </Button>
            <Button onClick={() => { setReceiptOrder(null); setReceiptEmailOpen(false); setWhatsappOpen(false); setReceiptEmailAddr(""); setWhatsappPhone(""); }} className="flex-1">New Sale</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Subscription expiry popup — fires on management role PIN login */}
      <Dialog open={expiryPopupOpen} onOpenChange={setExpiryPopupOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-400">
              <AlertTriangle className="h-5 w-5" />
              Plan Expiring Soon
            </DialogTitle>
          </DialogHeader>

          <div className="py-3 space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              Your NEXXUS POS subscription is expiring. Renew now to avoid any interruption to your business.
            </p>

            {expiryCountdown && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
                <p className="text-xs text-amber-400/70 text-center mb-2 uppercase tracking-widest">Time remaining</p>
                <div className="grid grid-cols-4 gap-2 text-center">
                  {[
                    { label: "Days", value: expiryCountdown.days },
                    { label: "Hours", value: expiryCountdown.hours },
                    { label: "Mins", value: expiryCountdown.minutes },
                    { label: "Secs", value: expiryCountdown.seconds },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-black/30 rounded-lg py-2">
                      <div className={`text-2xl font-bold font-mono tabular-nums ${value <= 0 && label === "Days" ? "text-red-400" : "text-amber-300"}`}>
                        {String(value).padStart(2, "0")}
                      </div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {expiryCountdown && expiryCountdown.days <= 3 && (
              <p className="text-xs text-red-400 text-center font-medium">
                ⚠ Critical: Less than 3 days remaining. Renew immediately to avoid service disruption.
              </p>
            )}
          </div>

          <DialogFooter className="gap-2 flex-col sm:flex-row">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setExpiryPopupOpen(false)}
            >
              Remind Me Later
            </Button>
            <Button
              className="flex-1 bg-amber-500 hover:bg-amber-400 text-black font-semibold"
              onClick={() => { setExpiryPopupOpen(false); navigate("/subscription"); }}
            >
              Renew Now →
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
