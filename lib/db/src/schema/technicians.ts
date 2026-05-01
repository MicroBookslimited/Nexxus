import { pgTable, serial, text, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const techniciansTable = pgTable("technicians", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  phone: text("phone"),
  // pending | approved | suspended | rejected
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  approvedBy: text("approved_by"),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
});

export const technicianAssignmentsTable = pgTable("technician_assignments", {
  id: serial("id").primaryKey(),
  technicianId: integer("technician_id").notNull().references(() => techniciansTable.id, { onDelete: "cascade" }),
  tenantId: integer("tenant_id").notNull(),
  assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
  assignedBy: text("assigned_by"),
}, t => ({
  techTenantUniq: uniqueIndex("technician_assignments_tech_tenant_uniq").on(t.technicianId, t.tenantId),
}));
