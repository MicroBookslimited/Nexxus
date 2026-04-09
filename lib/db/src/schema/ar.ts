import { pgTable, text, serial, timestamp, real, integer } from "drizzle-orm/pg-core";
import { customersTable } from "./customers";
import { ordersTable } from "./orders";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const accountsReceivableTable = pgTable("accounts_receivable", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().default(0),
  customerId: integer("customer_id").notNull().references(() => customersTable.id),
  customerName: text("customer_name").notNull(),
  orderId: integer("order_id").references(() => ordersTable.id),
  orderNumber: text("order_number").notNull(),
  amount: real("amount").notNull(),
  amountPaid: real("amount_paid").notNull().default(0),
  status: text("status").notNull().default("open"),
  notes: text("notes"),
  dueDate: timestamp("due_date", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const arPaymentsTable = pgTable("ar_payments", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().default(0),
  arId: integer("ar_id").notNull().references(() => accountsReceivableTable.id),
  amount: real("amount").notNull(),
  paymentMethod: text("payment_method").notNull().default("cash"),
  staffName: text("staff_name"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertArSchema = createInsertSchema(accountsReceivableTable).omit({ id: true, createdAt: true });
export type InsertAr = z.infer<typeof insertArSchema>;
export type AccountsReceivable = typeof accountsReceivableTable.$inferSelect;
export type ArPayment = typeof arPaymentsTable.$inferSelect;
