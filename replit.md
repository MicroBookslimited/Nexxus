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
  - `/pos` — Main POS with product grid, cart, discounts, notes, hold/recall, split payments, barcode scanning, receipt modal
  - `/orders` — Order history with status filtering, void/refund support
  - `/products` — Full product CRUD (add/edit/delete, search, category filter)
  - `/customers` — Customer management with loyalty points, order history, search
  - `/reports` — Business reports with date range presets, hourly chart, KPIs, CSV export

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

## Database Schema

- `products` — Product catalog with name, price, category, stock, barcode
- `orders` — Order records with status, totals, payment method, discount, notes, customerId
- `order_items` — Line items linking orders to products
- `held_orders` — Temporarily held carts (serialized JSON)
- `customers` — Customer profiles with name, email, phone, loyaltyPoints, totalSpent, orderCount

## Business Rules

- Tax rate: 10% (server-side)
- Loyalty points: 1 point per $10 spent, awarded on order completion
- Low-stock threshold: configurable via `?threshold=N` (default 10)
- Stock auto-deducted from products on order completion
- Customer stats (totalSpent, orderCount, loyaltyPoints) updated on every order
