import { pgTable, serial, text, integer, real, timestamp } from "drizzle-orm/pg-core";
import { staffTable } from "./staff";

export const cashSessionsTable = pgTable("cash_sessions", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().default(0),
  staffId: integer("staff_id").references(() => staffTable.id),
  staffName: text("staff_name").notNull(),
  locationId: integer("location_id"),
  locationName: text("location_name"),
  stationNumber: integer("station_number"),
  openingCash: real("opening_cash").notNull(),
  status: text("status").notNull().default("open"),
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  actualCash: real("actual_cash"),
  actualCard: real("actual_card"),
  actualOther: real("actual_other"),
  closingNotes: text("closing_notes"),
  denominationBreakdown: text("denomination_breakdown"),
});

export const cashPayoutsTable = pgTable("cash_payouts", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull().references(() => cashSessionsTable.id),
  amount: real("amount").notNull(),
  reason: text("reason").notNull(),
  staffName: text("staff_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Cash a field technician still physically holds after closing a shift.
 * Raised automatically when a technician closes with counted cash, and stays
 * "pending" until an admin, manager or staff member flagged as a cash
 * receiver signs for it — that signature is the tenant's proof of handover.
 * One row per closed shift (unique index on session_id).
 */
export const cashHandoversTable = pgTable("cash_handovers", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().default(0),
  sessionId: integer("session_id").notNull().references(() => cashSessionsTable.id),
  staffId: integer("staff_id"),
  staffName: text("staff_name").notNull(),
  // Amount the technician counted at close — what they are accountable for.
  amount: real("amount").notNull(),
  status: text("status").notNull().default("pending"),
  // Amount the receiver actually counted when signing (may differ).
  receivedAmount: real("received_amount"),
  receivedByStaffId: integer("received_by_staff_id"),
  receivedByName: text("received_by_name"),
  signature: text("signature"),
  notes: text("notes"),
  signedAt: timestamp("signed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CashSession = typeof cashSessionsTable.$inferSelect;
export type CashPayout = typeof cashPayoutsTable.$inferSelect;
export type CashHandover = typeof cashHandoversTable.$inferSelect;
