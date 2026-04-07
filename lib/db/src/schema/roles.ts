import { pgTable, serial, integer, text, jsonb, boolean, timestamp } from "drizzle-orm/pg-core";
import { tenantsTable } from "./saas";

export const rolesTable = pgTable("roles", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color").notNull().default("#3b82f6"),
  permissions: jsonb("permissions").notNull().default([]).$type<string[]>(),
  isSystem: boolean("is_system").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Role = typeof rolesTable.$inferSelect;
