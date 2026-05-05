import { db, subscriptionManualPaymentsTable, subscriptionsTable, subscriptionPlansTable } from "@workspace/db";
import { eq, and, lte, desc } from "drizzle-orm";

function addBillingCycle(date: Date, cycle: string): Date {
  const d = new Date(date);
  if (cycle === "annual") {
    d.setFullYear(d.getFullYear() + 1);
  } else {
    d.setMonth(d.getMonth() + 1);
  }
  return d;
}

/**
 * Compute the scheduledStartDate for a NEW manual payment for tenantId.
 * = max(currentPeriodEnd or trialEndsAt, last scheduled payment's end, now)
 * This enables chaining: multiple scheduled payments each start where the previous ends.
 */
export async function computeNextStartDate(tenantId: number): Promise<Date> {
  const now = new Date();

  const [subscription] = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.tenantId, tenantId));

  const [lastScheduled] = await db
    .select({ scheduledEndDate: subscriptionManualPaymentsTable.scheduledEndDate })
    .from(subscriptionManualPaymentsTable)
    .where(and(
      eq(subscriptionManualPaymentsTable.tenantId, tenantId),
      eq(subscriptionManualPaymentsTable.status, "scheduled"),
    ))
    .orderBy(desc(subscriptionManualPaymentsTable.scheduledEndDate))
    .limit(1);

  const candidates: Date[] = [now];

  if (subscription?.currentPeriodEnd) candidates.push(new Date(subscription.currentPeriodEnd));
  if (subscription?.trialEndsAt) candidates.push(new Date(subscription.trialEndsAt));
  if (lastScheduled?.scheduledEndDate) candidates.push(new Date(lastScheduled.scheduledEndDate));

  return new Date(Math.max(...candidates.map(d => d.getTime())));
}

/**
 * Apply all scheduled manual payments whose scheduledStartDate <= now for a given tenant.
 * Called on every /api/saas/me so activation is automatic.
 */
export async function applyDueManualPayments(tenantId: number): Promise<void> {
  const now = new Date();

  const duePayments = await db
    .select()
    .from(subscriptionManualPaymentsTable)
    .where(and(
      eq(subscriptionManualPaymentsTable.tenantId, tenantId),
      eq(subscriptionManualPaymentsTable.status, "scheduled"),
      lte(subscriptionManualPaymentsTable.scheduledStartDate, now),
    ))
    .orderBy(subscriptionManualPaymentsTable.scheduledStartDate);

  if (duePayments.length === 0) return;

  for (const payment of duePayments) {
    const [existingSub] = await db
      .select({ id: subscriptionsTable.id })
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.tenantId, tenantId));

    if (existingSub) {
      await db.update(subscriptionsTable)
        .set({
          planId: payment.planId,
          status: "active",
          billingCycle: payment.billingCycle,
          currentPeriodStart: payment.scheduledStartDate,
          currentPeriodEnd: payment.scheduledEndDate,
          provider: "manual",
          cancelledAt: null,
        })
        .where(eq(subscriptionsTable.tenantId, tenantId));
    } else {
      const [plan] = await db.select().from(subscriptionPlansTable).where(eq(subscriptionPlansTable.id, payment.planId));
      if (plan) {
        await db.insert(subscriptionsTable).values({
          tenantId,
          planId: payment.planId,
          status: "active",
          billingCycle: payment.billingCycle,
          provider: "manual",
          currentPeriodStart: payment.scheduledStartDate,
          currentPeriodEnd: payment.scheduledEndDate,
        });
      }
    }

    await db.update(subscriptionManualPaymentsTable)
      .set({ status: "applied", appliedAt: now, updatedAt: now })
      .where(eq(subscriptionManualPaymentsTable.id, payment.id));
  }
}

export { addBillingCycle };
