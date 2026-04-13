import { pgTable, serial, text, integer, real, timestamp, boolean, uniqueIndex } from "drizzle-orm/pg-core";

export const subscriptionPlansTable = pgTable("subscription_plans", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description").notNull(),
  priceMonthly: real("price_monthly").notNull(),
  priceAnnual: real("price_annual").notNull(),
  maxStaff: integer("max_staff").notNull(),
  maxProducts: integer("max_products").notNull(),
  maxLocations: integer("max_locations").notNull(),
  maxInvoices: integer("max_invoices").notNull().default(9999),
  modules: text("modules").notNull().default('["pos","reports","inventory","customers","staff","cash","tables","kitchen","loyalty"]'),
  features: text("features").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tenantsTable = pgTable("tenants", {
  id: serial("id").primaryKey(),
  businessName: text("business_name").notNull(),
  ownerName: text("owner_name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone"),
  address: text("address"),
  country: text("country").default("US"),
  slug: text("slug").unique(),
  status: text("status").notNull().default("pending"),
  passwordHash: text("password_hash").notNull(),
  onboardingStep: integer("onboarding_step").notNull().default(1),
  onboardingComplete: boolean("onboarding_complete").notNull().default(false),
  resellerId: integer("reseller_id"),
  emailVerified: boolean("email_verified").notNull().default(false),
  emailVerificationToken: text("email_verification_token"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const subscriptionsTable = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenantsTable.id),
  planId: integer("plan_id").references(() => subscriptionPlansTable.id),
  status: text("status").notNull().default("trial"),
  provider: text("provider"),
  providerSubscriptionId: text("provider_subscription_id"),
  providerOrderId: text("provider_order_id"),
  billingCycle: text("billing_cycle").notNull().default("monthly"),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const bankAccountSettingsTable = pgTable("bank_account_settings", {
  id: serial("id").primaryKey(),
  accountHolder: text("account_holder").notNull(),
  bankName: text("bank_name").notNull(),
  accountNumber: text("account_number").notNull(),
  routingNumber: text("routing_number"),
  iban: text("iban"),
  swiftCode: text("swift_code"),
  currency: text("currency").notNull().default("USD"),
  instructions: text("instructions"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const emailTemplatesTable = pgTable("email_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  eventKey: text("event_key").notNull(),
  subject: text("subject").notNull(),
  htmlBody: text("html_body").notNull(),
  textBody: text("text_body").notNull().default(""),
  isEnabled: boolean("is_enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const emailLogsTable = pgTable("email_logs", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id").references(() => emailTemplatesTable.id),
  eventKey: text("event_key").notNull(),
  toEmail: text("to_email").notNull(),
  subject: text("subject").notNull(),
  status: text("status").notNull().default("pending"),
  messageId: text("message_id"),
  errorMessage: text("error_message"),
  variables: text("variables"),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tenantAdminUsersTable = pgTable("tenant_admin_users", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  passwordHash: text("password_hash"),
  isPrimary: boolean("is_primary").notNull().default(false),
  inviteToken: text("invite_token"),
  inviteExpiresAt: timestamp("invite_expires_at", { withTimezone: true }),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TenantAdminUser = typeof tenantAdminUsersTable.$inferSelect;

export const bankTransferProofsTable = pgTable("bank_transfer_proofs", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenantsTable.id),
  planId: integer("plan_id").references(() => subscriptionPlansTable.id),
  bankAccountId: integer("bank_account_id").references(() => bankAccountSettingsTable.id),
  billingCycle: text("billing_cycle").notNull().default("monthly"),
  amount: real("amount").notNull(),
  referenceNumber: text("reference_number"),
  notes: text("notes"),
  proofFileName: text("proof_file_name"),
  proofFileType: text("proof_file_type"),
  proofFileData: text("proof_file_data"),
  status: text("status").notNull().default("pending"),
  reviewNotes: text("review_notes"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
