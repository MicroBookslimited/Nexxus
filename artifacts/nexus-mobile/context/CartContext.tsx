import React, { createContext, useContext, useMemo, useState } from "react";
import type { ChoiceItem, Product } from "@workspace/api-client-react";

export interface CartLine {
  /** Stable per-line identity: same product + same choices stacks; different choices = separate line. */
  lineKey: string;
  product: Product;
  quantity: number;
  /** Per-unit price including variant price + modifier add-ons. */
  unitPrice: number;
  variantChoices: ChoiceItem[];
  modifierChoices: ChoiceItem[];
  /** Total discount applied to this line (currency, not per-unit). */
  lineDiscount: number;
  /** Optional per-line note entered at the POS (e.g. "cut thin"). Printed on the receipt. */
  note?: string;
}

export interface AddToCartOptions {
  unitPrice?: number;
  variantChoices?: ChoiceItem[];
  modifierChoices?: ChoiceItem[];
}

interface CartState {
  lines: CartLine[];
  count: number;
  subtotal: number;
  add: (p: Product, opts?: AddToCartOptions) => void;
  setQty: (lineKey: string, q: number) => void;
  remove: (lineKey: string) => void;
  setDiscount: (lineKey: string, discount: number) => void;
  setNote: (lineKey: string, note: string) => void;
  clear: () => void;
}

const CartCtx = createContext<CartState | null>(null);

function makeLineKey(productId: number, vc: ChoiceItem[], mc: ChoiceItem[]): string {
  const v = vc
    .map((c) => c.optionId)
    .sort((a, b) => a - b)
    .join(".");
  const m = mc
    .map((c) => c.optionId)
    .sort((a, b) => a - b)
    .join(".");
  return `${productId}|v:${v}|m:${m}`;
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);

  const add = (p: Product, opts?: AddToCartOptions) => {
    const variantChoices = opts?.variantChoices ?? [];
    const modifierChoices = opts?.modifierChoices ?? [];
    const unitPrice = opts?.unitPrice ?? p.price;
    const lineKey = makeLineKey(p.id, variantChoices, modifierChoices);
    setLines((prev) => {
      const i = prev.findIndex((l) => l.lineKey === lineKey);
      if (i >= 0) {
        const copy = [...prev];
        copy[i] = { ...copy[i]!, quantity: copy[i]!.quantity + 1 };
        return copy;
      }
      return [
        ...prev,
        { lineKey, product: p, quantity: 1, unitPrice, variantChoices, modifierChoices, lineDiscount: 0 },
      ];
    });
  };

  const setQty = (lineKey: string, q: number) =>
    setLines((prev) =>
      q <= 0
        ? prev.filter((l) => l.lineKey !== lineKey)
        : prev.map((l) => (l.lineKey === lineKey ? { ...l, quantity: q } : l)),
    );

  const remove = (lineKey: string) => setLines((prev) => prev.filter((l) => l.lineKey !== lineKey));

  const setDiscount = (lineKey: string, discount: number) =>
    setLines((prev) =>
      prev.map((l) => {
        if (l.lineKey !== lineKey) return l;
        const max = l.unitPrice * l.quantity;
        const clamped = Number.isFinite(discount) ? Math.min(Math.max(0, discount), max) : 0;
        return { ...l, lineDiscount: clamped };
      }),
    );

  const setNote = (lineKey: string, note: string) =>
    setLines((prev) =>
      prev.map((l) => (l.lineKey === lineKey ? { ...l, note: note.trim() || undefined } : l)),
    );

  const clear = () => setLines([]);

  const subtotal = useMemo(
    () => lines.reduce((s, l) => s + Math.max(0, l.unitPrice * l.quantity - l.lineDiscount), 0),
    [lines],
  );
  const count = useMemo(() => lines.reduce((s, l) => s + l.quantity, 0), [lines]);

  return (
    <CartCtx.Provider value={{ lines, count, subtotal, add, setQty, remove, setDiscount, setNote, clear }}>
      {children}
    </CartCtx.Provider>
  );
}

export function useCart(): CartState {
  const ctx = useContext(CartCtx);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
