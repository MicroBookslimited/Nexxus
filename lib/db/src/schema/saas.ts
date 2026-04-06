import { pgTable, serial, text, integer, real, timestamp, boolean } from "drizzle-orm/pg-core";

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
  status: text("status").notNull().default("pending"),
  passwordHash: text("password_hash").notNull(),
  onboardingStep: integer("onboarding_step").notNull().default(1),
  onboardingComplete: boolean("onboarding_complete").notNull().default(false),
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
