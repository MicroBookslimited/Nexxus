import { pgTable, text, serial, timestamp, real, integer, uniqueIndex, index } from "drizzle-orm/pg-core";
import { customersTable } from "./customers";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Gift vouchers: prepaid, tenant-scoped store credit a customer can redeem
// against future sales. Issuance is STANDALONE (no order row — that would
// inflate sales-revenue reports); the money collected for a voucher is deferred
// revenue / a liability, surfaced via reports rather than auto-posted journal
// entries (to match how product sales behave in this app). Tax is NOT charged
// at issuance — it applies normally when the voucher is redeemed for goods.
export const giftVouchersTable = pgTable("gift_vouchers", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().default(0),
  // Human-facing, cryptographically random code (NOT sequential — a guessable
  // code is guessable money). Unique per tenant.
  code: text("code").notNull(),
  originalValue: real("original_value").notNull(),
  // Remaining redeemable balance. Decrements on redemption; can be restored on
  // a refund-to-voucher.
  balance: real("balance").notNull(),
  // active | partially_redeemed | redeemed | expired | cancelled
  status: text("status").notNull().default("active"),
  customerId: integer("customer_id").references(() => customersTable.id),
  // Free-text recipient details for walk-in / unregistered customers.
  customerName: text("customer_name"),
  customerPhone: text("customer_phone"),
  customerEmail: text("customer_email"),
  // How the voucher itself was paid for: cash | card | bank_transfer | other.
  paymentMethod: text("payment_method"),
  // Amount actually collected for the voucher (defaults to face value).
  amountPaid: real("amount_paid"),
  notes: text("notes"),
  expiryDate: timestamp("expiry_date", { withTimezone: true }),
  issuedByStaffId: integer("issued_by_staff_id"),
  issuedByName: text("issued_by_name"),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // Per-tenant uniqueness on the code so concurrent issuance collides loudly
  // (23505) instead of duplicating a code.
  tenantCodeUnique: uniqueIndex("gift_vouchers_tenant_code_unique").on(t.tenantId, t.code),
}));

// Immutable audit ledger of every balance-changing event on a voucher. Each
// row records the delta (`amount`) plus the before/after balance so the full
// history is reconstructable and reports can sum issued/redeemed/outstanding.
export const giftVoucherTransactionsTable = pgTable("gift_voucher_transactions", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().default(0),
  voucherId: integer("voucher_id").notNull().references(() => giftVouchersTable.id),
  // issue | redeem | cancel | expire | adjust | refund
  action: text("action").notNull(),
  amount: real("amount").notNull(),
  balanceBefore: real("balance_before").notNull(),
  balanceAfter: real("balance_after").notNull(),
  // The sale this transaction relates to (redemption / refund).
  relatedOrderId: integer("related_order_id"),
  staffId: integer("staff_id"),
  staffName: text("staff_name"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  voucherIdx: index("gift_voucher_transactions_voucher_idx").on(t.voucherId),
}));

export const insertGiftVoucherSchema = createInsertSchema(giftVouchersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertGiftVoucher = z.infer<typeof insertGiftVoucherSchema>;
export type GiftVoucher = typeof giftVouchersTable.$inferSelect;
export type GiftVoucherTransaction = typeof giftVoucherTransactionsTable.$inferSelect;
