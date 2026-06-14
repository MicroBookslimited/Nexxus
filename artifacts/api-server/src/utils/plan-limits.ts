import { db, productsTable, subscriptionPlansTable } from "@workspace/db";
import { and, eq, isNull, count } from "drizzle-orm";

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
