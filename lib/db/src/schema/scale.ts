import { pgTable, text, serial, timestamp, integer, real, date, uniqueIndex } from "drizzle-orm/pg-core";

export const weightLabelsTable = pgTable("weight_labels", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  productId: integer("product_id").notNull(),
  productName: text("product_name").notNull(),
  productPlu: text("product_plu").notNull(),
  unitOfMeasure: text("unit_of_measure").notNull(),
  weightValue: real("weight_value").notNull(),
  pricePerUnit: real("price_per_unit").notNull(),
  totalPrice: real("total_price").notNull(),
  packDate: date("pack_date"),
  expirationDate: date("expiration_date"),
  barcode: text("barcode").notNull(),
  status: text("status").notNull().default("available"),
  createdByStaffId: integer("created_by_staff_id"),
  createdByStaffName: text("created_by_staff_name"),
  soldOrderId: integer("sold_order_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  soldAt: timestamp("sold_at", { withTimezone: true }),
}, (t) => ({
  byTenantBarcodeStatus: uniqueIndex("weight_labels_tenant_barcode_id_uq").on(t.tenantId, t.id),
}));

export type WeightLabel = typeof weightLabelsTable.$inferSelect;
export type InsertWeightLabel = typeof weightLabelsTable.$inferInsert;
