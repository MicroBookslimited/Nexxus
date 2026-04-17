import { pgTable, text, serial, timestamp, boolean, integer, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const productsTable = pgTable("products", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().default(0),
  name: text("name").notNull(),
  description: text("description"),
  price: real("price").notNull(),
  category: text("category").notNull(),
  imageUrl: text("image_url"),
  barcode: text("barcode"),
  inStock: boolean("in_stock").notNull().default(true),
  stockCount: integer("stock_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // ── Weighing-scale support ──────────────────────────────────────────
  // When true, the product is sold by weight (price is per unit-of-measure).
  soldByWeight: boolean("sold_by_weight").notNull().default(false),
  // Unit of measure for weight-priced products: lb, kg, oz, g.
  unitOfMeasure: text("unit_of_measure"),
  // 6-digit Product Lookup Unit code embedded in EAN-13 weight barcodes.
  plu: text("plu"),
});

export const insertProductSchema = createInsertSchema(productsTable).omit({ id: true, createdAt: true });
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof productsTable.$inferSelect;
