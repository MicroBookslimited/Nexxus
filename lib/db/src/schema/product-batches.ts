import { pgTable, serial, integer, text, real, timestamp, date, index } from "drizzle-orm/pg-core";
import { productsTable } from "./products";

/**
 * Per-batch inventory rows for products with `trackBatches = true`.
 *
 * Each row represents a discrete intake (a purchase line, a manual stock
 * receipt, or a one-time legacy migration) with its own batch/lot number
 * and optional expiry date. SUM(quantityRemaining) for a product MUST
 * equal that product's `stockCount` at rest.
 *
 * `sourceType` values: 'purchase' | 'legacy' | 'manual'
 */
export const productBatchesTable = pgTable(
  "product_batches",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").notNull(),
    productId: integer("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "cascade" }),
    batchNumber: text("batch_number"),
    expiryDate: date("expiry_date"),
    quantityRemaining: real("quantity_remaining").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    sourceType: text("source_type").notNull().default("purchase"),
    purchaseBillId: integer("purchase_bill_id"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    productIdx: index("product_batches_product_idx").on(t.tenantId, t.productId, t.receivedAt),
    expiryIdx: index("product_batches_expiry_idx").on(t.tenantId, t.expiryDate),
  }),
);

export type ProductBatch = typeof productBatchesTable.$inferSelect;
