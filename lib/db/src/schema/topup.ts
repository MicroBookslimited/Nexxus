import { pgTable, text, serial, timestamp, real, integer, boolean } from "drizzle-orm/pg-core";

export const topupTransactionsTable = pgTable("topup_transactions", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  dingTransactionId: text("ding_transaction_id"),
  distributorRef: text("distributor_ref").notNull(),
  phoneNumber: text("phone_number").notNull(),
  countryCode: text("country_code").notNull().default("JM"),
  operatorId: text("operator_id").notNull(),
  operatorName: text("operator_name").notNull(),
  productSkuCode: text("product_sku_code").notNull(),
  productName: text("product_name").notNull(),
  sendValue: real("send_value").notNull(),
  sendCurrency: text("send_currency").notNull().default("JMD"),
  benefitValue: real("benefit_value").notNull(),
  benefitCurrency: text("benefit_currency").notNull().default("JMD"),
  cost: real("cost").notNull().default(0),
  commissionEarned: real("commission_earned").notNull().default(0),
  status: text("status").notNull().default("pending"),
  staffId: integer("staff_id"),
  staffName: text("staff_name"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const topupWalletsTable = pgTable("topup_wallets", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().unique(),
  balance: real("balance").notNull().default(0),
  totalTopups: integer("total_topups").notNull().default(0),
  totalCommission: real("total_commission").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const topupWalletLedgerTable = pgTable("topup_wallet_ledger", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  type: text("type").notNull(),
  amount: real("amount").notNull(),
  balanceAfter: real("balance_after").notNull(),
  description: text("description").notNull(),
  referenceId: text("reference_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TopupTransaction = typeof topupTransactionsTable.$inferSelect;
export type TopupWallet = typeof topupWalletsTable.$inferSelect;
export type TopupWalletLedger = typeof topupWalletLedgerTable.$inferSelect;
