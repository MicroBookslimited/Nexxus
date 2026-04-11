import { pgTable, text, serial, timestamp, integer, real, unique } from "drizzle-orm/pg-core";
import { productsTable } from "./products";

export const ingredientsTable = pgTable("ingredients", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().default(0),
  name: text("name").notNull(),
  unit: text("unit").notNull().default("pcs"),
  costPerUnit: real("cost_per_unit").notNull().default(0),
  stockQuantity: real("stock_quantity").notNull().default(0),
  minStockLevel: real("min_stock_level").notNull().default(0),
  category: text("category"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const recipesTable = pgTable("recipes", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().default(0),
  productId: integer("product_id").notNull().references(() => productsTable.id, { onDelete: "cascade" }),
  name: text("name"),
  notes: text("notes"),
  yieldQuantity: real("yield_quantity").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique("uq_recipe_product").on(t.productId, t.tenantId)]);

export const recipeIngredientsTable = pgTable("recipe_ingredients", {
  id: serial("id").primaryKey(),
  recipeId: integer("recipe_id").notNull().references(() => recipesTable.id, { onDelete: "cascade" }),
  ingredientId: integer("ingredient_id").notNull().references(() => ingredientsTable.id, { onDelete: "restrict" }),
  quantity: real("quantity").notNull(),
  unit: text("unit").notNull(),
  notes: text("notes"),
});

export const productionBatchesTable = pgTable("production_batches", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().default(0),
  batchNumber: text("batch_number").notNull(),
  status: text("status").notNull().default("draft"),
  notes: text("notes"),
  totalCost: real("total_cost"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: integer("created_by"),
});

export const productionBatchItemsTable = pgTable("production_batch_items", {
  id: serial("id").primaryKey(),
  batchId: integer("batch_id").notNull().references(() => productionBatchesTable.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => productsTable.id),
  quantityPlanned: real("quantity_planned").notNull(),
  quantityProduced: real("quantity_produced"),
  unit: text("unit").notNull().default("pcs"),
  costCalculated: real("cost_calculated"),
});

export const ingredientUsageLogsTable = pgTable("ingredient_usage_logs", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().default(0),
  ingredientId: integer("ingredient_id").notNull().references(() => ingredientsTable.id),
  quantity: real("quantity").notNull(),
  reason: text("reason").notNull(),
  referenceId: integer("reference_id"),
  referenceType: text("reference_type"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Ingredient = typeof ingredientsTable.$inferSelect;
export type Recipe = typeof recipesTable.$inferSelect;
export type RecipeIngredient = typeof recipeIngredientsTable.$inferSelect;
export type ProductionBatch = typeof productionBatchesTable.$inferSelect;
export type ProductionBatchItem = typeof productionBatchItemsTable.$inferSelect;
export type IngredientUsageLog = typeof ingredientUsageLogsTable.$inferSelect;
