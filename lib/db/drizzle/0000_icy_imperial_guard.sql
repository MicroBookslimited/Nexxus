CREATE TABLE "product_pricing_tiers" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"min_qty" real NOT NULL,
	"max_qty" real,
	"unit_price" real NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_purchase_units" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"unit_name" text NOT NULL,
	"conversion_factor" real NOT NULL,
	"is_purchase" boolean DEFAULT true NOT NULL,
	"is_sale" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_units" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"name" text NOT NULL,
	"base_unit" text DEFAULT 'each' NOT NULL,
	"conversion_factor" real NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 0 NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price" real NOT NULL,
	"category" text NOT NULL,
	"image_url" text,
	"barcode" text,
	"sku" text,
	"size" text,
	"in_stock" boolean DEFAULT true NOT NULL,
	"stock_count" real DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sold_by_weight" boolean DEFAULT false NOT NULL,
	"unit_of_measure" text,
	"selling_unit" text,
	"plu" text,
	"product_type" text DEFAULT 'item' NOT NULL,
	"has_modifiers" boolean DEFAULT false NOT NULL,
	"base_unit" text DEFAULT 'each' NOT NULL,
	"cost_price" real,
	"structure_type" text DEFAULT 'simple' NOT NULL,
	"is_taxable" boolean DEFAULT true NOT NULL,
	"track_batches" boolean DEFAULT false NOT NULL,
	"stock_method_override" text,
	"brand" text,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "held_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 0 NOT NULL,
	"label" text,
	"items" jsonb NOT NULL,
	"notes" text,
	"discount_type" text,
	"discount_amount" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"product_name" text NOT NULL,
	"quantity" real NOT NULL,
	"refunded_quantity" real DEFAULT 0,
	"unit_price" real NOT NULL,
	"original_unit_price" real,
	"discount_amount" real,
	"variant_adjustment" real,
	"modifier_adjustment" real,
	"variant_choices" jsonb,
	"modifier_choices" jsonb,
	"line_total" real NOT NULL,
	"notes" text,
	"component_snapshot" jsonb
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 0 NOT NULL,
	"order_number" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"kitchen_status" text,
	"subtotal" real NOT NULL,
	"discount_type" text,
	"discount_amount" real,
	"discount_value" real,
	"tax" real NOT NULL,
	"service_charge" real DEFAULT 0,
	"total" real NOT NULL,
	"payment_method" text,
	"card_type" text,
	"split_card_amount" real,
	"split_cash_amount" real,
	"split_credit_amount" real,
	"cash_tendered" real,
	"gift_voucher_id" integer,
	"gift_voucher_code" text,
	"gift_voucher_amount" real DEFAULT 0,
	"notes" text,
	"void_reason" text,
	"customer_id" integer,
	"table_id" integer,
	"order_type" text DEFAULT 'counter',
	"loyalty_points_redeemed" integer DEFAULT 0,
	"loyalty_discount" real DEFAULT 0,
	"refunded_total" real DEFAULT 0,
	"refund_method" text,
	"refunded_at" timestamp with time zone,
	"staff_id" integer,
	"location_id" integer,
	"station_number" integer,
	"sales_channel" text DEFAULT 'pos' NOT NULL,
	"client_request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "quotations" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 0 NOT NULL,
	"quote_number" text NOT NULL,
	"customer_id" integer,
	"items" jsonb NOT NULL,
	"subtotal" real DEFAULT 0 NOT NULL,
	"discount_type" text,
	"discount_amount" real,
	"tax" real DEFAULT 0 NOT NULL,
	"total" real DEFAULT 0 NOT NULL,
	"notes" text,
	"status" text DEFAULT 'active' NOT NULL,
	"expiry_date" timestamp with time zone,
	"converted_order_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 0 NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"phone2" text,
	"company" text,
	"address" text,
	"city" text,
	"state" text,
	"postal_code" text,
	"notes" text,
	"directions" text,
	"card_number" text,
	"opening_balance" real DEFAULT 0 NOT NULL,
	"loyalty_points" integer DEFAULT 0 NOT NULL,
	"total_spent" real DEFAULT 0 NOT NULL,
	"order_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "modifier_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"name" text NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"min_selections" integer DEFAULT 0 NOT NULL,
	"max_selections" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "modifier_options" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"name" text NOT NULL,
	"price_adjustment" real DEFAULT 0 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "variant_combinations" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"option_ids" jsonb NOT NULL,
	"label" text NOT NULL,
	"price" real,
	"stock_count" real,
	"sku" text,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "variant_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"name" text NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "variant_options" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"name" text NOT NULL,
	"price_adjustment" real DEFAULT 0 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"stock_count" real,
	"sku" text
);
--> statement-breakpoint
CREATE TABLE "dining_tables" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 0 NOT NULL,
	"name" text NOT NULL,
	"capacity" integer DEFAULT 4 NOT NULL,
	"status" text DEFAULT 'available' NOT NULL,
	"current_order_id" integer,
	"color" text DEFAULT 'blue' NOT NULL,
	"position_x" integer DEFAULT 0 NOT NULL,
	"position_y" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kds_screens" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"categories" text[] DEFAULT '{}'::text[] NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_bill_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"bill_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"quantity" integer NOT NULL,
	"unit_cost" real DEFAULT 0 NOT NULL,
	"tax_rate" real,
	"tax_amount" real DEFAULT 0 NOT NULL,
	"total_cost" real DEFAULT 0 NOT NULL,
	"batch_number" text,
	"expiry_date" text
);
--> statement-breakpoint
CREATE TABLE "purchase_bills" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 0 NOT NULL,
	"bill_number" text NOT NULL,
	"vendor_id" integer,
	"supplier" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"notes" text,
	"default_tax_rate" real DEFAULT 0 NOT NULL,
	"tax_mode" text DEFAULT 'exclusive' NOT NULL,
	"subtotal" real DEFAULT 0 NOT NULL,
	"tax_total" real DEFAULT 0 NOT NULL,
	"total_cost" real DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"po_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"quantity" integer NOT NULL,
	"unit_cost" real DEFAULT 0 NOT NULL,
	"tax_rate" real,
	"tax_amount" real DEFAULT 0 NOT NULL,
	"total_cost" real DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 0 NOT NULL,
	"po_number" text NOT NULL,
	"vendor_id" integer,
	"supplier" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"expected_date" text,
	"notes" text,
	"default_tax_rate" real DEFAULT 0 NOT NULL,
	"tax_mode" text DEFAULT 'exclusive' NOT NULL,
	"subtotal" real DEFAULT 0 NOT NULL,
	"tax_total" real DEFAULT 0 NOT NULL,
	"total_cost" real DEFAULT 0 NOT NULL,
	"converted_bill_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 0 NOT NULL,
	"product_id" integer NOT NULL,
	"quantity" integer NOT NULL,
	"unit_cost" real DEFAULT 0 NOT NULL,
	"total_cost" real DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer,
	"name" text NOT NULL,
	"pin" text NOT NULL,
	"role" text DEFAULT 'cashier' NOT NULL,
	"is_technician" boolean DEFAULT false NOT NULL,
	"can_receive_cash" boolean DEFAULT false NOT NULL,
	"email" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"staff_id" integer NOT NULL,
	"staff_name" text NOT NULL,
	"location_id" integer,
	"location_name" text,
	"clock_in_time" timestamp with time zone DEFAULT now() NOT NULL,
	"clock_out_time" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cash_handovers" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 0 NOT NULL,
	"session_id" integer NOT NULL,
	"staff_id" integer,
	"staff_name" text NOT NULL,
	"amount" real NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"received_amount" real,
	"received_by_staff_id" integer,
	"received_by_name" text,
	"signature" text,
	"notes" text,
	"signed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cash_payouts" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"amount" real NOT NULL,
	"reason" text NOT NULL,
	"staff_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cash_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 0 NOT NULL,
	"staff_id" integer,
	"staff_name" text NOT NULL,
	"location_id" integer,
	"location_name" text,
	"station_number" integer,
	"opening_cash" real NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"actual_cash" real,
	"actual_card" real,
	"actual_other" real,
	"closing_notes" text,
	"denomination_breakdown" text
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 0 NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_account_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_holder" text NOT NULL,
	"bank_name" text NOT NULL,
	"account_number" text NOT NULL,
	"routing_number" text,
	"iban" text,
	"swift_code" text,
	"currency" text DEFAULT 'USD' NOT NULL,
	"instructions" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_transfer_proofs" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"plan_id" integer,
	"bank_account_id" integer,
	"billing_cycle" text DEFAULT 'monthly' NOT NULL,
	"amount" real NOT NULL,
	"reference_number" text,
	"notes" text,
	"proof_file_name" text,
	"proof_file_type" text,
	"proof_file_data" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"review_notes" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"template_id" integer,
	"event_key" text NOT NULL,
	"to_email" text NOT NULL,
	"subject" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"message_id" text,
	"error_message" text,
	"variables" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 0 NOT NULL,
	"template_key" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"event_key" text DEFAULT '' NOT NULL,
	"subject" text NOT NULL,
	"html_body" text NOT NULL,
	"text_body" text DEFAULT '' NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketing_campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"subject" text NOT NULL,
	"html_body" text NOT NULL,
	"from_name" text NOT NULL,
	"from_address" text NOT NULL,
	"audience" text DEFAULT 'all' NOT NULL,
	"audience_filter" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"total_recipients" integer DEFAULT 0 NOT NULL,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"open_count" integer DEFAULT 0 NOT NULL,
	"click_count" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"resumed_at" timestamp with time zone,
	"resume_count" integer DEFAULT 0 NOT NULL,
	"resume_alerted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "marketing_link_clicks" (
	"id" serial PRIMARY KEY NOT NULL,
	"recipient_id" integer NOT NULL,
	"campaign_id" integer NOT NULL,
	"url" text NOT NULL,
	"clicked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketing_recipients" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"message_id" text,
	"error_message" text,
	"sent_at" timestamp with time zone,
	"opened_at" timestamp with time zone,
	"clicked_at" timestamp with time zone,
	"open_count" integer DEFAULT 0 NOT NULL,
	"click_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketing_unsubscribes" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"token" text,
	"campaign_id" integer,
	"unsubscribed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "marketing_unsubscribes_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "subscription_addons" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"price_monthly" real NOT NULL,
	"price_annual" real NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_addons_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "subscription_coupon_redemptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"coupon_id" integer NOT NULL,
	"tenant_id" integer NOT NULL,
	"plan_id" integer,
	"redeemed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_coupons" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"plan_id" integer NOT NULL,
	"billing_cycle" text DEFAULT 'annual' NOT NULL,
	"max_redemptions" integer DEFAULT 1 NOT NULL,
	"redemption_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_by" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_coupons_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "subscription_invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"plan_id" integer,
	"invoice_number" text NOT NULL,
	"receipt_number" text NOT NULL,
	"plan_name" text NOT NULL,
	"billing_cycle" text DEFAULT 'monthly' NOT NULL,
	"amount" real NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"provider" text NOT NULL,
	"payment_method_label" text,
	"provider_ref" text,
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"bill_to_name" text DEFAULT '' NOT NULL,
	"bill_to_email" text DEFAULT '' NOT NULL,
	"bill_to_address" text,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	"emailed_at" timestamp with time zone,
	"email_status" text DEFAULT 'pending' NOT NULL,
	"email_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_manual_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"plan_id" integer NOT NULL,
	"billing_cycle" text DEFAULT 'monthly' NOT NULL,
	"amount" real NOT NULL,
	"payment_method" text DEFAULT 'cash' NOT NULL,
	"reference_number" text,
	"notes" text,
	"scheduled_start_date" timestamp with time zone NOT NULL,
	"scheduled_end_date" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"applied_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text NOT NULL,
	"price_monthly" real NOT NULL,
	"price_annual" real NOT NULL,
	"max_staff" integer NOT NULL,
	"max_products" integer NOT NULL,
	"max_locations" integer NOT NULL,
	"max_invoices" integer DEFAULT 9999 NOT NULL,
	"modules" text DEFAULT '["pos","reports","inventory","customers","staff","cash","tables","kitchen","loyalty"]' NOT NULL,
	"features" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_promotional" boolean DEFAULT false NOT NULL,
	"duration_days" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_plans_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"plan_id" integer,
	"status" text DEFAULT 'trial' NOT NULL,
	"provider" text,
	"provider_subscription_id" text,
	"provider_order_id" text,
	"billing_cycle" text DEFAULT 'monthly' NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_addons" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"addon_slug" text NOT NULL,
	"billing_cycle" text DEFAULT 'monthly' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"current_period_start" timestamp with time zone DEFAULT now() NOT NULL,
	"current_period_end" timestamp with time zone DEFAULT now() NOT NULL,
	"provider" text,
	"provider_ref" text,
	"amount" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_admin_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"invite_token" text,
	"invite_expires_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"sessions_invalidated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_features" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"feature_name" text NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" serial PRIMARY KEY NOT NULL,
	"business_name" text NOT NULL,
	"owner_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"address" text,
	"country" text DEFAULT 'US',
	"slug" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"password_hash" text NOT NULL,
	"onboarding_step" integer DEFAULT 1 NOT NULL,
	"onboarding_complete" boolean DEFAULT false NOT NULL,
	"reseller_id" integer,
	"email_verified" boolean DEFAULT false NOT NULL,
	"email_verification_token" text,
	"last_login_at" timestamp with time zone,
	"sessions_invalidated_at" timestamp with time zone,
	"terms_accepted_at" timestamp with time zone,
	"terms_version" text,
	"business_type" text DEFAULT 'restaurant' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_email_unique" UNIQUE("email"),
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#3b82f6' NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "location_inventory" (
	"id" serial PRIMARY KEY NOT NULL,
	"location_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"stock_count" real DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_location_product" UNIQUE("location_id","product_id")
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 0 NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"phone" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_locations" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"location_id" integer NOT NULL,
	"is_available" boolean DEFAULT true NOT NULL,
	"price_override" real,
	"markup_override" real,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_product_location_avail" UNIQUE("product_id","location_id")
);
--> statement-breakpoint
CREATE TABLE "staff_locations" (
	"id" serial PRIMARY KEY NOT NULL,
	"staff_id" integer NOT NULL,
	"location_id" integer NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	CONSTRAINT "uq_staff_location" UNIQUE("staff_id","location_id")
);
--> statement-breakpoint
CREATE TABLE "stock_transfers" (
	"id" serial PRIMARY KEY NOT NULL,
	"from_location_id" integer,
	"to_location_id" integer,
	"product_id" integer NOT NULL,
	"quantity" integer NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounting_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 0 NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"subtype" text,
	"description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 0 NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"description" text NOT NULL,
	"reference" text,
	"type" text DEFAULT 'manual' NOT NULL,
	"status" text DEFAULT 'posted' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal_entry_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"entry_id" integer NOT NULL,
	"account_id" integer NOT NULL,
	"description" text,
	"debit" real DEFAULT 0 NOT NULL,
	"credit" real DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quickbooks_connection" (
	"id" serial PRIMARY KEY NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"realm_id" text,
	"token_type" text,
	"expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"last_sync_at" timestamp with time zone,
	"last_sync_status" text,
	"last_sync_message" text
);
--> statement-breakpoint
CREATE TABLE "stock_adjustments" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 0 NOT NULL,
	"product_id" integer NOT NULL,
	"product_name" text NOT NULL,
	"adjustment_type" text NOT NULL,
	"quantity" integer NOT NULL,
	"reason" text NOT NULL,
	"notes" text,
	"previous_stock" integer NOT NULL,
	"new_stock" integer NOT NULL,
	"unit_cost" real,
	"journal_entry_id" integer,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_count_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"product_name" text NOT NULL,
	"product_category" text,
	"system_count" integer NOT NULL,
	"physical_count" integer,
	"discrepancy" integer,
	"unit_cost" real,
	"is_adjusted" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_count_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 0 NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"notes" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_by" text,
	"total_items" integer,
	"total_discrepancies" integer
);
--> statement-breakpoint
CREATE TABLE "accounts_receivable" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 0 NOT NULL,
	"customer_id" integer NOT NULL,
	"customer_name" text NOT NULL,
	"order_id" integer,
	"order_number" text NOT NULL,
	"amount" real NOT NULL,
	"amount_paid" real DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"notes" text,
	"due_date" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ar_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 0 NOT NULL,
	"ar_id" integer NOT NULL,
	"amount" real NOT NULL,
	"payment_method" text DEFAULT 'cash' NOT NULL,
	"staff_name" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingredient_usage_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 0 NOT NULL,
	"ingredient_id" integer NOT NULL,
	"quantity" real NOT NULL,
	"reason" text NOT NULL,
	"reference_id" integer,
	"reference_type" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingredients" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 0 NOT NULL,
	"name" text NOT NULL,
	"unit" text DEFAULT 'pcs' NOT NULL,
	"cost_per_unit" real DEFAULT 0 NOT NULL,
	"stock_quantity" real DEFAULT 0 NOT NULL,
	"min_stock_level" real DEFAULT 0 NOT NULL,
	"category" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "production_batch_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"batch_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"quantity_planned" real NOT NULL,
	"quantity_produced" real,
	"unit" text DEFAULT 'pcs' NOT NULL,
	"cost_calculated" real
);
--> statement-breakpoint
CREATE TABLE "production_batches" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 0 NOT NULL,
	"batch_number" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"notes" text,
	"total_cost" real,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" integer
);
--> statement-breakpoint
CREATE TABLE "recipe_ingredients" (
	"id" serial PRIMARY KEY NOT NULL,
	"recipe_id" integer NOT NULL,
	"ingredient_id" integer NOT NULL,
	"quantity" real NOT NULL,
	"unit" text NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "recipes" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 0 NOT NULL,
	"product_id" integer NOT NULL,
	"name" text,
	"notes" text,
	"yield_quantity" real DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_recipe_product" UNIQUE("product_id","tenant_id")
);
--> statement-breakpoint
CREATE TABLE "reseller_commissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"reseller_id" integer NOT NULL,
	"tenant_id" integer NOT NULL,
	"plan_id" integer,
	"period_month" text NOT NULL,
	"base_amount" real NOT NULL,
	"commission_rate" real NOT NULL,
	"commission_amount" real NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payout_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reseller_payouts" (
	"id" serial PRIMARY KEY NOT NULL,
	"reseller_id" integer NOT NULL,
	"amount" real NOT NULL,
	"commission_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"notes" text,
	"payment_details" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resellers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"company_name" text,
	"phone" text,
	"referral_code" text NOT NULL,
	"commission_rate" real DEFAULT 0.3 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"payment_details" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resellers_email_unique" UNIQUE("email"),
	CONSTRAINT "resellers_referral_code_unique" UNIQUE("referral_code")
);
--> statement-breakpoint
CREATE TABLE "store_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"order_number" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payment_method" text,
	"payment_status" text DEFAULT 'unpaid' NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"subtotal" real NOT NULL,
	"tax" real DEFAULT 0 NOT NULL,
	"total" real NOT NULL,
	"amount_paid" real DEFAULT 0 NOT NULL,
	"contact_name" text NOT NULL,
	"contact_phone" text NOT NULL,
	"delivery_address" text NOT NULL,
	"notes" text,
	"fulfillment_assignee" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_orders_order_number_unique" UNIQUE("order_number")
);
--> statement-breakpoint
CREATE TABLE "store_products" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"category" text NOT NULL,
	"sku" text,
	"brand" text,
	"tags" text[],
	"product_type" text DEFAULT 'simple' NOT NULL,
	"price" real NOT NULL,
	"cost_price" real,
	"image_emoji" text DEFAULT '📦' NOT NULL,
	"image_url" text,
	"specs" jsonb DEFAULT '{}'::jsonb,
	"in_stock" boolean DEFAULT true NOT NULL,
	"stock_count" integer DEFAULT 9999 NOT NULL,
	"low_stock_threshold" integer DEFAULT 5 NOT NULL,
	"supplier_id" integer,
	"preferred_supplier_price" real,
	"lead_time_days" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_stock_movements" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"type" text NOT NULL,
	"quantity" integer NOT NULL,
	"previous_stock" integer NOT NULL,
	"new_stock" integer NOT NULL,
	"reference" text,
	"notes" text,
	"performed_by" text DEFAULT 'superadmin' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_suppliers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"contact_name" text,
	"contact_phone" text,
	"email" text,
	"website" text,
	"address" text,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "driver_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"device_type" text NOT NULL,
	"make" text NOT NULL,
	"model" text,
	"driver_name" text NOT NULL,
	"download_url" text NOT NULL,
	"version" text,
	"platform" text DEFAULT 'all' NOT NULL,
	"file_size" text,
	"release_date" text,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hardware_devices" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 0 NOT NULL,
	"device_type" text DEFAULT 'other' NOT NULL,
	"make" text NOT NULL,
	"model" text NOT NULL,
	"serial_number" text,
	"purchase_date" text,
	"condition" text DEFAULT 'good' NOT NULL,
	"location" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ap_credits" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"vendor_id" integer NOT NULL,
	"amount" real NOT NULL,
	"used_amount" real DEFAULT 0 NOT NULL,
	"available_amount" real NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ap_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"vendor_id" integer,
	"purchase_id" integer,
	"purchase_bill_id" integer,
	"entry_date" timestamp with time zone DEFAULT now() NOT NULL,
	"due_date" timestamp with time zone,
	"invoice_ref" text,
	"currency" text DEFAULT 'JMD' NOT NULL,
	"exchange_rate" real DEFAULT 1 NOT NULL,
	"amount_total" real NOT NULL,
	"amount_paid" real DEFAULT 0 NOT NULL,
	"amount_balance" real NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ap_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"ap_entry_id" integer NOT NULL,
	"vendor_id" integer,
	"payment_date" timestamp with time zone DEFAULT now() NOT NULL,
	"amount" real NOT NULL,
	"payment_method" text DEFAULT 'cash' NOT NULL,
	"reference" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raw_material_purchase_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"purchase_id" integer NOT NULL,
	"ingredient_id" integer NOT NULL,
	"purchase_unit" text NOT NULL,
	"purchase_qty" real NOT NULL,
	"conversion_factor" real NOT NULL,
	"base_unit" text NOT NULL,
	"base_qty" real NOT NULL,
	"unit_cost" real DEFAULT 0 NOT NULL,
	"total_cost" real DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raw_material_purchases" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"purchase_number" text NOT NULL,
	"vendor_id" integer,
	"status" text DEFAULT 'draft' NOT NULL,
	"payment_type" text DEFAULT 'credit' NOT NULL,
	"currency" text DEFAULT 'JMD' NOT NULL,
	"exchange_rate" real DEFAULT 1 NOT NULL,
	"purchase_date" timestamp with time zone DEFAULT now() NOT NULL,
	"due_date" timestamp with time zone,
	"invoice_ref" text,
	"notes" text,
	"total_cost" real DEFAULT 0 NOT NULL,
	"total_cost_jmd" real DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "units_of_measurement" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 0 NOT NULL,
	"name" text NOT NULL,
	"symbol" text NOT NULL,
	"base_unit" text NOT NULL,
	"conversion_factor" real NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"name" text NOT NULL,
	"contact_name" text,
	"phone" text,
	"email" text,
	"address" text,
	"city" text,
	"state" text,
	"postal_code" text,
	"tax_id" text,
	"currency" text DEFAULT 'JMD' NOT NULL,
	"payment_terms_days" integer DEFAULT 30,
	"credit_limit" real DEFAULT 0,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 0 NOT NULL,
	"product_id" integer NOT NULL,
	"type" text NOT NULL,
	"quantity" real NOT NULL,
	"balance_after" real NOT NULL,
	"reference_type" text,
	"reference_id" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"staff_id" integer,
	"staff_name" text,
	"action" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"details" jsonb,
	"ip_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "impersonation_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"superadmin_email" text NOT NULL,
	"tenant_id" integer NOT NULL,
	"tenant_email" text NOT NULL,
	"business_name" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"notes" text,
	"actor_type" text DEFAULT 'superadmin' NOT NULL,
	"actor_technician_id" integer,
	"actor_name" text
);
--> statement-breakpoint
CREATE TABLE "topup_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"ding_transaction_id" text,
	"distributor_ref" text NOT NULL,
	"phone_number" text NOT NULL,
	"country_code" text DEFAULT 'JM' NOT NULL,
	"operator_id" text NOT NULL,
	"operator_name" text NOT NULL,
	"product_sku_code" text NOT NULL,
	"product_name" text NOT NULL,
	"send_value" real NOT NULL,
	"send_currency" text DEFAULT 'JMD' NOT NULL,
	"benefit_value" real NOT NULL,
	"benefit_currency" text DEFAULT 'JMD' NOT NULL,
	"cost" real DEFAULT 0 NOT NULL,
	"commission_earned" real DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"product_type" text DEFAULT 'topup' NOT NULL,
	"redemption_info" text,
	"staff_id" integer,
	"staff_name" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "topup_wallet_ledger" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"type" text NOT NULL,
	"amount" real NOT NULL,
	"balance_after" real NOT NULL,
	"description" text NOT NULL,
	"reference_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "topup_wallets" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"balance" real DEFAULT 0 NOT NULL,
	"total_topups" integer DEFAULT 0 NOT NULL,
	"total_commission" real DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "topup_wallets_tenant_id_unique" UNIQUE("tenant_id")
);
--> statement-breakpoint
CREATE TABLE "weight_labels" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"product_name" text NOT NULL,
	"product_plu" text NOT NULL,
	"unit_of_measure" text NOT NULL,
	"weight_value" real NOT NULL,
	"price_per_unit" real NOT NULL,
	"total_price" real NOT NULL,
	"pack_date" date,
	"expiration_date" date,
	"barcode" text NOT NULL,
	"status" text DEFAULT 'available' NOT NULL,
	"created_by_staff_id" integer,
	"created_by_staff_name" text,
	"sold_order_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sold_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "payment_methods" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'custom' NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "composite_product_components" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"parent_product_id" integer NOT NULL,
	"child_product_id" integer NOT NULL,
	"quantity_required" real NOT NULL,
	"unit_id" integer,
	"variant_option_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_composite_parent_child_option" UNIQUE NULLS NOT DISTINCT("parent_product_id","child_product_id","variant_option_id")
);
--> statement-breakpoint
CREATE TABLE "technician_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"technician_id" integer NOT NULL,
	"tenant_id" integer NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"assigned_by" text
);
--> statement-breakpoint
CREATE TABLE "technicians" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"phone" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_at" timestamp with time zone,
	"approved_by" text,
	"last_login_at" timestamp with time zone,
	"terms_accepted_at" timestamp with time zone,
	"terms_version" text,
	CONSTRAINT "technicians_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "price_change_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"staff_id" integer,
	"staff_name" text,
	"method" text NOT NULL,
	"value" real NOT NULL,
	"rounding" text DEFAULT 'none' NOT NULL,
	"scope" text DEFAULT 'custom' NOT NULL,
	"affected_count" integer DEFAULT 0 NOT NULL,
	"details" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promotions" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"promo_price" real NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_batches" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"batch_number" text,
	"expiry_date" date,
	"quantity_remaining" real NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source_type" text DEFAULT 'purchase' NOT NULL,
	"purchase_bill_id" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_return_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"return_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"purchase_bill_item_id" integer,
	"quantity" integer NOT NULL,
	"unit_cost" real DEFAULT 0 NOT NULL,
	"tax_rate" real,
	"tax_amount" real DEFAULT 0 NOT NULL,
	"total_amount" real DEFAULT 0 NOT NULL,
	"batch_id" integer,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "supplier_returns" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"return_number" text NOT NULL,
	"supplier" text,
	"purchase_bill_id" integer,
	"status" text DEFAULT 'draft' NOT NULL,
	"notes" text,
	"subtotal" real DEFAULT 0 NOT NULL,
	"tax_total" real DEFAULT 0 NOT NULL,
	"total_amount" real DEFAULT 0 NOT NULL,
	"return_date" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_override_cards" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"staff_id" integer NOT NULL,
	"card_number" text NOT NULL,
	"label" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_override_cards_tenant_card_unique" UNIQUE("tenant_id","card_number")
);
--> statement-breakpoint
CREATE TABLE "gift_voucher_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 0 NOT NULL,
	"voucher_id" integer NOT NULL,
	"action" text NOT NULL,
	"amount" real NOT NULL,
	"balance_before" real NOT NULL,
	"balance_after" real NOT NULL,
	"related_order_id" integer,
	"staff_id" integer,
	"staff_name" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gift_vouchers" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 0 NOT NULL,
	"code" text NOT NULL,
	"original_value" real NOT NULL,
	"balance" real NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"customer_id" integer,
	"customer_name" text,
	"customer_phone" text,
	"customer_email" text,
	"payment_method" text,
	"amount_paid" real,
	"notes" text,
	"expiry_date" timestamp with time zone,
	"issued_by_staff_id" integer,
	"issued_by_name" text,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shopify_app_credentials" (
	"tenant_id" integer PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"client_secret_encrypted" text NOT NULL,
	"api_version" text DEFAULT '2025-01' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shopify_connections" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"shop_domain" text NOT NULL,
	"auth_mode" text DEFAULT 'token' NOT NULL,
	"access_token_encrypted" text,
	"access_token_expires_at" timestamp with time zone,
	"granted_scopes" text,
	"client_id" text,
	"client_secret_encrypted" text,
	"webhook_secret_encrypted" text,
	"api_version" text DEFAULT '2025-01' NOT NULL,
	"shop_name" text,
	"status" text DEFAULT 'disconnected' NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"sync_products" boolean DEFAULT false NOT NULL,
	"sync_inventory" boolean DEFAULT false NOT NULL,
	"sync_orders" boolean DEFAULT false NOT NULL,
	"sync_customers" boolean DEFAULT false NOT NULL,
	"sync_direction" text DEFAULT 'shopify_to_nexus' NOT NULL,
	"default_location_id" integer,
	"last_test_at" timestamp with time zone,
	"last_test_status" text,
	"last_test_message" text,
	"last_sync_at" timestamp with time zone,
	"last_sync_status" text,
	"last_sync_message" text,
	"connected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shopify_oauth_states" (
	"state" text PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"shop_domain" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shopify_order_mappings" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"order_id" integer,
	"shopify_order_id" text NOT NULL,
	"shopify_order_number" text,
	"financial_status" text,
	"fulfillment_status" text,
	"raw_payload" jsonb,
	"imported_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shopify_product_mappings" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"shopify_product_id" text,
	"shopify_variant_id" text,
	"shopify_inventory_item_id" text,
	"sku" text,
	"barcode" text,
	"sync_status" text DEFAULT 'pending' NOT NULL,
	"sync_error" text,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shopify_sync_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"sync_type" text NOT NULL,
	"direction" text,
	"status" text NOT NULL,
	"items_processed" integer DEFAULT 0 NOT NULL,
	"items_succeeded" integer DEFAULT 0 NOT NULL,
	"items_failed" integer DEFAULT 0 NOT NULL,
	"message" text,
	"details" jsonb,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zoho_connections" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"region" text DEFAULT 'com' NOT NULL,
	"organization_id" text,
	"organization_name" text,
	"organization_currency" text,
	"refresh_token_encrypted" text,
	"access_token_encrypted" text,
	"access_token_expires_at" timestamp with time zone,
	"granted_scopes" text,
	"status" text DEFAULT 'disconnected' NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"sync_customers" boolean DEFAULT true NOT NULL,
	"sync_direction" text DEFAULT 'two_way' NOT NULL,
	"auto_sync" boolean DEFAULT true NOT NULL,
	"last_test_at" timestamp with time zone,
	"last_test_status" text,
	"last_test_message" text,
	"last_sync_at" timestamp with time zone,
	"last_sync_status" text,
	"last_sync_message" text,
	"connected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zoho_customer_mappings" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"customer_id" integer NOT NULL,
	"zoho_contact_id" text NOT NULL,
	"local_fingerprint" text,
	"zoho_last_modified" text,
	"sync_status" text DEFAULT 'pending' NOT NULL,
	"sync_error" text,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zoho_oauth_states" (
	"state" text PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"region" text DEFAULT 'com' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zoho_sync_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"sync_type" text NOT NULL,
	"direction" text,
	"status" text NOT NULL,
	"items_processed" integer DEFAULT 0 NOT NULL,
	"items_created" integer DEFAULT 0 NOT NULL,
	"items_updated" integer DEFAULT 0 NOT NULL,
	"items_failed" integer DEFAULT 0 NOT NULL,
	"message" text,
	"details" jsonb,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_activity_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"user_id" integer,
	"event_type" text NOT NULL,
	"event_reference_id" text,
	"metadata" jsonb,
	"ip_address" text,
	"device_info" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_usage_alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"alert_type" text NOT NULL,
	"severity" text DEFAULT 'medium' NOT NULL,
	"title" text NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tenant_usage_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"snapshot_date" date NOT NULL,
	"active_users_daily" integer DEFAULT 0 NOT NULL,
	"active_users_weekly" integer DEFAULT 0 NOT NULL,
	"active_users_monthly" integer DEFAULT 0 NOT NULL,
	"product_count" integer DEFAULT 0 NOT NULL,
	"customer_count" integer DEFAULT 0 NOT NULL,
	"staff_count" integer DEFAULT 0 NOT NULL,
	"location_count" integer DEFAULT 0 NOT NULL,
	"sales_count" integer DEFAULT 0 NOT NULL,
	"sales_count_30d" integer DEFAULT 0 NOT NULL,
	"sales_total_30d" real DEFAULT 0 NOT NULL,
	"inventory_movement_count" integer DEFAULT 0 NOT NULL,
	"report_generation_count" integer DEFAULT 0 NOT NULL,
	"receipt_print_count" integer DEFAULT 0 NOT NULL,
	"api_request_count" integer DEFAULT 0 NOT NULL,
	"uploaded_file_count" integer DEFAULT 0 NOT NULL,
	"webhook_event_count" integer DEFAULT 0 NOT NULL,
	"storage_used_mb" real DEFAULT 0 NOT NULL,
	"estimated_row_count" real DEFAULT 0 NOT NULL,
	"activity_score" real DEFAULT 0 NOT NULL,
	"resource_risk_score" real DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_ref" text NOT NULL,
	"tenant_id" integer NOT NULL,
	"business_name" text NOT NULL,
	"contact_name" text,
	"contact_phone" text,
	"contact_email" text,
	"category" text NOT NULL,
	"sub_category" text NOT NULL,
	"impact" text,
	"priority" text DEFAULT 'NORMAL' NOT NULL,
	"started_when" text,
	"steps_taken" jsonb,
	"additional_notes" text,
	"resolution_type" text,
	"report_source" text,
	"status" text DEFAULT 'open' NOT NULL,
	"admin_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_tickets_ticket_ref_unique" UNIQUE("ticket_ref")
);
--> statement-breakpoint
CREATE TABLE "layaway_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 0 NOT NULL,
	"layaway_id" integer NOT NULL,
	"amount" real NOT NULL,
	"method" text DEFAULT 'cash' NOT NULL,
	"reference" text,
	"staff_id" integer,
	"staff_name" text,
	"kind" text DEFAULT 'payment' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "layaways" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 0 NOT NULL,
	"layaway_number" text NOT NULL,
	"customer_id" integer NOT NULL,
	"items" jsonb NOT NULL,
	"subtotal" real DEFAULT 0 NOT NULL,
	"discount_type" text,
	"discount_amount" real,
	"tax" real DEFAULT 0 NOT NULL,
	"total" real DEFAULT 0 NOT NULL,
	"amount_paid" real DEFAULT 0 NOT NULL,
	"deposit_required" real DEFAULT 0 NOT NULL,
	"plan_type" text DEFAULT 'flexible' NOT NULL,
	"installment_amount" real,
	"installment_frequency" text,
	"next_due_date" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"cancellation_fee" real,
	"notes" text,
	"converted_order_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_order_allocations" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"work_order_id" integer NOT NULL,
	"product_id" integer,
	"asset_id" integer,
	"description" text NOT NULL,
	"category" text,
	"unit" text DEFAULT 'pcs' NOT NULL,
	"qty_allocated" real NOT NULL,
	"qty_returned" real DEFAULT 0 NOT NULL,
	"is_returnable" boolean DEFAULT false NOT NULL,
	"is_cable" boolean DEFAULT false NOT NULL,
	"box_size_ft" real,
	"runs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'dispatched' NOT NULL,
	"dispatched_by_staff_id" integer,
	"dispatched_by_name" text,
	"remarks" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_order_appointments" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"work_order_id" integer NOT NULL,
	"staff_id" integer,
	"staff_ids" jsonb,
	"appointment_type" text DEFAULT 'repair' NOT NULL,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone,
	"notes" text,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_order_manager_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"work_order_id" integer NOT NULL,
	"rating" integer NOT NULL,
	"outcome" text DEFAULT 'satisfactory' NOT NULL,
	"comment" text,
	"reviewer_staff_id" integer,
	"reviewer_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_order_material_handovers" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"work_order_id" integer NOT NULL,
	"staff_id" integer,
	"staff_name" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"received_by_staff_id" integer,
	"received_by_name" text,
	"received_notes" text,
	"signature" text,
	"signed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_order_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"work_order_id" integer NOT NULL,
	"author_staff_id" integer,
	"author_name" text,
	"content" text NOT NULL,
	"is_internal" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_order_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"work_order_id" integer NOT NULL,
	"staff_id" integer,
	"staff_name" text,
	"amount" real NOT NULL,
	"method" text NOT NULL,
	"reference" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_order_photos" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"work_order_id" integer NOT NULL,
	"staff_id" integer,
	"staff_name" text,
	"data" text NOT NULL,
	"caption" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_order_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"work_order_id" integer NOT NULL,
	"rating" integer NOT NULL,
	"comment" text,
	"reviewer_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_order_status_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"work_order_id" integer NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"changed_by_staff_id" integer,
	"changed_by_name" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_order_time_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"work_order_id" integer NOT NULL,
	"staff_id" integer,
	"staff_name" text,
	"entry_type" text DEFAULT 'work' NOT NULL,
	"pause_reason" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"minutes" integer,
	"is_billable" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 0 NOT NULL,
	"work_order_number" text NOT NULL,
	"customer_id" integer,
	"contact_name" text,
	"contact_phone" text,
	"contact_email" text,
	"item_description" text NOT NULL,
	"brand" text,
	"model" text,
	"serial_number" text,
	"imei" text,
	"asset_tag" text,
	"colour" text,
	"condition_received" text,
	"accessories_received" text,
	"problem_description" text NOT NULL,
	"diagnosis" text,
	"service_type" text,
	"service_channel" text DEFAULT 'in_store' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"assigned_staff_id" integer,
	"assigned_staff_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"assigned_team_id" integer,
	"service_areas" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"install_details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"assignment_status" text DEFAULT 'pending' NOT NULL,
	"assignment_responded_at" timestamp with time zone,
	"decline_reason" text,
	"travel_started_at" timestamp with time zone,
	"arrived_at" timestamp with time zone,
	"work_completed_at" timestamp with time zone,
	"estimated_minutes" integer,
	"promised_date" timestamp with time zone,
	"appointment_date" timestamp with time zone,
	"storage_location" text,
	"items" jsonb NOT NULL,
	"subtotal" real DEFAULT 0 NOT NULL,
	"discount_type" text,
	"discount_amount" real,
	"tax" real DEFAULT 0 NOT NULL,
	"total" real DEFAULT 0 NOT NULL,
	"deposit_required" real,
	"deposit_paid" real DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'received' NOT NULL,
	"notes" text,
	"internal_notes" text,
	"converted_order_id" integer,
	"customer_signature" text,
	"staff_signature" text,
	"completion_signature" text,
	"completion_signed_by" text,
	"completion_signed_at" timestamp with time zone,
	"completion_verified_via" text,
	"completion_otp_hash" text,
	"completion_otp_expires_at" timestamp with time zone,
	"completion_otp_attempts" integer DEFAULT 0 NOT NULL,
	"manager_code_hash" text,
	"manager_code_expires_at" timestamp with time zone,
	"manager_code_attempts" integer DEFAULT 0 NOT NULL,
	"review_email_sent_at" timestamp with time zone,
	"completion_email_sent_at" timestamp with time zone,
	"equipment_deducted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "packages" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer DEFAULT 0 NOT NULL,
	"tracking_number" text NOT NULL,
	"awb" text,
	"purchase_tracking_number" text,
	"customer_name" text,
	"customer_phone" text,
	"courier" text,
	"weight" real,
	"weight_unit" text DEFAULT 'lb',
	"shelf_location" text,
	"fee" real DEFAULT 0 NOT NULL,
	"notes" text,
	"status" text DEFAULT 'received' NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"received_by_staff_id" integer,
	"received_by_staff_name" text,
	"collected_at" timestamp with time zone,
	"collected_by_staff_id" integer,
	"collected_by_staff_name" text,
	"collected_order_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_threads" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"kind" text NOT NULL,
	"work_order_id" integer,
	"staff_id" integer,
	"last_message_id" integer,
	"last_message_at" timestamp with time zone,
	"last_message_preview" text,
	"last_message_sender_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "thread_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"thread_id" integer NOT NULL,
	"body" text NOT NULL,
	"sender_staff_id" integer,
	"sender_name" text NOT NULL,
	"sender_side" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "thread_reads" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"thread_id" integer NOT NULL,
	"staff_id" integer NOT NULL,
	"last_read_message_id" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asset_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"asset_id" integer NOT NULL,
	"assignee_type" text NOT NULL,
	"staff_id" integer,
	"staff_name" text,
	"team_id" integer,
	"team_name" text,
	"work_order_id" integer,
	"work_order_number" text,
	"assigned_by_staff_id" integer,
	"assigned_by_name" text,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expected_return_date" timestamp with time zone,
	"condition_out" text,
	"notes" text,
	"status" text DEFAULT 'active' NOT NULL,
	"returned_at" timestamp with time zone,
	"returned_to_staff_id" integer,
	"returned_to_name" text,
	"condition_in" text,
	"return_notes" text
);
--> statement-breakpoint
CREATE TABLE "asset_service_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"asset_id" integer NOT NULL,
	"service_type" text DEFAULT 'service' NOT NULL,
	"performed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"performed_by" text,
	"cost" real DEFAULT 0 NOT NULL,
	"notes" text,
	"next_due_date" timestamp with time zone,
	"created_by_staff_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fixed_assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"asset_tag" text NOT NULL,
	"barcode" text,
	"name" text NOT NULL,
	"description" text,
	"category" text,
	"is_tool" boolean DEFAULT false NOT NULL,
	"serial_number" text,
	"manufacturer" text,
	"model" text,
	"photo_url" text,
	"purchase_date" timestamp with time zone,
	"purchase_cost" real DEFAULT 0 NOT NULL,
	"vendor_id" integer,
	"vendor_name" text,
	"warranty_expiry" timestamp with time zone,
	"depreciation_method" text DEFAULT 'straight_line' NOT NULL,
	"useful_life_months" integer,
	"salvage_value" real DEFAULT 0 NOT NULL,
	"depreciation_start_date" timestamp with time zone,
	"condition" text DEFAULT 'good' NOT NULL,
	"status" text DEFAULT 'in_store' NOT NULL,
	"location_id" integer,
	"location_name" text,
	"service_interval_days" integer,
	"last_service_date" timestamp with time zone,
	"next_service_due" timestamp with time zone,
	"current_assignment_id" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "technician_team_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"team_id" integer NOT NULL,
	"staff_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "technician_teams" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"leader_staff_id" integer,
	"colour" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modifier_groups" ADD CONSTRAINT "modifier_groups_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modifier_options" ADD CONSTRAINT "modifier_options_group_id_modifier_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."modifier_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_combinations" ADD CONSTRAINT "variant_combinations_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_groups" ADD CONSTRAINT "variant_groups_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_options" ADD CONSTRAINT "variant_options_group_id_variant_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."variant_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_bill_items" ADD CONSTRAINT "purchase_bill_items_bill_id_purchase_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."purchase_bills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_bill_items" ADD CONSTRAINT "purchase_bill_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_sessions" ADD CONSTRAINT "staff_sessions_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_sessions" ADD CONSTRAINT "staff_sessions_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_handovers" ADD CONSTRAINT "cash_handovers_session_id_cash_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."cash_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_payouts" ADD CONSTRAINT "cash_payouts_session_id_cash_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."cash_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transfer_proofs" ADD CONSTRAINT "bank_transfer_proofs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transfer_proofs" ADD CONSTRAINT "bank_transfer_proofs_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transfer_proofs" ADD CONSTRAINT "bank_transfer_proofs_bank_account_id_bank_account_settings_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_account_settings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_template_id_email_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."email_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_link_clicks" ADD CONSTRAINT "marketing_link_clicks_recipient_id_marketing_recipients_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."marketing_recipients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_link_clicks" ADD CONSTRAINT "marketing_link_clicks_campaign_id_marketing_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."marketing_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_recipients" ADD CONSTRAINT "marketing_recipients_campaign_id_marketing_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."marketing_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_unsubscribes" ADD CONSTRAINT "marketing_unsubscribes_campaign_id_marketing_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."marketing_campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_coupon_redemptions" ADD CONSTRAINT "subscription_coupon_redemptions_coupon_id_subscription_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."subscription_coupons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_coupon_redemptions" ADD CONSTRAINT "subscription_coupon_redemptions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_coupon_redemptions" ADD CONSTRAINT "subscription_coupon_redemptions_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_coupons" ADD CONSTRAINT "subscription_coupons_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_invoices" ADD CONSTRAINT "subscription_invoices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_invoices" ADD CONSTRAINT "subscription_invoices_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_manual_payments" ADD CONSTRAINT "subscription_manual_payments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_manual_payments" ADD CONSTRAINT "subscription_manual_payments_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_addons" ADD CONSTRAINT "tenant_addons_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_features" ADD CONSTRAINT "tenant_features_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_inventory" ADD CONSTRAINT "location_inventory_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_inventory" ADD CONSTRAINT "location_inventory_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_locations" ADD CONSTRAINT "product_locations_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_locations" ADD CONSTRAINT "product_locations_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_locations" ADD CONSTRAINT "staff_locations_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_locations" ADD CONSTRAINT "staff_locations_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_from_location_id_locations_id_fk" FOREIGN KEY ("from_location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_to_location_id_locations_id_fk" FOREIGN KEY ("to_location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_entry_id_journal_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_account_id_accounting_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounting_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_count_items" ADD CONSTRAINT "stock_count_items_session_id_stock_count_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."stock_count_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts_receivable" ADD CONSTRAINT "accounts_receivable_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts_receivable" ADD CONSTRAINT "accounts_receivable_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ar_payments" ADD CONSTRAINT "ar_payments_ar_id_accounts_receivable_id_fk" FOREIGN KEY ("ar_id") REFERENCES "public"."accounts_receivable"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredient_usage_logs" ADD CONSTRAINT "ingredient_usage_logs_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_batch_items" ADD CONSTRAINT "production_batch_items_batch_id_production_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."production_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_batch_items" ADD CONSTRAINT "production_batch_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reseller_commissions" ADD CONSTRAINT "reseller_commissions_reseller_id_resellers_id_fk" FOREIGN KEY ("reseller_id") REFERENCES "public"."resellers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reseller_commissions" ADD CONSTRAINT "reseller_commissions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reseller_payouts" ADD CONSTRAINT "reseller_payouts_reseller_id_resellers_id_fk" FOREIGN KEY ("reseller_id") REFERENCES "public"."resellers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ap_credits" ADD CONSTRAINT "ap_credits_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ap_entries" ADD CONSTRAINT "ap_entries_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ap_entries" ADD CONSTRAINT "ap_entries_purchase_id_raw_material_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."raw_material_purchases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ap_payments" ADD CONSTRAINT "ap_payments_ap_entry_id_ap_entries_id_fk" FOREIGN KEY ("ap_entry_id") REFERENCES "public"."ap_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ap_payments" ADD CONSTRAINT "ap_payments_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_material_purchase_items" ADD CONSTRAINT "raw_material_purchase_items_purchase_id_raw_material_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."raw_material_purchases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_material_purchase_items" ADD CONSTRAINT "raw_material_purchase_items_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_material_purchases" ADD CONSTRAINT "raw_material_purchases_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "composite_product_components" ADD CONSTRAINT "composite_product_components_parent_product_id_products_id_fk" FOREIGN KEY ("parent_product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "composite_product_components" ADD CONSTRAINT "composite_product_components_child_product_id_products_id_fk" FOREIGN KEY ("child_product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "composite_product_components" ADD CONSTRAINT "composite_product_components_variant_option_id_variant_options_id_fk" FOREIGN KEY ("variant_option_id") REFERENCES "public"."variant_options"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technician_assignments" ADD CONSTRAINT "technician_assignments_technician_id_technicians_id_fk" FOREIGN KEY ("technician_id") REFERENCES "public"."technicians"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_return_items" ADD CONSTRAINT "supplier_return_items_return_id_supplier_returns_id_fk" FOREIGN KEY ("return_id") REFERENCES "public"."supplier_returns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_return_items" ADD CONSTRAINT "supplier_return_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_return_items" ADD CONSTRAINT "supplier_return_items_purchase_bill_item_id_purchase_bill_items_id_fk" FOREIGN KEY ("purchase_bill_item_id") REFERENCES "public"."purchase_bill_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_return_items" ADD CONSTRAINT "supplier_return_items_batch_id_product_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."product_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_purchase_bill_id_purchase_bills_id_fk" FOREIGN KEY ("purchase_bill_id") REFERENCES "public"."purchase_bills"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_override_cards" ADD CONSTRAINT "staff_override_cards_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_override_cards" ADD CONSTRAINT "staff_override_cards_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_voucher_transactions" ADD CONSTRAINT "gift_voucher_transactions_voucher_id_gift_vouchers_id_fk" FOREIGN KEY ("voucher_id") REFERENCES "public"."gift_vouchers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_vouchers" ADD CONSTRAINT "gift_vouchers_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "layaway_payments" ADD CONSTRAINT "layaway_payments_layaway_id_layaways_id_fk" FOREIGN KEY ("layaway_id") REFERENCES "public"."layaways"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "layaways" ADD CONSTRAINT "layaways_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_allocations" ADD CONSTRAINT "work_order_allocations_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_allocations" ADD CONSTRAINT "work_order_allocations_dispatched_by_staff_id_staff_id_fk" FOREIGN KEY ("dispatched_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_appointments" ADD CONSTRAINT "work_order_appointments_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_appointments" ADD CONSTRAINT "work_order_appointments_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_manager_reviews" ADD CONSTRAINT "work_order_manager_reviews_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_material_handovers" ADD CONSTRAINT "work_order_material_handovers_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_notes" ADD CONSTRAINT "work_order_notes_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_notes" ADD CONSTRAINT "work_order_notes_author_staff_id_staff_id_fk" FOREIGN KEY ("author_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_payments" ADD CONSTRAINT "work_order_payments_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_photos" ADD CONSTRAINT "work_order_photos_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_photos" ADD CONSTRAINT "work_order_photos_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_reviews" ADD CONSTRAINT "work_order_reviews_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_status_history" ADD CONSTRAINT "work_order_status_history_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_status_history" ADD CONSTRAINT "work_order_status_history_changed_by_staff_id_staff_id_fk" FOREIGN KEY ("changed_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_time_entries" ADD CONSTRAINT "work_order_time_entries_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_time_entries" ADD CONSTRAINT "work_order_time_entries_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_assigned_staff_id_staff_id_fk" FOREIGN KEY ("assigned_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_threads" ADD CONSTRAINT "message_threads_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thread_messages" ADD CONSTRAINT "thread_messages_thread_id_message_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."message_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thread_reads" ADD CONSTRAINT "thread_reads_thread_id_message_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."message_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_assignments" ADD CONSTRAINT "asset_assignments_asset_id_fixed_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."fixed_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_service_records" ADD CONSTRAINT "asset_service_records_asset_id_fixed_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."fixed_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technician_team_members" ADD CONSTRAINT "technician_team_members_team_id_technician_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."technician_teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technician_team_members" ADD CONSTRAINT "technician_team_members_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technician_teams" ADD CONSTRAINT "technician_teams_leader_staff_id_staff_id_fk" FOREIGN KEY ("leader_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_products_tenant_category" ON "products" USING btree ("tenant_id","category");--> statement-breakpoint
CREATE INDEX "idx_products_tenant_archived" ON "products" USING btree ("tenant_id","archived_at");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_tenant_order_number_unique" ON "orders" USING btree ("tenant_id","order_number");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_tenant_client_request_unique" ON "orders" USING btree ("tenant_id","client_request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quotations_tenant_quote_number_unique" ON "quotations" USING btree ("tenant_id","quote_number");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_tenant_card_uq" ON "customers" USING btree ("tenant_id","card_number");--> statement-breakpoint
CREATE INDEX "idx_modifier_groups_product" ON "modifier_groups" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_variant_groups_product" ON "variant_groups" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_orders_tenant_po_number_unique" ON "purchase_orders" USING btree ("tenant_id","po_number");--> statement-breakpoint
CREATE INDEX "staff_sessions_tenant_staff_status_idx" ON "staff_sessions" USING btree ("tenant_id","staff_id","status");--> statement-breakpoint
CREATE INDEX "staff_sessions_tenant_clock_in_idx" ON "staff_sessions" USING btree ("tenant_id","clock_in_time");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_sessions_one_active_per_staff" ON "staff_sessions" USING btree ("tenant_id","staff_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_coupon_redemptions_coupon_tenant_uidx" ON "subscription_coupon_redemptions" USING btree ("coupon_id","tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_invoices_tenant_provider_ref_uidx" ON "subscription_invoices" USING btree ("tenant_id","provider","provider_ref") WHERE "subscription_invoices"."provider_ref" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_addons_tenant_slug_unique" ON "tenant_addons" USING btree ("tenant_id","addon_slug");--> statement-breakpoint
CREATE INDEX "idx_location_inventory_product" ON "location_inventory" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "weight_labels_tenant_barcode_id_uq" ON "weight_labels" USING btree ("tenant_id","id");--> statement-breakpoint
CREATE INDEX "idx_composite_parent_product" ON "composite_product_components" USING btree ("parent_product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "technician_assignments_tech_tenant_uniq" ON "technician_assignments" USING btree ("technician_id","tenant_id");--> statement-breakpoint
CREATE INDEX "promotions_tenant_product_idx" ON "promotions" USING btree ("tenant_id","product_id","active");--> statement-breakpoint
CREATE INDEX "product_batches_product_idx" ON "product_batches" USING btree ("tenant_id","product_id","received_at");--> statement-breakpoint
CREATE INDEX "product_batches_expiry_idx" ON "product_batches" USING btree ("tenant_id","expiry_date");--> statement-breakpoint
CREATE INDEX "supplier_returns_tenant_idx" ON "supplier_returns" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "supplier_returns_bill_idx" ON "supplier_returns" USING btree ("purchase_bill_id");--> statement-breakpoint
CREATE INDEX "gift_voucher_transactions_voucher_idx" ON "gift_voucher_transactions" USING btree ("voucher_id");--> statement-breakpoint
CREATE UNIQUE INDEX "gift_vouchers_tenant_code_unique" ON "gift_vouchers" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "shopify_connections_tenant_shop_unique" ON "shopify_connections" USING btree ("tenant_id","shop_domain");--> statement-breakpoint
CREATE UNIQUE INDEX "shopify_order_mappings_tenant_order_unique" ON "shopify_order_mappings" USING btree ("tenant_id","shopify_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shopify_product_mappings_tenant_product_unique" ON "shopify_product_mappings" USING btree ("tenant_id","product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shopify_product_mappings_tenant_variant_unique" ON "shopify_product_mappings" USING btree ("tenant_id","shopify_variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "zoho_connections_tenant_unique" ON "zoho_connections" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "zoho_customer_mappings_tenant_customer_unique" ON "zoho_customer_mappings" USING btree ("tenant_id","customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "zoho_customer_mappings_tenant_contact_unique" ON "zoho_customer_mappings" USING btree ("tenant_id","zoho_contact_id");--> statement-breakpoint
CREATE INDEX "zoho_sync_logs_tenant_created_idx" ON "zoho_sync_logs" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "tenant_activity_events_tenant_created_idx" ON "tenant_activity_events" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "tenant_activity_events_event_type_idx" ON "tenant_activity_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "tenant_usage_alerts_status_idx" ON "tenant_usage_alerts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tenant_usage_alerts_tenant_idx" ON "tenant_usage_alerts" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_usage_alerts_open_unique_idx" ON "tenant_usage_alerts" USING btree ("tenant_id","alert_type") WHERE "tenant_usage_alerts"."status" = 'open';--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_usage_snapshots_tenant_date_idx" ON "tenant_usage_snapshots" USING btree ("tenant_id","snapshot_date");--> statement-breakpoint
CREATE INDEX "support_tickets_tenant_created_idx" ON "support_tickets" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "support_tickets_status_idx" ON "support_tickets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "layaway_payments_layaway_idx" ON "layaway_payments" USING btree ("layaway_id");--> statement-breakpoint
CREATE UNIQUE INDEX "layaways_tenant_number_unique" ON "layaways" USING btree ("tenant_id","layaway_number");--> statement-breakpoint
CREATE INDEX "layaways_tenant_status_idx" ON "layaways" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "work_order_allocations_wo_idx" ON "work_order_allocations" USING btree ("tenant_id","work_order_id");--> statement-breakpoint
CREATE INDEX "work_order_appt_wo_idx" ON "work_order_appointments" USING btree ("tenant_id","work_order_id");--> statement-breakpoint
CREATE INDEX "work_order_appt_time_idx" ON "work_order_appointments" USING btree ("tenant_id","start_time");--> statement-breakpoint
CREATE UNIQUE INDEX "work_order_manager_reviews_wo_unique" ON "work_order_manager_reviews" USING btree ("tenant_id","work_order_id");--> statement-breakpoint
CREATE INDEX "wo_material_handovers_wo_idx" ON "work_order_material_handovers" USING btree ("tenant_id","work_order_id");--> statement-breakpoint
CREATE INDEX "wo_material_handovers_staff_idx" ON "work_order_material_handovers" USING btree ("tenant_id","staff_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "wo_material_handovers_one_pending" ON "work_order_material_handovers" USING btree ("tenant_id","work_order_id") WHERE status = 'pending';--> statement-breakpoint
CREATE INDEX "work_order_notes_wo_idx" ON "work_order_notes" USING btree ("tenant_id","work_order_id");--> statement-breakpoint
CREATE INDEX "work_order_payments_wo_idx" ON "work_order_payments" USING btree ("tenant_id","work_order_id");--> statement-breakpoint
CREATE INDEX "work_order_payments_staff_time_idx" ON "work_order_payments" USING btree ("tenant_id","staff_id","created_at");--> statement-breakpoint
CREATE INDEX "work_order_photos_wo_idx" ON "work_order_photos" USING btree ("tenant_id","work_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "work_order_reviews_wo_unique" ON "work_order_reviews" USING btree ("tenant_id","work_order_id");--> statement-breakpoint
CREATE INDEX "work_order_status_history_wo_idx" ON "work_order_status_history" USING btree ("tenant_id","work_order_id");--> statement-breakpoint
CREATE INDEX "work_order_time_entries_wo_idx" ON "work_order_time_entries" USING btree ("tenant_id","work_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "work_order_time_entries_one_open_uniq" ON "work_order_time_entries" USING btree ("tenant_id","work_order_id") WHERE "work_order_time_entries"."ended_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "work_orders_tenant_number_unique" ON "work_orders" USING btree ("tenant_id","work_order_number");--> statement-breakpoint
CREATE INDEX "work_orders_tenant_status_idx" ON "work_orders" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "work_orders_tenant_created_idx" ON "work_orders" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "work_orders_serial_idx" ON "work_orders" USING btree ("tenant_id","serial_number");--> statement-breakpoint
CREATE UNIQUE INDEX "packages_tenant_tracking_unique" ON "packages" USING btree ("tenant_id","tracking_number");--> statement-breakpoint
CREATE INDEX "packages_tenant_status_idx" ON "packages" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "message_threads_tenant_recent_idx" ON "message_threads" USING btree ("tenant_id","last_message_at");--> statement-breakpoint
CREATE UNIQUE INDEX "message_threads_direct_unique" ON "message_threads" USING btree ("tenant_id","staff_id") WHERE kind = 'direct';--> statement-breakpoint
CREATE UNIQUE INDEX "message_threads_job_unique" ON "message_threads" USING btree ("tenant_id","work_order_id") WHERE kind = 'job';--> statement-breakpoint
CREATE INDEX "thread_messages_thread_idx" ON "thread_messages" USING btree ("tenant_id","thread_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "thread_reads_thread_staff_unique" ON "thread_reads" USING btree ("thread_id","staff_id");--> statement-breakpoint
CREATE UNIQUE INDEX "asset_assignments_one_active" ON "asset_assignments" USING btree ("asset_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "asset_assignments_asset_idx" ON "asset_assignments" USING btree ("tenant_id","asset_id","assigned_at");--> statement-breakpoint
CREATE INDEX "asset_assignments_staff_idx" ON "asset_assignments" USING btree ("tenant_id","staff_id","status");--> statement-breakpoint
CREATE INDEX "asset_assignments_team_idx" ON "asset_assignments" USING btree ("tenant_id","team_id","status");--> statement-breakpoint
CREATE INDEX "asset_service_records_asset_idx" ON "asset_service_records" USING btree ("tenant_id","asset_id","performed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "fixed_assets_tenant_tag_unique" ON "fixed_assets" USING btree ("tenant_id","asset_tag");--> statement-breakpoint
CREATE INDEX "fixed_assets_tenant_tool_idx" ON "fixed_assets" USING btree ("tenant_id","is_tool","status");--> statement-breakpoint
CREATE INDEX "fixed_assets_service_due_idx" ON "fixed_assets" USING btree ("tenant_id","next_service_due");--> statement-breakpoint
CREATE UNIQUE INDEX "technician_team_members_unique" ON "technician_team_members" USING btree ("team_id","staff_id");--> statement-breakpoint
CREATE INDEX "technician_team_members_staff_idx" ON "technician_team_members" USING btree ("tenant_id","staff_id");--> statement-breakpoint
CREATE UNIQUE INDEX "technician_teams_tenant_name_unique" ON "technician_teams" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE INDEX "technician_teams_tenant_idx" ON "technician_teams" USING btree ("tenant_id","is_active");