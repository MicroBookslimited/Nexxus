import { pgTable, serial, text, integer, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { staffTable } from "./staff";
import { locationsTable } from "./locations";

export const staffSessionsTable = pgTable(
  "staff_sessions",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").notNull(),
    staffId: integer("staff_id").notNull().references(() => staffTable.id),
    staffName: text("staff_name").notNull(),
    locationId: integer("location_id").references(() => locationsTable.id),
    locationName: text("location_name"),
    clockInTime: timestamp("clock_in_time", { withTimezone: true }).notNull().defaultNow(),
    clockOutTime: timestamp("clock_out_time", { withTimezone: true }),
    status: text("status").notNull().default("active"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantStaffStatusIdx: index("staff_sessions_tenant_staff_status_idx").on(
      t.tenantId,
      t.staffId,
      t.status,
    ),
    tenantClockInIdx: index("staff_sessions_tenant_clock_in_idx").on(
      t.tenantId,
      t.clockInTime,
    ),
    // Prevents the same staff from having two active shifts at once
    // (also acts as a hard guard against TOCTOU races on clock-in).
    oneActivePerStaff: uniqueIndex("staff_sessions_one_active_per_staff")
      .on(t.tenantId, t.staffId)
      .where(sql`status = 'active'`),
  }),
);

export type StaffSession = typeof staffSessionsTable.$inferSelect;
export type NewStaffSession = typeof staffSessionsTable.$inferInsert;
