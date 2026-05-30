import React, { createContext, useContext, useMemo, useState } from "react";
import type { Product } from "@workspace/api-client-react";

export interface CartLine {
  product: Product;
  quantity: number;
}

interface CartState {
  lines: CartLine[];
  count: number;
  subtotal: number;
  add: (p: Product) => void;
  setQty: (productId: number, q: number) => void;
  remove: (productId: number) => void;
  clear: () => void;
}

const CartCtx = createContext<CartState | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);

  const add = (p: Product) =>
    setLines((prev) => {
      const i = prev.findIndex((l) => l.product.id === p.id);
      if (i >= 0) {
        const copy = [...prev];
        copy[i] = { ...copy[i]!, quantity: copy[i]!.quantity + 1 };
        return copy;
      }
      return [...prev, { product: p, quantity: 1 }];
    });

  const setQty = (productId: number, q: number) =>
    setLines((prev) =>
      q <= 0
        ? prev.filter((l) => l.product.id !== productId)
        : prev.map((l) => (l.product.id === productId ? { ...l, quantity: q } : l)),
    );

  const remove = (productId: number) =>
    setLines((prev) => prev.filter((l) => l.product.id !== productId));

  const clear = () => setLines([]);

  const subtotal = useMemo(
    () => lines.reduce((s, l) => s + l.product.price * l.quantity, 0),
    [lines],
  );
  const count = useMemo(() => lines.reduce((s, l) => s + l.quantity, 0), [lines]);

  return (
    <CartCtx.Provider value={{ lines, count, subtotal, add, setQty, remove, clear }}>
      {children}
    </CartCtx.Provider>
  );
}

export function useCart(): CartState {
  const ctx = useContext(CartCtx);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
