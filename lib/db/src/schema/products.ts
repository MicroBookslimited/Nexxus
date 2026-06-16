import { pgTable, text, serial, timestamp, boolean, integer, real, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const productsTable = pgTable("products", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().default(0),
  name: text("name").notNull(),
  description: text("description"),
  price: real("price").notNull(),
  category: text("category").notNull(),
  imageUrl: text("image_url"),
  barcode: text("barcode"),
  // Stock-keeping unit. Optional, human-assigned identifier. Distinct from
  // barcode (which is the scanned EAN/UPC). Both are matched at the POS.
  sku: text("sku"),
  // Optional free-text product size label (e.g. "12 inch", "Large", "500ml").
  // Display-only; surfaced when the tenant `show_product_size` setting is on.
  // NULL = not set.
  size: text("size"),
  inStock: boolean("in_stock").notNull().default(true),
  stockCount: real("stock_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // ── Weighing-scale support ──────────────────────────────────────────
  // When true, the product is sold by weight (price is per unit-of-measure).
  soldByWeight: boolean("sold_by_weight").notNull().default(false),
  // Unit of measure for weight-priced products: lb, kg, oz, g.
  unitOfMeasure: text("unit_of_measure"),
  // Optional free-text selling unit / unit of measure label (e.g. "each",
  // "case", "pieces", "box"). Display-only — describes how the product is
  // sold and surfaces on the POS cart line and printed receipts. Distinct
  // from the weight-only `unitOfMeasure` enum above. NULL = not set.
  sellingUnit: text("selling_unit"),
  // 6-digit Product Lookup Unit code embedded in EAN-13 weight barcodes.
  plu: text("plu"),
  // Multi-industry support:
  //  - "item"      = retail/wholesale stock-keeping unit
  //  - "menu_item" = restaurant-style item that may have modifiers/kitchen routing
  productType: text("product_type").notNull().default("item"),
  hasModifiers: boolean("has_modifiers").notNull().default(false),
  // Base inventory unit. All stock_count values are stored in this unit.
  // Examples: "each", "kg", "g", "lb", "oz", "ml", "L". Defaults to "each".
  baseUnit: text("base_unit").notNull().default("each"),
  // Per-unit acquisition cost. Used for COGS / margin reports and as the
  // basis for derived cost on composite (bundle) parents. Nullable for
  // legacy rows that haven't been costed yet.
  costPrice: real("cost_price"),
  // Product structure:
  //  - "simple"    = stand-alone SKU with its own stock + cost
  //  - "composite" = bundle SKU; selling price is fixed/manual on this row,
  //                  stock and cost are derived from child components
  //                  listed in composite_product_components.
  structureType: text("structure_type").notNull().default("simple"),
  // When false, sales tax is not applied to this product at checkout.
  // Defaults to true so existing products are unaffected.
  isTaxable: boolean("is_taxable").notNull().default(true),
  // When true, this product's stock is tracked per-batch in
  // `product_batches`. Purchase bill lines for the product require
  // `batchNumber`/`expiryDate`; checkout deducts batches FIFO/LIFO.
  trackBatches: boolean("track_batches").notNull().default(false),
  // Optional per-product override of the tenant-wide stock method.
  // 'fifo' | 'lifo' | null (inherit from app_settings.stock_method).
  stockMethodOverride: text("stock_method_override"),
  // Soft-delete / archive timestamp. When set, the product is hidden from
  // the catalog, POS, online menu, and bulk-pricing tools, but all of its
  // historical records (orders, purchase bills, accounting links) remain
  // intact. NULL = active. Restorable by clearing this column.
  archivedAt: timestamp("archived_at", { withTimezone: true }),
}, (t) => [
  index("idx_products_tenant_category").on(t.tenantId, t.category),
  index("idx_products_tenant_archived").on(t.tenantId, t.archivedAt),
]);

export const insertProductSchema = createInsertSchema(productsTable).omit({ id: true, createdAt: true });
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof productsTable.$inferSelect;

/* ────────────────────────────────────────────────────────────────────────
 * Volume / tier pricing.
 * Each row: when the cart's total quantity (in base units) for this product
 * is between minQty and maxQty (inclusive), charge `unitPrice` per base unit.
 * maxQty = NULL means open-ended ("buy 100 or more"). Tiers are evaluated
 * lowest-min first; the first matching tier wins.
 * ──────────────────────────────────────────────────────────────────────── */
export const productPricingTiersTable = pgTable("product_pricing_tiers", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  productId: integer("product_id").notNull(),
  minQty: real("min_qty").notNull(),
  maxQty: real("max_qty"),
  unitPrice: real("unit_price").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type ProductPricingTier = typeof productPricingTiersTable.$inferSelect;

/* ────────────────────────────────────────────────────────────────────────
 * Multi-unit conversions per product.
 *   unitName          — display name ("Case", "Dozen", "Sack")
 *   conversionFactor  — base units in 1 of this unit (e.g. Case = 24)
 *   isPurchase        — show in purchase form
 *   isSale            — allow selling by this unit
 * The product's baseUnit always has implicit factor 1; we don't store it.
 * ──────────────────────────────────────────────────────────────────────── */
export const productPurchaseUnitsTable = pgTable("product_purchase_units", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  productId: integer("product_id").notNull(),
  unitName: text("unit_name").notNull(),
  conversionFactor: real("conversion_factor").notNull(),
  isPurchase: boolean("is_purchase").notNull().default(true),
  isSale: boolean("is_sale").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type ProductPurchaseUnit = typeof productPurchaseUnitsTable.$inferSelect;

/* ────────────────────────────────────────────────────────────────────────
 * Shared, tenant-scoped catalog of reusable unit definitions.
 * Distinct from `product_purchase_units` (which stays the per-product
 * source of truth): this table just remembers the unit names + their
 * canonical conversion so the Pricing & Units editor can offer them as a
 * dropdown and so a "Units" management screen can list them.
 *   name             — display name ("CS24", "Case", "Dozen", "Sack")
 *   baseUnit         — the base unit this conversion is expressed in
 *   conversionFactor — base units in 1 of this unit (e.g. CS24 = 24)
 * ──────────────────────────────────────────────────────────────────────── */
export const productUnitsTable = pgTable("product_units", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  name: text("name").notNull(),
  baseUnit: text("base_unit").notNull().default("each"),
  conversionFactor: real("conversion_factor").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type ProductUnit = typeof productUnitsTable.$inferSelect;
