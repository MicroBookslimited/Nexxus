import { pgTable, serial, text, integer, real, timestamp } from "drizzle-orm/pg-core";
import { staffTable } from "./staff";

export const cashSessionsTable = pgTable("cash_sessions", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().default(0),
  staffId: integer("staff_id").references(() => staffTable.id),
  staffName: text("staff_name").notNull(),
  openingCash: real("opening_cash").notNull(),
  status: text("status").notNull().default("open"),
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  actualCash: real("actual_cash"),
  actualCard: real("actual_card"),
  actualOther: real("actual_other"),
  closingNotes: text("closing_notes"),
});

export const cashPayoutsTable = pgTable("cash_payouts", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull().references(() => cashSessionsTable.id),
  amount: real("amount").notNull(),
  reason: text("reason").notNull(),
  staffName: text("staff_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CashSession = typeof cashSessionsTable.$inferSelect;
export type CashPayout = typeof cashPayoutsTable.$inferSelect;
