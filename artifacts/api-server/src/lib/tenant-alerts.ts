import { db, tenantUsageAlertsTable, tenantsTable } from "@workspace/db";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { computeTenantUsageList, type TenantUsageRow } from "./tenant-usage";

const DAY_MS = 24 * 60 * 60 * 1000;

export type AlertSeverity = "low" | "medium" | "high" | "critical";
export type AlertStatus = "open" | "resolved" | "dismissed";

export interface DerivedAlert {
  tenantId: number;
  alertType: string;
  severity: AlertSeverity;
  title: string;
  message: string;
}

/**
 * Pure function: given a computed usage row, derive the set of alert conditions
 * that currently apply to that tenant. De-duplication / persistence is handled
 * by generateTenantAlerts().
 */
export function deriveAlertsForTenant(r: TenantUsageRow): DerivedAlert[] {
  const out: DerivedAlert[] = [];

  if (r.subscriptionStatus === "past_due") {
    out.push({
      tenantId: r.tenantId,
      alertType: "past_due",
      severity: "high",
      title: "Subscription past due",
      message: `${r.businessName}'s subscription payment is past due.`,
    });
  }

  if (r.subscriptionStatus === "trial" && r.trialEndsAt) {
    const days = Math.ceil((new Date(r.trialEndsAt).getTime() - Date.now()) / DAY_MS);
    if (days <= 5) {
      out.push({
        tenantId: r.tenantId,
        alertType: "trial_ending",
        severity: days <= 1 ? "high" : "medium",
        title: "Trial ending soon",
        message: `Trial ends in ${days <= 0 ? "less than a day" : `${days} day(s)`} — follow up to convert.`,
      });
    }
  }

  if (r.activityLabel === "dormant" && (r.subscriptionStatus === "active" || r.subscriptionStatus === "trial")) {
    if (r.daysSinceActivity == null) {
      out.push({
        tenantId: r.tenantId,
        alertType: "no_activity",
        severity: "medium",
        title: "No recorded activity",
        message: "Onboarding may be incomplete — no logins or sales recorded yet.",
      });
    } else {
      out.push({
        tenantId: r.tenantId,
        alertType: "dormant",
        severity: r.daysSinceActivity >= 60 ? "high" : "medium",
        title: "Dormant account",
        message: `No activity for ${r.daysSinceActivity} day(s) on a ${r.subscriptionStatus} plan — re-engage.`,
      });
    }
  }

  const limitEntries: [string, number | null, number, number | null][] = [
    ["products", r.limitUsage.products, r.productCount, r.maxProducts],
    ["staff", r.limitUsage.staff, r.staffCount, r.maxStaff],
    ["locations", r.limitUsage.locations, r.locationCount, r.maxLocations],
  ];
  let worst: { name: string; ratio: number; used: number; max: number } | null = null;
  for (const [name, rt, used, max] of limitEntries) {
    if (rt == null || max == null) continue;
    if (rt >= 0.75 && (!worst || rt > worst.ratio)) worst = { name, ratio: rt, used, max };
  }
  if (worst) {
    out.push({
      tenantId: r.tenantId,
      alertType: "near_limit",
      severity: worst.ratio >= 1 ? "critical" : worst.ratio >= 0.9 ? "high" : "medium",
      title: "Approaching plan limit",
      message: `${worst.name} usage at ${worst.used}/${worst.max} (${Math.round(worst.ratio * 100)}%) — consider an upgrade.`,
    });
  }

  if (r.riskLabel === "high") {
    out.push({
      tenantId: r.tenantId,
      alertType: "high_resource_risk",
      severity: "high",
      title: "High resource usage",
      message: `Resource risk score ${r.resourceRiskScore} (~${r.estimatedRowCount.toLocaleString()} est. rows) — monitor capacity.`,
    });
  }

  return out;
}

/**
 * Recomputes usage for all tenants, derives current alert conditions, and
 * reconciles them with the persisted alerts:
 *  - creates new OPEN alerts for conditions not already open or dismissed
 *  - refreshes severity/title/message on still-open matching alerts
 *  - auto-resolves OPEN alerts whose condition no longer applies
 *
 * Dismissed alerts are left alone (and not recreated) until their condition
 * clears and recurs, so an operator's "dismiss" sticks.
 */
export async function generateTenantAlerts(): Promise<{ created: number; resolved: number; refreshed: number; openTotal: number }> {
  const rows = await computeTenantUsageList();
  const derived: DerivedAlert[] = [];
  for (const r of rows) derived.push(...deriveAlertsForTenant(r));

  const existing = await db
    .select({
      id: tenantUsageAlertsTable.id,
      tenantId: tenantUsageAlertsTable.tenantId,
      alertType: tenantUsageAlertsTable.alertType,
      severity: tenantUsageAlertsTable.severity,
      title: tenantUsageAlertsTable.title,
      message: tenantUsageAlertsTable.message,
      status: tenantUsageAlertsTable.status,
    })
    .from(tenantUsageAlertsTable)
    .where(inArray(tenantUsageAlertsTable.status, ["open", "dismissed"]));

  const key = (tenantId: number, alertType: string) => `${tenantId}:${alertType}`;
  const openByKey = new Map<string, (typeof existing)[number]>();
  const dismissedKeys = new Set<string>();
  for (const a of existing) {
    if (a.status === "open") openByKey.set(key(a.tenantId, a.alertType), a);
    else if (a.status === "dismissed") dismissedKeys.add(key(a.tenantId, a.alertType));
  }
  const derivedKeys = new Set(derived.map((d) => key(d.tenantId, d.alertType)));

  const toCreate: DerivedAlert[] = [];
  const toRefresh: { id: number; severity: AlertSeverity; title: string; message: string }[] = [];
  for (const d of derived) {
    const k = key(d.tenantId, d.alertType);
    const open = openByKey.get(k);
    if (open) {
      if (open.severity !== d.severity || open.title !== d.title || open.message !== d.message) {
        toRefresh.push({ id: open.id, severity: d.severity, title: d.title, message: d.message });
      }
    } else if (!dismissedKeys.has(k)) {
      toCreate.push(d);
    }
  }

  const toResolve = [...openByKey.values()].filter((a) => !derivedKeys.has(key(a.tenantId, a.alertType)));

  const openTotal = await db.transaction(async (tx) => {
    if (toCreate.length) {
      // onConflictDoNothing backstops the in-memory dedup: the partial unique
      // index (tenant_id, alert_type) WHERE status='open' guarantees no
      // duplicate open alert even if two generation runs race.
      await tx
        .insert(tenantUsageAlertsTable)
        .values(
          toCreate.map((d) => ({
            tenantId: d.tenantId,
            alertType: d.alertType,
            severity: d.severity,
            title: d.title,
            message: d.message,
            status: "open" as const,
          })),
        )
        .onConflictDoNothing({
          target: [tenantUsageAlertsTable.tenantId, tenantUsageAlertsTable.alertType],
          where: eq(tenantUsageAlertsTable.status, "open"),
        });
    }
    for (const u of toRefresh) {
      await tx
        .update(tenantUsageAlertsTable)
        .set({ severity: u.severity, title: u.title, message: u.message })
        .where(eq(tenantUsageAlertsTable.id, u.id));
    }
    if (toResolve.length) {
      await tx
        .update(tenantUsageAlertsTable)
        .set({ status: "resolved", resolvedAt: new Date(), note: "Auto-resolved: condition no longer met" })
        .where(inArray(tenantUsageAlertsTable.id, toResolve.map((a) => a.id)));
    }
    const [openCount] = await tx
      .select({ value: count() })
      .from(tenantUsageAlertsTable)
      .where(eq(tenantUsageAlertsTable.status, "open"));
    return Number(openCount?.value ?? 0);
  });

  return { created: toCreate.length, resolved: toResolve.length, refreshed: toRefresh.length, openTotal };
}

export interface AlertRow {
  id: number;
  tenantId: number;
  businessName: string | null;
  alertType: string;
  severity: string;
  title: string;
  message: string;
  status: string;
  note: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
}

export interface AlertListResult {
  alerts: AlertRow[];
  summary: { open: number; resolved: number; dismissed: number; bySeverity: Record<AlertSeverity, number> };
}

/**
 * Lists alerts (optionally filtered by status/severity) joined with the tenant
 * business name, plus a summary of counts used for the status tabs + badge.
 */
export async function listTenantAlerts(opts: { status?: string; severity?: string }): Promise<AlertListResult> {
  const filters = [] as ReturnType<typeof eq>[];
  if (opts.status && opts.status !== "all") filters.push(eq(tenantUsageAlertsTable.status, opts.status));
  if (opts.severity) filters.push(eq(tenantUsageAlertsTable.severity, opts.severity));

  const alerts = await db
    .select({
      id: tenantUsageAlertsTable.id,
      tenantId: tenantUsageAlertsTable.tenantId,
      businessName: tenantsTable.businessName,
      alertType: tenantUsageAlertsTable.alertType,
      severity: tenantUsageAlertsTable.severity,
      title: tenantUsageAlertsTable.title,
      message: tenantUsageAlertsTable.message,
      status: tenantUsageAlertsTable.status,
      note: tenantUsageAlertsTable.note,
      createdAt: tenantUsageAlertsTable.createdAt,
      resolvedAt: tenantUsageAlertsTable.resolvedAt,
    })
    .from(tenantUsageAlertsTable)
    .leftJoin(tenantsTable, eq(tenantsTable.id, tenantUsageAlertsTable.tenantId))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(tenantUsageAlertsTable.createdAt));

  const allForCounts = await db
    .select({ status: tenantUsageAlertsTable.status, severity: tenantUsageAlertsTable.severity })
    .from(tenantUsageAlertsTable);

  const summary = {
    open: 0,
    resolved: 0,
    dismissed: 0,
    bySeverity: { low: 0, medium: 0, high: 0, critical: 0 } as Record<AlertSeverity, number>,
  };
  for (const a of allForCounts) {
    if (a.status === "open") {
      summary.open++;
      if (a.severity in summary.bySeverity) summary.bySeverity[a.severity as AlertSeverity]++;
    } else if (a.status === "resolved") summary.resolved++;
    else if (a.status === "dismissed") summary.dismissed++;
  }

  return { alerts, summary };
}

/**
 * Updates a single alert's status (open|resolved|dismissed) and optional note.
 * Returns null if the alert does not exist.
 */
export async function updateTenantAlert(
  id: number,
  patch: { status?: AlertStatus; note?: string | null },
): Promise<AlertRow | null> {
  const set: Record<string, unknown> = {};
  if (patch.status) {
    set["status"] = patch.status;
    set["resolvedAt"] = patch.status === "resolved" ? new Date() : null;
  }
  if (patch.note !== undefined) set["note"] = patch.note;
  if (Object.keys(set).length === 0) {
    const [existing] = await db.select().from(tenantUsageAlertsTable).where(eq(tenantUsageAlertsTable.id, id)).limit(1);
    if (!existing) return null;
  } else {
    await db.update(tenantUsageAlertsTable).set(set).where(eq(tenantUsageAlertsTable.id, id));
  }

  const [row] = await db
    .select({
      id: tenantUsageAlertsTable.id,
      tenantId: tenantUsageAlertsTable.tenantId,
      businessName: tenantsTable.businessName,
      alertType: tenantUsageAlertsTable.alertType,
      severity: tenantUsageAlertsTable.severity,
      title: tenantUsageAlertsTable.title,
      message: tenantUsageAlertsTable.message,
      status: tenantUsageAlertsTable.status,
      note: tenantUsageAlertsTable.note,
      createdAt: tenantUsageAlertsTable.createdAt,
      resolvedAt: tenantUsageAlertsTable.resolvedAt,
    })
    .from(tenantUsageAlertsTable)
    .leftJoin(tenantsTable, eq(tenantsTable.id, tenantUsageAlertsTable.tenantId))
    .where(eq(tenantUsageAlertsTable.id, id))
    .limit(1);

  return row ?? null;
}
