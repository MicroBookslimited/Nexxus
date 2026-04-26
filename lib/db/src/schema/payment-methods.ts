import { pgTable, text, serial, timestamp, boolean, integer } from "drizzle-orm/pg-core";

/**
 * Per-tenant configurable payment methods shown in the POS checkout.
 * Built-in types (cash, card, split, credit) are seeded automatically;
 * tenants may add custom types like "Voucher", "Mobile Money", etc.
 *   type     — one of: cash | card | split | credit | digital | custom
 *   isEnabled  — toggled on/off in Settings → Payments
 *   isDefault  — exactly one row per tenant marked default
 */
export const paymentMethodsTable = pgTable("payment_methods", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull().default("custom"),
  isEnabled: boolean("is_enabled").notNull().default(true),
  isDefault: boolean("is_default").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PaymentMethod = typeof paymentMethodsTable.$inferSelect;
export type InsertPaymentMethod = typeof paymentMethodsTable.$inferInsert;
