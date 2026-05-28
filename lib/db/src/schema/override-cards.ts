import { pgTable, serial, integer, text, boolean, timestamp, unique } from "drizzle-orm/pg-core";
import { staffTable } from "./staff";
import { tenantsTable } from "./saas";

export const staffOverrideCardsTable = pgTable("staff_override_cards", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  staffId: integer("staff_id").notNull().references(() => staffTable.id, { onDelete: "cascade" }),
  cardNumber: text("card_number").notNull(),
  label: text("label"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniqTenantCard: unique("staff_override_cards_tenant_card_unique").on(t.tenantId, t.cardNumber),
}));

export type StaffOverrideCard = typeof staffOverrideCardsTable.$inferSelect;
