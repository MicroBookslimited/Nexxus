import { pgTable, serial, text, boolean, integer, real, timestamp, unique } from "drizzle-orm/pg-core";

export const accountingAccountsTable = pgTable("accounting_accounts", {
  id: serial("id").primaryKey(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull(), // "asset" | "liability" | "equity" | "revenue" | "expense"
  subtype: text("subtype"), // e.g. "current_asset", "fixed_asset", "current_liability"
  description: text("description"),
  isSystem: boolean("is_system").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique("uq_account_code").on(t.code)]);

export const journalEntriesTable = pgTable("journal_entries", {
  id: serial("id").primaryKey(),
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

export type AccountingAccount = typeof accountingAccountsTable.$inferSelect;
export type JournalEntry = typeof journalEntriesTable.$inferSelect;
export type JournalEntryLine = typeof journalEntryLinesTable.$inferSelect;
export type QuickbooksConnection = typeof quickbooksConnectionTable.$inferSelect;
