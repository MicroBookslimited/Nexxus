# Overview

This project is a pnpm workspace monorepo written in TypeScript, designed to build a comprehensive Point of Sale (POS) system called NEXXUS POS. It aims to unify various business functionalities into a single application, including customer display, online ordering, reseller management, and advanced accounting. The system provides a robust solution for businesses to manage sales, inventory, staff, and customer relationships across multiple locations, with a focus on ease of use and scalability.

NEXXUS POS, branded "Your Business, Connected." and powered by MicroBooks, targets small to medium-sized businesses looking for an integrated platform to streamline their operations. Key capabilities include a full-featured POS terminal, kitchen display system, multi-location inventory management, detailed accounting modules (Chart of Accounts, Journal Entries, P&L, Balance Sheet), staff management with role-based access, and a customer loyalty program. The platform also features a dedicated reseller portal to foster channel partnerships and drive growth.

# User Preferences

I want iterative development. I want to be asked before you make any major changes to the codebase. I prefer clear and concise explanations.

# System Architecture

The project is structured as a pnpm workspace monorepo, utilizing Node.js 24 and TypeScript 5.9. The frontend is a React + Vite web application (`artifacts/nexus-pos`) that consolidates all user-facing sections (landing, customer display, menu, reseller portal, and the main POS app) into a single, unified application. Navigation is managed by top-level `App.tsx` dispatching to lazy-loaded components based on URL prefixes, with each section managing its own router. The UI adopts a dark navy and electric blue theme.

The backend is an Express 5 REST API (`artifacts/api-server`) that handles all business logic, data persistence, and integrations. It exposes a rich set of API endpoints for product management, order processing, customer management, staff operations, multi-location inventory, accounting, and reporting. Data is stored in a PostgreSQL database and managed using Drizzle ORM. API requests and responses are validated using Zod, and API hooks are generated from an OpenAPI spec using Orval.

Key architectural features include:
- **Unified Frontend**: A single React application serves all user roles and functionalities, improving maintainability and user experience.
- **Modular Backend**: A RESTful API design with distinct endpoints for various business domains ensures scalability and clear separation of concerns.
- **SaaS Layer**: Includes robust authentication using JWT for tenants and superadmins, and integrated payment processing via PayPal and PowerTranz. Subscription plans are managed within this layer.
- **Accounting Module**: Implements double-entry bookkeeping principles, providing a comprehensive Chart of Accounts, Journal Entries, and standard financial reports (P&L, Balance Sheet, Trial Balance). It also supports QuickBooks integration for seamless financial data synchronization.
- **Inventory Management**: Features real-time stock deduction, multi-location inventory tracking, stock transfers, and detailed stock adjustment/counting functionalities.
- **Multi-Unit Sales (Unit-of-Measure Picker)**: Products can have multiple sale units configured in `product_purchase_units` (e.g. each, Six Pack, Case). When the cashier taps a multi-unit product in the POS, a "Choose unit" dialog opens listing every sale unit with its computed price (basePrice × conversionFactor). Selected lines store quantity in BASE units so stock decrements, volume tiers, and `originalUnitPrice` keep working unchanged. The cart line shows a cyan badge "<count> <unitLabel>" and the +/- buttons step by the unit factor. Direct quantity edits snap to the nearest whole multiple on commit (Enter / blur). Different unit choices for the same product appear as separate cart lines, keyed by the DB unit row id.
- **Reseller System**: A dedicated portal and associated backend logic manage reseller sign-ups, referrals, commission tracking (30% recurring), and payout requests, with safeguards against self-referral and double-commissioning.
- **Email Automation System**: Full template management with DB-backed `email_templates` and `email_logs` tables. Supports 5 event triggers (user_signup, payment_success, payment_failed, trial_expiring, password_reset) with `{{variable}}` interpolation, CRUD via `/superadmin/email/*` endpoints, test-send with variable overrides, and a full log viewer. Managed from the "Email" tab in the Super Admin panel.
- **Marketing Email Unsubscribe System**: Every bulk marketing email includes a signed one-click unsubscribe link. The public `/api/unsubscribe?token=...` endpoint verifies the JWT, records the opt-out in `marketing_unsubscribes`, and shows a confirmation page. Audience resolution in `superadmin-marketing.ts` excludes opted-out addresses. Campaign detail endpoint returns `unsubscribeCount`. Superadmins can view the global opt-out list at `GET /api/superadmin/marketing/unsubscribes`.
- **Database Schema**: Designed to support all core functionalities, including `products`, `orders`, `customers`, `staff`, `locations`, `dining_tables`, `accounts`, `journal_entries`, `resellers`, `email_templates`, `email_logs`, and related entities, with appropriate foreign key relationships.
- **Business Rules**: Enforced server-side, including a 10% tax rate, loyalty point accrual (1 point per $10 spent) and redemption (100 points = $1.00 discount), and configurable low-stock thresholds.

# External Dependencies

- **Database**: PostgreSQL (with Drizzle ORM)
- **API Codegen**: Orval (generates from OpenAPI spec)
- **Payment Gateways**:
  - PayPal (using PayPal Orders API v2 and `@paypal/paypal-js` for Smart Buttons)
  - PowerTranz (direct REST API integration)
- **Financial Integration**: QuickBooks (via OAuth 2.0 for syncing orders as Sales Receipts)
- **Charting Library**: Recharts (for dashboard visualizations)