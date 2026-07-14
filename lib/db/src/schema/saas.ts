import { pgTable, serial, text, integer, real, timestamp, boolean, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

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
  // Promotional plans are visible only to superadmin (hidden from public /plans).
  isPromotional: boolean("is_promotional").notNull().default(false),
  // Optional override for trial / billing period length in days. Used by promotional
  // plans like "1 Year Free" so the trial / current period is set to ~365 days.
  durationDays: integer("duration_days"),
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
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  sessionsInvalidatedAt: timestamp("sessions_invalidated_at", { withTimezone: true }),
  // Proof of consent: when the account accepted the Terms & Conditions at signup,
  // and which version was in effect at that time.
  termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }),
  termsVersion: text("terms_version"),
  // Industry / experience type. Drives which POS surface and feature flags load.
  // Values: restaurant | retail | wholesale | hybrid.
  businessType: text("business_type").notNull().default("restaurant"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Per-tenant feature flags. One row per (tenant, feature). Absence = use the
// default for the tenant's business_type (see DEFAULT_FEATURES on the server).
export const tenantFeaturesTable = pgTable("tenant_features", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  featureName: text("feature_name").notNull(),
  isEnabled: boolean("is_enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export type TenantFeature = typeof tenantFeaturesTable.$inferSelect;

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
  tenantId: integer("tenant_id").notNull().default(0),
  templateKey: text("template_key").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  eventKey: text("event_key").notNull().default(""),
  subject: text("subject").notNull(),
  body: text("html_body").notNull(),
  textBody: text("text_body").notNull().default(""),
  enabled: boolean("is_enabled").notNull().default(true),
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
  sessionsInvalidatedAt: timestamp("sessions_invalidated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TenantAdminUser = typeof tenantAdminUsersTable.$inferSelect;

export const marketingCampaignsTable = pgTable("marketing_campaigns", {
  id: serial("id").primaryKey(),
  subject: text("subject").notNull(),
  htmlBody: text("html_body").notNull(),
  fromName: text("from_name").notNull(),
  fromAddress: text("from_address").notNull(),
  audience: text("audience").notNull().default("all"),
  audienceFilter: text("audience_filter"),
  status: text("status").notNull().default("draft"),
  totalRecipients: integer("total_recipients").notNull().default(0),
  sentCount: integer("sent_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
  openCount: integer("open_count").notNull().default(0),
  clickCount: integer("click_count").notNull().default(0),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  resumedAt: timestamp("resumed_at", { withTimezone: true }),
  resumeCount: integer("resume_count").notNull().default(0),
  resumeAlertedAt: timestamp("resume_alerted_at", { withTimezone: true }),
});

export const marketingRecipientsTable = pgTable("marketing_recipients", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull().references(() => marketingCampaignsTable.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  name: text("name"),
  status: text("status").notNull().default("pending"),
  messageId: text("message_id"),
  errorMessage: text("error_message"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  openedAt: timestamp("opened_at", { withTimezone: true }),
  clickedAt: timestamp("clicked_at", { withTimezone: true }),
  openCount: integer("open_count").notNull().default(0),
  clickCount: integer("click_count").notNull().default(0),
});

export type MarketingCampaign = typeof marketingCampaignsTable.$inferSelect;
export type MarketingRecipient = typeof marketingRecipientsTable.$inferSelect;

export const marketingUnsubscribesTable = pgTable("marketing_unsubscribes", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  token: text("token"),
  campaignId: integer("campaign_id").references(() => marketingCampaignsTable.id, { onDelete: "set null" }),
  unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }).notNull().defaultNow(),
});

export type MarketingUnsubscribe = typeof marketingUnsubscribesTable.$inferSelect;

export const marketingLinkClicksTable = pgTable("marketing_link_clicks", {
  id: serial("id").primaryKey(),
  recipientId: integer("recipient_id").notNull().references(() => marketingRecipientsTable.id, { onDelete: "cascade" }),
  campaignId: integer("campaign_id").notNull().references(() => marketingCampaignsTable.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  clickedAt: timestamp("clicked_at", { withTimezone: true }).notNull().defaultNow(),
});

export type MarketingLinkClick = typeof marketingLinkClicksTable.$inferSelect;

/**
 * Superadmin-recorded manual/offline subscription payments.
 * Each row represents a payment received outside the normal online flow
 * (cash, cheque, bank transfer, etc.). The payment is "scheduled" to take
 * effect when the current subscription period ends; multiple payments can
 * be chained — each one starts where the previous one ends.
 *
 * Auto-applied: on every /api/saas/me call the server checks for any
 * scheduled payments whose scheduledStartDate ≤ now and activates them.
 */
export const subscriptionManualPaymentsTable = pgTable("subscription_manual_payments", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  planId: integer("plan_id").notNull().references(() => subscriptionPlansTable.id),
  billingCycle: text("billing_cycle").notNull().default("monthly"),
  amount: real("amount").notNull(),
  // cash | bank_transfer | cheque | card | other
  paymentMethod: text("payment_method").notNull().default("cash"),
  referenceNumber: text("reference_number"),
  notes: text("notes"),
  // When this payment period starts (= end of current subscription or last scheduled payment)
  scheduledStartDate: timestamp("scheduled_start_date", { withTimezone: true }).notNull(),
  // When this payment period ends (scheduledStartDate + billingCycle duration)
  scheduledEndDate: timestamp("scheduled_end_date", { withTimezone: true }).notNull(),
  // scheduled | applied | cancelled
  status: text("status").notNull().default("scheduled"),
  appliedAt: timestamp("applied_at", { withTimezone: true }),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * One row per subscription payment event (new subscription or renewal), across
 * all payment providers (PayPal, PowerTranz, manual). Backs the emailed
 * Invoice + Receipt PDFs and the tenant-facing Billing History page.
 * Numbers are assigned at issue time and stay stable for re-download/re-send.
 */
export const subscriptionInvoicesTable = pgTable("subscription_invoices", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  planId: integer("plan_id").references(() => subscriptionPlansTable.id),
  // Human-facing document numbers, e.g. MB-INV-26-00042 / MB-RCP-26-00042.
  invoiceNumber: text("invoice_number").notNull(),
  receiptNumber: text("receipt_number").notNull(),
  planName: text("plan_name").notNull(),
  billingCycle: text("billing_cycle").notNull().default("monthly"),
  amount: real("amount").notNull(),
  currency: text("currency").notNull().default("USD"),
  // paypal | powertranz | manual (+ manual sub-type stored in paymentMethodLabel)
  provider: text("provider").notNull(),
  paymentMethodLabel: text("payment_method_label"),
  providerRef: text("provider_ref"),
  periodStart: timestamp("period_start", { withTimezone: true }),
  periodEnd: timestamp("period_end", { withTimezone: true }),
  // Snapshot of the buyer details as printed on the documents.
  billToName: text("bill_to_name").notNull().default(""),
  billToEmail: text("bill_to_email").notNull().default(""),
  billToAddress: text("bill_to_address"),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
  paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
  emailedAt: timestamp("emailed_at", { withTimezone: true }),
  emailStatus: text("email_status").notNull().default("pending"),
  emailError: text("email_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // Race-safe idempotency: one invoice per tenant+provider+providerRef.
  uniqTenantProviderRef: uniqueIndex("subscription_invoices_tenant_provider_ref_uidx")
    .on(t.tenantId, t.provider, t.providerRef)
    .where(sql`${t.providerRef} is not null`),
}));

export type SubscriptionInvoice = typeof subscriptionInvoicesTable.$inferSelect;

/**
 * Superadmin-issued coupon codes that unlock a promotional subscription plan
 * (e.g. "1 Year Free"). Promotional plans can ONLY be activated by redeeming a
 * valid coupon — they are rejected by the self-serve free-activate path. Each
 * code carries a redemption limit (1 = single-use, N = batch) and an optional
 * expiry; redemptions are tracked one-per-tenant in the redemptions table below.
 */
export const subscriptionCouponsTable = pgTable("subscription_coupons", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  planId: integer("plan_id").notNull().references(() => subscriptionPlansTable.id),
  // Billing cycle recorded on the resulting subscription. When the plan has a
  // durationDays override (e.g. 365), that takes precedence for the period end.
  billingCycle: text("billing_cycle").notNull().default("annual"),
  maxRedemptions: integer("max_redemptions").notNull().default(1),
  redemptionCount: integer("redemption_count").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  isActive: boolean("is_active").notNull().default(true),
  notes: text("notes"),
  createdBy: text("created_by").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SubscriptionCoupon = typeof subscriptionCouponsTable.$inferSelect;

export const subscriptionCouponRedemptionsTable = pgTable("subscription_coupon_redemptions", {
  id: serial("id").primaryKey(),
  couponId: integer("coupon_id").notNull().references(() => subscriptionCouponsTable.id, { onDelete: "cascade" }),
  tenantId: integer("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  planId: integer("plan_id").references(() => subscriptionPlansTable.id),
  redeemedAt: timestamp("redeemed_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // One redemption per (coupon, tenant): a tenant cannot re-redeem the same code.
  uniqCouponTenant: uniqueIndex("subscription_coupon_redemptions_coupon_tenant_uidx")
    .on(t.couponId, t.tenantId),
}));

export type SubscriptionCouponRedemption = typeof subscriptionCouponRedemptionsTable.$inferSelect;

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
