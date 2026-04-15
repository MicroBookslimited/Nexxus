import { pgTable, serial, text, integer, real, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";

export const storeSuppliersTable = pgTable("store_suppliers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  contactName: text("contact_name"),
  contactPhone: text("contact_phone"),
  email: text("email"),
  website: text("website"),
  address: text("address"),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const storeProductsTable = pgTable("store_products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  category: text("category").notNull(),
  sku: text("sku"),
  brand: text("brand"),
  tags: text("tags").array(),
  productType: text("product_type").notNull().default("simple"),
  price: real("price").notNull(),
  costPrice: real("cost_price"),
  imageEmoji: text("image_emoji").notNull().default("📦"),
  imageUrl: text("image_url"),
  specs: jsonb("specs").default({}),
  inStock: boolean("in_stock").notNull().default(true),
  stockCount: integer("stock_count").notNull().default(9999),
  lowStockThreshold: integer("low_stock_threshold").notNull().default(5),
  supplierId: integer("supplier_id"),
  preferredSupplierPrice: real("preferred_supplier_price"),
  leadTimeDays: integer("lead_time_days"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const storeStockMovementsTable = pgTable("store_stock_movements", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull(),
  type: text("type").notNull(), // purchase | sale | adjustment | return
  quantity: integer("quantity").notNull(), // positive = in, negative = out
  previousStock: integer("previous_stock").notNull(),
  newStock: integer("new_stock").notNull(),
  reference: text("reference"), // order number, PO number, etc.
  notes: text("notes"),
  performedBy: text("performed_by").notNull().default("superadmin"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const storeOrdersTable = pgTable("store_orders", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  orderNumber: text("order_number").notNull().unique(),
  status: text("status").notNull().default("pending"),
  paymentMethod: text("payment_method"),
  paymentStatus: text("payment_status").notNull().default("unpaid"),
  items: jsonb("items").notNull().default([]),
  subtotal: real("subtotal").notNull(),
  tax: real("tax").notNull().default(0),
  total: real("total").notNull(),
  amountPaid: real("amount_paid").notNull().default(0),
  contactName: text("contact_name").notNull(),
  contactPhone: text("contact_phone").notNull(),
  deliveryAddress: text("delivery_address").notNull(),
  notes: text("notes"),
  fulfillmentAssignee: text("fulfillment_assignee"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
