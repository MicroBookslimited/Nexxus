import { pgTable, text, serial, timestamp, real, integer, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
import { customersTable } from "./customers";

// Layaway: a customer reserves goods with a deposit and pays them off over
// time. Stock is deducted (reserved) when the layaway is CREATED; cancelling
// or defaulting restores it. Completing (balance reaches zero) records a real
// order for reporting but does NOT touch stock again.
export const layawaysTable = pgTable("layaways", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().default(0),
  layawayNumber: text("layaway_number").notNull(),
  customerId: integer("customer_id").notNull().references(() => customersTable.id),
  items: jsonb("items").notNull().$type<Array<{
    productId: number;
    productName: string;
    price: number;
    quantity: number;
    isTaxable?: boolean;
    isCustom?: boolean;
    unitLabel?: string;
    unitFactor?: number;
  }>>(),
  subtotal: real("subtotal").notNull().default(0),
  discountType: text("discount_type"),
  discountAmount: real("discount_amount"),
  tax: real("tax").notNull().default(0),
  total: real("total").notNull().default(0),
  // Sum of layaway_payments rows — denormalized for cheap listing; the
  // payments table is the source of truth and updates happen in the same txn.
  amountPaid: real("amount_paid").notNull().default(0),
  // Deposit required to open the layaway (currency amount, already applied
  // as the first payment when the layaway is created).
  depositRequired: real("deposit_required").notNull().default(0),
  // "flexible" (pay any amount, any time) | "installment" (fixed schedule)
  planType: text("plan_type").notNull().default("flexible"),
  installmentAmount: real("installment_amount"),
  // "weekly" | "biweekly" | "monthly"
  installmentFrequency: text("installment_frequency"),
  nextDueDate: timestamp("next_due_date", { withTimezone: true }),
  // active | completed | cancelled | defaulted
  status: text("status").notNull().default("active"),
  // Optional restocking/cancellation fee retained when cancelled/defaulted.
  cancellationFee: real("cancellation_fee"),
  notes: text("notes"),
  // Set when the layaway completes and a real order row is written.
  convertedOrderId: integer("converted_order_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantLayawayNumberUnique: uniqueIndex("layaways_tenant_number_unique").on(
    t.tenantId,
    t.layawayNumber,
  ),
  tenantStatusIdx: index("layaways_tenant_status_idx").on(t.tenantId, t.status),
}));

export const layawayPaymentsTable = pgTable("layaway_payments", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().default(0),
  layawayId: integer("layaway_id").notNull().references(() => layawaysTable.id),
  amount: real("amount").notNull(),
  // cash | card | other
  method: text("method").notNull().default("cash"),
  reference: text("reference"),
  staffName: text("staff_name"),
  // "deposit" for the opening payment, "payment" for subsequent ones,
  // "refund" for negative adjustments on cancellation.
  kind: text("kind").notNull().default("payment"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  layawayIdx: index("layaway_payments_layaway_idx").on(t.layawayId),
}));

export type Layaway = typeof layawaysTable.$inferSelect;
export type LayawayPayment = typeof layawayPaymentsTable.$inferSelect;
