import { pgTable, serial, text, integer, real, timestamp, jsonb, date, uniqueIndex, index } from "drizzle-orm/pg-core";

/**
 * Lightweight per-tenant activity event log for the Super Admin analytics
 * dashboard. Written fire-and-forget at a small number of high-value choke
 * points (login, sale). Most other usage metrics are derived on the fly from
 * existing domain tables rather than instrumented here.
 */
export const tenantActivityEventsTable = pgTable("tenant_activity_events", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  userId: integer("user_id"),
  eventType: text("event_type").notNull(),
  eventReferenceId: text("event_reference_id"),
  metadata: jsonb("metadata"),
  ipAddress: text("ip_address"),
  deviceInfo: text("device_info"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("tenant_activity_events_tenant_created_idx").on(t.tenantId, t.createdAt),
  index("tenant_activity_events_event_type_idx").on(t.eventType),
]);
export type TenantActivityEvent = typeof tenantActivityEventsTable.$inferSelect;

/**
 * Daily per-tenant usage snapshot. One row per (tenant, date). Written by the
 * snapshot job (or the manual "run snapshots" action) and used for trend
 * charts and historical comparisons. Storage / API-request style figures are
 * estimates (no per-request instrumentation exists), used only for risk
 * scoring — never billed.
 */
export const tenantUsageSnapshotsTable = pgTable("tenant_usage_snapshots", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  snapshotDate: date("snapshot_date").notNull(),
  activeUsersDaily: integer("active_users_daily").notNull().default(0),
  activeUsersWeekly: integer("active_users_weekly").notNull().default(0),
  activeUsersMonthly: integer("active_users_monthly").notNull().default(0),
  productCount: integer("product_count").notNull().default(0),
  customerCount: integer("customer_count").notNull().default(0),
  staffCount: integer("staff_count").notNull().default(0),
  locationCount: integer("location_count").notNull().default(0),
  salesCount: integer("sales_count").notNull().default(0),
  salesCount30d: integer("sales_count_30d").notNull().default(0),
  salesTotal30d: real("sales_total_30d").notNull().default(0),
  inventoryMovementCount: integer("inventory_movement_count").notNull().default(0),
  reportGenerationCount: integer("report_generation_count").notNull().default(0),
  receiptPrintCount: integer("receipt_print_count").notNull().default(0),
  apiRequestCount: integer("api_request_count").notNull().default(0),
  uploadedFileCount: integer("uploaded_file_count").notNull().default(0),
  webhookEventCount: integer("webhook_event_count").notNull().default(0),
  storageUsedMb: real("storage_used_mb").notNull().default(0),
  estimatedRowCount: real("estimated_row_count").notNull().default(0),
  activityScore: real("activity_score").notNull().default(0),
  resourceRiskScore: real("resource_risk_score").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("tenant_usage_snapshots_tenant_date_idx").on(t.tenantId, t.snapshotDate),
]);
export type TenantUsageSnapshot = typeof tenantUsageSnapshotsTable.$inferSelect;

/**
 * Super Admin alerts surfaced in the Alerts Center (dormant tenants, trials
 * ending, plan limits reached, high resource usage, etc.). De-duplicated on
 * (tenant, alertType) while still open.
 */
export const tenantUsageAlertsTable = pgTable("tenant_usage_alerts", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  alertType: text("alert_type").notNull(),
  // low | medium | high | critical
  severity: text("severity").notNull().default("medium"),
  title: text("title").notNull(),
  message: text("message").notNull().default(""),
  // open | resolved | dismissed
  status: text("status").notNull().default("open"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
}, (t) => [
  index("tenant_usage_alerts_status_idx").on(t.status),
  index("tenant_usage_alerts_tenant_idx").on(t.tenantId),
]);
export type TenantUsageAlert = typeof tenantUsageAlertsTable.$inferSelect;
