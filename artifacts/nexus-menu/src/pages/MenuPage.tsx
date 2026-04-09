import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { ShoppingCart, Plus, Minus, Trash2, ChevronLeft, ChefHat, CheckCircle2, X, Star } from "lucide-react";
import { fetchMenu, fetchSettings, submitOrder } from "@/lib/api";
import type { MenuItem, VariantGroup, ModifierGroup } from "@/lib/api";
import type { CartItem, CartItemCustomization } from "@/lib/cart";
import { buildCartId, calcUnitPrice } from "@/lib/cart";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

function useSearchParams() {
  const params = new URLSearchParams(window.location.search);
  return params;
}

function useSlug() {
  const params = useSearchParams();
  return params.get("slug") || params.get("business") || "demo";
}

function useMode(): "kiosk" | "online" {
  const params = useSearchParams();
  const m = params.get("mode");
  return m === "kiosk" ? "kiosk" : "online";
}

function formatCurrency(amount: number, currency = "JMD") {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

interface CustomizationDialogProps {
  item: MenuItem | null;
  onClose: () => void;
  onAdd: (item: MenuItem, qty: number, customization: CartItemCustomization) => void;
  currency: string;
}

function CustomizationDialog({ item, onClose, onAdd, currency }: CustomizationDialogProps) {
  const [qty, setQty] = useState(1);
  const [selectedVariants, setSelectedVariants] = useState<Record<number, number>>({});
  const [selectedModifiers, setSelectedModifiers] = useState<Record<number, Set<number>>>({});

  if (!item) return null;

  const missingRequired = item.variantGroups
    .filter(g => g.isRequired)
    .some(g => !selectedVariants[g.id]);

  const handleVariant = (groupId: number, optId: number) => {
    setSelectedVariants(prev => ({ ...prev, [groupId]: optId }));
  };

  const handleModifier = (groupId: number, optId: number, isMulti: boolean) => {
    setSelectedModifiers(prev => {
      const next = { ...prev };
      if (isMulti) {
        const s = new Set(next[groupId] ?? []);
        s.has(optId) ? s.delete(optId) : s.add(optId);
        next[groupId] = s;
      } else {
        const s = new Set(next[groupId] ?? []);
        next[groupId] = s.has(optId) ? new Set() : new Set([optId]);
      }
      return next;
    });
  };

  const buildCustomization = (): CartItemCustomization => {
    const variantChoices = item.variantGroups.flatMap(g => {
      const selId = selectedVariants[g.id];
      const opt = g.options.find(o => o.id === selId);
      if (!opt) return [];
      return [{ optionId: opt.id, optionName: opt.name, groupName: g.name, priceAdjustment: opt.priceAdjustment }];
    });
    const modifierChoices = item.modifierGroups.flatMap(g => {
      return [...(selectedModifiers[g.id] ?? [])].flatMap(optId => {
        const opt = g.options.find(o => o.id === optId);
        if (!opt) return [];
        return [{ optionId: opt.id, optionName: opt.name, groupName: g.name, priceAdjustment: opt.priceAdjustment }];
      });
    });
    return { variantChoices, modifierChoices };
  };

  const customization = buildCustomization();
  const unitPrice = calcUnitPrice(item, customization);
  const totalPrice = unitPrice * qty;

  const handleAdd = () => {
    if (missingRequired) return;
    onAdd(item, qty, customization);
    onClose();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] flex flex-col bg-[#0f1729] border-[#1e2d4a] text-white">
        <DialogHeader>
          <DialogTitle className="text-xl">{item.name}</DialogTitle>
          {item.description && <p className="text-sm text-slate-400 mt-1">{item.description}</p>}
        </DialogHeader>
        <ScrollArea className="flex-1 -mx-1 px-1">
          <div className="space-y-4 py-2">
            {item.variantGroups.map(g => (
              <div key={g.id}>
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-sm font-semibold text-slate-200">{g.name}</p>
                  {g.isRequired && <Badge variant="outline" className="text-xs border-blue-500 text-blue-400">Required</Badge>}
                </div>
                <div className="space-y-1">
                  {g.options.map(o => (
                    <button
                      key={o.id}
                      onClick={() => handleVariant(g.id, o.id)}
                      className={`w-full flex justify-between items-center p-2.5 rounded-lg border text-sm transition-colors ${selectedVariants[g.id] === o.id ? "border-blue-500 bg-blue-500/10 text-white" : "border-[#1e2d4a] text-slate-300 hover:border-blue-400"}`}
                    >
                      <span>{o.name}</span>
                      {o.priceAdjustment !== 0 && <span className="text-xs text-blue-400">+{formatCurrency(o.priceAdjustment, currency)}</span>}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            {item.modifierGroups.map(g => (
              <div key={g.id}>
                <p className="text-sm font-semibold text-slate-200 mb-2">{g.name}</p>
                <div className="space-y-1">
                  {g.options.map(o => {
                    const sel = selectedModifiers[g.id]?.has(o.id) ?? false;
                    return (
                      <button
                        key={o.id}
                        onClick={() => handleModifier(g.id, o.id, g.isMultiSelect)}
                        className={`w-full flex justify-between items-center p-2.5 rounded-lg border text-sm transition-colors ${sel ? "border-blue-500 bg-blue-500/10 text-white" : "border-[#1e2d4a] text-slate-300 hover:border-blue-400"}`}
                      >
                        <span>{o.name}</span>
                        {o.priceAdjustment !== 0 && <span className="text-xs text-blue-400">+{formatCurrency(o.priceAdjustment, currency)}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="border-t border-[#1e2d4a] pt-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => setQty(q => Math.max(1, q - 1))} className="w-8 h-8 rounded-full border border-[#1e2d4a] flex items-center justify-center hover:border-blue-500 transition-colors">
                <Minus className="w-4 h-4" />
              </button>
              <span className="w-8 text-center font-semibold text-lg">{qty}</span>
              <button onClick={() => setQty(q => q + 1)} className="w-8 h-8 rounded-full border border-[#1e2d4a] flex items-center justify-center hover:border-blue-500 transition-colors">
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <span className="text-lg font-bold text-blue-400">{formatCurrency(totalPrice, currency)}</span>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={onClose} className="flex-1 border-[#1e2d4a] bg-transparent">Cancel</Button>
            <Button
              onClick={handleAdd}
              disabled={missingRequired}
              className="flex-1 bg-blue-600 hover:bg-blue-500"
            >
              Add to Order
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type PageView = "menu" | "cart" | "checkout" | "confirmation";

export default function MenuPage() {
  const slug = useSlug();
  const mode = useMode();
  const { toast } = useToast();

  const [view, setView] = useState<PageView>("menu");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customizingItem, setCustomizingItem] = useState<MenuItem | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [orderResult, setOrderResult] = useState<{ orderNumber: string; total: number } | null>(null);

  const { data: menu, isLoading: loadingMenu, error: menuError } = useQuery({
    queryKey: ["public-menu", slug],
    queryFn: () => fetchMenu(slug),
    enabled: !!slug,
  });

  const { data: settings } = useQuery({
    queryKey: ["public-settings", slug],
    queryFn: () => fetchSettings(slug),
    enabled: !!slug,
  });

  const currency = settings?.base_currency || "JMD";
  const taxRate = parseFloat(settings?.tax_rate || "15") / 100;
  const businessName = settings?.business_name || "Our Menu";

  const filteredProducts = useMemo(() => {
    if (!menu) return [];
    return menu.products.filter(p => {
      if (activeCategory && p.category !== activeCategory) return false;
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [menu, activeCategory, search]);

  const cartTotal = useMemo(() => {
    const subtotal = cart.reduce((s, i) => s + i.lineTotal, 0);
    const tax = subtotal * taxRate;
    return { subtotal, tax, total: subtotal + tax };
  }, [cart, taxRate]);

  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);

  const addToCart = (item: MenuItem, qty: number, customization: CartItemCustomization) => {
    const unitPrice = calcUnitPrice(item, customization);
    const cartId = buildCartId(item.id, customization);
    setCart(prev => {
      const existing = prev.find(c => c.cartId === cartId);
      if (existing) {
        return prev.map(c => c.cartId === cartId
          ? { ...c, quantity: c.quantity + qty, lineTotal: (c.quantity + qty) * c.unitPrice }
          : c
        );
      }
      return [...prev, { cartId, product: item, quantity: qty, customization, unitPrice, lineTotal: unitPrice * qty }];
    });
    toast({ title: `Added ${item.name}`, description: `${qty} × ${formatCurrency(unitPrice, currency)}` });
  };

  const updateQty = (cartId: string, delta: number) => {
    setCart(prev => prev.flatMap(c => {
      if (c.cartId !== cartId) return [c];
      const newQty = c.quantity + delta;
      if (newQty <= 0) return [];
      return [{ ...c, quantity: newQty, lineTotal: newQty * c.unitPrice }];
    }));
  };

  const removeItem = (cartId: string) => {
    setCart(prev => prev.filter(c => c.cartId !== cartId));
  };

  const placeOrder = useMutation({
    mutationFn: () => submitOrder(slug, {
      items: cart.map(c => ({
        productId: c.product.id,
        quantity: c.quantity,
        variantChoices: c.customization.variantChoices,
        modifierChoices: c.customization.modifierChoices,
      })),
      customerName: customerName || undefined,
      customerEmail: customerEmail || undefined,
      notes: notes || undefined,
      orderType: mode,
    }),
    onSuccess: (result) => {
      setOrderResult({ orderNumber: result.orderNumber, total: result.total });
      setCart([]);
      setView("confirmation");
    },
    onError: (err: Error) => {
      toast({ title: "Order failed", description: err.message, variant: "destructive" });
    },
  });

  if (loadingMenu) {
    return (
      <div className="min-h-screen bg-[#0f1729] flex items-center justify-center">
        <div className="text-center">
          <ChefHat className="w-12 h-12 text-blue-500 mx-auto mb-4 animate-pulse" />
          <p className="text-slate-400">Loading menu…</p>
        </div>
      </div>
    );
  }

  if (menuError || !menu) {
    return (
      <div className="min-h-screen bg-[#0f1729] flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <p className="text-2xl text-white font-bold">Menu not found</p>
          <p className="text-slate-400 text-sm">Check that the business slug is correct.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f1729] text-white flex flex-col max-w-2xl mx-auto">
      <header className="sticky top-0 z-40 bg-[#0f1729]/95 backdrop-blur border-b border-[#1e2d4a] px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {(view === "cart" || view === "checkout") && (
              <button onClick={() => setView(view === "checkout" ? "cart" : "menu")} className="text-slate-400 hover:text-white transition-colors">
                <ChevronLeft className="w-6 h-6" />
              </button>
            )}
            <div>
              <h1 className="text-lg font-bold">{businessName}</h1>
              {mode === "kiosk" && <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full">Kiosk</span>}
              {mode === "online" && <span className="text-xs bg-emerald-600 text-white px-2 py-0.5 rounded-full">Online Order</span>}
            </div>
          </div>
          {view === "menu" && cartCount > 0 && (
            <button
              onClick={() => setView("cart")}
              className="relative flex items-center gap-2 bg-blue-600 hover:bg-blue-500 transition-colors px-4 py-2 rounded-full text-sm font-semibold"
            >
              <ShoppingCart className="w-4 h-4" />
              <span>View Cart</span>
              <span className="ml-1 bg-white text-blue-600 rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold">{cartCount}</span>
            </button>
          )}
        </div>
      </header>

      <AnimatePresence mode="wait">
        {view === "menu" && (
          <motion.div key="menu" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col">
            <div className="px-4 pt-3 pb-2 space-y-3">
              <Input
                placeholder="Search items…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="bg-[#131f35] border-[#1e2d4a] text-white placeholder:text-slate-500"
              />
              {menu.categories.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                  <button
                    onClick={() => setActiveCategory(null)}
                    className={`whitespace-nowrap px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${activeCategory === null ? "bg-blue-600 text-white" : "bg-[#131f35] text-slate-400 hover:text-white"}`}
                  >
                    All
                  </button>
                  {menu.categories.map(cat => (
                    <button
                      key={cat}
                      onClick={() => setActiveCategory(cat === activeCategory ? null : cat)}
                      className={`whitespace-nowrap px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${activeCategory === cat ? "bg-blue-600 text-white" : "bg-[#131f35] text-slate-400 hover:text-white"}`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <ScrollArea className="flex-1">
              <div className="px-4 pb-6 space-y-3">
                {filteredProducts.length === 0 && (
                  <div className="text-center py-12 text-slate-500">No items found.</div>
                )}
                {filteredProducts.map(product => (
                  <motion.button
                    key={product.id}
                    layoutId={`product-${product.id}`}
                    onClick={() => {
                      if (product.variantGroups.length > 0 || product.modifierGroups.length > 0) {
                        setCustomizingItem(product);
                      } else {
                        addToCart(product, 1, { variantChoices: [], modifierChoices: [] });
                      }
                    }}
                    className="w-full text-left flex gap-3 bg-[#131f35] hover:bg-[#1a2844] border border-[#1e2d4a] hover:border-blue-500/40 rounded-xl p-3 transition-all"
                  >
                    {product.imageUrl && (
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        className="w-20 h-20 rounded-lg object-cover flex-shrink-0"
                        onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start gap-2">
                        <p className="font-semibold text-white leading-tight">{product.name}</p>
                        <span className="text-blue-400 font-bold text-sm whitespace-nowrap">{formatCurrency(product.price, currency)}</span>
                      </div>
                      {product.description && (
                        <p className="text-slate-400 text-xs mt-1 line-clamp-2">{product.description}</p>
                      )}
                      {product.category && (
                        <span className="inline-block mt-1.5 text-xs bg-[#0f1729] text-slate-400 px-2 py-0.5 rounded-full border border-[#1e2d4a]">{product.category}</span>
                      )}
                      {(product.variantGroups.length > 0 || product.modifierGroups.length > 0) && (
                        <p className="text-xs text-blue-400 mt-1">Customizable</p>
                      )}
                    </div>
                    <div className="self-center">
                      <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
                        <Plus className="w-4 h-4" />
                      </div>
                    </div>
                  </motion.button>
                ))}
              </div>
            </ScrollArea>

            {cartCount > 0 && (
              <div className="px-4 py-3 border-t border-[#1e2d4a] bg-[#0f1729]">
                <Button
                  onClick={() => setView("cart")}
                  className="w-full bg-blue-600 hover:bg-blue-500 py-3 text-base font-semibold rounded-xl"
                >
                  <ShoppingCart className="mr-2 w-5 h-5" />
                  View Cart ({cartCount} items) — {formatCurrency(cartTotal.total, currency)}
                </Button>
              </div>
            )}
          </motion.div>
        )}

        {view === "cart" && (
          <motion.div key="cart" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col">
            <div className="px-4 pt-4 pb-2">
              <h2 className="text-xl font-bold">Your Order</h2>
            </div>
            <ScrollArea className="flex-1">
              <div className="px-4 pb-4 space-y-3">
                {cart.length === 0 && (
                  <div className="text-center py-12 text-slate-500">Your cart is empty.</div>
                )}
                {cart.map(ci => (
                  <div key={ci.cartId} className="bg-[#131f35] border border-[#1e2d4a] rounded-xl p-3">
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium">{ci.product.name}</p>
                        {[...ci.customization.variantChoices, ...ci.customization.modifierChoices].map((c, i) => (
                          <p key={i} className="text-xs text-slate-400">&bull; {c.optionName}</p>
                        ))}
                      </div>
                      <div className="text-right">
                        <p className="text-blue-400 font-semibold">{formatCurrency(ci.lineTotal, currency)}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center gap-2">
                        <button onClick={() => updateQty(ci.cartId, -1)} className="w-7 h-7 rounded-full bg-[#0f1729] border border-[#1e2d4a] flex items-center justify-center">
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="text-sm font-medium w-4 text-center">{ci.quantity}</span>
                        <button onClick={() => updateQty(ci.cartId, 1)} className="w-7 h-7 rounded-full bg-[#0f1729] border border-[#1e2d4a] flex items-center justify-center">
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                      <button onClick={() => removeItem(ci.cartId)} className="text-red-400 hover:text-red-300 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            {cart.length > 0 && (
              <div className="px-4 py-4 border-t border-[#1e2d4a] space-y-3 bg-[#0f1729]">
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between text-slate-400">
                    <span>Subtotal</span>
                    <span>{formatCurrency(cartTotal.subtotal, currency)}</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>GCT ({settings?.tax_rate ?? "15"}%)</span>
                    <span>{formatCurrency(cartTotal.tax, currency)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-base text-white border-t border-[#1e2d4a] pt-2 mt-2">
                    <span>Total</span>
                    <span className="text-blue-400">{formatCurrency(cartTotal.total, currency)}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setView("menu")} className="flex-1 border-[#1e2d4a] bg-transparent">
                    Add More
                  </Button>
                  <Button onClick={() => setView("checkout")} className="flex-1 bg-blue-600 hover:bg-blue-500">
                    Checkout
                  </Button>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {view === "checkout" && (
          <motion.div key="checkout" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col">
            <div className="px-4 pt-4 pb-2">
              <h2 className="text-xl font-bold">Your Details</h2>
              <p className="text-slate-400 text-sm mt-0.5">Optional — leave blank to order anonymously.</p>
            </div>
            <ScrollArea className="flex-1">
              <div className="px-4 pb-4 space-y-4">
                <div className="space-y-2">
                  <Label className="text-slate-300">Name</Label>
                  <Input
                    placeholder="Your name"
                    value={customerName}
                    onChange={e => setCustomerName(e.target.value)}
                    className="bg-[#131f35] border-[#1e2d4a] text-white placeholder:text-slate-500"
                  />
                </div>
                {mode === "online" && (
                  <div className="space-y-2">
                    <Label className="text-slate-300">Email</Label>
                    <Input
                      type="email"
                      placeholder="your@email.com"
                      value={customerEmail}
                      onChange={e => setCustomerEmail(e.target.value)}
                      className="bg-[#131f35] border-[#1e2d4a] text-white placeholder:text-slate-500"
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <Label className="text-slate-300">Special Instructions</Label>
                  <Input
                    placeholder="Allergies, preferences…"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    className="bg-[#131f35] border-[#1e2d4a] text-white placeholder:text-slate-500"
                  />
                </div>

                <div className="bg-[#131f35] border border-[#1e2d4a] rounded-xl p-3 space-y-1">
                  <p className="font-semibold text-sm text-slate-300 mb-2">Order Summary</p>
                  {cart.map(ci => (
                    <div key={ci.cartId} className="flex justify-between text-sm text-slate-400">
                      <span>{ci.quantity}× {ci.product.name}</span>
                      <span>{formatCurrency(ci.lineTotal, currency)}</span>
                    </div>
                  ))}
                  <div className="border-t border-[#1e2d4a] pt-2 mt-2 flex justify-between font-bold text-white">
                    <span>Total</span>
                    <span className="text-blue-400">{formatCurrency(cartTotal.total, currency)}</span>
                  </div>
                </div>
              </div>
            </ScrollArea>

            <div className="px-4 py-4 border-t border-[#1e2d4a] bg-[#0f1729]">
              <Button
                onClick={() => placeOrder.mutate()}
                disabled={placeOrder.isPending || cart.length === 0}
                className="w-full bg-blue-600 hover:bg-blue-500 py-3 text-base font-semibold rounded-xl"
              >
                {placeOrder.isPending ? "Placing Order…" : `Place Order — ${formatCurrency(cartTotal.total, currency)}`}
              </Button>
            </div>
          </motion.div>
        )}

        {view === "confirmation" && (
          <motion.div key="confirmation" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col items-center justify-center px-6 text-center space-y-6">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200, delay: 0.1 }}
            >
              <CheckCircle2 className="w-20 h-20 text-emerald-400 mx-auto" />
            </motion.div>
            <div>
              <h2 className="text-2xl font-bold text-white">Order Placed!</h2>
              {orderResult && (
                <p className="text-slate-400 mt-2">
                  Order <span className="text-blue-400 font-semibold">#{orderResult.orderNumber}</span>
                </p>
              )}
              {orderResult && (
                <p className="text-slate-300 mt-1">Total: {formatCurrency(orderResult.total, currency)}</p>
              )}
              <p className="text-slate-400 text-sm mt-3">
                {mode === "kiosk"
                  ? "Your order has been sent to the kitchen. Please wait for your number to be called."
                  : "Your order has been received. We'll get started right away!"}
              </p>
            </div>
            <Button
              onClick={() => {
                setView("menu");
                setOrderResult(null);
                setCustomerName("");
                setCustomerEmail("");
                setNotes("");
              }}
              className="bg-blue-600 hover:bg-blue-500 px-8"
            >
              Order More
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      <CustomizationDialog
        item={customizingItem}
        onClose={() => setCustomizingItem(null)}
        onAdd={addToCart}
        currency={currency}
      />

      <footer className="border-t border-[#1e2d4a] py-2 px-4 text-center">
        <p className="text-xs text-slate-600">Powered by MicroBooks</p>
      </footer>
    </div>
  );
}
