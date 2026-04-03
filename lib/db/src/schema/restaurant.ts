import { pgTable, serial, text, integer, timestamp, boolean } from "drizzle-orm/pg-core";

export const diningTablesTable = pgTable("dining_tables", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  capacity: integer("capacity").notNull().default(4),
  status: text("status").notNull().default("available"),
  currentOrderId: integer("current_order_id"),
  color: text("color").notNull().default("blue"),
  positionX: integer("position_x").notNull().default(0),
  positionY: integer("position_y").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type DiningTable = typeof diningTablesTable.$inferSelect;
