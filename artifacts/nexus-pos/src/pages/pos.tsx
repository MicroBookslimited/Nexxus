import { useState, useMemo, KeyboardEvent } from "react";
import { motion } from "framer-motion";
import { 
  useListProducts, 
  useCreateOrder,
  useListHeldOrders,
  useCreateHeldOrder,
  useDeleteHeldOrder
} from "@workspace/api-client-react";
import type { GetOrderResponse } from "@workspace/api-zod";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Search, CreditCard, Banknote, Trash2, ShoppingCart, ScanBarcode, Minus, Plus, Percent, DollarSign, SplitSquareHorizontal, SaveAll, Download, Printer, CheckCircle2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { format } from "date-fns";

type CartItem = {
  productId: number;
  productName: string;
  price: number;
  quantity: number;
  itemDiscount: number;
};

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
  const [showHoldPanel, setShowHoldPanel] = useState(false);

  const [splitCardAmount, setSplitCardAmount] = useState<number>(0);
  const [splitCashAmount, setSplitCashAmount] = useState<number>(0);
  const [receiptOrder, setReceiptOrder] = useState<GetOrderResponse | null>(null);

  const categories = useMemo(() => {
    if (!products) return [];
    const cats = new Set(products.map(p => p.category));
    return Array.from(cats);
  }, [products]);

  const filteredProducts = products?.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter ? p.category === categoryFilter : true;
    return matchesSearch && matchesCategory;
  });

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

  const addToCart = (product: NonNullable<typeof products>[0]) => {
    setCart(prev => {
      const existing = prev.find(item => item.productId === product.id);
      if (existing) {
        return prev.map(item => 
          item.productId === product.id 
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, {
        productId: product.id,
        productName: product.name,
        price: product.price,
        quantity: 1,
        itemDiscount: 0
      }];
    });
  };

  const handleBarcodeScan = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const product = products?.find(p => p.barcode === barcodeTerm);
      if (product) {
        addToCart(product);
        toast({ title: "Product added", description: product.name });
      } else {
        toast({ title: "Product not found", description: `Barcode: ${barcodeTerm}`, variant: "destructive" });
      }
      setBarcodeTerm("");
    }
  };

  const updateQuantity = (productId: number, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.productId === productId) {
        const newQuantity = Math.max(1, item.quantity + delta);
        return { ...item, quantity: newQuantity };
      }
      return item;
    }));
  };

  const removeFromCart = (productId: number) => {
    setCart(prev => prev.filter(item => item.productId !== productId));
  };

  const subtotal = cart.reduce((sum, item) => sum + ((item.price - item.itemDiscount) * item.quantity), 0);
  
  let cartDiscountValue = 0;
  if (discountType === "percent") {
    cartDiscountValue = subtotal * ((discountAmount || 0) / 100);
  } else if (discountType === "fixed") {
    cartDiscountValue = discountAmount || 0;
  }
  
  // Clamp discount
  cartDiscountValue = Math.min(cartDiscountValue, subtotal);
  
  const discountedSubtotal = subtotal - cartDiscountValue;
  const tax = discountedSubtotal * 0.08; // 8% tax
  const total = discountedSubtotal + tax;

  // Auto-split calculation
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
    
    createOrder.mutate({
      data: {
        paymentMethod,
        items: cart.map(item => ({ 
          productId: item.productId, 
          quantity: item.quantity, 
          discountAmount: item.itemDiscount || undefined 
        })),
        splitCardAmount: paymentMethod === "split" ? splitCardAmount : undefined,
        splitCashAmount: paymentMethod === "split" ? splitCashAmount : undefined,
        discountType: discountType ?? undefined,
        discountAmount: discountAmount > 0 ? discountAmount : undefined,
        notes: notes || undefined,
      }
    }, {
      onSuccess: (data) => {
        setReceiptOrder(data);
        resetCart();
      },
      onError: () => {
        toast({
          title: "Payment Failed",
          description: "There was an error processing the payment.",
          variant: "destructive"
        });
      }
    });
  };

  const handleHoldOrder = () => {
    if (cart.length === 0) return;
    createHeldOrder.mutate({
      data: {
        items: cart.map(item => ({
          productId: item.productId,
          productName: item.productName,
          price: item.price,
          quantity: item.quantity
        })),
        notes: notes || undefined,
        discountType: discountType || undefined,
        discountAmount: discountAmount || undefined
      }
    }, {
      onSuccess: () => {
        toast({ title: "Order Held", description: "Order has been saved for later." });
        resetCart();
        queryClient.invalidateQueries({ queryKey: ["/api/held-orders"] });
      }
    });
  };

  const handleRecallOrder = (heldOrderId: number) => {
    const order = heldOrders?.find(o => o.id === heldOrderId);
    if (!order) return;

    setCart(order.items.map(item => ({
      productId: item.productId,
      productName: item.productName,
      price: item.price,
      quantity: item.quantity,
      itemDiscount: 0
    })));
    setNotes(order.notes || "");
    setDiscountType((order.discountType as "percent" | "fixed") || null);
    setDiscountAmount(order.discountAmount || 0);

    deleteHeldOrder.mutate({ id: heldOrderId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/held-orders"] });
        setShowHoldPanel(false);
        toast({ title: "Order Recalled" });
      }
    });
  };

  const handleDeleteHeldOrder = (heldOrderId: number) => {
    deleteHeldOrder.mutate({ id: heldOrderId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/held-orders"] });
        toast({ title: "Held Order Deleted" });
      }
    });
  };

  return (
    <>
    <div className="flex h-full w-full overflow-hidden">
      {/* Products Area */}
      <div className="flex-1 flex flex-col min-w-0 border-r border-border">
        <div className="p-4 border-b border-border bg-card/50 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search products..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-12 bg-background"
            />
          </div>
          <div className="relative">
            <ScanBarcode className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Scan or enter barcode..." 
              value={barcodeTerm}
              onChange={(e) => setBarcodeTerm(e.target.value)}
              onKeyDown={handleBarcodeScan}
              className="pl-9 h-10 bg-background"
            />
          </div>
          <ScrollArea className="w-full whitespace-nowrap pb-2">
            <div className="flex gap-2">
              <Button 
                variant={categoryFilter === null ? "default" : "outline"} 
                onClick={() => setCategoryFilter(null)}
                className="rounded-full"
                size="sm"
              >
                All
              </Button>
              {categories.map(cat => (
                <Button 
                  key={cat}
                  variant={categoryFilter === cat ? "default" : "outline"} 
                  onClick={() => setCategoryFilter(cat)}
                  className="rounded-full"
                  size="sm"
                >
                  {cat}
                </Button>
              ))}
            </div>
          </ScrollArea>
        </div>
        
        <ScrollArea className="flex-1 p-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 pb-20">
            {loadingProducts ? (
              [...Array(12)].map((_, i) => (
                <div key={i} className="h-32 rounded-xl bg-muted animate-pulse" />
              ))
            ) : filteredProducts?.map((product) => (
              <motion.button
                key={product.id}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => addToCart(product)}
                className="flex flex-col items-start p-4 h-32 rounded-xl bg-card border border-border shadow-sm hover:border-primary transition-colors text-left"
              >
                <span className="font-semibold text-lg line-clamp-2 leading-tight flex-1">
                  {product.name}
                </span>
                <div className="flex items-center justify-between w-full mt-2">
                  <span className="font-mono text-primary font-bold">
                    {formatCurrency(product.price)}
                  </span>
                  <span className="text-xs text-muted-foreground px-2 py-1 rounded bg-secondary">
                    {product.category}
                  </span>
                </div>
              </motion.button>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Cart Area */}
      <div className="w-[450px] flex flex-col bg-card shrink-0">
        <div className="p-4 border-b border-border flex justify-between items-center">
          <h2 className="text-xl font-bold">Current Order</h2>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleHoldOrder} disabled={cart.length === 0}>
              <SaveAll className="w-4 h-4 mr-2" /> Hold
            </Button>
            <Sheet open={showHoldPanel} onOpenChange={setShowHoldPanel}>
              <SheetTrigger asChild>
                <Button variant="secondary" size="sm">
                  <Download className="w-4 h-4 mr-2" /> Recall
                </Button>
              </SheetTrigger>
              <SheetContent className="w-[400px] sm:w-[540px]">
                <SheetHeader>
                  <SheetTitle>Held Orders</SheetTitle>
                  <SheetDescription>Restore a previously held order to continue checkout.</SheetDescription>
                </SheetHeader>
                <div className="mt-6 space-y-4">
                  {heldOrders?.length === 0 && (
                    <p className="text-muted-foreground text-center py-8">No held orders found.</p>
                  )}
                  {heldOrders?.map(order => (
                    <Card key={order.id} className="p-4 flex flex-col gap-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium">{order.label || `Order #${order.id}`}</p>
                          <p className="text-xs text-muted-foreground">{format(new Date(order.createdAt), "h:mm a")}</p>
                        </div>
                        <span className="text-sm">{order.items.length} items</span>
                      </div>
                      <div className="flex justify-end gap-2 mt-2">
                        <Button variant="outline" size="sm" onClick={() => handleDeleteHeldOrder(order.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                        <Button size="sm" onClick={() => handleRecallOrder(order.id)}>
                          Recall
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>

        <ScrollArea className="flex-1 p-4">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
              <ShoppingCart className="h-10 w-10 mb-4 opacity-20" />
              <p>Cart is empty</p>
            </div>
          ) : (
            <div className="space-y-4">
              {cart.map((item) => (
                <div key={item.productId} className="flex flex-col gap-2 group p-2 border border-transparent hover:border-border rounded-lg">
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{item.productName}</p>
                      <p className="text-sm text-muted-foreground font-mono">
                        {formatCurrency(item.price)}
                      </p>
                    </div>
                    <span className="font-mono font-medium">
                      {formatCurrency((item.price - item.itemDiscount) * item.quantity)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 bg-secondary rounded-md p-1">
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => updateQuantity(item.productId, -1)}>
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-6 text-center font-mono text-sm">{item.quantity}</span>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => updateQuantity(item.productId, 1)}>
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                    <Button 
                      variant="ghost" size="icon"
                      onClick={() => removeFromCart(item.productId)}
                      className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 h-8 w-8"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        <div className="p-6 border-t border-border bg-background/50 flex flex-col gap-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground whitespace-nowrap">Discount</span>
              <div className="flex bg-secondary rounded-md p-1">
                <Button 
                  variant={discountType === "percent" ? "default" : "ghost"} 
                  size="sm" className="h-7 px-2"
                  onClick={() => setDiscountType(discountType === "percent" ? null : "percent")}
                >
                  <Percent className="w-3 h-3" />
                </Button>
                <Button 
                  variant={discountType === "fixed" ? "default" : "ghost"} 
                  size="sm" className="h-7 px-2"
                  onClick={() => setDiscountType(discountType === "fixed" ? null : "fixed")}
                >
                  <DollarSign className="w-3 h-3" />
                </Button>
              </div>
              {discountType && (
                <Input 
                  type="number" 
                  className="h-8 w-20 text-right font-mono" 
                  value={discountAmount} 
                  onChange={(e) => setDiscountAmount(Number(e.target.value))}
                  placeholder="0"
                />
              )}
            </div>
            <Textarea 
              placeholder="Order Notes" 
              className="resize-none h-16 text-sm" 
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="space-y-2 mt-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-mono">{formatCurrency(subtotal)}</span>
            </div>
            {cartDiscountValue > 0 && (
              <div className="flex justify-between text-sm text-amber-500">
                <span>Discount ({discountType === 'percent' ? `${discountAmount}%` : 'Fixed'})</span>
                <span className="font-mono">-{formatCurrency(cartDiscountValue)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Tax (8%)</span>
              <span className="font-mono">{formatCurrency(tax)}</span>
            </div>
            <Separator className="my-2" />
            <div className="flex justify-between text-xl font-bold">
              <span>Total</span>
              <span className="font-mono text-primary">{formatCurrency(total)}</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 mb-2">
            <Button 
              variant={paymentMethod === "card" ? "default" : "outline"} 
              onClick={() => setPaymentMethod("card")}
              className="h-10"
            >
              <CreditCard className="mr-2 h-4 w-4" />
              Card
            </Button>
            <Button 
              variant={paymentMethod === "cash" ? "default" : "outline"} 
              onClick={() => setPaymentMethod("cash")}
              className="h-10"
            >
              <Banknote className="mr-2 h-4 w-4" />
              Cash
            </Button>
            <Button 
              variant={paymentMethod === "split" ? "default" : "outline"} 
              onClick={handleSplitClick}
              className="h-10"
            >
              <SplitSquareHorizontal className="mr-2 h-4 w-4" />
              Split
            </Button>
          </div>

          {paymentMethod === "split" && (
            <div className="flex gap-2 items-center bg-secondary/50 p-2 rounded-md">
              <div className="flex-1 space-y-1">
                <label className="text-xs text-muted-foreground">Card $</label>
                <Input 
                  type="number" 
                  value={splitCardAmount} 
                  onChange={(e) => setSplitCardAmount(Number(e.target.value))}
                  className="h-8 font-mono text-sm"
                />
              </div>
              <div className="flex-1 space-y-1">
                <label className="text-xs text-muted-foreground">Cash $</label>
                <Input 
                  type="number" 
                  value={splitCashAmount} 
                  onChange={(e) => setSplitCashAmount(Number(e.target.value))}
                  className="h-8 font-mono text-sm"
                />
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
            {createOrder.isPending ? "Processing..." : `Charge ${formatCurrency(total)}`}
          </Button>
        </div>
      </div>
    </div>

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
              <p className="text-xs text-muted-foreground mt-1">
                {format(new Date(receiptOrder.createdAt), "MMM d, yyyy h:mm a")}
              </p>
              <p className="font-mono text-xs mt-1">{receiptOrder.orderNumber}</p>
            </div>

            <div className="space-y-1">
              {receiptOrder.items.map((item) => (
                <div key={item.id} className="flex justify-between">
                  <span className="text-muted-foreground">
                    {item.productName} × {item.quantity}
                  </span>
                  <span className="font-mono">{formatCurrency(item.lineTotal)}</span>
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

            <p className="text-center text-xs text-muted-foreground pt-2 border-t border-border">
              Powered by MicroBooks
            </p>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => window.print()} className="gap-2 flex-1">
            <Printer className="h-4 w-4" />
            Print
          </Button>
          <Button onClick={() => setReceiptOrder(null)} className="flex-1">
            New Sale
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
