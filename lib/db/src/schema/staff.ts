import { pgTable, serial, text, boolean, timestamp, integer } from "drizzle-orm/pg-core";

export const staffTable = pgTable("staff", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id"),
  name: text("name").notNull(),
  pin: text("pin").notNull(),
  role: text("role").notNull().default("cashier"),
  // Field technician flag (Work Orders module): technicians sign into the FSM
  // app and must have an email on file.
  isTechnician: boolean("is_technician").notNull().default(false),
  email: text("email"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Staff = typeof staffTable.$inferSelect;
