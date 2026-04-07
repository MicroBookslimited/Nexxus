import { pgTable, text, serial, timestamp, real, integer, jsonb } from "drizzle-orm/pg-core";
import { customersTable } from "./customers";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const ordersTable = pgTable("orders", {
  id: serial("id").primaryKey(),
  orderNumber: text("order_number").notNull(),
  status: text("status").notNull().default("pending"),
  subtotal: real("subtotal").notNull(),
  discountType: text("discount_type"),
  discountAmount: real("discount_amount"),
  discountValue: real("discount_value"),
  tax: real("tax").notNull(),
  total: real("total").notNull(),
  paymentMethod: text("payment_method"),
  splitCardAmount: real("split_card_amount"),
  splitCashAmount: real("split_cash_amount"),
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
  quantity: integer("quantity").notNull(),
  unitPrice: real("unit_price").notNull(),
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
});

export const heldOrdersTable = pgTable("held_orders", {
  id: serial("id").primaryKey(),
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
