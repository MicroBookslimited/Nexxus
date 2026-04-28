import { pgTable, serial, integer, real, text, timestamp } from "drizzle-orm/pg-core";
import { productsTable } from "./products";

export const stockMovementsTable = pgTable("stock_movements", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().default(0),
  productId: integer("product_id").notNull().references(() => productsTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  quantity: real("quantity").notNull(),
  balanceAfter: real("balance_after").notNull(),
  referenceType: text("reference_type"),
  referenceId: integer("reference_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type StockMovement = typeof stockMovementsTable.$inferSelect;
