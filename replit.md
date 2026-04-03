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
  - `/dashboard` — Business overview (sales, orders, categories)
  - `/pos` — Main POS interface with product grid and cart
  - `/orders` — Order history with status filtering

### API Server (`artifacts/api-server`)
- **Type**: Express 5 REST API
- **Routes**:
  - `GET/POST /api/products` — Product catalog
  - `GET/PUT/DELETE /api/products/:id` — Single product
  - `GET/POST /api/orders` — Orders
  - `GET/PATCH /api/orders/:id` — Single order
  - `GET /api/dashboard/summary` — Business stats
  - `GET /api/dashboard/recent-orders` — Recent orders feed
  - `GET /api/dashboard/sales-by-category` — Category breakdown

## Database Schema

- `products` — Product catalog with name, price, category, stock
- `orders` — Order records with status, totals, payment method
- `order_items` — Line items linking orders to products
