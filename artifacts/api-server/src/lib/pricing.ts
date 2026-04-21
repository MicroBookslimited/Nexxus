/**
 * Volume-pricing & unit-conversion engine.
 * Used by the orders, purchases, and POS surfaces so all decisions
 * are made in exactly one place.
 */

import type { ProductPricingTier, ProductPurchaseUnit } from "@workspace/db";

/** System-wide unit conversions used as defaults when a product has no
 *  per-product override. Factors are "base units per 1 of this unit"
 *  assuming the *base* is the singular form ("each", "g", "ml"). */
export const SYSTEM_UNIT_CONVERSIONS: Record<string, Record<string, number>> = {
  each: { dozen: 12, pair: 2, half_dozen: 6 },
  g:    { kg: 1000, mg: 0.001 },
  ml:   { l: 1000 },
  oz:   { lb: 16 },
};

/**
 * Resolve a `qty` expressed in `unitName` to the product's base unit.
 * Per-product purchase units win over the system table. An unknown unit
 * (and the base unit itself) is treated as factor 1.
 */
export function convertToBaseUnit(
  qty: number,
  unitName: string | null | undefined,
  baseUnit: string,
  purchaseUnits: Pick<ProductPurchaseUnit, "unitName" | "conversionFactor">[],
): number {
  if (!unitName || unitName === baseUnit) return qty;
  const u = unitName.toLowerCase();
  const override = purchaseUnits.find(p => p.unitName.toLowerCase() === u);
  if (override) return qty * override.conversionFactor;
  const sys = SYSTEM_UNIT_CONVERSIONS[baseUnit.toLowerCase()]?.[u];
  if (sys) return qty * sys;
  return qty; // unknown — assume already in base
}

export interface PricingResult {
  /** Per-base-unit price after applying tiers. */
  unitPrice: number;
  /** The matching tier, if any (else `null` = base price). */
  tier: ProductPricingTier | null;
  /** Per-base-unit savings vs. the base price. >= 0. */
  savings: number;
  /** Total line price = unitPrice * qty. */
  lineTotal: number;
}

/**
 * Pick the best tier for the given quantity and return the resulting price.
 * Evaluation order: tiers sorted by minQty ASC, first row whose
 * `minQty <= qty <= (maxQty ?? +∞)` wins. If no tier matches, basePrice.
 */
export function applyVolumePricing(
  basePrice: number,
  qty: number,
  tiers: ProductPricingTier[],
): PricingResult {
  const sorted = [...tiers].sort((a, b) => a.minQty - b.minQty);
  let chosen: ProductPricingTier | null = null;
  for (const t of sorted) {
    const max = t.maxQty ?? Number.POSITIVE_INFINITY;
    if (qty >= t.minQty && qty <= max) chosen = t;
  }
  const unitPrice = chosen ? chosen.unitPrice : basePrice;
  const savings = Math.max(0, basePrice - unitPrice);
  return { unitPrice, tier: chosen, savings, lineTotal: unitPrice * qty };
}
