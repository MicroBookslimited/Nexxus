import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Per-tenant Shopify connection. Each tenant creates a Shopify CUSTOM APP in
 * their own Shopify admin and pastes its Admin API access token here — we do
 * NOT use an app-scoped OAuth connector (that only supports one store per
 * project). The access token and webhook signing secret are stored ENCRYPTED
 * (AES-256-GCM) and are never returned to the client.
 *
 * One row per tenant (enforced by a unique index on tenantId). `isActive`
 * mirrors whether the connection is currently usable; `status` is the
 * human-facing state shown in the UI.
 */
export const shopifyConnectionsTable = pgTable(
  "shopify_connections",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").notNull(),
    // e.g. "my-store.myshopify.com" (the permanent .myshopify.com domain)
    shopDomain: text("shop_domain").notNull(),
    // AES-256-GCM encrypted Admin API access token. Never exposed to clients.
    accessTokenEncrypted: text("access_token_encrypted"),
    // Optional AES-256-GCM encrypted webhook signing secret (the custom app's
    // API secret key) used to HMAC-verify inbound webhooks in later phases.
    webhookSecretEncrypted: text("webhook_secret_encrypted"),
    // Configurable Shopify Admin API version, e.g. "2025-01". Stored so we never
    // hardcode a single (eventually-deprecated) version in the client.
    apiVersion: text("api_version").notNull().default("2025-01"),
    // Cached shop display name returned by the last successful test.
    shopName: text("shop_name"),
    // "connected" | "disconnected" | "failed"
    status: text("status").notNull().default("disconnected"),
    isActive: boolean("is_active").notNull().default(false),
    // Sync feature toggles (UI + persistence only this phase).
    syncProducts: boolean("sync_products").notNull().default(false),
    syncInventory: boolean("sync_inventory").notNull().default(false),
    syncOrders: boolean("sync_orders").notNull().default(false),
    syncCustomers: boolean("sync_customers").notNull().default(false),
    // "shopify_to_nexus" | "nexus_to_shopify" | "two_way"
    syncDirection: text("sync_direction").notNull().default("shopify_to_nexus"),
    // NEXXUS location that Shopify stock/orders map to by default.
    defaultLocationId: integer("default_location_id"),
    // Last connection-test result.
    lastTestAt: timestamp("last_test_at", { withTimezone: true }),
    lastTestStatus: text("last_test_status"),
    lastTestMessage: text("last_test_message"),
    // Last data-sync result (used by later phases).
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    lastSyncStatus: text("last_sync_status"),
    lastSyncMessage: text("last_sync_message"),
    connectedAt: timestamp("connected_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantUnique: uniqueIndex("shopify_connections_tenant_unique").on(t.tenantId),
  }),
);

/**
 * Maps a NEXXUS product to its Shopify counterpart (product + variant +
 * inventory item). Created/used by Phase 2 (product & inventory sync); the
 * table is defined now so later phases need no new migration.
 */
export const shopifyProductMappingsTable = pgTable(
  "shopify_product_mappings",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").notNull(),
    productId: integer("product_id").notNull(),
    shopifyProductId: text("shopify_product_id"),
    shopifyVariantId: text("shopify_variant_id"),
    shopifyInventoryItemId: text("shopify_inventory_item_id"),
    sku: text("sku"),
    barcode: text("barcode"),
    // "synced" | "pending" | "error"
    syncStatus: text("sync_status").notNull().default("pending"),
    syncError: text("sync_error"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantProductUnique: uniqueIndex("shopify_product_mappings_tenant_product_unique").on(
      t.tenantId,
      t.productId,
    ),
    tenantVariantUnique: uniqueIndex("shopify_product_mappings_tenant_variant_unique").on(
      t.tenantId,
      t.shopifyVariantId,
    ),
  }),
);

/**
 * Maps an imported Shopify order to its NEXXUS order. Created/used by Phase 3
 * (order import & webhooks). Defined now to avoid a later migration.
 */
export const shopifyOrderMappingsTable = pgTable(
  "shopify_order_mappings",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").notNull(),
    // NEXXUS order id (nullable until the local order is created).
    orderId: integer("order_id"),
    shopifyOrderId: text("shopify_order_id").notNull(),
    shopifyOrderNumber: text("shopify_order_number"),
    financialStatus: text("financial_status"),
    fulfillmentStatus: text("fulfillment_status"),
    rawPayload: jsonb("raw_payload"),
    importedAt: timestamp("imported_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantOrderUnique: uniqueIndex("shopify_order_mappings_tenant_order_unique").on(
      t.tenantId,
      t.shopifyOrderId,
    ),
  }),
);

/**
 * Append-only log of Shopify sync operations (connection tests, product /
 * inventory / order / customer syncs). Powers the sync history/reporting UI in
 * later phases.
 */
export const shopifySyncLogsTable = pgTable("shopify_sync_logs", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  // "connection" | "products" | "inventory" | "orders" | "customers"
  syncType: text("sync_type").notNull(),
  // "shopify_to_nexus" | "nexus_to_shopify" | "two_way" | null
  direction: text("direction"),
  // "success" | "error" | "partial"
  status: text("status").notNull(),
  itemsProcessed: integer("items_processed").notNull().default(0),
  itemsSucceeded: integer("items_succeeded").notNull().default(0),
  itemsFailed: integer("items_failed").notNull().default(0),
  message: text("message"),
  details: jsonb("details"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ShopifyConnection = typeof shopifyConnectionsTable.$inferSelect;
export type ShopifyProductMapping = typeof shopifyProductMappingsTable.$inferSelect;
export type ShopifyOrderMapping = typeof shopifyOrderMappingsTable.$inferSelect;
export type ShopifySyncLog = typeof shopifySyncLogsTable.$inferSelect;
