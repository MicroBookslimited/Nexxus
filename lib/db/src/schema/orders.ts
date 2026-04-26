import { pgTable, text, serial, timestamp, real, integer, jsonb } from "drizzle-orm/pg-core";
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
  quantity: real("quantity").notNull(),
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

export const insertOrderSchema = createInsertSchema(ordersTable).omit({ id: true, createdAt: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;
export type OrderItem = typeof orderItemsTable.$inferSelect;
export type HeldOrder = typeof heldOrdersTable.$inferSelect;
