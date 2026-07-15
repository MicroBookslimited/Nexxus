import { pgTable, text, serial, timestamp, real, integer, uniqueIndex, index } from "drizzle-orm/pg-core";

// Package/Shipping Service module: packages are scanned IN when they arrive
// at the store and scanned OUT (collected) at the POS like a product sale.
// Each tracking number is unique per tenant and can only be collected once.
export const packagesTable = pgTable("packages", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().default(0),
  // Primary barcode scanned in/out — unique per tenant.
  trackingNumber: text("tracking_number").notNull(),
  // Air waybill number (optional secondary reference).
  awb: text("awb"),
  // The merchant/purchase tracking number (e.g. Amazon order tracking).
  purchaseTrackingNumber: text("purchase_tracking_number"),
  customerName: text("customer_name"),
  customerPhone: text("customer_phone"),
  courier: text("courier"),
  weight: real("weight"),
  weightUnit: text("weight_unit").default("lb"),
  shelfLocation: text("shelf_location"),
  // Fee charged to the customer at pickup (entered when received).
  fee: real("fee").notNull().default(0),
  notes: text("notes"),
  // received | collected | cancelled
  status: text("status").notNull().default("received"),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  receivedByStaffId: integer("received_by_staff_id"),
  receivedByStaffName: text("received_by_staff_name"),
  collectedAt: timestamp("collected_at", { withTimezone: true }),
  collectedByStaffId: integer("collected_by_staff_id"),
  collectedByStaffName: text("collected_by_staff_name"),
  // Order that charged the pickup fee (set on collection).
  collectedOrderId: integer("collected_order_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantTrackingUnique: uniqueIndex("packages_tenant_tracking_unique").on(
    t.tenantId,
    t.trackingNumber,
  ),
  tenantStatusIdx: index("packages_tenant_status_idx").on(t.tenantId, t.status),
}));

export type Package = typeof packagesTable.$inferSelect;
