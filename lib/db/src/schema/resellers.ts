import { pgTable, serial, text, integer, real, timestamp, boolean } from "drizzle-orm/pg-core";
import { tenantsTable } from "./saas";

export const resellersTable = pgTable("resellers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  companyName: text("company_name"),
  phone: text("phone"),
  referralCode: text("referral_code").notNull().unique(),
  commissionRate: real("commission_rate").notNull().default(0.30),
  status: text("status").notNull().default("active"),
  paymentDetails: text("payment_details"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const resellerCommissionsTable = pgTable("reseller_commissions", {
  id: serial("id").primaryKey(),
  resellerId: integer("reseller_id").notNull().references(() => resellersTable.id),
  tenantId: integer("tenant_id").notNull().references(() => tenantsTable.id),
  planId: integer("plan_id"),
  periodMonth: text("period_month").notNull(),
  baseAmount: real("base_amount").notNull(),
  commissionRate: real("commission_rate").notNull(),
  commissionAmount: real("commission_amount").notNull(),
  status: text("status").notNull().default("pending"),
  payoutId: integer("payout_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const resellerPayoutsTable = pgTable("reseller_payouts", {
  id: serial("id").primaryKey(),
  resellerId: integer("reseller_id").notNull().references(() => resellersTable.id),
  amount: real("amount").notNull(),
  commissionCount: integer("commission_count").notNull().default(0),
  status: text("status").notNull().default("pending"),
  notes: text("notes"),
  paymentDetails: text("payment_details"),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Reseller = typeof resellersTable.$inferSelect;
export type ResellerCommission = typeof resellerCommissionsTable.$inferSelect;
export type ResellerPayout = typeof resellerPayoutsTable.$inferSelect;
