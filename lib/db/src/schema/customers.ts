import { pgTable, text, serial, timestamp, real, integer, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const customersTable = pgTable(
  "customers",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").notNull().default(0),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    // Alternate/secondary phone (work orders: reach someone on site).
    phone2: text("phone2"),
    company: text("company"),
    address: text("address"),
    city: text("city"),
    state: text("state"),
    postalCode: text("postal_code"),
    notes: text("notes"),
    // Directions / landmark for field visits (on-site work orders).
    directions: text("directions"),
    // Loyalty card number (e.g. "LM##########"). Nullable for legacy rows;
    // auto-assigned on create and backfilled for existing customers. Unique
    // per tenant (NULLs are distinct in Postgres, so unassigned rows coexist).
    cardNumber: text("card_number"),
    // Opening balance carried over from a previous system (e.g. QuickBooks
    // POS "Account Balance") at migration time. Informational — not part of
    // the live A/R ledger.
    openingBalance: real("opening_balance").notNull().default(0),
    loyaltyPoints: integer("loyalty_points").notNull().default(0),
    totalSpent: real("total_spent").notNull().default(0),
    orderCount: integer("order_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantCardUq: uniqueIndex("customers_tenant_card_uq").on(t.tenantId, t.cardNumber),
  }),
);

export const insertCustomerSchema = createInsertSchema(customersTable).omit({ id: true, createdAt: true });
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Customer = typeof customersTable.$inferSelect;
