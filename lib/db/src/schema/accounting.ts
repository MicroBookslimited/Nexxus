import { pgTable, serial, text, boolean, integer, real, timestamp } from "drizzle-orm/pg-core";
import { productsTable } from "./products";

export const accountingAccountsTable = pgTable("accounting_accounts", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().default(0),
  code: text("code").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull(), // "asset" | "liability" | "equity" | "revenue" | "expense"
  subtype: text("subtype"), // e.g. "current_asset", "fixed_asset", "current_liability"
  description: text("description"),
  isSystem: boolean("is_system").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const journalEntriesTable = pgTable("journal_entries", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().default(0),
  date: timestamp("date", { withTimezone: true }).notNull(),
  description: text("description").notNull(),
  reference: text("reference"),
  type: text("type").notNull().default("manual"), // "manual" | "sales" | "purchase" | "adjustment"
  status: text("status").notNull().default("posted"), // "draft" | "posted" | "voided"
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const journalEntryLinesTable = pgTable("journal_entry_lines", {
  id: serial("id").primaryKey(),
  entryId: integer("entry_id").notNull().references(() => journalEntriesTable.id, { onDelete: "cascade" }),
  accountId: integer("account_id").notNull().references(() => accountingAccountsTable.id),
  description: text("description"),
  debit: real("debit").notNull().default(0),
  credit: real("credit").notNull().default(0),
});

export const quickbooksConnectionTable = pgTable("quickbooks_connection", {
  id: serial("id").primaryKey(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  realmId: text("realm_id"),
  tokenType: text("token_type"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
  isActive: boolean("is_active").notNull().default(false),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  lastSyncStatus: text("last_sync_status"),
  lastSyncMessage: text("last_sync_message"),
});

/* ─── Stock Adjustments ─── */
export const stockAdjustmentsTable = pgTable("stock_adjustments", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().default(0),
  productId: integer("product_id").notNull().references(() => productsTable.id),
  productName: text("product_name").notNull(),
  adjustmentType: text("adjustment_type").notNull(), // "increase" | "decrease"
  quantity: integer("quantity").notNull(),
  reason: text("reason").notNull(),
  notes: text("notes"),
  previousStock: integer("previous_stock").notNull(),
  newStock: integer("new_stock").notNull(),
  unitCost: real("unit_cost"),
  journalEntryId: integer("journal_entry_id"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ─── Stock Count Sessions ─── */
export const stockCountSessionsTable = pgTable("stock_count_sessions", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().default(0),
  name: text("name").notNull(),
  status: text("status").notNull().default("draft"), // "draft" | "in_progress" | "completed" | "voided"
  notes: text("notes"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdBy: text("created_by"),
  totalItems: integer("total_items"),
  totalDiscrepancies: integer("total_discrepancies"),
});

/* ─── Stock Count Items ─── */
export const stockCountItemsTable = pgTable("stock_count_items", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull().references(() => stockCountSessionsTable.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull(),
  productName: text("product_name").notNull(),
  productCategory: text("product_category"),
  systemCount: integer("system_count").notNull(),
  physicalCount: integer("physical_count"),
  discrepancy: integer("discrepancy"),
  unitCost: real("unit_cost"),
  isAdjusted: boolean("is_adjusted").notNull().default(false),
});

export type AccountingAccount = typeof accountingAccountsTable.$inferSelect;
export type JournalEntry = typeof journalEntriesTable.$inferSelect;
export type JournalEntryLine = typeof journalEntryLinesTable.$inferSelect;
export type QuickbooksConnection = typeof quickbooksConnectionTable.$inferSelect;
export type StockAdjustment = typeof stockAdjustmentsTable.$inferSelect;
export type StockCountSession = typeof stockCountSessionsTable.$inferSelect;
export type StockCountItem = typeof stockCountItemsTable.$inferSelect;
