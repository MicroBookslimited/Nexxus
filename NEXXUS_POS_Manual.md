# NEXXUS POS — User Manual
**Version:** May 2026  
**Currency:** JMD (Jamaican Dollar)  
**Platform:** Web / Tablet (dark-themed, mobile-optimised)

---

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [Point of Sale (POS)](#2-point-of-sale-pos)
3. [Orders & Order History](#3-orders--order-history)
4. [Products & Inventory](#4-products--inventory)
5. [Cash Management](#5-cash-management)
6. [Customers](#6-customers)
7. [Staff & Roles](#7-staff--roles)
8. [Tables (Dine-In)](#8-tables-dine-in)
9. [Kitchen Display (KDS)](#9-kitchen-display-kds)
10. [Reports](#10-reports)
11. [Accounting](#11-accounting)
12. [Accounts Receivable (AR)](#12-accounts-receivable-ar)
13. [Accounts Payable (AP)](#13-accounts-payable-ap)
14. [Production & Manufacturing](#14-production--manufacturing)
15. [Top-Up / Airtime](#15-top-up--airtime)
16. [Scale & Weight Labels](#16-scale--weight-labels)
17. [Hardware](#17-hardware)
18. [Locations](#18-locations)
19. [Audit Log](#19-audit-log)
20. [Settings](#20-settings)
21. [Subscription & Billing](#21-subscription--billing)
22. [Technician Portal](#22-technician-portal)
23. [Super Admin Panel](#23-super-admin-panel)
24. [Receipts](#24-receipts)
25. [Offline Mode](#25-offline-mode)
26. [Permission Reference](#26-permission-reference)

---

## 1. Getting Started

### Signing Up
1. Navigate to the app URL and click **Get Started** or go to `/signup`.
2. Enter your business name, email, and a password (minimum 8 characters).
3. Complete onboarding — set your business type, upload a logo, and configure your first location.
4. You will be placed on a free trial. See [Section 21](#21-subscription--billing) to activate a paid plan.

### Logging In
- Go to `/login` and enter your email and password.
- After login, you land on the **Dashboard**.

### Staff PIN Login (POS)
- The POS page requires a staff PIN to begin a shift.
- On the PIN pad, enter your 4–6 digit PIN.
- Admins and Managers have full access; Cashiers have a restricted view.

### Superadmin Login
- Go to `/superadmin` for the platform-level admin panel.

### Technician Login
- Go to `/technician/login` to access the Technician Portal.

---

## 2. Point of Sale (POS)

The POS is the primary selling interface, designed for tablet and touchscreen use.

### Starting a Shift
1. Open the **POS** from the sidebar.
2. Enter your staff PIN on the PIN pad.
3. If multiple locations are configured, select your location.
4. Enter the opening cash amount in the drawer, then tap **Open Shift**.

### Finding Products
- Use the **search bar** to find products by name, barcode, or category.
- Tap any product tile to add it to the cart.
- **Barcode scanner:** Focus the search field and scan — the item is added instantly. If a barcode matches more than one product, a picker dialog opens.

### Quick Add Product *(Admin / Manager only)*
- Tap the green **Add** button (with a box-plus icon) beside the search bar.
- Fill in: Name, Price, Category, Barcode (optional), Initial Qty.
- Press **Enter** in the barcode field to advance to Qty; press **Enter** in Qty (or tap the button) to save.
- The product is created in inventory and added to the cart immediately.

### Cart Management
| Action | How |
|---|---|
| Increase qty | Tap **+** on the cart row |
| Decrease qty | Tap **−** (removes when qty reaches 0) |
| Set exact qty | Tap the quantity number and type |
| Per-item discount | Tap the **%** or **$** icon on a row |
| Per-item note | Tap the **note** icon on a row |
| Remove item | Tap the **trash** icon |

### Product Variants & Modifiers
- If a product has variants (e.g. Small / Medium / Large), a selection dialog opens automatically.
- If it has modifiers (e.g. add-ons, toppings), choose from the list.
- Price adjustments are shown in real time.

### Sell by Weight
- Weight items show a unit (kg, lb, oz, g) instead of a quantity stepper.
- Enter the weight from the scale or type it in.

### Order Type
Select from the top bar:
- **Counter** — walk-in sale
- **Dine-In** — seated at a table
- **Takeout** — customer collects
- **Delivery** — home delivery

### Table Assignment (Dine-In)
- Tap the **table** icon to pick from your configured tables.
- Orders tied to a table are visible in the Tables page.

### Attaching a Customer
- Tap the **customer** icon (person+) to search for or create a customer.
- Linked customers earn loyalty points and accrue outstanding balances if needed.

### Discounts
- **Order-level discount:** Tap the **Discount** button at the bottom. Enter a percentage or fixed amount.
- **Item-level discount:** Tap the **%** icon on a specific cart row.
- Manager PIN is required when discounting above your role's threshold.

### Order Notes
- Tap the **note** icon in the cart toolbar to add a note to the entire order.

### Loyalty Points
- If a customer is attached and has a loyalty balance, a **Redeem Points** option appears.
- Loyalty is earned at a configurable rate (default: 1 point per $10 spent).

### Holding Orders
- Tap **Hold** (save icon) to park the current cart.
- Retrieve held orders from the **Held Orders** panel (clipboard icon).
- Up to 99 orders can be held simultaneously.

### Payment

#### Cash
1. Tap **Cash**.
2. Optionally type the tendered amount on the numpad (e.g. customer hands over $1,000).
3. Tap **Charge** — the receipt shows **Amount Tendered** and **Change Due**.
   - If no tendered amount is entered, the receipt defaults to exact-amount tendered (change = $0.00).

#### Card
1. Tap **Card** and confirm the total.
2. Process on your card terminal; tap **Confirm & Charge** once approved.

#### Split Payment (Cash + Card)
1. Tap **Split**.
2. Enter how much is paid by card and how much by cash.
3. Charge both portions.

#### Other Methods
- **Bank Transfer**, **Loyalty**, **Top-Up Credit** — available if enabled by your administrator.

### After Payment
- The receipt prints automatically (or a print dialog opens).
- Tap **WhatsApp** to send the receipt directly to the customer's phone.
- Tap **Email** to send it to the customer's email address.
- The order is saved and appears in Order History.

### Customer Display (Second Screen)
- If you have a second screen or facing monitor, open `/customer-display` on that device.
- The display shows the current cart total in real time via a broadcast channel.

### Closing a Shift
- Tap the **lock / end shift** icon in the POS toolbar.
- The system calculates the expected cash; enter your physical count.
- Review variance (over/short), then tap **Close Session**.
- An end-of-day report can be emailed from Cash Management.

---

## 3. Orders & Order History

Navigate to **Orders** in the sidebar.

### Viewing Orders
- All completed orders appear in a table sorted by date (newest first).
- Each row shows: order number, date/time, items, payment method, total, status.

### Filtering & Search
| Filter | Options |
|---|---|
| Date preset | Today, Yesterday, Last 7 Days, Last 30 Days |
| Custom date | From / To date pickers |
| Payment method | Cash, Card, Split, etc. |
| Status | All, Completed, Voided, Refunded |
| Search | Order number or customer name |

### Actions (Admin / Manager)
- **Reprint Receipt** — reprints the original receipt in the configured template.
- **Send WhatsApp / Email** — resends the receipt to the customer.
- **Void Order** — requires manager PIN; marks the order void and reverses inventory.
- **Refund** — requires manager PIN; creates a refund record. Enter the amount to refund.

### Export
- Tap **Export CSV** to download the filtered order list as a spreadsheet.

### Offline Orders
- Orders placed while offline show a **Wi-Fi off** badge.
- They are synced automatically when connectivity is restored.

---

## 4. Products & Inventory

Navigate to **Inventory → Products**.

### Adding a Product
1. Tap **New Product**.
2. Fill in:
   - **Name** (required)
   - **Category** (required)
   - **Price** (required, inclusive or exclusive of tax depending on your tax mode)
   - **Barcode** (optional; must be unique)
   - **SKU** (optional)
   - **Description**
   - **Initial Stock Qty**
   - **Cost Price** (for profit reporting)
   - **Track Stock** toggle
   - **Active** toggle

### Variants
- Open a product → **Variants** tab.
- Add variant groups (e.g. "Size") and options (e.g. "Small", "Medium", "Large").
- Each option can have its own price override or price adjustment.

### Modifiers / Customisations
- Open a product → **Modifiers** tab.
- Add choice groups (e.g. "Add-ons") with options and price adjustments.
- Mark a group as **Required** to force selection at checkout.

### Composite Products
- Open a product → **Components** tab.
- Link component products and quantities to create a bundle.
- Composite availability is calculated from the lowest-stock component.

### Pricing Units (Sell by Weight/Volume)
- Open a product → **Pricing Units** tab.
- Add units (e.g. kg, 100g, lb) with their conversion factor and optional price per unit.

### Pricing Tiers (Volume Discounts)
- Set quantity thresholds that trigger automatic price reductions.
- Configured per product via the Pricing Tiers panel.

### Stock Management
- **Adjust Stock:** Open a product → **Stock** → enter a positive (receive) or negative (adjustment) quantity with a reason.
- **Stock History:** Shows every in/out movement with timestamp and reason.
- **Allow Overselling:** Toggle in Settings to permit sales even when stock hits zero.
- **Low Stock Alerts:** Automatically emails you when any product falls below the configured threshold.

### Purchase Bills (Receiving Stock)
1. Go to **Inventory → Purchases**.
2. Tap **New Bill**, select vendor, enter products and quantities received.
3. **Confirm Bill** to post the stock increase and create the AP entry.

### Vendors
- Manage suppliers under **Inventory → Vendors**.
- Name, contact, address, and notes per vendor.

---

## 5. Cash Management

Navigate to **Cash** in the sidebar.

### Opening a Session
1. Enter your staff PIN.
2. Select your location (if multi-location).
3. Enter the opening float amount.
4. Tap **Open Shift**.

### During a Session
- **Cash Drop (Payout):** Record cash removed from the drawer (e.g. banking run). Enter the amount and reason.
- Running totals for cash, card, and split sales are shown on-screen.

### Closing a Session
1. Tap **Close Session**.
2. Enter the physical cash count.
3. Review the variance (balanced / over / short).
4. Confirm to close.
5. Optionally, tap **Email Report** to send the end-of-day summary.

### Session History
- All previous sessions are listed with open/close times, opening float, sales totals, payouts, and variance.
- Expand any session to see its full breakdown.

---

## 6. Customers

Navigate to **Customers** in the sidebar.

### Adding a Customer
- Tap **New Customer** and enter: Name (required), Email, Phone.

### Customer Profile
- View total spend, order count, loyalty points balance, and outstanding AR balance.
- Expand to see full order history for that customer.

### Loyalty Points
- Earned automatically when orders are linked to a customer.
- Redeemable at the POS checkout.
- Balance is shown on receipts.

### Editing / Deleting
- Edit: click the **pencil** icon next to the customer.
- Delete: click the **trash** icon (requires confirmation).

---

## 7. Staff & Roles

Navigate to **Staff** in the sidebar.

### Adding a Staff Member
1. Tap **New Staff**.
2. Enter: Name, Email (optional), PIN (4–6 digits), Role.
3. Toggle **Active** status.

### Roles
NEXXUS POS ships with built-in roles:
| Role | Access Level |
|---|---|
| Admin | Full access to all features |
| Manager | Full POS + management; can void/refund/discount |
| Cashier | POS + orders (no voids/refunds without manager PIN) |
| Inventory Clerk | Inventory management only |

**Custom Roles** can be created in Settings → Roles. Each permission can be toggled individually.

### Location Assignment
- Click the **pin** icon on a staff member to assign them to one or more locations.
- Mark one location as **Primary**.

### Manager PIN Override
- Certain actions (void, refund, high-value discounts) require a manager PIN even when logged in as a cashier.

---

## 8. Tables (Dine-In)

Navigate to **Tables** in the sidebar.

### Adding Tables
1. Tap **New Table**.
2. Enter: Name (e.g. "Table 5"), Capacity (number of seats), Color (for visual identification).
3. Save.

### Table Statuses
| Status | Colour |
|---|---|
| Available | Green |
| Occupied | Blue |
| Reserved | Amber |

### Managing Tables
- **Edit** a table to change its name, capacity, or colour.
- **Free Table** releases an occupied table back to available.
- **Delete** removes a table (only when available).

Tables are assigned from the POS during order creation (Dine-In order type).

---

## 9. Kitchen Display (KDS)

Navigate to **Kitchen** in the sidebar.

### Kitchen Orders
- New orders appear automatically as cards with a 15-minute countdown timer.
- Cards turn red when overdue.
- Tap a card to cycle its status: **Pending → Preparing → Ready**.

### KDS Screens
- Create multiple named screens to route orders to different prep stations (e.g. "Grill", "Cold Drinks").
- Each screen can be opened on a dedicated monitor/tablet.

### Polling
- Kitchen orders update in real time (auto-refresh every 15 seconds).
- Manual refresh button available.

---

## 10. Reports

Navigate to **Reports** in the sidebar.

### Date Range
Use the preset buttons or enter a custom from/to date:
- Today
- Yesterday
- Last 7 Days
- Last 30 Days
- Custom

### Available Reports

| Report | Description |
|---|---|
| Sales Summary | Total revenue, order count, average order value, tax collected |
| Hourly Sales | Bar chart of sales volume by hour of day |
| Sales by Category | Revenue breakdown by product category |
| Top Products | Best-selling items by quantity and revenue |
| Payment Methods | Split of cash / card / split / other |
| Staff Performance | Sales totals per cashier |
| Discounts Report | Total discounts given and by whom |
| Refunds / Voids | Cancellation summary |
| Low Stock | Products below the configured threshold |
| Table Turnover | Average time per table (restaurant mode) |

### Exporting
- Every report section has an **Export CSV** button.
- CSV files download immediately and open in Excel or Google Sheets.

---

## 11. Accounting

Navigate to **Accounting** in the sidebar (Admin/Manager only).

### Tabs

#### Overview
- Period selector (month-to-date, year-to-date, custom).
- Total revenue, expenses, tax collected, net income, order count.

#### Chart of Accounts
- View all GL accounts (Assets, Liabilities, Equity, Revenue, Expenses).
- System accounts are read-only; custom accounts can be added/edited/deleted.
- Each account has a code, name, type, and subtype.

#### Journal Entries
- Manually create double-entry journal entries.
- Each entry needs at minimum one debit and one credit line that balance.
- View, filter, and expand existing entries.

#### P&L (Profit & Loss)
- Period-based income statement.
- Sales revenue, manual income, total expenses, gross profit, net income.
- Breakdowns by payment method.

#### Balance Sheet
- Point-in-time snapshot of assets, liabilities, and equity.
- Shows whether the books are balanced.

#### Trial Balance
- Lists all accounts with total debits and total credits.
- Flags imbalances.

#### Stock Adjustments
- Record manual stock changes with reason codes.
- Optionally linked to a journal entry for COGS tracking.

#### Stock Counts
- Create a stock count session (name it, e.g. "Month-End Count").
- Record physical counts per product.
- System highlights discrepancies and allows one-click adjustment.

#### QuickBooks Sync
- Connect your QuickBooks Online account via OAuth.
- Sync sales, expenses, and tax to your QBO company file.
- Monitor sync status and last-sync timestamp.

---

## 12. Accounts Receivable (AR)

Navigate to **AR** in the sidebar.

- Lists all outstanding customer balances from credit sales.
- Each record shows: customer, order number, amount, amount paid, status (Open / Partial / Paid), due date.
- Click a record to view payment history and record a new payment.
- Payments can be cash, card, bank transfer, or other.

---

## 13. Accounts Payable (AP)

Navigate to **AP** in the sidebar.

### Summary Cards
- Total outstanding, overdue, due this week, paid this month.

### AP Entries
- Created automatically when a Purchase Bill is confirmed.
- Can also be created manually (e.g. utilities, rent).
- Fields: vendor, amount, due date, reference, notes.

### Recording Payments
- Open an AP entry → **Record Payment** → enter amount, method, date, reference.
- Partial payments are supported; status moves from Open → Partial → Paid.

### Aging Report
- Shows amounts outstanding broken into: Current, 1–30 days, 31–60 days, 61–90 days, 90+ days.

### Supplier Ledger
- Select any vendor to see their full transaction history.

### Vendors
- Manage vendor details from the **Vendors** sub-tab.

---

## 14. Production & Manufacturing

Navigate to **Production** in the sidebar.

### Tabs

#### Ingredients
- Add raw materials with unit (pcs, g, kg, ml, l), unit cost, and current stock.
- **Adjust Stock** to record receipts or usage.

#### Recipes
- Link a finished product (SKU) to a list of ingredients with quantities.
- The system calculates material cost per unit.

#### Batches
- Create a production run: select a recipe, enter the batch quantity.
- **Complete Batch** deducts ingredient stock and increments product stock.
- Batches can be printed for the production floor.

#### Raw Material Purchases
- Record purchases of ingredients from suppliers.
- Linked to the AP module for payables tracking.

#### History
- Full log of all batch completions with before/after stock levels.

---

## 15. Top-Up / Airtime

Navigate to **Top-Up** in the sidebar.

Powered by the **Ding** network — sell international and local mobile airtime/data to customers.

### Selling a Top-Up
1. Search for the customer's country.
2. Select the mobile operator.
3. Choose the top-up product (fixed value or range).
4. Enter the recipient's phone number.
5. Tap **Confirm** — the transaction is sent to Ding in real time.

### Transaction History
- All top-up sales listed with status (Pending / Success / Failed).
- Filter by date, status, or operator.
- Commission earned per transaction is shown.

### Analytics
- Summary cards for total transactions, revenue, and commission for the period.

---

## 16. Scale & Weight Labels

Navigate to **Scale** in the sidebar (Admin, Manager, Inventory Clerk).

### Configuring a Product for Scale
1. Find the product → toggle **Scale / Weight Item** on.
2. Set the default unit (lb, kg, oz, g) and price-per-unit.

### Printing Weight Labels
1. Search for the product.
2. Enter the weight reading.
3. Tap **Print Label** — a barcode label is generated and sent to your label printer.
4. The label encodes the product and weight; scanning it at the POS adds the item with the correct weight.

### Label Management
- View all printed, active, and voided labels.
- Void a label if it was printed in error.

---

## 17. Hardware

Navigate to **Hardware** in the sidebar.

### Registering a Device
1. Tap **Add Device**.
2. Select the device type:
   - Receipt Printer
   - Barcode Scanner
   - Cash Drawer
   - Card Reader
   - Customer Display
   - Label Printer
   - Tablet / PC
   - Kitchen Display (KDS)
   - Other
3. Enter a friendly name, model, serial number (optional), and connection notes.
4. Save.

### Driver Links
- Attach download links for printer drivers, SDK software, or configuration guides.
- Platform tags (Windows, macOS, Android, iOS, Linux) help technicians find the right driver.
- Each link has a label, URL, version, and optional description.

### Technician Access
- Hardware page is accessible to Technicians in restricted-access sessions, allowing them to configure devices without accessing sales data.

---

## 18. Locations

Navigate to **Locations** in the sidebar (Admin only).

### Adding a Location
1. Tap **New Location**.
2. Enter: Name, Address, Phone.
3. Toggle **Active**.

### Inventory per Location
- Each location maintains its own stock levels.
- Switch between locations using the location tab in the Inventory sub-view.

### Stock Transfers
- Select source and destination locations, product, and quantity.
- The transfer is recorded and stock levels updated immediately.

### Staff Assignment
- Staff can be assigned to one or more locations via the Staff page.

---

## 19. Audit Log

Navigate to **Audit** in the sidebar (Admin only).

Tracks every significant action in the system:
- Sales, voids, refunds
- Cash open / close / payout
- Product created / updated / deleted
- Staff created / updated / deleted

### Filtering
- Search by staff name or reference.
- Filter by action type (dropdown).
- Each log entry shows: timestamp, action, entity, staff name, and a JSON detail payload.

---

## 20. Settings

Navigate to **Settings** in the sidebar (Admin only).

### Business Profile
| Setting | Description |
|---|---|
| Business Name | Appears on receipts and emails |
| Business Address | Printed on receipts |
| Business Phone | Printed on receipts |
| Logo | Upload a PNG/JPG — shown on receipts and login screen |

### Tax
| Setting | Options |
|---|---|
| Tax Rate | Percentage (e.g. 15) |
| Tax Mode | **Exclusive** (tax added on top) or **Inclusive** (tax included in price) |

### Currency
| Setting | Description |
|---|---|
| Base Currency | Primary currency (default: JMD) |
| Secondary Currency | Optional second currency for display (e.g. USD) |
| Exchange Rate | Base units per 1 unit of secondary currency |

### Receipts
| Setting | Options |
|---|---|
| Paper Size | 58 mm or 80 mm |
| Template | Classic, Modern, Minimal, Bold, Supermarket, Convenience, Staple |
| Footer Text | Custom message printed at the bottom (e.g. "Thank you!") |

All templates always print **Amount Tendered** and **Change Due** for cash payments.

### Email
| Option | Description |
|---|---|
| System Email | Use the built-in NEXXUS POS mailer (no configuration needed) |
| Custom SMTP | Your own SMTP server — host, port, TLS, credentials, from address |

- **Daily Digest:** Send a daily sales summary at a chosen hour.
- **Low Stock Alert:** Email when any product falls below the threshold (configurable hour).

### Inventory
- **Low Stock Threshold:** Default number of units before a product is flagged.
- **Allow Overselling:** If enabled, sales proceed even when stock reaches zero.

### Roles & Permissions
- View all roles (system and custom).
- **Create Custom Role:** Name it and toggle each permission on or off.
- **Edit / Delete** custom roles.
- System roles (Admin, Manager, Cashier, Inventory Clerk) cannot be deleted.

### Payment Methods
- Enable or disable specific payment methods shown at the POS checkout.

### Online Store / QR Code
- A unique QR code is generated for your store URL.
- Share it with customers or embed it in marketing materials.

---

## 21. Subscription & Billing

Navigate to **Subscription** in the sidebar.

### Plans
- Choose from available plans on a **Monthly** or **Annual** billing cycle.
- Annual plans offer a discount over monthly billing.

### Payment Methods
| Method | Notes |
|---|---|
| PayPal | Instant; redirects through PayPal checkout |
| Credit/Debit Card | Processed via PowerTranz with 3-D Secure authentication |
| Bank Transfer | Upload proof of transfer; awaits superadmin review |

### Subscription Status
- **Trial** — full access for the trial period.
- **Active** — paid and current.
- **Expired** — access restricted; must renew to continue.

### Bank Transfer History
- View all submitted transfer proofs and their review status (Pending / Approved / Rejected).

---

## 22. Technician Portal

Technicians are third-party installers/support staff who need limited access to a customer's POS to configure hardware and settings without seeing sales data.

### Technician Registration
1. Go to `/technician/register`.
2. Enter: Name, Email, Phone (optional), Password (min 8 characters).
3. Submit — your account is placed in **Pending** status.
4. A superadmin must approve the account before you can log in.

### Technician Login
- Go to `/technician/login` and sign in with your email and password.

### Technician Portal
- After login, the portal lists all customer locations (tenants) assigned to you.
- Tap **Open POS** to enter a specific customer's system.

### Restricted Access
When a technician is inside a customer's system, access is limited to:
- Inventory (Products, Locations, Ingredients, Recipes, Production)
- Hardware
- Reports
- Settings
- Audit

The following areas are **not accessible** to technicians:
- POS / Sales
- Orders
- Cash Management
- Tables / Kitchen
- Top-Up
- Staff
- Accounting / AR / AP
- Subscription / Billing

An **Impersonation Banner** at the top of the screen identifies the active technician session. Click **End Session** to return to the Technician Portal.

---

## 23. Super Admin Panel

Navigate to `/superadmin` (platform administrators only).

### Overview Tab
- Platform-wide stats: total tenants, active/trial subscriptions, MRR, ARR.
- Plan breakdown chart.

### Tenants Tab
- List all tenant accounts with subscription status.
- **Impersonate:** Log in as any tenant to troubleshoot.
- **Edit Tenant:** Change plan, status, trial end date.
- **Force Logout:** Invalidate all active sessions for a tenant.
- **Reset Password:** Set a new password for the tenant's admin user.

### Users Tab
- List all admin-level users across all tenants.
- Reset user passwords, force logout.

### Technicians Tab
Manage the technician workforce:
- View technicians filtered by status (Pending / Approved / Suspended / Rejected).
- **Approve / Reject** pending registrations.
- **Suspend / Re-activate** approved technicians.
- **Reset Password** for any technician.
- **Manage Assignments:** Add or remove tenant assignments — controls which customer systems a technician can access.
- **Delete** a technician account.

### Payments Tab
- View all bank transfer proofs submitted by tenants.
- **Approve** or **Reject** each proof with notes.
- Manage bank accounts (add/edit/delete account details shown to tenants for transfer).

### Plans Tab
- Create, edit, and delete subscription plans.
- Set name, monthly price, annual price, description, features list, and active status.

### Gateway Tab
- Configure the PowerTranz payment gateway credentials used for card billing.

### Email Tab
- Configure platform-level email settings.

### Marketing Tab
- Manage promotional banners and announcements shown to tenants.

### Store Tab
- Configure app store metadata and public-facing settings.

### Impersonation Logs
- Full audit trail of all impersonation sessions (superadmin and technician).
- Shows who, which tenant, start/end time, and session duration.
- Active sessions can be force-closed.

---

## 24. Receipts

### Templates

| Template | Best For |
|---|---|
| **Classic** | General retail; clean two-column layout |
| **Modern** | Branded look with logo emphasis |
| **Minimal** | Fast printing; no decoration |
| **Bold** | High-contrast; easy to read in bright environments |
| **Supermarket** | Wide item columns; customer copy footer |
| **Convenience** | Compact convenience-store style |
| **Staple** | Hardware/staple goods; card-terminal style layout |

Configure the template in **Settings → Receipts**.

### Paper Sizes
- **58 mm** — narrow roll, typical in compact printers
- **80 mm** — standard POS roll

### Cash Payment Lines
Every cash transaction receipt includes:
- **Amount Tendered** — the amount the customer handed over (defaults to the exact total if not entered)
- **Change Due** — the difference returned to the customer

### Other Receipt Sections
- Business name, address, phone, logo
- Order number, date/time, cashier name
- Itemised list with quantities and prices
- Subtotal, tax, discount, total
- Payment method
- Loyalty points earned / redeemed / balance
- Customer name (if attached)
- Receipt footer message

### Delivery Options
| Channel | How |
|---|---|
| Print | Opens browser print dialog (connects to POS printer) |
| WhatsApp | Opens WhatsApp web with a pre-filled text receipt |
| Email | Sends to the customer's registered email |

---

## 25. Offline Mode

NEXXUS POS continues working when your internet connection drops.

- Sales made offline are queued locally in the browser.
- A **Wi-Fi Off** badge is shown on the Orders page for queued items.
- When connectivity is restored, the queue is processed automatically in the background.
- Inventory counts and price lookups use the last cached data until sync.

> **Note:** Top-Up / Airtime transactions require an active connection and cannot be queued offline.

---

## 26. Permission Reference

| Permission Key | Description |
|---|---|
| `pos.sale` | Create sales at the POS |
| `pos.discount` | Apply discounts |
| `pos.void` | Void completed orders |
| `pos.refund` | Issue refunds |
| `orders.view` | View order history |
| `orders.export` | Export orders to CSV |
| `cash.manage` | Open/close cash sessions, record payouts |
| `inventory.view` | View products and stock levels |
| `inventory.manage` | Create/edit/delete products, adjust stock |
| `inventory.purchase` | Create and confirm purchase bills |
| `customers.view` | View customer list |
| `customers.manage` | Create/edit/delete customers |
| `staff.view` | View staff list |
| `staff.manage` | Create/edit/delete staff, assign roles |
| `reports.view` | View all reports |
| `accounting.view` | View accounting module |
| `accounting.manage` | Create journal entries, manage accounts |
| `settings.manage` | Change business settings |
| `tables.manage` | Add/edit/delete dining tables |
| `kitchen.view` | View kitchen orders |
| `topup.sell` | Process top-up / airtime transactions |
| `hardware.manage` | Register and configure hardware devices |
| `audit.view` | View audit log |

---

*NEXXUS POS — Built for Jamaican businesses. Powered by modern cloud technology.*  
*For support, contact your system administrator or visit the Help section.*
