import { pgTable, serial, integer, real, timestamp, unique } from "drizzle-orm/pg-core";
import { productsTable } from "./products";

/**
 * Composite (bundle) product components.
 *
 * A composite product (e.g. "Coke Case 24") is sold at a fixed manual
 * price stored on the parent product. Its inventory and COGS come from
 * the child products listed here.
 *
 * Selling 1 of the parent deducts `quantityRequired` of each child.
 * Available bundles = MIN(floor(child.stock / quantityRequired)).
 */
export const compositeProductComponentsTable = pgTable(
  "composite_product_components",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").notNull(),
    parentProductId: integer("parent_product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "cascade" }),
    childProductId: integer("child_product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "cascade" }),
    quantityRequired: real("quantity_required").notNull(),
    // Optional reference to a productPurchaseUnit (we record the chosen
    // unit so the editor can re-display "qty per Case" instead of "qty in
    // each"); the actual stock math always uses base units.
    unitId: integer("unit_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("uq_composite_parent_child").on(t.parentProductId, t.childProductId),
  ],
);

export type CompositeProductComponent = typeof compositeProductComponentsTable.$inferSelect;
export type InsertCompositeProductComponent = typeof compositeProductComponentsTable.$inferInsert;
