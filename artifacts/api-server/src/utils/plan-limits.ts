import { db, productsTable, subscriptionPlansTable, subscriptionsTable } from "@workspace/db";
import { and, eq, isNull, count, asc } from "drizzle-orm";

/**
 * Plan product-limit enforcement.
 *
 * A tenant must not be able to subscribe to (or downgrade to) a plan whose
 * `maxProducts` is smaller than the number of products they already have.
 * Only active (non-archived) products count toward the limit — archived
 * products are soft-deleted and should not consume plan quota.
 */
export async function getActiveProductCount(tenantId: number): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(productsTable)
    .where(and(eq(productsTable.tenantId, tenantId), isNull(productsTable.archivedAt)));
  return Number(row?.n ?? 0);
}

export type PlanLimitError = {
  error: string;
  code: "PLAN_PRODUCT_LIMIT";
  productCount: number;
  maxProducts: number;
  planName: string;
};

/**
 * Returns a 409-style error payload when the tenant's product count exceeds the
 * plan's `maxProducts`, otherwise `null`.
 */
export function planProductLimitError(
  plan: typeof subscriptionPlansTable.$inferSelect,
  productCount: number,
): PlanLimitError | null {
  if (plan.maxProducts != null && productCount > plan.maxProducts) {
    return {
      error: `Your account has ${productCount} active products, which exceeds the ${plan.name} plan limit of ${plan.maxProducts}. Archive or remove products, or choose a higher plan, before switching to ${plan.name}.`,
      code: "PLAN_PRODUCT_LIMIT",
      productCount,
      maxProducts: plan.maxProducts,
      planName: plan.name,
    };
  }
  return null;
}

export type RecommendedPlan = {
  name: string;
  slug: string;
  maxProducts: number | null;
  priceMonthly: number;
  priceAnnual: number;
};

export type PlanLimitStatus = {
  /** Whether a plan with a finite product limit is in effect. */
  enforced: boolean;
  productCount: number;
  /** The current plan's product limit (null = unlimited / no plan). */
  maxProducts: number | null;
  planName: string | null;
  planSlug: string | null;
  /** True when adding one more product would exceed the limit. */
  atLimit: boolean;
  /** How many products the tenant is currently over the limit by (0 if within). */
  overBy: number;
  /**
   * Cheapest active plan whose maxProducts can accommodate the tenant.
   * For an over-limit tenant this fits the current count; otherwise it fits
   * count + 1 (room to add at least one more). Null when none is large enough
   * or the tenant is comfortably within their current plan.
   */
  recommendedPlan: RecommendedPlan | null;
};

/**
 * Resolves the tenant's current plan product-limit posture: how many products
 * they have, what their plan allows, whether they are at/over the limit, and
 * which plan to upgrade to. Fails open (enforced: false) when the tenant has no
 * resolvable plan or an unlimited (null) maxProducts.
 */
export async function getPlanLimitStatus(tenantId: number): Promise<PlanLimitStatus> {
  const productCount = await getActiveProductCount(tenantId);

  const [sub] = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.tenantId, tenantId));

  let plan: typeof subscriptionPlansTable.$inferSelect | undefined;
  if (sub?.planId != null) {
    [plan] = await db
      .select()
      .from(subscriptionPlansTable)
      .where(eq(subscriptionPlansTable.id, sub.planId));
  }

  const maxProducts = plan?.maxProducts ?? null;

  // Fail open: no plan, or an unlimited plan — nothing to enforce.
  if (!plan || maxProducts == null) {
    return {
      enforced: false,
      productCount,
      maxProducts,
      planName: plan?.name ?? null,
      planSlug: plan?.slug ?? null,
      atLimit: false,
      overBy: 0,
      recommendedPlan: null,
    };
  }

  const overBy = Math.max(0, productCount - maxProducts);
  // atLimit: cannot add one more without exceeding the limit.
  const atLimit = productCount >= maxProducts;

  let recommendedPlan: RecommendedPlan | null = null;
  if (atLimit || overBy > 0) {
    // We need room for at least one product beyond the current count.
    const needed = productCount + 1;
    const plans = await db
      .select()
      .from(subscriptionPlansTable)
      .where(eq(subscriptionPlansTable.isActive, true))
      .orderBy(asc(subscriptionPlansTable.maxProducts), asc(subscriptionPlansTable.priceMonthly));
    const fit = plans.find(
      (p) =>
        p.id !== plan!.id &&
        p.maxProducts != null &&
        p.maxProducts >= needed &&
        p.priceMonthly > 0, // never suggest a free plan as an upgrade path
    );
    if (fit) {
      recommendedPlan = {
        name: fit.name,
        slug: fit.slug,
        maxProducts: fit.maxProducts,
        priceMonthly: fit.priceMonthly,
        priceAnnual: fit.priceAnnual,
      };
    }
  }

  return {
    enforced: true,
    productCount,
    maxProducts,
    planName: plan.name,
    planSlug: plan.slug,
    atLimit,
    overBy,
    recommendedPlan,
  };
}
