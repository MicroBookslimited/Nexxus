import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const staffTable = pgTable("staff", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  pin: text("pin").notNull(),
  role: text("role").notNull().default("cashier"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Staff = typeof staffTable.$inferSelect;
