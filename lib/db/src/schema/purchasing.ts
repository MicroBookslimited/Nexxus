import { pgTable, text, serial, timestamp, integer, real, boolean } from "drizzle-orm/pg-core";
import { ingredientsTable } from "./ingredients";

/**
 * System-wide + tenant-specific units of measurement.
 * Each unit has a base_unit (pcs | g | ml) and a conversion_factor
 * so that: base_qty = purchase_qty * conversion_factor
 *
 * Examples:
 *   Dozen  → base=pcs,  factor=12
 *   Gross  → base=pcs,  factor=144
 *   kg     → base=g,    factor=1000
 *   lb     → base=g,    factor=453.592
 *   oz     → base=g,    factor=28.3495
 *   l      → base=ml,   factor=1000
 *   fl oz  → base=ml,   factor=29.5735
 *   gal    → base=ml,   factor=3785.41
 */
export const unitsOfMeasurementTable = pgTable("units_of_measurement", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().default(0),   // 0 = system unit, shared
  name: text("name").notNull(),                          // "Kilogram", "Dozen"
  symbol: text("symbol").notNull(),                      // "kg", "doz"
  baseUnit: text("base_unit").notNull(),                 // pcs | g | ml
  conversionFactor: real("conversion_factor").notNull(), // qty in base units per 1 of this unit
  isSystem: boolean("is_system").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const vendorsTable = pgTable("vendors", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  name: text("name").notNull(),
  contactName: text("contact_name"),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const rawMaterialPurchasesTable = pgTable("raw_material_purchases", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  purchaseNumber: text("purchase_number").notNull(),
  vendorId: integer("vendor_id").references(() => vendorsTable.id, { onDelete: "set null" }),
  status: text("status").notNull().default("draft"),    // draft | confirmed
  purchaseDate: timestamp("purchase_date", { withTimezone: true }).notNull().defaultNow(),
  invoiceRef: text("invoice_ref"),
  notes: text("notes"),
  totalCost: real("total_cost").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const rawMaterialPurchaseItemsTable = pgTable("raw_material_purchase_items", {
  id: serial("id").primaryKey(),
  purchaseId: integer("purchase_id").notNull().references(() => rawMaterialPurchasesTable.id, { onDelete: "cascade" }),
  ingredientId: integer("ingredient_id").notNull().references(() => ingredientsTable.id, { onDelete: "restrict" }),
  purchaseUnit: text("purchase_unit").notNull(),         // "doz", "kg", "l", etc.
  purchaseQty: real("purchase_qty").notNull(),           // how many purchase units bought
  conversionFactor: real("conversion_factor").notNull(), // base units per 1 purchase unit
  baseUnit: text("base_unit").notNull(),                 // pcs | g | ml
  baseQty: real("base_qty").notNull(),                   // purchaseQty * conversionFactor
  unitCost: real("unit_cost").notNull().default(0),      // cost per purchase unit (JMD)
  totalCost: real("total_cost").notNull().default(0),    // purchaseQty * unitCost
});

export type UnitOfMeasurement = typeof unitsOfMeasurementTable.$inferSelect;
export type Vendor = typeof vendorsTable.$inferSelect;
export type RawMaterialPurchase = typeof rawMaterialPurchasesTable.$inferSelect;
export type RawMaterialPurchaseItem = typeof rawMaterialPurchaseItemsTable.$inferSelect;
