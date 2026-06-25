import {
  db,
  tenantsTable,
  subscriptionsTable,
  subscriptionPlansTable,
  productsTable,
  customersTable,
  staffTable,
  locationsTable,
  ordersTable,
  orderItemsTable,
  stockMovementsTable,
  auditLogsTable,
  tenantActivityEventsTable,
  tenantUsageSnapshotsTable,
} from "@workspace/db";
import { and, count, desc, eq, gte, isNull, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

const DAY_MS = 24 * 60 * 60 * 1000;
const AVG_ROW_KB = 1.5; // rough estimate used only for risk scoring, never billed

export type ActivityLabel = "active" | "moderate" | "low" | "dormant";
export type RiskLabel = "low" | "medium" | "high";

export interface TenantUsageRow {
  tenantId: number;
  businessName: string;
  ownerName: string;
  email: string;
  country: string | null;
  status: string;
  createdAt: Date;
  lastLoginAt: Date | null;
  subscriptionStatus: string | null;
  planId: number | null;
  planName: string | null;
  billingCycle: string | null;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  maxProducts: number | null;
  maxStaff: number | null;
  maxLocations: number | null;
  productCount: number;
  customerCount: number;
  staffCount: number;
  locationCount: number;
  salesCount: number;
  salesTotal: number;
  salesCount30d: number;
  salesTotal30d: number;
  orderItemCount: number;
  inventoryMovementCount: number;
  lastActivityAt: Date | null;
  daysSinceActivity: number | null;
  estimatedRowCount: number;
  estimatedStorageMb: number;
  activityScore: number;
  resourceRiskScore: number;
  activityLabel: ActivityLabel;
  riskLabel: RiskLabel;
  costRiskCategory: RiskLabel;
  limitUsage: { products: number | null; staff: number | null; locations: number | null };
  recommendations: string[];
}

type NumMap = Map<number, number>;
type DateMap = Map<number, Date>;

function numMap(rows: { tenantId: number | null; value: number | null }[]): NumMap {
  const m: NumMap = new Map();
  for (const r of rows) if (r.tenantId != null) m.set(r.tenantId, Number(r.value ?? 0));
  return m;
}
function dateMap(rows: { tenantId: number | null; value: Date | string | null }[]): DateMap {
  const m: DateMap = new Map();
  for (const r of rows) {
    if (r.tenantId == null || !r.value) continue;
    const d = r.value instanceof Date ? r.value : new Date(r.value);
    if (!Number.isNaN(d.getTime())) m.set(r.tenantId, d);
  }
  return m;
}
function maxDate(...dates: (Date | null | undefined)[]): Date | null {
  let best: Date | null = null;
  for (const d of dates) {
    if (d && (!best || d > best)) best = d;
  }
  return best;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function activityScoreOf(input: {
  daysSinceActivity: number | null;
  salesCount30d: number;
  productCount: number;
  customerCount: number;
  staffCount: number;
  locationCount: number;
}): number {
  // recency 0-40
  let recency = 0;
  const d = input.daysSinceActivity;
  if (d == null) recency = 0;
  else if (d <= 1) recency = 40;
  else if (d <= 3) recency = 32;
  else if (d <= 7) recency = 24;
  else if (d <= 14) recency = 16;
  else if (d <= 30) recency = 8;
  else recency = 0;
  // volume 0-40
  const volume = clamp(input.salesCount30d * 2, 0, 40);
  // breadth 0-20
  let breadth = 0;
  if (input.productCount > 0) breadth += 6;
  if (input.customerCount > 0) breadth += 5;
  if (input.staffCount > 0) breadth += 5;
  if (input.locationCount > 0) breadth += 4;
  return Math.round(clamp(recency + volume + breadth, 0, 100));
}

function resourceRiskScoreOf(input: {
  limitUsage: { products: number | null; staff: number | null; locations: number | null };
  estimatedRowCount: number;
}): number {
  const ratios = [input.limitUsage.products, input.limitUsage.staff, input.limitUsage.locations].filter(
    (r): r is number => r != null,
  );
  const maxRatio = ratios.length ? Math.max(...ratios) : 0;
  const limitPressure = clamp(maxRatio * 60, 0, 60); // 0-60
  const heaviness = clamp(input.estimatedRowCount / 500, 0, 40); // 20k rows -> 40
  return Math.round(clamp(limitPressure + heaviness, 0, 100));
}

function labelActivity(score: number, daysSinceActivity: number | null): ActivityLabel {
  if (daysSinceActivity == null || daysSinceActivity > 30) return "dormant";
  if (score >= 60) return "active";
  if (score >= 30) return "moderate";
  if (score >= 10) return "low";
  return "dormant";
}
function labelRisk(score: number): RiskLabel {
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  return "low";
}

function ratio(used: number, max: number | null): number | null {
  if (max == null || max <= 0 || max >= 9999) return null;
  return used / max;
}

function buildRecommendations(r: TenantUsageRow): string[] {
  const out: string[] = [];
  const limits: [string, number | null, number, number | null][] = [
    ["product", r.limitUsage.products, r.productCount, r.maxProducts],
    ["staff", r.limitUsage.staff, r.staffCount, r.maxStaff],
    ["location", r.limitUsage.locations, r.locationCount, r.maxLocations],
  ];
  for (const [name, rt, used, max] of limits) {
    if (rt == null || max == null) continue;
    if (rt >= 0.9) out.push(`Near ${name} limit (${used}/${max}) — recommend plan upgrade`);
    else if (rt >= 0.75) out.push(`Approaching ${name} limit (${used}/${max})`);
  }
  if (r.subscriptionStatus === "trial" && r.trialEndsAt) {
    const days = Math.ceil((r.trialEndsAt.getTime() - Date.now()) / DAY_MS);
    if (days <= 5) out.push(`Trial ends in ${days <= 0 ? "0" : days} day(s) — follow up to convert`);
  }
  if (r.subscriptionStatus === "past_due") out.push("Subscription payment is past due");
  if (r.activityLabel === "dormant" && (r.subscriptionStatus === "active" || r.subscriptionStatus === "trial")) {
    out.push(
      r.daysSinceActivity == null
        ? "No recorded activity yet — onboarding may be incomplete"
        : `Dormant for ${r.daysSinceActivity} day(s) — re-engage`,
    );
  }
  if (r.salesCount30d >= 500) out.push("High sales volume — candidate for a higher tier");
  return out;
}

/**
 * Computes per-tenant usage + scores for ALL tenants using batched aggregate
 * queries (group-by, no per-tenant loop queries).
 */
export async function computeTenantUsageList(tenantId?: number): Promise<TenantUsageRow[]> {
  const since30 = new Date(Date.now() - 30 * DAY_MS);
  const tf = (col: AnyPgColumn) => (tenantId != null ? eq(col, tenantId) : undefined);

  const [
    tenants,
    productRows,
    customerRows,
    staffRows,
    locationRows,
    orderAllRows,
    order30Rows,
    orderItemRows,
    stockRows,
    auditRows,
    eventRows,
  ] = await Promise.all([
    db
      .select({
        id: tenantsTable.id,
        businessName: tenantsTable.businessName,
        ownerName: tenantsTable.ownerName,
        email: tenantsTable.email,
        country: tenantsTable.country,
        status: tenantsTable.status,
        createdAt: tenantsTable.createdAt,
        lastLoginAt: tenantsTable.lastLoginAt,
        subscriptionStatus: subscriptionsTable.status,
        planId: subscriptionsTable.planId,
        billingCycle: subscriptionsTable.billingCycle,
        trialEndsAt: subscriptionsTable.trialEndsAt,
        currentPeriodEnd: subscriptionsTable.currentPeriodEnd,
        planName: subscriptionPlansTable.name,
        maxProducts: subscriptionPlansTable.maxProducts,
        maxStaff: subscriptionPlansTable.maxStaff,
        maxLocations: subscriptionPlansTable.maxLocations,
      })
      .from(tenantsTable)
      .leftJoin(subscriptionsTable, eq(subscriptionsTable.tenantId, tenantsTable.id))
      .leftJoin(subscriptionPlansTable, eq(subscriptionsTable.planId, subscriptionPlansTable.id))
      .where(tf(tenantsTable.id))
      .orderBy(desc(tenantsTable.createdAt)),
    db
      .select({ tenantId: productsTable.tenantId, value: count() })
      .from(productsTable)
      .where(and(isNull(productsTable.archivedAt), tf(productsTable.tenantId)))
      .groupBy(productsTable.tenantId),
    db.select({ tenantId: customersTable.tenantId, value: count() }).from(customersTable).where(tf(customersTable.tenantId)).groupBy(customersTable.tenantId),
    db.select({ tenantId: staffTable.tenantId, value: count() }).from(staffTable).where(tf(staffTable.tenantId)).groupBy(staffTable.tenantId),
    db.select({ tenantId: locationsTable.tenantId, value: count() }).from(locationsTable).where(tf(locationsTable.tenantId)).groupBy(locationsTable.tenantId),
    db
      .select({
        tenantId: ordersTable.tenantId,
        value: count(),
        total: sql<number>`COALESCE(SUM(${ordersTable.total}), 0)`,
        last: sql<Date | null>`MAX(${ordersTable.createdAt})`,
      })
      .from(ordersTable)
      .where(tf(ordersTable.tenantId))
      .groupBy(ordersTable.tenantId),
    db
      .select({
        tenantId: ordersTable.tenantId,
        value: count(),
        total: sql<number>`COALESCE(SUM(${ordersTable.total}), 0)`,
      })
      .from(ordersTable)
      .where(and(gte(ordersTable.createdAt, since30), tf(ordersTable.tenantId)))
      .groupBy(ordersTable.tenantId),
    db
      .select({ tenantId: ordersTable.tenantId, value: count() })
      .from(orderItemsTable)
      .innerJoin(ordersTable, eq(orderItemsTable.orderId, ordersTable.id))
      .where(tf(ordersTable.tenantId))
      .groupBy(ordersTable.tenantId),
    db.select({ tenantId: stockMovementsTable.tenantId, value: count() }).from(stockMovementsTable).where(tf(stockMovementsTable.tenantId)).groupBy(stockMovementsTable.tenantId),
    db
      .select({ tenantId: auditLogsTable.tenantId, value: sql<Date | null>`MAX(${auditLogsTable.createdAt})` })
      .from(auditLogsTable)
      .where(tf(auditLogsTable.tenantId))
      .groupBy(auditLogsTable.tenantId),
    db
      .select({ tenantId: tenantActivityEventsTable.tenantId, value: sql<Date | null>`MAX(${tenantActivityEventsTable.createdAt})` })
      .from(tenantActivityEventsTable)
      .where(tf(tenantActivityEventsTable.tenantId))
      .groupBy(tenantActivityEventsTable.tenantId),
  ]);

  const products = numMap(productRows);
  const customers = numMap(customerRows);
  const staff = numMap(staffRows);
  const locations = numMap(locationRows);
  const ordersCount = numMap(orderAllRows.map((r) => ({ tenantId: r.tenantId, value: r.value })));
  const ordersTotal = numMap(orderAllRows.map((r) => ({ tenantId: r.tenantId, value: r.total })));
  const ordersLast = dateMap(orderAllRows.map((r) => ({ tenantId: r.tenantId, value: r.last })));
  const orders30Count = numMap(order30Rows.map((r) => ({ tenantId: r.tenantId, value: r.value })));
  const orders30Total = numMap(order30Rows.map((r) => ({ tenantId: r.tenantId, value: r.total })));
  const orderItems = numMap(orderItemRows);
  const stock = numMap(stockRows);
  const auditLast = dateMap(auditRows.map((r) => ({ tenantId: r.tenantId, value: r.value })));
  const eventLast = dateMap(eventRows.map((r) => ({ tenantId: r.tenantId, value: r.value })));

  const now = Date.now();
  return tenants.map((t) => {
    const productCount = products.get(t.id) ?? 0;
    const customerCount = customers.get(t.id) ?? 0;
    const staffCount = staff.get(t.id) ?? 0;
    const locationCount = locations.get(t.id) ?? 0;
    const salesCount = ordersCount.get(t.id) ?? 0;
    const salesTotal = Math.round((ordersTotal.get(t.id) ?? 0) * 100) / 100;
    const salesCount30d = orders30Count.get(t.id) ?? 0;
    const salesTotal30d = Math.round((orders30Total.get(t.id) ?? 0) * 100) / 100;
    const orderItemCount = orderItems.get(t.id) ?? 0;
    const inventoryMovementCount = stock.get(t.id) ?? 0;

    const lastActivityAt = maxDate(t.lastLoginAt, ordersLast.get(t.id), auditLast.get(t.id), eventLast.get(t.id));
    const daysSinceActivity = lastActivityAt ? Math.floor((now - lastActivityAt.getTime()) / DAY_MS) : null;

    const estimatedRowCount =
      productCount + customerCount + staffCount + locationCount + salesCount + orderItemCount + inventoryMovementCount;
    const estimatedStorageMb = Math.round(((estimatedRowCount * AVG_ROW_KB) / 1024) * 100) / 100;

    const limitUsage = {
      products: ratio(productCount, t.maxProducts),
      staff: ratio(staffCount, t.maxStaff),
      locations: ratio(locationCount, t.maxLocations),
    };

    const activityScore = activityScoreOf({ daysSinceActivity, salesCount30d, productCount, customerCount, staffCount, locationCount });
    const resourceRiskScore = resourceRiskScoreOf({ limitUsage, estimatedRowCount });
    const activityLabel = labelActivity(activityScore, daysSinceActivity);
    const riskLabel = labelRisk(resourceRiskScore);

    const row: TenantUsageRow = {
      tenantId: t.id,
      businessName: t.businessName,
      ownerName: t.ownerName,
      email: t.email,
      country: t.country,
      status: t.status,
      createdAt: t.createdAt,
      lastLoginAt: t.lastLoginAt,
      subscriptionStatus: t.subscriptionStatus,
      planId: t.planId,
      planName: t.planName,
      billingCycle: t.billingCycle,
      trialEndsAt: t.trialEndsAt,
      currentPeriodEnd: t.currentPeriodEnd,
      maxProducts: t.maxProducts,
      maxStaff: t.maxStaff,
      maxLocations: t.maxLocations,
      productCount,
      customerCount,
      staffCount,
      locationCount,
      salesCount,
      salesTotal,
      salesCount30d,
      salesTotal30d,
      orderItemCount,
      inventoryMovementCount,
      lastActivityAt,
      daysSinceActivity,
      estimatedRowCount,
      estimatedStorageMb,
      activityScore,
      resourceRiskScore,
      activityLabel,
      riskLabel,
      costRiskCategory: riskLabel,
      limitUsage,
      recommendations: [],
    };
    row.recommendations = buildRecommendations(row);
    return row;
  });
}

export interface OverviewResult {
  totals: {
    tenants: number;
    activeSubscriptions: number;
    trialSubscriptions: number;
    pastDue: number;
    cancelled: number;
  };
  activity: {
    activeToday: number;
    active7d: number;
    active30d: number;
    dormant: number;
    avgActivityScore: number;
  };
  resource: {
    totalEstimatedRows: number;
    totalEstimatedStorageMb: number;
    avgResourceRiskScore: number;
    costRisk: { low: number; medium: number; high: number };
    topResourceTenants: { tenantId: number; businessName: string; estimatedRowCount: number; resourceRiskScore: number; costRiskCategory: RiskLabel }[];
  };
  plans: { planName: string | null; count: number }[];
  alerts: { dormant: number; trialEnding: number; pastDue: number; nearLimit: number };
  generatedAt: string;
}

export function buildOverview(rows: TenantUsageRow[]): OverviewResult {
  const totals = { tenants: rows.length, activeSubscriptions: 0, trialSubscriptions: 0, pastDue: 0, cancelled: 0 };
  const activity = { activeToday: 0, active7d: 0, active30d: 0, dormant: 0, avgActivityScore: 0 };
  const costRisk = { low: 0, medium: 0, high: 0 };
  const planCounts = new Map<string | null, number>();
  const alerts = { dormant: 0, trialEnding: 0, pastDue: 0, nearLimit: 0 };

  let rowSum = 0;
  let storageSum = 0;
  let activitySum = 0;
  let riskSum = 0;

  for (const r of rows) {
    if (r.subscriptionStatus === "active") totals.activeSubscriptions++;
    else if (r.subscriptionStatus === "trial") totals.trialSubscriptions++;
    else if (r.subscriptionStatus === "past_due") totals.pastDue++;
    else if (r.subscriptionStatus === "cancelled") totals.cancelled++;

    if (r.daysSinceActivity != null) {
      if (r.daysSinceActivity === 0) activity.activeToday++;
      if (r.daysSinceActivity <= 7) activity.active7d++;
      if (r.daysSinceActivity <= 30) activity.active30d++;
    }
    if (r.activityLabel === "dormant") activity.dormant++;

    costRisk[r.costRiskCategory]++;
    planCounts.set(r.planName, (planCounts.get(r.planName) ?? 0) + 1);

    rowSum += r.estimatedRowCount;
    storageSum += r.estimatedStorageMb;
    activitySum += r.activityScore;
    riskSum += r.resourceRiskScore;

    if (r.activityLabel === "dormant" && (r.subscriptionStatus === "active" || r.subscriptionStatus === "trial")) alerts.dormant++;
    if (r.subscriptionStatus === "trial" && r.trialEndsAt) {
      const days = Math.ceil((r.trialEndsAt.getTime() - Date.now()) / DAY_MS);
      if (days <= 5) alerts.trialEnding++;
    }
    if (r.subscriptionStatus === "past_due") alerts.pastDue++;
    const maxRatio = Math.max(...[r.limitUsage.products, r.limitUsage.staff, r.limitUsage.locations].map((x) => x ?? 0));
    if (maxRatio >= 0.75) alerts.nearLimit++;
  }

  const n = rows.length || 1;
  activity.avgActivityScore = Math.round(activitySum / n);

  const topResourceTenants = [...rows]
    .sort((a, b) => b.estimatedRowCount - a.estimatedRowCount)
    .slice(0, 10)
    .map((r) => ({
      tenantId: r.tenantId,
      businessName: r.businessName,
      estimatedRowCount: r.estimatedRowCount,
      resourceRiskScore: r.resourceRiskScore,
      costRiskCategory: r.costRiskCategory,
    }));

  return {
    totals,
    activity,
    resource: {
      totalEstimatedRows: rowSum,
      totalEstimatedStorageMb: Math.round(storageSum * 100) / 100,
      avgResourceRiskScore: Math.round(riskSum / n),
      costRisk,
      topResourceTenants,
    },
    plans: [...planCounts.entries()].map(([planName, c]) => ({ planName, count: c })),
    alerts,
    generatedAt: new Date().toISOString(),
  };
}

export interface TenantDetailResult {
  tenant: TenantUsageRow;
  featureAdoption: { key: string; label: string; adopted: boolean }[];
  salesTrend: { date: string; count: number; total: number }[];
  recentEvents: { id: number; eventType: string; createdAt: Date; metadata: unknown }[];
}

export async function computeTenantDetail(tenantId: number): Promise<TenantDetailResult | null> {
  const list = await computeTenantUsageList(tenantId);
  const tenant = list.find((r) => r.tenantId === tenantId);
  if (!tenant) return null;

  const since14 = new Date(Date.now() - 14 * DAY_MS);
  const [onlineRows, trendRows, recentEvents] = await Promise.all([
    db
      .select({ value: count() })
      .from(ordersTable)
      .where(and(eq(ordersTable.tenantId, tenantId), sql`${ordersTable.salesChannel} <> 'pos'`)),
    db
      .select({
        date: sql<string>`to_char(${ordersTable.createdAt}, 'YYYY-MM-DD')`,
        count: count(),
        total: sql<number>`COALESCE(SUM(${ordersTable.total}), 0)`,
      })
      .from(ordersTable)
      .where(and(eq(ordersTable.tenantId, tenantId), gte(ordersTable.createdAt, since14)))
      .groupBy(sql`to_char(${ordersTable.createdAt}, 'YYYY-MM-DD')`)
      .orderBy(sql`to_char(${ordersTable.createdAt}, 'YYYY-MM-DD')`),
    db
      .select({
        id: tenantActivityEventsTable.id,
        eventType: tenantActivityEventsTable.eventType,
        createdAt: tenantActivityEventsTable.createdAt,
        metadata: tenantActivityEventsTable.metadata,
      })
      .from(tenantActivityEventsTable)
      .where(eq(tenantActivityEventsTable.tenantId, tenantId))
      .orderBy(desc(tenantActivityEventsTable.createdAt))
      .limit(50),
  ]);

  const onlineOrders = Number(onlineRows[0]?.value ?? 0);

  const featureAdoption = [
    { key: "pos", label: "POS Sales", adopted: tenant.salesCount > 0 },
    { key: "inventory", label: "Inventory Tracking", adopted: tenant.inventoryMovementCount > 0 },
    { key: "customers", label: "Customers / Loyalty", adopted: tenant.customerCount > 0 },
    { key: "staff", label: "Multiple Staff", adopted: tenant.staffCount > 1 },
    { key: "multiLocation", label: "Multi-Location", adopted: tenant.locationCount > 1 },
    { key: "onlineOrders", label: "Online / Off-POS Orders", adopted: onlineOrders > 0 },
  ];

  return {
    tenant,
    featureAdoption,
    salesTrend: trendRows.map((r) => ({ date: r.date, count: Number(r.count), total: Math.round(Number(r.total) * 100) / 100 })),
    recentEvents,
  };
}

/**
 * Generates / upserts today's usage snapshot for every tenant. Used by the
 * manual "run snapshots" action (and a scheduled job in a later phase).
 */
export async function generateTenantUsageSnapshots(): Promise<{ tenants: number; snapshotDate: string }> {
  const rows = await computeTenantUsageList();
  const snapshotDate = new Date().toISOString().slice(0, 10);

  for (const r of rows) {
    const values = {
      tenantId: r.tenantId,
      snapshotDate,
      productCount: r.productCount,
      customerCount: r.customerCount,
      staffCount: r.staffCount,
      locationCount: r.locationCount,
      salesCount: r.salesCount,
      salesCount30d: r.salesCount30d,
      salesTotal30d: r.salesTotal30d,
      inventoryMovementCount: r.inventoryMovementCount,
      estimatedRowCount: r.estimatedRowCount,
      storageUsedMb: r.estimatedStorageMb,
      activityScore: r.activityScore,
      resourceRiskScore: r.resourceRiskScore,
    };
    await db
      .insert(tenantUsageSnapshotsTable)
      .values(values)
      .onConflictDoUpdate({
        target: [tenantUsageSnapshotsTable.tenantId, tenantUsageSnapshotsTable.snapshotDate],
        set: values,
      });
  }

  return { tenants: rows.length, snapshotDate };
}
