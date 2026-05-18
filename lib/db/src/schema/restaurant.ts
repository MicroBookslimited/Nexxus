import { pgTable, serial, text, integer, timestamp, boolean, real } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { productsTable } from "./products";

export const diningTablesTable = pgTable("dining_tables", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().default(0),
  name: text("name").notNull(),
  capacity: integer("capacity").notNull().default(4),
  status: text("status").notNull().default("available"),
  currentOrderId: integer("current_order_id"),
  color: text("color").notNull().default("blue"),
  positionX: integer("position_x").notNull().default(0),
  positionY: integer("position_y").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type DiningTable = typeof diningTablesTable.$inferSelect;

export const kdsScreensTable = pgTable("kds_screens", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  categories: text("categories").array().notNull().default(sql`'{}'::text[]`),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type KdsScreen = typeof kdsScreensTable.$inferSelect;

export const purchasesTable = pgTable("purchases", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().default(0),
  productId: integer("product_id").notNull().references(() => productsTable.id, { onDelete: "cascade" }),
  quantity: integer("quantity").notNull(),
  unitCost: real("unit_cost").notNull().default(0),
  totalCost: real("total_cost").notNull().default(0),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Purchase = typeof purchasesTable.$inferSelect;

export const purchaseBillsTable = pgTable("purchase_bills", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().default(0),
  billNumber: text("bill_number").notNull(),
  supplier: text("supplier"),
  status: text("status").notNull().default("draft"),
  notes: text("notes"),
  // Default input-tax rate (%) applied to lines that don't override.
  // Stored as a percentage, e.g. 15 = 15%. Zero = tax-free bill.
  defaultTaxRate: real("default_tax_rate").notNull().default(0),
  // Sum of (qty * unitCost) across all lines, BEFORE tax. Used as the
  // inventory debit when posting to accounting.
  subtotal: real("subtotal").notNull().default(0),
  // Sum of input tax across all lines. Posted as a debit to
  // "Input Tax Receivable" so it nets against output tax on reports.
  taxTotal: real("tax_total").notNull().default(0),
  // Grand total (subtotal + taxTotal). Posted as the AP credit.
  totalCost: real("total_cost").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PurchaseBill = typeof purchaseBillsTable.$inferSelect;

export const purchaseBillItemsTable = pgTable("purchase_bill_items", {
  id: serial("id").primaryKey(),
  billId: integer("bill_id").notNull().references(() => purchaseBillsTable.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => productsTable.id),
  quantity: integer("quantity").notNull(),
  // Per-unit cost EXCLUDING tax.
  unitCost: real("unit_cost").notNull().default(0),
  // Tax rate (%) for this line. NULL = inherit bill's defaultTaxRate.
  taxRate: real("tax_rate"),
  // Tax amount for the line = qty * unitCost * effectiveRate / 100.
  taxAmount: real("tax_amount").notNull().default(0),
  // Line grand total = qty*unitCost + taxAmount.
  totalCost: real("total_cost").notNull().default(0),
  // Batch/lot tracking — only used when the product has `trackBatches`.
  // On bill confirm a `product_batches` row is created from these fields.
  batchNumber: text("batch_number"),
  expiryDate: text("expiry_date"), // ISO date (YYYY-MM-DD) or null
});

export type PurchaseBillItem = typeof purchaseBillItemsTable.$inferSelect;
