import { useState } from "react";
import { motion } from "framer-motion";
import { 
  useListProducts, 
  useCreateOrder,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Search, CreditCard, Banknote, Trash2, ShoppingCart } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

type CartItem = {
  productId: number;
  productName: string;
  price: number;
  quantity: number;
};

export function POS() {
  const { data: products, isLoading: loadingProducts } = useListProducts();
  const createOrder = useCreateOrder();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [searchTerm, setSearchTerm] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState("credit_card");

  const filteredProducts = products?.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
        quantity: 1
      }];
    });
  };

  const removeFromCart = (productId: number) => {
    setCart(prev => prev.filter(item => item.productId !== productId));
  };

  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const tax = subtotal * 0.08; // 8% tax
  const total = subtotal + tax;

  const handleCharge = () => {
    if (cart.length === 0) return;
    
    createOrder.mutate({
      data: {
        paymentMethod,
        items: cart.map(item => ({
          productId: item.productId,
          quantity: item.quantity
        }))
      }
    }, {
      onSuccess: () => {
        toast({
          title: "Payment Successful",
          description: `Charged ${formatCurrency(total)} via ${paymentMethod.replace('_', ' ')}`,
        });
        setCart([]);
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

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* Products Area */}
      <div className="flex-1 flex flex-col min-w-0 border-r border-border">
        <div className="p-4 border-b border-border bg-card/50">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search products..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-12 bg-background"
            />
          </div>
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
      <div className="w-[400px] flex flex-col bg-card shrink-0">
        <div className="p-4 border-b border-border">
          <h2 className="text-xl font-bold">Current Order</h2>
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
                <div key={item.productId} className="flex justify-between items-start gap-4 group">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{item.productName}</p>
                    <p className="text-sm text-muted-foreground font-mono">
                      {formatCurrency(item.price)} × {item.quantity}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-medium">
                      {formatCurrency(item.price * item.quantity)}
                    </span>
                    <button 
                      onClick={() => removeFromCart(item.productId)}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        <div className="p-6 border-t border-border bg-background/50">
          <div className="space-y-3 mb-6">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-mono">{formatCurrency(subtotal)}</span>
            </div>
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

          <div className="grid grid-cols-2 gap-2 mb-6">
            <Button 
              variant={paymentMethod === "credit_card" ? "default" : "outline"} 
              onClick={() => setPaymentMethod("credit_card")}
              className="h-12"
            >
              <CreditCard className="mr-2 h-4 w-4" />
              Card
            </Button>
            <Button 
              variant={paymentMethod === "cash" ? "default" : "outline"} 
              onClick={() => setPaymentMethod("cash")}
              className="h-12"
            >
              <Banknote className="mr-2 h-4 w-4" />
              Cash
            </Button>
          </div>

          <Button 
            className="w-full h-14 text-lg shadow-lg shadow-primary/20" 
            size="lg"
            onClick={handleCharge}
            disabled={cart.length === 0 || createOrder.isPending}
          >
            {createOrder.isPending ? "Processing..." : `Charge ${formatCurrency(total)}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
