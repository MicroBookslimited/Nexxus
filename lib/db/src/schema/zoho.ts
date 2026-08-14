import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

/**
 * Per-tenant Zoho Books connection.
 *
 * Each NEXXUS tenant authorizes OUR single Zoho API client (platform-managed
 * ZOHO_CLIENT_ID / ZOHO_CLIENT_SECRET) against THEIR Zoho Books organisation.
 * Zoho hands back a long-lived refresh token plus a 1-hour access token; both
 * are stored encrypted (AES-256-GCM) and never returned to the browser.
 *
 * One row per tenant: a tenant syncs with exactly one Zoho Books organisation.
 * `region` is the Zoho data centre the tenant's account lives in (com, eu, in,
 * com.au, jp, ca, sa, uk) — token and API hosts differ per data centre.
 */
export const zohoConnectionsTable = pgTable(
  "zoho_connections",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").notNull(),
    // Zoho data centre suffix: "com" | "eu" | "in" | "com.au" | "jp" | "ca" | "sa" | "uk"
    region: text("region").notNull().default("com"),
    // Zoho Books organisation the tenant picked (null until chosen).
    organizationId: text("organization_id"),
    organizationName: text("organization_name"),
    // Currency of the chosen organisation (display only).
    organizationCurrency: text("organization_currency"),
    // AES-256-GCM encrypted OAuth refresh token (long lived, never expires
    // unless revoked). This is what lets the server act for the tenant.
    refreshTokenEncrypted: text("refresh_token_encrypted"),
    // AES-256-GCM encrypted cached access token + its expiry (~1 hour).
    accessTokenEncrypted: text("access_token_encrypted"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    // Space-separated scopes Zoho actually granted.
    grantedScopes: text("granted_scopes"),
    // "connected" | "disconnected" | "failed"
    status: text("status").notNull().default("disconnected"),
    isActive: boolean("is_active").notNull().default(false),
    // Customer sync toggles.
    syncCustomers: boolean("sync_customers").notNull().default(true),
    // "zoho_to_nexus" | "nexus_to_zoho" | "two_way"
    syncDirection: text("sync_direction").notNull().default("two_way"),
    // Push a customer to Zoho as soon as it is created/edited in NEXXUS.
    autoSync: boolean("auto_sync").notNull().default(true),
    // Last connection-test result.
    lastTestAt: timestamp("last_test_at", { withTimezone: true }),
    lastTestStatus: text("last_test_status"),
    lastTestMessage: text("last_test_message"),
    // Last full customer sync result.
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    lastSyncStatus: text("last_sync_status"),
    lastSyncMessage: text("last_sync_message"),
    connectedAt: timestamp("connected_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantUnique: uniqueIndex("zoho_connections_tenant_unique").on(t.tenantId),
  }),
);

/**
 * Short-lived, single-use OAuth `state` nonces. Zoho does not sign its redirect
 * (unlike Shopify's HMAC), so this nonce is the ONLY thing tying the public
 * callback back to the tenant that started the connect — it must be random,
 * expiring and consumed atomically.
 */
export const zohoOauthStatesTable = pgTable("zoho_oauth_states", {
  state: text("state").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  region: text("region").notNull().default("com"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Links a NEXXUS customer to its Zoho Books contact.
 *
 * `localFingerprint` is a hash of the NEXXUS fields we sync; `zohoLastModified`
 * is Zoho's `last_modified_time` as of the last successful sync. Comparing both
 * against the current values tells us which side changed since we last synced,
 * which is how two-way sync avoids echoing its own writes back and forth.
 */
export const zohoCustomerMappingsTable = pgTable(
  "zoho_customer_mappings",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").notNull(),
    customerId: integer("customer_id").notNull(),
    zohoContactId: text("zoho_contact_id").notNull(),
    // Snapshot of the NEXXUS side at last sync (sha256 of the mapped fields).
    localFingerprint: text("local_fingerprint"),
    // Zoho's last_modified_time string at last sync.
    zohoLastModified: text("zoho_last_modified"),
    // "synced" | "pending" | "error"
    syncStatus: text("sync_status").notNull().default("pending"),
    syncError: text("sync_error"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantCustomerUnique: uniqueIndex("zoho_customer_mappings_tenant_customer_unique").on(
      t.tenantId,
      t.customerId,
    ),
    tenantContactUnique: uniqueIndex("zoho_customer_mappings_tenant_contact_unique").on(
      t.tenantId,
      t.zohoContactId,
    ),
  }),
);

/** Append-only log of Zoho sync operations (connection tests, customer syncs). */
export const zohoSyncLogsTable = pgTable(
  "zoho_sync_logs",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id").notNull(),
    // "connection" | "customers" | "customer"
    syncType: text("sync_type").notNull(),
    // "zoho_to_nexus" | "nexus_to_zoho" | "two_way" | null
    direction: text("direction"),
    // "success" | "error" | "partial"
    status: text("status").notNull(),
    itemsProcessed: integer("items_processed").notNull().default(0),
    itemsCreated: integer("items_created").notNull().default(0),
    itemsUpdated: integer("items_updated").notNull().default(0),
    itemsFailed: integer("items_failed").notNull().default(0),
    message: text("message"),
    details: jsonb("details"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantCreatedIdx: index("zoho_sync_logs_tenant_created_idx").on(t.tenantId, t.createdAt),
  }),
);

export type ZohoConnection = typeof zohoConnectionsTable.$inferSelect;
export type ZohoOauthState = typeof zohoOauthStatesTable.$inferSelect;
export type ZohoCustomerMapping = typeof zohoCustomerMappingsTable.$inferSelect;
export type ZohoSyncLog = typeof zohoSyncLogsTable.$inferSelect;
