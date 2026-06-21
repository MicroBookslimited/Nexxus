/**
 * Volume-pricing engine — a faithful port of the server's `applyVolumePricing`
 * (artifacts/api-server/src/lib/pricing.ts) so the mobile cart PREVIEW matches
 * what the server will charge. The server stays authoritative on the saved
 * order; this only drives the on-screen unit price + totals.
 */

import type { PricingTier } from "@/lib/nexus-api";

export interface PricingResult {
  /** Per-base-unit price after applying tiers (== basePrice when no tier matches). */
  unitPrice: number;
  /** The matching tier, if any (else null = base price). */
  tier: PricingTier | null;
  /** Per-base-unit savings vs. the base price. >= 0. */
  savings: number;
  /** Total line price = unitPrice * qty. */
  lineTotal: number;
}

/**
 * Pick the best tier for the given quantity and return the resulting price.
 * Evaluation mirrors the server exactly: tiers sorted by minQty ASC, the last
 * row whose `minQty <= qty <= (maxQty ?? +∞)` wins. If none match, basePrice.
 */
export function applyVolumePricing(
  basePrice: number,
  qty: number,
  tiers: PricingTier[],
): PricingResult {
  const sorted = [...tiers].sort((a, b) => a.minQty - b.minQty);
  let chosen: PricingTier | null = null;
  for (const t of sorted) {
    const max = t.maxQty ?? Number.POSITIVE_INFINITY;
    if (qty >= t.minQty && qty <= max) chosen = t;
  }
  const unitPrice = chosen ? chosen.unitPrice : basePrice;
  const savings = Math.max(0, basePrice - unitPrice);
  return { unitPrice, tier: chosen, savings, lineTotal: unitPrice * qty };
}
