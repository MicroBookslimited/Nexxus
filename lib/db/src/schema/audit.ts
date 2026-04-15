import { pgTable, serial, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";

export const impersonationLogsTable = pgTable("impersonation_logs", {
  id: serial("id").primaryKey(),
  superadminEmail: text("superadmin_email").notNull(),
  tenantId: integer("tenant_id").notNull(),
  tenantEmail: text("tenant_email").notNull(),
  businessName: text("business_name").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  notes: text("notes"),
});

export const auditLogsTable = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  staffId: integer("staff_id"),
  staffName: text("staff_name"),
  action: text("action").notNull(),
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  details: jsonb("details"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
