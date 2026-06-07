import { pgTable, text, serial, timestamp, real, integer, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { customersTable } from "./customers";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const ordersTable = pgTable("orders", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().default(0),
  orderNumber: text("order_number").notNull(),
  status: text("status").notNull().default("pending"),
  kitchenStatus: text("kitchen_status"),
  subtotal: real("subtotal").notNull(),
  discountType: text("discount_type"),
  discountAmount: real("discount_amount"),
  discountValue: real("discount_value"),
  tax: real("tax").notNull(),
  total: real("total").notNull(),
  paymentMethod: text("payment_method"),
  splitCardAmount: real("split_card_amount"),
  splitCashAmount: real("split_cash_amount"),
  cashTendered: real("cash_tendered"),
  notes: text("notes"),
  voidReason: text("void_reason"),
  customerId: integer("customer_id").references(() => customersTable.id),
  tableId: integer("table_id"),
  orderType: text("order_type").default("counter"),
  loyaltyPointsRedeemed: integer("loyalty_points_redeemed").default(0),
  loyaltyDiscount: real("loyalty_discount").default(0),
  // Cumulative money refunded back to the customer via partial (per-item)
  // refunds. Stays 0 for orders never partially refunded. A completed order
  // with refundedTotal > 0 is shown as "Partially refunded".
  refundedTotal: real("refunded_total").default(0),
  staffId: integer("staff_id"),
  locationId: integer("location_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const orderItemsTable = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => ordersTable.id),
  productId: integer("product_id").notNull(),
  productName: text("product_name").notNull(),
  // `real` to support decimal quantities for sold-by-weight items (e.g. 1.75 kg).
  // On a partial refund `quantity` is REDUCED to the remaining (un-refunded)
  // amount so reports — which SUM(quantity)/SUM(lineTotal) for completed
  // orders — automatically reflect the refund with no query changes.
  quantity: real("quantity").notNull(),
  // Cumulative quantity refunded for this line. The originally-sold quantity
  // is recoverable as (quantity + refundedQuantity).
  refundedQuantity: real("refunded_quantity").default(0),
  unitPrice: real("unit_price").notNull(),
  // Original (pre-tier) unit price captured at sale time so receipts can show
  // tier-pricing savings (originalUnitPrice - unitPrice) * quantity. Nullable
  // for back-compat with rows created before this column existed.
  originalUnitPrice: real("original_unit_price"),
  discountAmount: real("discount_amount"),
  variantAdjustment: real("variant_adjustment"),
  modifierAdjustment: real("modifier_adjustment"),
  variantChoices: jsonb("variant_choices").$type<Array<{
    groupId: number;
    groupName: string;
    optionId: number;
    optionName: string;
    priceAdjustment: number;
  }>>(),
  modifierChoices: jsonb("modifier_choices").$type<Array<{
    groupId: number;
    groupName: string;
    optionId: number;
    optionName: string;
    priceAdjustment: number;
  }>>(),
  lineTotal: real("line_total").notNull(),
  notes: text("notes"),
});

export const heldOrdersTable = pgTable("held_orders", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().default(0),
  label: text("label"),
  items: jsonb("items").notNull().$type<Array<{
    productId: number;
    productName: string;
    price: number;
    quantity: number;
  }>>(),
  notes: text("notes"),
  discountType: text("discount_type"),
  discountAmount: real("discount_amount"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Quotations: non-binding price quotes a cashier hands to a customer. Unlike
// held orders they persist after recall, carry a sequential quote number, an
// optional expiry, a customer link, server-computed totals, and a lifecycle
// status (active → converted/expired/cancelled). Converting a quote loads its
// items into the POS cart; the real sale (stock deduction, JE) happens at
// checkout — a quotation itself never touches stock or accounting.
export const quotationsTable = pgTable("quotations", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().default(0),
  quoteNumber: text("quote_number").notNull(),
  customerId: integer("customer_id").references(() => customersTable.id),
  items: jsonb("items").notNull().$type<Array<{
    productId: number;
    productName: string;
    price: number;
    quantity: number;
    isTaxable?: boolean;
    isCustom?: boolean;
    unitLabel?: string;
    unitFactor?: number;
    unitId?: number;
  }>>(),
  subtotal: real("subtotal").notNull().default(0),
  discountType: text("discount_type"),
  discountAmount: real("discount_amount"),
  tax: real("tax").notNull().default(0),
  total: real("total").notNull().default(0),
  notes: text("notes"),
  // active | converted | expired | cancelled
  status: text("status").notNull().default("active"),
  expiryDate: timestamp("expiry_date", { withTimezone: true }),
  // Set to the resulting order id when the quote is checked out as a sale.
  convertedOrderId: integer("converted_order_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // Per-tenant uniqueness on the human-facing quote number so concurrent
  // count-based generation collides loudly (23505) instead of duplicating.
  tenantQuoteNumberUnique: uniqueIndex("quotations_tenant_quote_number_unique").on(
    t.tenantId,
    t.quoteNumber,
  ),
}));

export const insertOrderSchema = createInsertSchema(ordersTable).omit({ id: true, createdAt: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;
export type OrderItem = typeof orderItemsTable.$inferSelect;
export type HeldOrder = typeof heldOrdersTable.$inferSelect;
export type Quotation = typeof quotationsTable.$inferSelect;
