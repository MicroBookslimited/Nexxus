import React, { createContext, useContext, useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import type { ChoiceItem, Product } from "@workspace/api-client-react";

import { getPricingTiers, type PricingTier } from "@/lib/nexus-api";
import { applyVolumePricing } from "@/lib/pricing";

export interface CartLine {
  /** Stable per-line identity: same product + same choices stacks; different choices = separate line. */
  lineKey: string;
  product: Product;
  quantity: number;
  /** Per-unit price including variant price + modifier add-ons (the catalog/base price, pre volume tiers). */
  unitPrice: number;
  /**
   * Per-unit price after volume/tiered pricing is applied for the current
   * quantity. Equals `unitPrice` when the product has no tiers (or the line is
   * customized with variants/modifiers, where tiers don't apply). The server
   * recomputes this authoritatively at checkout — this only drives the preview.
   */
  effectiveUnitPrice: number;
  variantChoices: ChoiceItem[];
  modifierChoices: ChoiceItem[];
  /** Total discount applied to this line (currency, not per-unit). */
  lineDiscount: number;
  /** Optional per-line note entered at the POS (e.g. "cut thin"). Printed on the receipt. */
  note?: string;
}

/** Internal cart line as stored in state (without the derived effective price). */
type StoredLine = Omit<CartLine, "effectiveUnitPrice">;

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
  const [lines, setLines] = useState<StoredLine[]>([]);

  // Fetch volume-pricing tiers for the distinct products currently in the cart.
  // The cart can replace lines at any time, so we key each query by product id
  // and let React Query cache/dedupe. Tiers rarely change, so a long staleTime
  // keeps this cheap. Tiers only apply to plain catalog lines (no variants /
  // modifiers) — mirroring how the server adds variant/modifier adjustments on
  // top of the tiered base price.
  const productIds = useMemo(() => {
    const ids = new Set<number>();
    for (const l of lines) {
      const customized = l.variantChoices.length > 0 || l.modifierChoices.length > 0;
      if (!customized) ids.add(l.product.id);
    }
    return [...ids];
  }, [lines]);

  const tierQueries = useQueries({
    queries: productIds.map((id) => ({
      queryKey: ["pricing-tiers", id],
      queryFn: () => getPricingTiers(id),
      staleTime: 5 * 60 * 1000,
    })),
  });

  const tiersByProduct = useMemo(() => {
    const map = new Map<number, PricingTier[]>();
    productIds.forEach((id, i) => {
      const data = tierQueries[i]?.data;
      if (data && data.length > 0) map.set(id, data);
    });
    return map;
  }, [productIds, tierQueries]);

  // Decorate every stored line with its effective (tiered) unit price for the
  // current quantity. Customized lines keep their catalog price.
  const decoratedLines = useMemo<CartLine[]>(
    () =>
      lines.map((l) => {
        const customized = l.variantChoices.length > 0 || l.modifierChoices.length > 0;
        const tiers = customized ? undefined : tiersByProduct.get(l.product.id);
        const effectiveUnitPrice = tiers
          ? applyVolumePricing(l.unitPrice, l.quantity, tiers).unitPrice
          : l.unitPrice;
        return { ...l, effectiveUnitPrice };
      }),
    [lines, tiersByProduct],
  );

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
    () =>
      decoratedLines.reduce(
        (s, l) => s + Math.max(0, l.effectiveUnitPrice * l.quantity - l.lineDiscount),
        0,
      ),
    [decoratedLines],
  );
  const count = useMemo(() => decoratedLines.reduce((s, l) => s + l.quantity, 0), [decoratedLines]);

  return (
    <CartCtx.Provider
      value={{ lines: decoratedLines, count, subtotal, add, setQty, remove, setDiscount, setNote, clear }}
    >
      {children}
    </CartCtx.Provider>
  );
}

export function useCart(): CartState {
  const ctx = useContext(CartCtx);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
