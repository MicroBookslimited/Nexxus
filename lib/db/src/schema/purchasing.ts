import { pgTable, text, serial, timestamp, integer, real, boolean } from "drizzle-orm/pg-core";
import { ingredientsTable } from "./ingredients";

/**
 * System-wide + tenant-specific units of measurement.
 * Each unit has a base_unit (pcs | g | ml) and a conversion_factor
 * so that: base_qty = purchase_qty * conversion_factor
 */
export const unitsOfMeasurementTable = pgTable("units_of_measurement", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().default(0),
  name: text("name").notNull(),
  symbol: text("symbol").notNull(),
  baseUnit: text("base_unit").notNull(),
  conversionFactor: real("conversion_factor").notNull(),
  isSystem: boolean("is_system").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const vendorsTable = pgTable("vendors", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  name: text("name").notNull(),
  contactName: text("contact_name"),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  taxId: text("tax_id"),                                       // TRN / VAT number
  currency: text("currency").notNull().default("JMD"),         // supplier default currency
  paymentTermsDays: integer("payment_terms_days").default(30), // default credit days
  creditLimit: real("credit_limit").default(0),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const rawMaterialPurchasesTable = pgTable("raw_material_purchases", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  purchaseNumber: text("purchase_number").notNull(),
  vendorId: integer("vendor_id").references(() => vendorsTable.id, { onDelete: "set null" }),
  status: text("status").notNull().default("draft"),            // draft | confirmed
  paymentType: text("payment_type").notNull().default("credit"),// cash | credit
  currency: text("currency").notNull().default("JMD"),
  exchangeRate: real("exchange_rate").notNull().default(1),     // foreign → JMD
  purchaseDate: timestamp("purchase_date", { withTimezone: true }).notNull().defaultNow(),
  dueDate: timestamp("due_date", { withTimezone: true }),       // null for cash purchases
  invoiceRef: text("invoice_ref"),
  notes: text("notes"),
  totalCost: real("total_cost").notNull().default(0),           // in purchase currency
  totalCostJmd: real("total_cost_jmd").notNull().default(0),    // converted to JMD
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const rawMaterialPurchaseItemsTable = pgTable("raw_material_purchase_items", {
  id: serial("id").primaryKey(),
  purchaseId: integer("purchase_id").notNull().references(() => rawMaterialPurchasesTable.id, { onDelete: "cascade" }),
  ingredientId: integer("ingredient_id").notNull().references(() => ingredientsTable.id, { onDelete: "restrict" }),
  purchaseUnit: text("purchase_unit").notNull(),
  purchaseQty: real("purchase_qty").notNull(),
  conversionFactor: real("conversion_factor").notNull(),
  baseUnit: text("base_unit").notNull(),
  baseQty: real("base_qty").notNull(),
  unitCost: real("unit_cost").notNull().default(0),
  totalCost: real("total_cost").notNull().default(0),
});

/* ─── Accounts Payable ─────────────────────────────────────────────────────── */

/** One AP entry per credit purchase (or manual entry) */
export const apEntriesTable = pgTable("ap_entries", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  vendorId: integer("vendor_id").references(() => vendorsTable.id, { onDelete: "set null" }),
  purchaseId: integer("purchase_id").references(() => rawMaterialPurchasesTable.id, { onDelete: "set null" }),
  entryDate: timestamp("entry_date", { withTimezone: true }).notNull().defaultNow(),
  dueDate: timestamp("due_date", { withTimezone: true }),
  invoiceRef: text("invoice_ref"),
  currency: text("currency").notNull().default("JMD"),
  exchangeRate: real("exchange_rate").notNull().default(1),
  amountTotal: real("amount_total").notNull(),                  // in JMD
  amountPaid: real("amount_paid").notNull().default(0),         // in JMD
  amountBalance: real("amount_balance").notNull(),              // amountTotal - amountPaid
  status: text("status").notNull().default("pending"),          // pending | partially_paid | paid | overdue | cancelled
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Individual payments against an AP entry */
export const apPaymentsTable = pgTable("ap_payments", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  apEntryId: integer("ap_entry_id").notNull().references(() => apEntriesTable.id, { onDelete: "cascade" }),
  vendorId: integer("vendor_id").references(() => vendorsTable.id, { onDelete: "set null" }),
  paymentDate: timestamp("payment_date", { withTimezone: true }).notNull().defaultNow(),
  amount: real("amount").notNull(),                             // in JMD
  paymentMethod: text("payment_method").notNull().default("cash"), // cash | bank | cheque | transfer | credit
  reference: text("reference"),                                 // cheque # / transfer ref
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Vendor credit balance (from overpayments or returns) */
export const apCreditsTable = pgTable("ap_credits", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  vendorId: integer("vendor_id").notNull().references(() => vendorsTable.id, { onDelete: "cascade" }),
  amount: real("amount").notNull(),
  usedAmount: real("used_amount").notNull().default(0),
  availableAmount: real("available_amount").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type UnitOfMeasurement = typeof unitsOfMeasurementTable.$inferSelect;
export type Vendor = typeof vendorsTable.$inferSelect;
export type RawMaterialPurchase = typeof rawMaterialPurchasesTable.$inferSelect;
export type RawMaterialPurchaseItem = typeof rawMaterialPurchaseItemsTable.$inferSelect;
export type ApEntry = typeof apEntriesTable.$inferSelect;
export type ApPayment = typeof apPaymentsTable.$inferSelect;
export type ApCredit = typeof apCreditsTable.$inferSelect;
