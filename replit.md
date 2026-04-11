# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Artifacts

### Nexus POS (`artifacts/nexus-pos`)
- **Type**: React + Vite web app
- **Preview path**: `/`
- **Brand**: Nexus POS — "Your Business, Connected." Powered by MicroBooks
- **Theme**: Dark navy/blue enterprise SaaS design
- **Pages**:
  - `/login` — Branded login screen
  - `/dashboard` — Business overview with Recharts charts (revenue, top products, payment methods, category breakdown)
  - `/pos` — Main POS with product grid, cart, discounts, notes, hold/recall, split payments, barcode scanning, receipt modal, customer selector, loyalty points redemption, table selector (dine-in)
  - `/tables` — Floor plan / Restaurant Table Management (add/edit/delete tables, color-coded, status badges: available/occupied/reserved)
  - `/kitchen` — Kitchen Display System (KDS) with 3-column kanban (Pending → Preparing → Ready), auto-refreshes every 15s
  - `/orders` — Order history with status filtering, void/refund support
  - `/products` — Full product CRUD (add/edit/delete, search, category filter, variants, modifiers)
  - `/customers` — Customer management with loyalty points, order history, search
  - `/staff` — Staff Management (add/edit/deactivate, roles: admin/manager/cashier/kitchen, PIN-based auth, branch assignment per staff member)
  - `/locations` — Multi-Location / Branch Management (create/edit/deactivate branches, per-branch inventory, stock transfer between branches, transfer history)
  - `/accounting` — Full Accounting Module with 6 tabs:
    - **Overview**: KPI cards (revenue, expenses, net income, tax collected) by week/month/year
    - **Chart of Accounts**: 22 default accounts, full CRUD, type-filtered (asset/liability/equity/revenue/expense)
    - **Journal Entries**: Double-entry bookkeeping, create manual entries, void entries, DR/CR line display
    - **Reports**: P&L Statement, Balance Sheet, Trial Balance with date range pickers and presets
    - **Inventory**: Stock Adjustments (adjust products up/down with reason tracking, optional journal entry), Stock Count sessions (physical count vs system count, apply discrepancies, optional journal entry)
    - **QuickBooks**: OAuth 2.0 connection, sync POS orders as QB Sales Receipts, disconnect flow
  - `/cash` — Cash Management (open shift with opening cash, record mid-shift payouts, close shift with end-of-day reconciliation, variance reporting, shift history sidebar, EOD report modal with Print Summary / Print with Sales Detail)
  - `/reports` — Business reports with date range presets, hourly chart, KPIs, CSV export
  - `/settings` — Admin Settings (Business Info, Receipt Settings, Email Provider selection)
  - `/subscription` — Subscription management page (plan cards, PayPal + PowerTranz payment)
  - `/signup` — 5-step SaaS onboarding wizard (Account → Business → Plan → Payment → Launch)
  - `/superadmin` — Super Admin Panel (separate login, tenant management, stats, plan override)

### API Server (`artifacts/api-server`)
- **Type**: Express 5 REST API
- **Routes**:
  - `GET/POST /api/products` — Product catalog
  - `GET/PUT/DELETE /api/products/:id` — Single product
  - `GET/POST /api/orders` — Orders (auto-deducts stock, updates customer stats/loyalty)
  - `GET/PATCH /api/orders/:id` — Single order
  - `GET/POST /api/held-orders` — Hold/recall cart
  - `DELETE /api/held-orders/:id` — Remove held order
  - `GET /api/dashboard/summary` — Business stats
  - `GET /api/dashboard/recent-orders` — Recent orders feed
  - `GET /api/dashboard/sales-by-category` — Category breakdown
  - `GET /api/dashboard/daily-sales` — 7-day revenue series
  - `GET /api/dashboard/top-products` — Top products by revenue
  - `GET /api/dashboard/payment-methods` — Payment method breakdown
  - `GET /api/dashboard/low-stock` — Products at or below stock threshold
  - `GET/POST /api/customers` — Customer CRUD
  - `GET/PUT/DELETE /api/customers/:id` — Single customer
  - `GET /api/customers/:id/orders` — Customer order history
  - `GET /api/reports/summary` — Period summary (revenue, orders, AOV, top product, etc.)
  - `GET /api/reports/hourly` — Hourly sales breakdown for a given date
  - `GET /api/reports/export` — CSV export of orders for a date range
  - `GET/POST /api/tables` — Dining table CRUD
  - `PATCH/DELETE /api/tables/:id` — Update/delete table
  - `GET /api/kitchen` — Pending kitchen orders (pending/preparing/ready)
  - `PATCH /api/kitchen/:id/status` — Advance kitchen order status
  - `GET/POST /api/staff` — Staff accounts CRUD
  - `PATCH/DELETE /api/staff/:id` — Update/deactivate staff
  - `POST /api/staff/verify-pin` — PIN authentication
  - `GET /api/staff/:id/locations` — Get branch assignments for a staff member
  - `PUT /api/staff/:id/locations` — Set branch assignments (with primaryLocationId)
  - `GET/POST /api/locations` — Branch CRUD
  - `PATCH/DELETE /api/locations/:id` — Update/deactivate branch
  - `GET/PUT /api/locations/:id/inventory` — Per-branch inventory management
  - `POST /api/locations/:id/inventory/init` — Seed all products into branch inventory
  - `GET /api/locations/:id/staff` — Staff assigned to a branch
  - `GET /api/stock-transfers` — Transfer history
  - `POST /api/stock-transfers` — Create stock transfer (deducts from source, adds to destination)
  - `GET /api/purchases?productId=X` — List purchase records (optionally filtered by product)
  - `POST /api/purchases` — Record a stock purchase (auto-increments product stockCount, sets inStock=true)
  - `DELETE /api/purchases/:id` — Delete a purchase record
  - `GET /api/accounting/accounts` — Chart of accounts (seeds 22 defaults on first call)
  - `POST /api/accounting/accounts` — Create account
  - `PATCH/DELETE /api/accounting/accounts/:id` — Update/deactivate account
  - `GET /api/accounting/journal-entries` — List journal entries with lines
  - `POST /api/accounting/journal-entries` — Create journal entry (double-entry validated)
  - `DELETE /api/accounting/journal-entries/:id` — Void journal entry
  - `GET /api/accounting/reports/profit-loss` — P&L report (from/to query params)
  - `GET /api/accounting/reports/balance-sheet` — Balance sheet (as_of param)
  - `GET /api/accounting/reports/trial-balance` — Trial balance (as_of param)
  - `GET /api/accounting/overview` — KPI summary (period=week|month|year)
  - `GET /api/accounting/quickbooks/status` — QB connection status
  - `GET /api/accounting/quickbooks/auth` — Start QB OAuth flow (redirect)
  - `GET /api/accounting/quickbooks/callback` — QB OAuth callback
  - `POST /api/accounting/quickbooks/disconnect` — Disconnect QB
  - `POST /api/accounting/quickbooks/sync` — Sync orders to QB (days param)
  - `GET /api/accounting/stock-adjustments` — List stock adjustments
  - `POST /api/accounting/stock-adjustments` — Create adjustment (updates product stockCount, optional JE)
  - `GET /api/accounting/stock-counts` — List stock count sessions
  - `POST /api/accounting/stock-counts` — Create stock count session (snapshots all products)
  - `GET /api/accounting/stock-counts/:id` — Get session with all items
  - `PATCH /api/accounting/stock-counts/:id/items/:itemId` — Update physical count for an item
  - `POST /api/accounting/stock-counts/:id/apply` — Apply count (updates stock, optional JE)
  - `DELETE /api/accounting/stock-counts/:id` — Void a session

### Customer Menu & Online Ordering (`artifacts/nexus-menu`)
- **Type**: React + Vite web app
- **Preview path**: `/menu/`
- **Purpose**: Customer-facing menu, online ordering, kiosk mode
- **Usage**: `/menu/?slug=<tenant-slug>` or `?slug=...&mode=kiosk` or `?mode=online`
- **Features**: Category filter, product search, cart, customization dialog (variants/modifiers), checkout, order confirmation
- **Public API Endpoints** (no auth required):
  - `GET /api/public/menu/:slug` — Products + categories for tenant
  - `GET /api/public/settings/:slug` — Business name, tax rate, currency settings
  - `POST /api/public/orders/:slug` — Place customer order (online/kiosk)
- **QR Code**: Admin Settings page shows QR code + links for menu/kiosk/online URLs (downloadable SVG)

## SaaS Layer

### Authentication
- Tenant auth uses JWT (signed with `SESSION_SECRET`). Token stored in `localStorage` as `nexus_tenant_token`.
- Superadmin auth uses JWT with `type: "superadmin"`. Token stored as `nexus_superadmin_token`.
- Default superadmin creds: `SUPERADMIN_EMAIL` (default: admin@nexuspos.com) / `SUPERADMIN_PASSWORD` (default: NexusAdmin2024!)

### Payment Providers
- **PayPal**: Backend uses PayPal Orders API v2. Frontend uses `@paypal/paypal-js` Smart Buttons.
  - Requires: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` (server), `VITE_PAYPAL_CLIENT_ID` (frontend)
  - Set `PAYPAL_ENV=production` for live mode (default: sandbox)
- **PowerTranz**: Direct REST API card payment (popular in Caribbean).
  - Requires: `POWERTRANZ_SPID`, `POWERTRANZ_SPPASSWORD`
  - Set `POWERTRANZ_ENV=production` for live endpoint (default: staging)

### Subscription Plans (seeded automatically)
- **Starter** $29/mo | $290/yr — 5 staff, 100 products, 1 location
- **Professional** $79/mo | $790/yr — 15 staff, 500 products, 3 locations
- **Enterprise** $199/mo | $1990/yr — unlimited

## Database Schema

- `products` — Product catalog with name, price, category, stock, barcode, hasVariants, hasModifiers
- `product_variants` — Variant groups/options with price adjustments
- `product_modifiers` — Modifier groups/options with price adjustments
- `orders` — Order records with status, totals, payment method, discount, notes, customerId, tableId, staffId, orderType, loyaltyPointsRedeemed, loyaltyDiscount
- `order_items` — Line items with variantChoices, modifierChoices (JSON)
- `held_orders` — Temporarily held carts (serialized JSON)
- `customers` — Customer profiles with name, email, phone, loyaltyPoints, totalSpent, orderCount
- `dining_tables` — Restaurant tables with name, capacity, status, color, position, currentOrderId
- `staff` — Staff members with name, PIN (hashed), role, isActive
- `purchases` — Stock purchase records with productId, quantity, unitCost, totalCost, notes; creating a purchase auto-increments product stockCount

### NEXXUS Reseller Portal (`artifacts/nexus-reseller`)
- **Type**: React + Vite web app
- **Preview path**: `/reseller/`
- **Purpose**: Dedicated portal for channel resellers/partners to manage their referrals and commissions
- **Auth**: Separate JWT-based auth (type="reseller"), token stored as `reseller_token` in localStorage
- **Pages**:
  - `/reseller/login` — Reseller sign-in
  - `/reseller/signup` — New reseller registration
  - `/reseller/dashboard` — Stats overview (total referrals, lifetime earnings, this month, pending payouts), referral code with copy button, monthly earnings breakdown, commission rate display
  - `/reseller/referrals` — Table of all referred tenants with subscription status
  - `/reseller/commissions` — Commission history with period, base amount, rate, earned amount, status
  - `/reseller/payouts` — Payout history + "Request Payout" button to bundle all pending commissions
  - `/reseller/profile` — Edit name, company, phone, payment details; view read-only account info
- **Commission system**:
  - Default rate: 30% recurring per month
  - `recordResellerCommission()` helper called on every PayPal/PowerTranz payment capture
  - Referral codes auto-generated on signup (`NAME-NANOID6` format)
  - No self-referral (resellers and tenants are separate user types)
  - Dedup check prevents double-commission per reseller+tenant+month
- **DB tables**: `resellers`, `reseller_commissions`, `reseller_payouts`; `resellerId` FK on `tenants`
- **Admin API**: `/admin/resellers`, `/admin/reseller-payouts`, `/admin/reseller-commissions/generate` (superadmin JWT required)

## Business Rules

- Tax rate: 10% (server-side and frontend)
- Loyalty earn: 1 point per $10 spent, awarded on order completion
- Loyalty redeem: 100 points = $1.00 discount; deducted from customer balance on checkout
- Low-stock threshold: configurable via `?threshold=N` (default 10)
- Stock auto-deducted from products on order completion
- Customer stats (totalSpent, orderCount, loyaltyPoints) updated on every order
- Staff roles: admin, manager, cashier, kitchen — PIN-based (4-6 digits)
- Order types: counter (default), dine-in, takeout
