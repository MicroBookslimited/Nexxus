import { pgTable, serial, integer, text, real, jsonb, timestamp } from "drizzle-orm/pg-core";

export const priceChangeLogsTable = pgTable("price_change_logs", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  staffId: integer("staff_id"),
  staffName: text("staff_name"),
  method: text("method").notNull(),
  value: real("value").notNull(),
  rounding: text("rounding").notNull().default("none"),
  scope: text("scope").notNull().default("custom"),
  affectedCount: integer("affected_count").notNull().default(0),
  details: jsonb("details").notNull().default([]).$type<Array<{
    productId: number;
    productName: string;
    oldPrice: number;
    newPrice: number;
  }>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PriceChangeLog = typeof priceChangeLogsTable.$inferSelect;
