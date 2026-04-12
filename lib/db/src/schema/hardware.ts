import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";

export const DEVICE_TYPES = [
  "printer",
  "barcode_scanner",
  "cash_drawer",
  "card_reader",
  "customer_display",
  "label_printer",
  "tablet",
  "kds",
  "other",
] as const;

export type DeviceType = (typeof DEVICE_TYPES)[number];

export const DRIVER_PLATFORMS = ["windows", "macos", "linux", "android", "ios", "all"] as const;
export type DriverPlatform = (typeof DRIVER_PLATFORMS)[number];

export const hardwareDevicesTable = pgTable("hardware_devices", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().default(0),
  deviceType: text("device_type").notNull().default("other"),
  make: text("make").notNull(),
  model: text("model").notNull(),
  serialNumber: text("serial_number"),
  purchaseDate: text("purchase_date"),
  condition: text("condition").notNull().default("good"),
  location: text("location"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const driverLinksTable = pgTable("driver_links", {
  id: serial("id").primaryKey(),
  deviceType: text("device_type").notNull(),
  make: text("make").notNull(),
  model: text("model"),
  driverName: text("driver_name").notNull(),
  downloadUrl: text("download_url").notNull(),
  version: text("version"),
  platform: text("platform").notNull().default("all"),
  fileSize: text("file_size"),
  releaseDate: text("release_date"),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type HardwareDevice = typeof hardwareDevicesTable.$inferSelect;
export type DriverLink = typeof driverLinksTable.$inferSelect;
