import { pgTable, serial, text, integer, real, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { productsTable } from "./products";

export const variantGroupsTable = pgTable("variant_groups", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => productsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  required: boolean("required").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const variantOptionsTable = pgTable("variant_options", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull().references(() => variantGroupsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  priceAdjustment: real("price_adjustment").notNull().default(0),
  position: integer("position").notNull().default(0),
  // Per-variant stock tracking. NULL = not tracked (falls back to parent product stock).
  // When non-null, the parent product's stockCount is computed as the SUM of all option stockCounts.
  stockCount: real("stock_count"),
  // Optional SKU / barcode for this specific variant option.
  sku: text("sku"),
});

export const modifierGroupsTable = pgTable("modifier_groups", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => productsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  required: boolean("required").notNull().default(false),
  minSelections: integer("min_selections").notNull().default(0),
  maxSelections: integer("max_selections").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const modifierOptionsTable = pgTable("modifier_options", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull().references(() => modifierGroupsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  priceAdjustment: real("price_adjustment").notNull().default(0),
  position: integer("position").notNull().default(0),
});

export const variantCombinationsTable = pgTable("variant_combinations", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => productsTable.id, { onDelete: "cascade" }),
  optionIds: jsonb("option_ids").$type<number[]>().notNull(),
  label: text("label").notNull(),
  stockCount: real("stock_count"),
  sku: text("sku"),
  position: integer("position").notNull().default(0),
});

export type VariantGroup = typeof variantGroupsTable.$inferSelect;
export type VariantOption = typeof variantOptionsTable.$inferSelect;
export type VariantCombination = typeof variantCombinationsTable.$inferSelect;
export type ModifierGroup = typeof modifierGroupsTable.$inferSelect;
export type ModifierOption = typeof modifierOptionsTable.$inferSelect;
