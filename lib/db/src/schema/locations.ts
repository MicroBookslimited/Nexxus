import { pgTable, serial, text, boolean, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { staffTable } from "./staff";
import { productsTable } from "./products";

export const locationsTable = pgTable("locations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  address: text("address"),
  phone: text("phone"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const staffLocationsTable = pgTable("staff_locations", {
  id: serial("id").primaryKey(),
  staffId: integer("staff_id").notNull().references(() => staffTable.id, { onDelete: "cascade" }),
  locationId: integer("location_id").notNull().references(() => locationsTable.id, { onDelete: "cascade" }),
  isPrimary: boolean("is_primary").notNull().default(false),
}, (t) => [unique("uq_staff_location").on(t.staffId, t.locationId)]);

export const locationInventoryTable = pgTable("location_inventory", {
  id: serial("id").primaryKey(),
  locationId: integer("location_id").notNull().references(() => locationsTable.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => productsTable.id, { onDelete: "cascade" }),
  stockCount: integer("stock_count").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique("uq_location_product").on(t.locationId, t.productId)]);

export const stockTransfersTable = pgTable("stock_transfers", {
  id: serial("id").primaryKey(),
  fromLocationId: integer("from_location_id").references(() => locationsTable.id),
  toLocationId: integer("to_location_id").references(() => locationsTable.id),
  productId: integer("product_id").notNull().references(() => productsTable.id),
  quantity: integer("quantity").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Location = typeof locationsTable.$inferSelect;
export type StaffLocation = typeof staffLocationsTable.$inferSelect;
export type LocationInventory = typeof locationInventoryTable.$inferSelect;
export type StockTransfer = typeof stockTransfersTable.$inferSelect;
