import { pgTable, serial, integer, real, boolean, timestamp, index } from "drizzle-orm/pg-core";

export const promotionsTable = pgTable("promotions", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  productId: integer("product_id").notNull(),
  promoPrice: real("promo_price").notNull(),
  startAt: timestamp("start_at", { withTimezone: true }).notNull(),
  endAt: timestamp("end_at", { withTimezone: true }).notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byTenantProduct: index("promotions_tenant_product_idx").on(t.tenantId, t.productId, t.active),
}));

export type Promotion = typeof promotionsTable.$inferSelect;
