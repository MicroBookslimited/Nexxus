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
    *   **Hardware Store POS Layout**: `artifacts/nexus-pos/src/pages/pos-hardware.tsx` (toggle via Settings → POS Interface)
*   **Mobile Application**: `artifacts/nexus-mobile` (Expo / React Native, previewPath `/mobile/`)
    *   **App-local API helper**: `artifacts/nexus-mobile/lib/nexus-api.ts` (endpoints not in the generated client)
    *   **Stock-count barcode flow**: `artifacts/nexus-mobile/app/stock-count/[id].tsx`
*   **Backend API Server**: `artifacts/api-server` (Express)
    *   **DB Schema**: `lib/db/src/schema/` (one file per domain; exported from `lib/db/src/schema/index.ts`)
    *   **API Contracts (OpenAPI spec)**: `artifacts/api-server/openapi.yaml`
*   **Shared Utilities/Types**: `packages/` (e.g., `packages/types`)

## Architecture decisions

Each decision below is summarized; full detail lives in [docs/architecture.md](docs/architecture.md#architecture-decisions).

*   **Unified Frontend** — Single React app serves all roles (POS, customer display, reseller, admin) via URL routing + lazy loading. [Details](docs/architecture.md#unified-frontend).
*   **Modular Backend API** — RESTful Express API with per-domain endpoints for scalability and separation of concerns. [Details](docs/architecture.md#modular-backend-api).
*   **Multi-Unit Sales** — Products sell in multiple units; cart stores base units, badges the chosen unit, and splits unit choices into separate lines. [Details](docs/architecture.md#multi-unit-sales).
*   **Variant Stock Tracking** — Single variant group tracks stock per option; 2+ groups track at the combination level (`variant_combinations`). [Details](docs/architecture.md#variant-stock-tracking).
*   **Per-Product Tax Exemption** — `is_taxable` products excluded from the tax base; discounts split proportionally across taxable/non-taxable buckets. [Details](docs/architecture.md#per-product-tax-exemption).
*   **Product Archive (Soft Delete) + Bulk Delete** — Products are soft-deleted (`archivedAt`) — never hard-deleted — so all history survives; bulk archive/restore + a 'Show archived' toggle. [Details](docs/architecture.md#product-archive-soft-delete--bulk-delete).
*   **Purchase Bill Input Tax + Cost Prompt** — Bills carry tax rates + margins; confirm runs stock/cost/JE side effects in one transaction and prompts to update selling prices. [Details](docs/architecture.md#purchase-bill-input-tax--cost-prompt).
*   **Technician Role** — Restricted installer role with impersonation and server-side blocking of sales/financial operations. [Details](docs/architecture.md#technician-role).
*   **Supermarket Mode** — Tenant setting requiring a manager PIN for cart-restricted actions when a cashier is logged in. [Details](docs/architecture.md#supermarket-mode).
*   **Price Manager** — Bulk price tool (`/price-manager`) — percentage / cost-markup / fixed methods with optional rounding, preview→apply, audited history. [Details](docs/architecture.md#price-manager).
*   **Time-Based Promotions** — Server-authoritative promo prices that activate in a date/time window, bypassing volume tiers and rendering a 'You Save' receipt line. [Details](docs/architecture.md#time-based-promotions).
*   **Batch / Lot / Expiry Tracking + FIFO/LIFO** — Opt-in per-product batch tracking with tenant/per-product FIFO or LIFO deduction at checkout. [Details](docs/architecture.md#batch--lot--expiry-tracking--fifolifo).
*   **Supplier Returns / Debit Notes** — Inverse of a purchase bill (bill-linked or standalone); confirm decrements stock and posts a reversing JE in one transaction. [Details](docs/architecture.md#supplier-returns--debit-notes).
*   **Hardware Store POS Layout** — Alternative `/pos` layout for hardware stores (gated by `hardware_ui_mode`); supports multi-unit sales, shares all cart/checkout logic. [Details](docs/architecture.md#hardware-store-pos-layout).
*   **Variable-Length PIN + Magstripe Override Cards** — `PinPad` accepts 4–8 digit PINs and detects USB magstripe/RFID swipes globally, authenticating staff override cards. [Details](docs/architecture.md#variable-length-pin--magstripe-override-cards).
*   **Duplicate Product Finder & Merge** — Detects duplicate products (exact + Levenshtein-similar) and merges them, re-attributing all history to one survivor. [Details](docs/architecture.md#duplicate-product-finder--merge).
*   **Barcode Scan in Stock Count** — Stock-count detail view accepts barcode scans (+1 per scan) with race-safe optimistic writes. [Details](docs/architecture.md#barcode-scan-in-stock-count).
*   **NEXXUS Mobile App (Expo)** — Single Expo/React Native app covering six POS areas, reusing the same generated hooks + an app-local helper (OpenAPI spec untouched). [Details](docs/architecture.md#nexxus-mobile-app-expo).
*   **Mobile Direct ESC/POS Receipt Printing** — Expo app prints receipts to thermal printers over Network/Bluetooth/USB; native modules lazy-required (needs a dev build). [Details](docs/architecture.md#mobile-direct-escpos-receipt-printing).
*   **Mobile Catalog Management + Subscription Renewal (Expo)** — Expo product/customer management + self-serve subscription renewal via secure in-app web checkout. [Details](docs/architecture.md#mobile-catalog-management--subscription-renewal-expo).
*   **Supermarket POS Layout (scan-only)** — Scan-only high-speed lane layout (gated by `supermarket_ui_mode`, mutually exclusive with hardware mode). [Details](docs/architecture.md#supermarket-pos-layout-scan-only).
*   **Auto-print Receipts (Silent Printing)** — Optional `auto_print_receipt` tenant setting that auto-prints on every checkout across all three POS layouts. [Details](docs/architecture.md#auto-print-receipts-silent-printing).
*   **Kiosk Lockdown** — App-wide fullscreen kiosk lock; exiting fullscreen requires a manager PIN, armed flag persisted in `sessionStorage`. [Details](docs/architecture.md#kiosk-lockdown).
*   **Quotations (Hardware Mode)** — Non-binding quotes saved from Hardware POS (auto QUO-YY-NNNN, server-computed totals, advisory-lock-serialized numbering); a dedicated `/quotations` page lists/searches/prints them and loads an accepted quote back into the POS cart, marking it converted at checkout. [Details](docs/architecture.md#quotations-hardware-mode).
*   **Shared Units Catalog** — Tenant-scoped catalog of reusable unit presets (`product_units`) surfaced as a "Units" tab under Products; backs a datalist dropdown in the per-product Pricing & Units editor (prefills conversion, auto-adds new units). Per-product `product_purchase_units` flow is untouched. [Details](docs/architecture.md#shared-units-catalog).

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

*   **Web receipt printing (browser print; Android prints a lean plain-text receipt)**: Web POS prints every receipt via the browser; Android prints a lean image-free text receipt to avoid ESC/POS pass-through service crashes. Full rationale + the two required levers in [docs/architecture.md#web-receipt-printing-browser-print-android-prints-a-lean-plain-text-receipt](docs/architecture.md#web-receipt-printing-browser-print-android-prints-a-lean-plain-text-receipt).

*   **Multi-unit product quantity edits**: Direct quantity edits for multi-unit products snap to the nearest whole multiple of the unit factor on commit.
*   **Technician Impersonation**: Technician-impersonated sessions carry `restrictedRole: "technician"` in the JWT. Server-side: `requireFullTenant()` in orders, cash, topup, purchases, held-orders rejects writes. Frontend: nav filtered via `isTechnicianRestricted()` in `lib/tenant-token.ts`; `TECHNICIAN_ALLOWED_PATHS` lists permitted routes.
*   **Database Migrations**: Always run `pnpm --filter @workspace/db run push` from the workspace root after schema changes.
*   **Supermarket Mode gate location**: PIN gate logic lives in `pos.tsx` (`needsSupermarketAuth`, `requestSupermarketAction`, `executeSupermarketAction`). To extend coverage to a new cart action, route its onClick through `requestSupermarketAction({ type: "...", ... })` and handle the new variant in `executeSupermarketAction`.
*   **Purchase Bill totals are authoritative on the server**: never trust the client for `subtotal`/`taxTotal`/`totalCost` — the POST handler in `purchase-bills.ts` recomputes them from items, and `confirmBillSideEffects` will repair zeroed totals on legacy drafts before posting the JE. To add a new cart action that posts to accounting, follow the same transaction pattern (`db.transaction(async (tx) => …)`) so a mid-flight failure cannot leave stock half-applied.
*   **PinPad auto-submit threshold**: `PinPad` only auto-submits when `digits.length === pinLength` (the *max*). Setting `pinLength={4}` on a caller makes 4-digit PINs auto-submit but blocks anyone with a 5–8 digit PIN. The defaults (max 8, min 4) are correct for nearly all call sites; only override if the dialog truly only accepts a fixed length.
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