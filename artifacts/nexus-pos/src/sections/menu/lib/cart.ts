import type { MenuItem, VariantGroup, ModifierGroup, VariantOption, ModifierOption } from "./api";

export interface CartItemCustomization {
  variantChoices: Array<{ optionId: number; optionName: string; groupName: string; priceAdjustment: number }>;
  modifierChoices: Array<{ optionId: number; optionName: string; groupName: string; priceAdjustment: number }>;
}

export interface CartItem {
  cartId: string;
  product: MenuItem;
  quantity: number;
  customization: CartItemCustomization;
  unitPrice: number;
  lineTotal: number;
}

export function buildCartId(productId: number, customization: CartItemCustomization): string {
  const key = JSON.stringify({ productId, ...customization });
  return btoa(key).slice(0, 16);
}

export function calcUnitPrice(product: MenuItem, customization: CartItemCustomization): number {
  const variantAdj = customization.variantChoices.reduce((s, c) => s + c.priceAdjustment, 0);
  const modifierAdj = customization.modifierChoices.reduce((s, c) => s + c.priceAdjustment, 0);
  return product.price + variantAdj + modifierAdj;
}
