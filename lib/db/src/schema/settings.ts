import { pgTable, integer, text, timestamp, primaryKey } from "drizzle-orm/pg-core";

export const appSettingsTable = pgTable("app_settings", {
  tenantId: integer("tenant_id").notNull().default(0),
  key: text("key").notNull(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.tenantId, t.key] })]);
