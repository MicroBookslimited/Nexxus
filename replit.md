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
  - `/staff` — Staff Management (add/edit/deactivate, roles: admin/manager/cashier/kitchen, PIN-based auth)
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
  - `GET /api/purchases?productId=X` — List purchase records (optionally filtered by product)
  - `POST /api/purchases` — Record a stock purchase (auto-increments product stockCount, sets inStock=true)
  - `DELETE /api/purchases/:id` — Delete a purchase record

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

## Business Rules

- Tax rate: 10% (server-side and frontend)
- Loyalty earn: 1 point per $10 spent, awarded on order completion
- Loyalty redeem: 100 points = $1.00 discount; deducted from customer balance on checkout
- Low-stock threshold: configurable via `?threshold=N` (default 10)
- Stock auto-deducted from products on order completion
- Customer stats (totalSpent, orderCount, loyaltyPoints) updated on every order
- Staff roles: admin, manager, cashier, kitchen — PIN-based (4-6 digits)
- Order types: counter (default), dine-in, takeout
