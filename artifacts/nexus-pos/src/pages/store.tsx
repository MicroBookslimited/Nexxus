import React, { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ShoppingCart, X, Plus, Minus, Package, Search, CheckCircle2, Loader2, ChevronRight, MapPin, Phone, User, StickyNote, ShoppingBag, Truck, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { TENANT_TOKEN_KEY } from "@/lib/saas-api";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

/* ─────────────────────────────────────────── types ── */
type StoreProduct = {
  id: number;
  name: string;
  description: string;
  category: string;
  sku: string | null;
  brand: string | null;
  price: number;
  imageEmoji: string;
  specs: Record<string, unknown>;
  inStock: boolean;
  stockCount: number;
  isActive: boolean;
};

type CartItem = {
  product: StoreProduct;
  qty: number;
};

type StoreOrder = {
  id: number;
  orderNumber: string;
  status: string;
  items: Array<{ id: number; name: string; price: number; qty: number; emoji: string }>;
  subtotal: number;
  total: number;
  contactName: string;
  contactPhone: string;
  deliveryAddress: string;
  notes: string | null;
  createdAt: string;
};

/* ─────────────────────────────────────── constants ── */
const CATEGORIES = [
  { value: "all",           label: "All Products",     emoji: "🛒" },
  { value: "systems",       label: "Complete Systems",  emoji: "🖥️" },
  { value: "hardware",      label: "Hardware",          emoji: "🖨️" },
  { value: "thermal_paper", label: "Thermal Paper",     emoji: "🧻" },
  { value: "inks",          label: "Inks",              emoji: "🖋️" },
  { value: "ribbons",       label: "Ribbons",           emoji: "🎀" },
  { value: "consumables",   label: "Consumables",       emoji: "🔌" },
];

const STATUS_COLORS: Record<string, string> = {
  pending:   "bg-amber-500/20 text-amber-400 border-amber-500/30",
  confirmed: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  shipped:   "bg-purple-500/20 text-purple-400 border-purple-500/30",
  delivered: "bg-green-500/20 text-green-400 border-green-500/30",
  cancelled: "bg-red-500/20 text-red-400 border-red-500/30",
};

const STATUS_ICONS: Record<string, React.ElementType> = {
  pending:   ShoppingBag,
  confirmed: CheckCircle2,
  shipped:   Truck,
  delivered: CheckCircle2,
  cancelled: X,
};

/* ─────────────────────────────────────── helpers ── */
function authHeader() {
  const token = localStorage.getItem(TENANT_TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function fmtJMD(v: number) {
  return "J$" + new Intl.NumberFormat("en-JM", { minimumFractionDigits: 2 }).format(v);
}

/* ─────────────────────────────────── product card ── */
function ProductCard({ product, qty, onAdd, onRemove }: {
  product: StoreProduct;
  qty: number;
  onAdd: () => void;
  onRemove: () => void;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "bg-card border border-border rounded-xl flex flex-col overflow-hidden transition-colors",
        !product.inStock && "opacity-60",
        qty > 0 && "border-primary/50 ring-1 ring-primary/20"
      )}
    >
      {/* Emoji hero */}
      <div className="h-32 bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center text-5xl shrink-0">
        {product.imageEmoji}
      </div>

      {/* Content */}
      <div className="p-3 flex flex-col flex-1 gap-2">
        {product.brand && (
          <p className="text-[10px] font-semibold text-primary uppercase tracking-widest">{product.brand}</p>
        )}
        <h3 className="text-sm font-semibold leading-snug line-clamp-2">{product.name}</h3>
        <p className="text-xs text-muted-foreground line-clamp-2 flex-1">{product.description}</p>

        {/* Specs pills */}
        {product.specs && Object.keys(product.specs).length > 0 && (
          <div className="flex flex-wrap gap-1">
            {Object.entries(product.specs).slice(0, 2).map(([k, v]) => (
              <span key={k} className="text-[9px] bg-secondary/60 px-1.5 py-0.5 rounded-full text-muted-foreground">
                {String(v)}
              </span>
            ))}
          </div>
        )}

        {/* Price + actions */}
        <div className="flex items-center justify-between gap-2 mt-auto pt-2 border-t border-border/50">
          <div>
            <p className="text-base font-bold text-primary font-mono">{fmtJMD(product.price)}</p>
            {!product.inStock && (
              <p className="text-[10px] text-destructive flex items-center gap-0.5">
                <AlertTriangle className="h-2.5 w-2.5" />Out of stock
              </p>
            )}
          </div>

          {product.inStock ? (
            qty === 0 ? (
              <Button size="sm" onClick={onAdd} className="h-8 px-3 text-xs gap-1">
                <Plus className="h-3.5 w-3.5" />Add
              </Button>
            ) : (
              <div className="flex items-center gap-1.5 bg-primary/10 border border-primary/30 rounded-lg px-1.5 py-1">
                <button onClick={onRemove} className="h-5 w-5 rounded flex items-center justify-center hover:bg-primary/20 transition-colors">
                  <Minus className="h-3 w-3 text-primary" />
                </button>
                <span className="text-sm font-bold w-4 text-center text-primary">{qty}</span>
                <button onClick={onAdd} className="h-5 w-5 rounded flex items-center justify-center hover:bg-primary/20 transition-colors">
                  <Plus className="h-3 w-3 text-primary" />
                </button>
              </div>
            )
          ) : (
            <Button size="sm" variant="outline" disabled className="h-8 px-3 text-xs">
              Out of stock
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/* ──────────────────────────────────────── cart ── */
function CartDrawer({
  open,
  onClose,
  cart,
  onAdd,
  onRemove,
  onClear,
  onCheckout,
}: {
  open: boolean;
  onClose: () => void;
  cart: CartItem[];
  onAdd: (id: number) => void;
  onRemove: (id: number) => void;
  onClear: () => void;
  onCheckout: () => void;
}) {
  const subtotal = cart.reduce((s, i) => s + i.product.price * i.qty, 0);

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={onClose}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 h-full w-full sm:w-96 bg-card border-l border-border z-50 flex flex-col shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-primary" />
                <h2 className="font-bold text-lg">Your Cart</h2>
                <Badge className="bg-primary/20 text-primary border-primary/30">{cart.reduce((s, i) => s + i.qty, 0)}</Badge>
              </div>
              <div className="flex items-center gap-2">
                {cart.length > 0 && (
                  <button onClick={onClear} className="text-xs text-muted-foreground hover:text-destructive transition-colors">Clear all</button>
                )}
                <button onClick={onClose} className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-secondary transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Items */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {cart.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-3">
                  <ShoppingCart className="h-10 w-10 opacity-30" />
                  <p className="text-sm">Your cart is empty</p>
                  <p className="text-xs opacity-70">Browse products and add items</p>
                </div>
              ) : (
                <AnimatePresence initial={false}>
                  {cart.map(({ product, qty }) => (
                    <motion.div
                      key={product.id}
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="flex items-center gap-3 bg-secondary/30 rounded-xl p-3"
                    >
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-xl shrink-0">
                        {product.imageEmoji}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold truncate">{product.name}</p>
                        <p className="text-xs text-primary font-mono">{fmtJMD(product.price)} ea.</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => onRemove(product.id)} className="h-6 w-6 rounded border border-border flex items-center justify-center hover:bg-secondary transition-colors">
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="text-sm font-bold w-5 text-center">{qty}</span>
                        <button onClick={() => onAdd(product.id)} className="h-6 w-6 rounded border border-border flex items-center justify-center hover:bg-secondary transition-colors">
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                      <p className="text-xs font-bold font-mono text-right shrink-0 w-16">{fmtJMD(product.price * qty)}</p>
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
            </div>

            {/* Footer */}
            {cart.length > 0 && (
              <div className="shrink-0 border-t border-border p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-sm">Subtotal</span>
                  <span className="font-bold font-mono text-lg">{fmtJMD(subtotal)}</span>
                </div>
                <p className="text-xs text-muted-foreground">Shipping and taxes calculated at confirmation.</p>
                <Button className="w-full gap-2" onClick={onCheckout}>
                  Proceed to Checkout <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/* ────────────────────────────────── checkout modal ── */
function CheckoutDialog({
  open,
  onClose,
  cart,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  cart: CartItem[];
  onSuccess: (orderNum: string) => void;
}) {
  const [form, setForm] = useState({ contactName: "", contactPhone: "", deliveryAddress: "", notes: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const subtotal = cart.reduce((s, i) => s + i.product.price * i.qty, 0);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/store/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({
          items: cart.map(({ product, qty }) => ({
            id: product.id,
            name: product.name,
            price: product.price,
            qty,
            emoji: product.imageEmoji,
          })),
          subtotal,
          total: subtotal,
          contactName: form.contactName,
          contactPhone: form.contactPhone,
          deliveryAddress: form.deliveryAddress,
          notes: form.notes || null,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (data) => {
      onSuccess(data.orderNumber);
      setForm({ contactName: "", contactPhone: "", deliveryAddress: "", notes: "" });
    },
    onError: () => toast.error("Failed to place order. Please try again."),
  });

  function validate() {
    const e: Record<string, string> = {};
    if (!form.contactName.trim()) e.contactName = "Name is required";
    if (!form.contactPhone.trim()) e.contactPhone = "Phone is required";
    if (!form.deliveryAddress.trim()) e.deliveryAddress = "Delivery address is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit() {
    if (validate()) mutation.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5 text-primary" />
            Checkout
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          {/* Order summary */}
          <div className="bg-secondary/30 rounded-xl p-4 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Order Summary</p>
            {cart.map(({ product, qty }) => (
              <div key={product.id} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 text-xs">
                  <span>{product.imageEmoji}</span>
                  <span className="truncate max-w-[180px]">{product.name}</span>
                  <span className="text-muted-foreground">×{qty}</span>
                </span>
                <span className="font-mono font-semibold shrink-0">{fmtJMD(product.price * qty)}</span>
              </div>
            ))}
            <div className="border-t border-border/50 pt-2 flex items-center justify-between font-bold">
              <span>Total</span>
              <span className="font-mono text-primary">{fmtJMD(subtotal)}</span>
            </div>
          </div>

          {/* Contact info */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Contact Details</p>
            <div>
              <Label className="text-xs mb-1 flex items-center gap-1"><User className="h-3 w-3" />Full Name</Label>
              <Input
                placeholder="Your name"
                value={form.contactName}
                onChange={e => setForm(f => ({ ...f, contactName: e.target.value }))}
                className={errors.contactName ? "border-destructive" : ""}
              />
              {errors.contactName && <p className="text-[10px] text-destructive mt-1">{errors.contactName}</p>}
            </div>
            <div>
              <Label className="text-xs mb-1 flex items-center gap-1"><Phone className="h-3 w-3" />Phone Number</Label>
              <Input
                placeholder="+1 (876) 000-0000"
                value={form.contactPhone}
                onChange={e => setForm(f => ({ ...f, contactPhone: e.target.value }))}
                className={errors.contactPhone ? "border-destructive" : ""}
              />
              {errors.contactPhone && <p className="text-[10px] text-destructive mt-1">{errors.contactPhone}</p>}
            </div>
            <div>
              <Label className="text-xs mb-1 flex items-center gap-1"><MapPin className="h-3 w-3" />Delivery Address</Label>
              <Textarea
                placeholder="Full delivery address..."
                rows={2}
                value={form.deliveryAddress}
                onChange={e => setForm(f => ({ ...f, deliveryAddress: e.target.value }))}
                className={errors.deliveryAddress ? "border-destructive" : ""}
              />
              {errors.deliveryAddress && <p className="text-[10px] text-destructive mt-1">{errors.deliveryAddress}</p>}
            </div>
            <div>
              <Label className="text-xs mb-1 flex items-center gap-1"><StickyNote className="h-3 w-3" />Notes (optional)</Label>
              <Textarea
                placeholder="Special instructions..."
                rows={2}
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button onClick={handleSubmit} disabled={mutation.isPending} className="flex-1 gap-2">
              {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Place Order
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ──────────────────────────────── order success ── */
function OrderSuccessDialog({ orderNumber, onClose }: { orderNumber: string; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-sm bg-card border-border text-center">
        <div className="flex flex-col items-center gap-4 py-4">
          <div className="h-16 w-16 rounded-full bg-green-500/20 flex items-center justify-center">
            <CheckCircle2 className="h-8 w-8 text-green-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Order Placed!</h2>
            <p className="text-muted-foreground text-sm mt-1">Your order has been received.</p>
          </div>
          <div className="bg-secondary/50 rounded-xl px-6 py-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">Order Number</p>
            <p className="text-lg font-bold font-mono text-primary">{orderNumber}</p>
          </div>
          <p className="text-xs text-muted-foreground">Our team will contact you shortly to confirm your order and arrange delivery.</p>
          <Button onClick={onClose} className="w-full">Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────────────────────── my orders tab ── */
function MyOrdersTab() {
  const { data: orders = [], isLoading } = useQuery<StoreOrder[]>({
    queryKey: ["store-orders"],
    queryFn: async () => {
      const res = await fetch(`/api/store/orders`, { headers: authHeader() as Record<string, string> });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  if (isLoading) return (
    <div className="space-y-3">
      {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
    </div>
  );

  if (!orders.length) return (
    <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
      <ShoppingBag className="h-12 w-12 opacity-30" />
      <p className="text-lg font-medium">No orders yet</p>
      <p className="text-sm">Browse our catalog to place your first order.</p>
    </div>
  );

  return (
    <div className="space-y-3">
      {orders.map(order => {
        const StatusIcon = STATUS_ICONS[order.status] || ShoppingBag;
        return (
          <div key={order.id} className="bg-card border border-border rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <StatusIcon className="h-4 w-4 text-muted-foreground" />
                <span className="font-bold font-mono text-sm">{order.orderNumber}</span>
              </div>
              <Badge className={cn("text-[10px] border", STATUS_COLORS[order.status] || "bg-secondary text-foreground")}>
                {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
              </Badge>
            </div>

            <div className="space-y-1">
              {(order.items as Array<{ id: number; name: string; price: number; qty: number; emoji: string }>).map((item, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <span>{item.emoji}</span>
                    <span>{item.name} ×{item.qty}</span>
                  </span>
                  <span className="font-mono">{fmtJMD(item.price * item.qty)}</span>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between border-t border-border/50 pt-2 text-sm">
              <span className="text-muted-foreground text-xs">{format(new Date(order.createdAt), "dd/MM/yyyy h:mm a")}</span>
              <span className="font-bold font-mono text-primary">{fmtJMD(order.total)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ──────────────────────────────────── main page ── */
export default function StorePage() {
  const [activeCategory, setActiveCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [successOrderNum, setSuccessOrderNum] = useState<string | null>(null);
  const [tab, setTab] = useState<"shop" | "orders">("shop");
  const queryClient = useQueryClient();

  const { data: products = [], isLoading } = useQuery<StoreProduct[]>({
    queryKey: ["store-products"],
    queryFn: async () => {
      const res = await fetch(`/api/store/products`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 1000 * 60 * 5,
  });

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchCat = activeCategory === "all" || p.category === activeCategory;
      const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.description.toLowerCase().includes(search.toLowerCase()) || (p.brand || "").toLowerCase().includes(search.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [products, activeCategory, search]);

  const cartQty = useCallback((id: number) => cart.find(i => i.product.id === id)?.qty ?? 0, [cart]);
  const totalCartItems = cart.reduce((s, i) => s + i.qty, 0);

  function addToCart(product: StoreProduct) {
    setCart(prev => {
      const existing = prev.find(i => i.product.id === product.id);
      if (existing) return prev.map(i => i.product.id === product.id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { product, qty: 1 }];
    });
  }

  function removeFromCart(productId: number) {
    setCart(prev => {
      const existing = prev.find(i => i.product.id === productId);
      if (!existing) return prev;
      if (existing.qty === 1) return prev.filter(i => i.product.id !== productId);
      return prev.map(i => i.product.id === productId ? { ...i, qty: i.qty - 1 } : i);
    });
  }

  function handleOrderSuccess(orderNum: string) {
    setCart([]);
    setCheckoutOpen(false);
    setCartOpen(false);
    setSuccessOrderNum(orderNum);
    queryClient.invalidateQueries({ queryKey: ["store-orders"] });
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col h-full force-light">

      {/* ── Header ── */}
      <div className="shrink-0 px-4 sm:px-6 pt-5 pb-4 border-b border-border bg-card/50">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
              <ShoppingCart className="h-6 w-6 sm:h-7 sm:w-7 text-primary" />
              NEXXUS Store
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">Hardware, consumables & supplies for your POS system</p>
          </div>

          {/* Cart button */}
          <button
            onClick={() => setCartOpen(true)}
            className="relative h-10 w-10 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center hover:bg-primary/20 transition-colors shrink-0"
          >
            <ShoppingCart className="h-5 w-5 text-primary" />
            {totalCartItems > 0 && (
              <span className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                {totalCartItems}
              </span>
            )}
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4">
          <button
            onClick={() => setTab("shop")}
            className={cn("flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors", tab === "shop" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary/60")}
          >
            <Package className="h-3.5 w-3.5" />Shop
          </button>
          <button
            onClick={() => setTab("orders")}
            className={cn("flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors", tab === "orders" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary/60")}
          >
            <ShoppingBag className="h-3.5 w-3.5" />My Orders
          </button>
        </div>

        {/* Category filter + search (shop tab only) */}
        {tab === "shop" && (
          <div className="space-y-3">
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9 w-full" placeholder="Search products…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
              {CATEGORIES.map(cat => (
                <button
                  key={cat.value}
                  onClick={() => setActiveCategory(cat.value)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors shrink-0",
                    activeCategory === cat.value
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary/50 text-muted-foreground hover:text-foreground hover:bg-secondary"
                  )}
                >
                  <span>{cat.emoji}</span>
                  <span>{cat.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {tab === "orders" ? (
          <MyOrdersTab />
        ) : isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-64 rounded-xl" />)}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
            <Package className="h-12 w-12 opacity-30" />
            <p className="text-lg font-medium">No products found</p>
            <p className="text-sm">Try a different category or search term.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            <AnimatePresence mode="popLayout">
              {filteredProducts.map(product => (
                <ProductCard
                  key={product.id}
                  product={product}
                  qty={cartQty(product.id)}
                  onAdd={() => addToCart(product)}
                  onRemove={() => removeFromCart(product.id)}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* ── Floating cart FAB (mobile) ── */}
      <AnimatePresence>
        {totalCartItems > 0 && !cartOpen && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            onClick={() => setCartOpen(true)}
            className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-30 flex items-center gap-2 bg-primary text-primary-foreground px-4 py-3 rounded-2xl shadow-xl shadow-primary/25 font-semibold text-sm"
          >
            <ShoppingCart className="h-4 w-4" />
            {totalCartItems} item{totalCartItems !== 1 ? "s" : ""} · {fmtJMD(cart.reduce((s, i) => s + i.product.price * i.qty, 0))}
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── Cart Drawer ── */}
      <CartDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        cart={cart}
        onAdd={(id) => { const p = products.find(p => p.id === id); if (p) addToCart(p); }}
        onRemove={removeFromCart}
        onClear={() => setCart([])}
        onCheckout={() => { setCartOpen(false); setCheckoutOpen(true); }}
      />

      {/* ── Checkout ── */}
      <CheckoutDialog
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        cart={cart}
        onSuccess={handleOrderSuccess}
      />

      {/* ── Success ── */}
      {successOrderNum && (
        <OrderSuccessDialog orderNumber={successOrderNum} onClose={() => setSuccessOrderNum(null)} />
      )}
    </motion.div>
  );
}
