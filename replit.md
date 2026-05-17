# NEXXUS POS

NEXXUS POS is a comprehensive Point of Sale (POS) system that unifies various business functionalities into a single application for small to medium-sized businesses.

## Run & Operate

*   **Install dependencies**: `pnpm install`
*   **Run development servers**: `pnpm dev` (starts both frontend and backend)
*   **Build all artifacts**: `pnpm build`
*   **Run typecheck**: `pnpm typecheck`
*   **Generate API client**: `pnpm -F api-server codegen`
*   **Push DB schema**: `pnpm --filter @workspace/db run push` (run from workspace root)

**Required Environment Variables**:
*   `DATABASE_URL`
*   `JWT_SECRET`
*   `PAYPAL_CLIENT_ID`
*   `PAYPAL_CLIENT_SECRET`
*   `POWERTRANZ_API_KEY`
*   `POWERTRANZ_MERCHANT_ID`
*   `QUICKBOOKS_CLIENT_ID`
*   `QUICKBOOKS_CLIENT_SECRET`

## Stack

*   **Runtime**: Node.js 24
*   **Language**: TypeScript 5.9
*   **Frontend**: React, Vite
*   **Backend**: Express 5
*   **ORM**: Drizzle ORM
*   **Database**: PostgreSQL
*   **Validation**: Zod
*   **Build Tool**: pnpm (monorepo workspace)

## Where things live

*   **Frontend Application**: `artifacts/nexus-pos` (React + Vite)
    *   **Receipt Templates**: `artifacts/nexus-pos/src/lib/receipt.ts`
*   **Backend API Server**: `artifacts/api-server` (Express)
    *   **DB Schema**: `lib/db/src/schema/` (one file per domain; exported from `lib/db/src/schema/index.ts`)
    *   **API Contracts (OpenAPI spec)**: `artifacts/api-server/openapi.yaml`
*   **Shared Utilities/Types**: `packages/` (e.g., `packages/types`)

## Architecture decisions

*   **Unified Frontend**: A single React application (`artifacts/nexus-pos`) serves all user roles (POS, customer display, reseller portal, admin) via URL-based routing and lazy-loaded components, improving maintainability.
*   **Modular Backend API**: A RESTful Express API (`artifacts/api-server`) with distinct endpoints for various business domains ensures scalability and clear separation of concerns.
*   **Multi-Unit Sales**: Products can have multiple sale units. The POS captures quantity in base units, and the cart UI shows a badge with the selected unit. Different unit choices for the same product appear as separate cart lines.
*   **Variant Stock Tracking**: For single variant groups, stock is tracked per variant option. For two or more variant groups, stock is tracked at the combination level, with a dedicated `variant_combinations` table.
*   **Per-Product Tax Exemption**: Products can be marked `is_taxable`. Non-taxable products are excluded from the tax base. Discounts are proportionally applied to taxable and non-taxable buckets.
*   **Purchase Bill Input Tax + Cost Prompt**: Each Purchase Bill carries a `defaultTaxRate` plus an optional per-line `taxRate` override; bills persist `subtotal`/`taxTotal`/`totalCost` and the line shows a Margin column (% and $). On confirm the server runs side effects in a single DB transaction (stock bump, stock movement, product cost update only when the new unit cost is *higher*, and a balanced journal entry: Dr Inventory `subtotal` + Dr Input Tax (`1250`) `taxTotal` = Cr AP `totalCost`). The server returns `costChanges` (one row per product, aggregated by `productId`) with a `suggestedPrice` that preserves the prior selling-price margin; the POS opens a dialog where the user can edit/skip individual price updates.
*   **Technician Role**: A restricted role for installers to set up customer POS systems, with impersonation capabilities and server-side route blocking for sales/financial operations.
*   **Supermarket Mode**: A global tenant setting (Settings → POS Security) that requires a manager/admin/supervisor PIN for cart-restricted actions (decrease qty, remove item, clear cart) when a cashier is logged in. Discount and price overrides are always gated by manager PIN. Managers/admins/supervisors bypass the gate.
*   **Price Manager**: Bulk price update tool at `/price-manager` (permission `pricing.manage`, also implicit for Owner/Admin). Supports three methods — percentage of current price, cost-based markup, and fixed amount — with optional rounding to nearest $5/$10/$50/$100/$1000. Scope is `all` / `category` / specific products. Workflow is preview → per-line override → apply; on apply the server enforces scope (rejects out-of-scope productIds), wraps product updates + an audit row in `price_change_logs` in a single transaction, and exposes a History tab. Server-side authz: every endpoint requires a `staffId` whose tenant matches the token and whose role grants `pricing.manage` (or is Owner/Admin); technician-impersonated tenant sessions are rejected.
*   **Time-Based Promotions**: Promotional prices on individual products that activate during a date/time window. Server-authoritative — `findActivePromoPrices()` in `routes/promotions.ts` is called from `orders.ts` BEFORE the volume-pricing tier lookup; when a promo is active the promo price replaces the regular price, `originalUnitPrice` is set to the regular price (so the receipt's "You Save" line auto-renders), volume tiers are bypassed, and any client-supplied per-line `itemDiscount` on a promo line is ignored ("replace and lock"). POS fetches `/api/promotions/active` (refetched every 60s) and merges promo prices into product cards (PROMO badge + crossed-out regular price). Managed at `/promotions` (permission `pricing.manage`). The receipt's tier-savings label was generalized from "(volume pricing)" to "You Save" so both promo and volume savings render under the same line.
*   **Kiosk Lockdown**: App-wide (`KioskLock` in `App.tsx`). Entering fullscreen arms the kiosk; any subsequent exit from fullscreen (ESC, F11, browser menu, page reload) opens a blocking PIN overlay that only a manager/admin/supervisor can dismiss. The armed flag is persisted in `sessionStorage` (`nexxus_kiosk_armed`) so reload cannot bypass it. While armed, a `beforeunload` handler also triggers the browser's native "Leave site?" prompt on any tab close, reload, or navigation attempt — the strongest guard the web platform permits without browser-level kiosk mode. The lock offers a "Re-enter Fullscreen" escape that does not require PIN.

## Product

*   **POS Terminal**: Full-featured point-of-sale operations.
*   **Customer Display & Online Ordering**: Integrated customer-facing interfaces.
*   **Inventory Management**: Multi-location tracking, real-time stock deduction, stock transfers, bulk stock count with variance reporting.
*   **Accounting Modules**: Chart of Accounts, Journal Entries, P&L, Balance Sheet, QuickBooks integration.
*   **Staff Management**: Role-based access, clock-in/out, shift tracking.
*   **Customer Loyalty Program**: Points accrual and redemption.
*   **Reseller Portal**: Dedicated portal for managing resellers, referrals, and commissions.
*   **Email Automation**: Template management, event-triggered emails, unsubscribe system.
*   **Subscription Management**: SaaS layer with payment processing (PayPal, PowerTranz) and manual payment recording for superadmins. Tenants with a scheduled manual payment see a reassuring "Renewal paid" banner/notice instead of the urgency countdown.
*   **Technician Portal**: Self-registration at `/technician/register`, login at `/technician/login`, customer list at `/technician`. Superadmin approves/rejects at the Technicians tab.

## User preferences

I want iterative development. I want to be asked before you make any major changes to the codebase. I prefer clear and concise explanations.

## Gotchas

*   **Multi-unit product quantity edits**: Direct quantity edits for multi-unit products snap to the nearest whole multiple of the unit factor on commit.
*   **Technician Impersonation**: Technician-impersonated sessions carry `restrictedRole: "technician"` in the JWT. Server-side: `requireFullTenant()` in orders, cash, topup, purchases, held-orders rejects writes. Frontend: nav filtered via `isTechnicianRestricted()` in `lib/tenant-token.ts`; `TECHNICIAN_ALLOWED_PATHS` lists permitted routes.
*   **Database Migrations**: Always run `pnpm --filter @workspace/db run push` from the workspace root after schema changes.
*   **Supermarket Mode gate location**: PIN gate logic lives in `pos.tsx` (`needsSupermarketAuth`, `requestSupermarketAction`, `executeSupermarketAction`). To extend coverage to a new cart action, route its onClick through `requestSupermarketAction({ type: "...", ... })` and handle the new variant in `executeSupermarketAction`.
*   **Purchase Bill totals are authoritative on the server**: never trust the client for `subtotal`/`taxTotal`/`totalCost` — the POST handler in `purchase-bills.ts` recomputes them from items, and `confirmBillSideEffects` will repair zeroed totals on legacy drafts before posting the JE. To add a new cart action that posts to accounting, follow the same transaction pattern (`db.transaction(async (tx) => …)`) so a mid-flight failure cannot leave stock half-applied.
*   **Drizzle push interactive prompt**: `pnpm --filter @workspace/db run push` is currently blocked by an unrelated `tenants_slug_unique` constraint prompt. For additive column changes, apply the SQL directly (via `executeSql` in the code execution sandbox) rather than waiting on the migration tool.

## Pointers

*   **Drizzle ORM Documentation**: [https://orm.drizzle.team/](https://orm.drizzle.team/)
*   **Express.js Documentation**: [https://expressjs.com/](https://expressjs.com/)
*   **React Documentation**: [https://react.dev/](https://react.dev/)
*   **Vite Documentation**: [https://vitejs.dev/](https://vitejs.dev/)
*   **Zod Documentation**: [https://zod.dev/](https://zod.dev/)
*   **Orval Documentation**: [https://orval.dev/](https://orval.dev/)
*   **PayPal Developer Documentation**: [https://developer.paypal.com/](https://developer.paypal.com/)
*   **QuickBooks API Documentation**: [https://developer.intuit.com/app/developer/qbo/docs/api](https://developer.intuit.com/app/developer/qbo/docs/api)