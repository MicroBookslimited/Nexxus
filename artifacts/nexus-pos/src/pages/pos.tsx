import { useState, useMemo, KeyboardEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  useListProducts,
  useCreateOrder,
  useListHeldOrders,
  useCreateHeldOrder,
  useDeleteHeldOrder,
  useGetProductCustomization,
} from "@workspace/api-client-react";
import type { GetOrderResponse } from "@workspace/api-zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Search, CreditCard, Banknote, Trash2, ShoppingCart, ScanBarcode,
  Minus, Plus, Percent, DollarSign, SplitSquareHorizontal, SaveAll,
  Download, Printer, CheckCircle2, Settings2,
} from "lucide-react";
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

function formatCurrency(val: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(val);
}

function choiceLabel(choices: ChoiceItem[]) {
  return choices.map((c) => c.optionName).join(", ");
}

const CARD_PALETTES = [
  { bg: "from-blue-600/20 to-blue-800/10", accent: "border-blue-500/40", dot: "bg-blue-500" },
  { bg: "from-violet-600/20 to-violet-800/10", accent: "border-violet-500/40", dot: "bg-violet-500" },
  { bg: "from-emerald-600/20 to-emerald-800/10", accent: "border-emerald-500/40", dot: "bg-emerald-500" },
  { bg: "from-amber-600/20 to-amber-800/10", accent: "border-amber-500/40", dot: "bg-amber-500" },
  { bg: "from-rose-600/20 to-rose-800/10", accent: "border-rose-500/40", dot: "bg-rose-500" },
  { bg: "from-cyan-600/20 to-cyan-800/10", accent: "border-cyan-500/40", dot: "bg-cyan-500" },
  { bg: "from-pink-600/20 to-pink-800/10", accent: "border-pink-500/40", dot: "bg-pink-500" },
  { bg: "from-indigo-600/20 to-indigo-800/10", accent: "border-indigo-500/40", dot: "bg-indigo-500" },
  { bg: "from-teal-600/20 to-teal-800/10", accent: "border-teal-500/40", dot: "bg-teal-500" },
  { bg: "from-orange-600/20 to-orange-800/10", accent: "border-orange-500/40", dot: "bg-orange-500" },
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

/* ─── Main POS component ─── */
export function POS() {
  const { data: products, isLoading: loadingProducts } = useListProducts();
  const createOrder = useCreateOrder();

  const { data: heldOrders } = useListHeldOrders();
  const createHeldOrder = useCreateHeldOrder();
  const deleteHeldOrder = useDeleteHeldOrder();

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [searchTerm, setSearchTerm] = useState("");
  const [barcodeTerm, setBarcodeTerm] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<"card" | "cash" | "split">("card");

  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  const [discountType, setDiscountType] = useState<"percent" | "fixed" | null>(null);
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [notes, setNotes] = useState("");

  const [splitCardAmount, setSplitCardAmount] = useState<number>(0);
  const [splitCashAmount, setSplitCashAmount] = useState<number>(0);
  const [receiptOrder, setReceiptOrder] = useState<GetOrderResponse | null>(null);

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

  const discountedSubtotal = subtotal - cartDiscountValue;
  const tax = discountedSubtotal * 0.08;
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
  };

  const handleCharge = () => {
    if (cart.length === 0) return;
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
          discountType: discountType ?? undefined,
          discountAmount: discountAmount > 0 ? discountAmount : undefined,
          notes: notes || undefined,
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

  return (
    <>
      <div className="flex h-full">
        {/* Product grid */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-border">
          {/* Search & filters */}
          <div className="p-4 border-b border-border space-y-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input className="pl-9" placeholder="Search products…" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
              </div>
              <div className="relative">
                <ScanBarcode className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input className="pl-9 w-44" placeholder="Scan barcode…" value={barcodeTerm} onChange={(e) => setBarcodeTerm(e.target.value)} onKeyDown={handleBarcodeScan} />
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
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 p-4">
              {loadingProducts
                ? Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="h-28 rounded-xl bg-secondary/30 animate-pulse" />
                  ))
                : filteredProducts?.map((product) => {
                    const palette = getProductPalette(product.id);
                    return (
                      <motion.div key={product.id} whileTap={{ scale: 0.95 }} whileHover={{ scale: 1.02 }}>
                        <div
                          onClick={() => !product.inStock ? undefined : handleProductTap(product)}
                          className={`relative cursor-pointer rounded-xl border bg-gradient-to-br ${palette.bg} ${palette.accent} h-28 p-3 flex flex-col justify-between transition-all duration-150 ${!product.inStock ? "opacity-40 cursor-not-allowed" : "hover:shadow-lg hover:shadow-black/20 active:scale-95"}`}
                        >
                          <div className={`absolute top-2.5 right-2.5 h-2 w-2 rounded-full ${palette.dot} opacity-70`} />
                          <div className="pr-4">
                            <p className="text-sm font-bold leading-snug line-clamp-2 text-white">{product.name}</p>
                            <p className="text-[11px] text-white/50 mt-0.5">{product.category}</p>
                          </div>
                          <div className="flex items-end justify-between">
                            <p className="text-base font-bold font-mono text-white">{formatCurrency(product.price)}</p>
                            <div className="flex items-center gap-1">
                              {(product.hasVariants || product.hasModifiers) && (
                                <Settings2 className="h-3.5 w-3.5 text-white/60" />
                              )}
                              {!product.inStock && (
                                <span className="text-[10px] font-semibold bg-red-500/30 text-red-300 px-1.5 py-0.5 rounded">Out</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
            </div>
          </ScrollArea>
        </div>

        {/* Cart sidebar */}
        <div className="w-[340px] shrink-0 flex flex-col bg-card">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-primary" />
              <span className="font-semibold text-sm">Cart</span>
              {cart.length > 0 && <Badge className="h-5 text-[10px] px-1.5">{cart.reduce((s, i) => s + i.quantity, 0)}</Badge>}
            </div>
            <div className="flex gap-1.5">
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

          <ScrollArea className="flex-1 px-3 py-2">
            <AnimatePresence initial={false}>
              {cart.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
                  <ShoppingCart className="h-8 w-8 opacity-30" />
                  <p className="text-sm">Cart is empty</p>
                </div>
              ) : (
                cart.map((item) => (
                  <motion.div key={item.cartKey} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} className="mb-2">
                    <div className="rounded-lg bg-secondary/30 p-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium leading-snug truncate">{item.productName}</p>
                          {item.variantChoices.length > 0 && (
                            <p className="text-xs text-primary/80 mt-0.5">{choiceLabel(item.variantChoices)}</p>
                          )}
                          {item.modifierChoices.length > 0 && (
                            <p className="text-xs text-amber-400/90 mt-0.5">+ {choiceLabel(item.modifierChoices)}</p>
                          )}
                          <p className="text-xs font-mono text-primary mt-1">{formatCurrency(item.effectivePrice)} ea</p>
                        </div>
                        <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive shrink-0" onClick={() => removeFromCart(item.cartKey)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <Button size="icon" variant="outline" className="h-6 w-6" onClick={() => updateQuantity(item.cartKey, -1)}>
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="text-sm font-bold w-5 text-center">{item.quantity}</span>
                        <Button size="icon" variant="outline" className="h-6 w-6" onClick={() => updateQuantity(item.cartKey, 1)}>
                          <Plus className="h-3 w-3" />
                        </Button>
                        <span className="ml-auto text-sm font-mono font-semibold">{formatCurrency(item.effectivePrice * item.quantity - item.itemDiscount)}</span>
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </ScrollArea>

          {/* Totals & payment */}
          <div className="border-t border-border p-3 space-y-2.5">
            {/* Discount */}
            <div className="flex gap-2">
              <Button size="sm" variant={discountType === "percent" ? "default" : "outline"} className="flex-1 h-8 text-xs" onClick={() => setDiscountType(discountType === "percent" ? null : "percent")}>
                <Percent className="h-3 w-3 mr-1" />%
              </Button>
              <Button size="sm" variant={discountType === "fixed" ? "default" : "outline"} className="flex-1 h-8 text-xs" onClick={() => setDiscountType(discountType === "fixed" ? null : "fixed")}>
                <DollarSign className="h-3 w-3 mr-1" />Fixed
              </Button>
              {discountType && (
                <Input
                  type="number"
                  min={0}
                  className="flex-1 h-8 text-xs font-mono"
                  placeholder={discountType === "percent" ? "%" : "$"}
                  value={discountAmount || ""}
                  onChange={(e) => setDiscountAmount(Number(e.target.value))}
                />
              )}
            </div>

            {/* Notes */}
            <Textarea
              className="text-xs resize-none h-14"
              placeholder="Order notes…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />

            <Separator />

            <div className="space-y-1 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span className="font-mono">{formatCurrency(subtotal)}</span>
              </div>
              {cartDiscountValue > 0 && (
                <div className="flex justify-between text-amber-400">
                  <span>Discount</span>
                  <span className="font-mono">-{formatCurrency(cartDiscountValue)}</span>
                </div>
              )}
              <div className="flex justify-between text-muted-foreground">
                <span>Tax (8%)</span>
                <span className="font-mono">{formatCurrency(tax)}</span>
              </div>
              <div className="flex justify-between font-bold text-base pt-1 border-t border-border">
                <span>Total</span>
                <span className="font-mono text-primary">{formatCurrency(total)}</span>
              </div>
            </div>

            {/* Payment method */}
            <div className="flex gap-2">
              <Button variant={paymentMethod === "card" ? "default" : "outline"} onClick={() => setPaymentMethod("card")} className="flex-1 h-10">
                <CreditCard className="mr-2 h-4 w-4" />Card
              </Button>
              <Button variant={paymentMethod === "cash" ? "default" : "outline"} onClick={() => setPaymentMethod("cash")} className="flex-1 h-10">
                <Banknote className="mr-2 h-4 w-4" />Cash
              </Button>
              <Button variant={paymentMethod === "split" ? "default" : "outline"} onClick={handleSplitClick} className="flex-1 h-10">
                <SplitSquareHorizontal className="mr-2 h-4 w-4" />Split
              </Button>
            </div>

            {paymentMethod === "split" && (
              <div className="flex gap-2 items-center bg-secondary/50 p-2 rounded-md">
                <div className="flex-1 space-y-1">
                  <label className="text-xs text-muted-foreground">Card $</label>
                  <Input type="number" value={splitCardAmount} onChange={(e) => setSplitCardAmount(Number(e.target.value))} className="h-8 font-mono text-sm" />
                </div>
                <div className="flex-1 space-y-1">
                  <label className="text-xs text-muted-foreground">Cash $</label>
                  <Input type="number" value={splitCashAmount} onChange={(e) => setSplitCashAmount(Number(e.target.value))} className="h-8 font-mono text-sm" />
                </div>
              </div>
            )}
            {paymentMethod === "split" && !isSplitValid && (
              <p className="text-amber-500 text-xs font-medium">Split amounts must equal total ({formatCurrency(total)})</p>
            )}

            <Button
              className="w-full h-14 text-lg shadow-lg shadow-primary/20 mt-2"
              size="lg"
              onClick={handleCharge}
              disabled={cart.length === 0 || createOrder.isPending || (paymentMethod === "split" && !isSplitValid)}
            >
              {createOrder.isPending ? "Processing…" : `Charge ${formatCurrency(total)}`}
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
                <p className="font-bold text-base">Nexus POS</p>
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
                  <span className="font-mono text-primary">{formatCurrency(receiptOrder.total)}</span>
                </div>
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
                {receiptOrder.notes && (
                  <div className="text-xs text-muted-foreground mt-1">
                    <span className="font-medium">Note:</span> {receiptOrder.notes}
                  </div>
                )}
              </div>

              <p className="text-center text-xs text-muted-foreground pt-2 border-t border-border">Powered by MicroBooks</p>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => window.print()} className="gap-2 flex-1">
              <Printer className="h-4 w-4" />Print
            </Button>
            <Button onClick={() => setReceiptOrder(null)} className="flex-1">New Sale</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
