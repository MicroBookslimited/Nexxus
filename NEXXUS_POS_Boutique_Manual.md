# NEXXUS POS — Clothing Boutique Manual
**Version:** May 2026 | **Currency:** JMD | **Business Type:** Retail

---

## 1. Getting Started

### Creating Your Account
1. Go to the app URL and click **Get Started** or navigate to `/signup`.
2. Enter your store name, email address, and a password (minimum 8 characters).
3. During onboarding, select **Retail** as your business type.
4. Your account begins on a free trial. See Section 12 to activate a paid plan.

### Logging In
- Go to `/login`, enter your email and password, and you will land on the Dashboard.
- The Dashboard shows today's sales, top products, and payment method summary at a glance.

### Staff PIN Login
- The POS requires every staff member to enter their 4–6 digit PIN before selling.
- Admins and Managers see all controls. Cashiers have a simpler, sale-focused view.

---

## 2. Setting Up Your Product Catalogue

Navigate to **Inventory** in the sidebar.

### Adding a Clothing Item

1. Tap **New Product**.
2. Fill in the following fields:

| Field | Notes |
|---|---|
| Name | e.g. "Floral Wrap Dress" |
| Category | e.g. Dresses, Tops, Bottoms, Accessories |
| Price | Selling price (JMD) |
| Cost Price | What you paid — used in profit reports |
| Barcode | Scan or type the garment barcode |
| SKU | Your internal reference code (optional) |
| Initial Stock Qty | Starting units on hand |
| Track Stock | Toggle ON to monitor stock levels |

3. Tap **Save**.

### Sizes & Colours — Variants

Variants are the most important feature for a clothing boutique. They let one product (e.g. "Slim Fit Chinos") have multiple size/colour combinations, each with its own stock count.

**To add variants:**
1. Open the product → **Variants** tab.
2. Create a variant group named **Size** and add options: XS, S, M, L, XL, XXL.
3. Add another group named **Colour** and add options: Black, White, Navy, Olive.
4. Each combination can have its own price override if needed.
5. Each variant tracks its own stock count independently.

**Tip:** A single size-colour combination (e.g. Size M / Colour Black) is one variant. Set opening stock for each one when you first add the product.

### Add-Ons / Customisations (Modifiers)

Use modifiers for optional extras at checkout — for example:
- Gift wrapping (+$150)
- Personalised embroidery (+$500)
- Hemming service (+$300)

Open a product → **Modifiers** tab → add a group with options and prices.

### Barcodes

- Every garment should have a barcode (either the manufacturer's or your own printed label).
- Scan directly into the **Barcode** field when creating the product.
- At the POS, scanning a barcode instantly finds and adds the item to the cart.

### Organising by Category

Good categories speed up the POS and make reports more useful. Suggested categories for a boutique:
- Dresses
- Tops & Blouses
- Pants & Jeans
- Skirts
- Outerwear & Jackets
- Swimwear
- Accessories
- Footwear
- Lingerie & Sleepwear
- Sale / Clearance

---

## 3. Point of Sale (POS)

Navigate to **POS** in the sidebar.

### Starting Your Shift

1. Open the POS page.
2. Enter your staff PIN.
3. Select your location if you have more than one branch.
4. Enter the opening cash float in the drawer.
5. Tap **Open Shift** — you are now ready to sell.

### Finding and Adding Items

**By barcode scanner:**
- Focus the search bar and scan the garment tag. The item (and its variant) is added to the cart instantly.
- If the barcode matches more than one product, a picker appears — select the correct one.

**By search:**
- Type the product name or category in the search bar.
- Tap the product tile to add it to the cart.
- If the item has variants, a dialog opens — select the size and colour, then confirm.

**Quick Add (Admin / Manager only):**
- Tap the green **Add** button beside the search bar to create a brand-new product on the spot.
- Fill in the name, price, category, and optional barcode, then save. The item goes into inventory and the cart simultaneously.

### Managing the Cart

| Action | How |
|---|---|
| Increase quantity | Tap **+** on the cart row |
| Decrease quantity | Tap **−** |
| Remove item | Tap the **trash** icon |
| Per-item discount | Tap the **%** or **$** icon on the row |
| Add a note to an item | Tap the **note** icon (e.g. "customer requested alterations") |

### Applying Discounts

- **Order discount:** Tap **Discount** at the bottom. Enter a percentage (e.g. 10%) or a fixed JMD amount.
- **Item discount:** Tap the **%** icon on a specific cart row.
- A manager PIN is required for discounts above the configured threshold.

### Loyalty Points

- Attach a customer to the sale (see below) and they automatically earn loyalty points.
- If the customer has enough points, a **Redeem Points** option appears at checkout.
- Loyalty balance prints on the receipt.

### Attaching a Customer

- Tap the **customer icon** (person+) in the toolbar.
- Search by name or phone number.
- Tap **New Customer** to create one on the spot (name, email, phone).
- Linked customers build a purchase history and earn loyalty points.

### Order Type

For a boutique you will mostly use **Counter**. If you offer delivery, select **Delivery**.

### Holding a Sale

- Tap **Hold** to park the current cart (e.g. customer wants to keep looking).
- Tap the **clipboard icon** to recall held orders. Up to 99 sales can be held at once.

### Payment

#### Cash
1. Tap **Cash**.
2. Type the amount the customer hands over on the numpad (e.g. $5,000).
3. Tap **Confirm** — the receipt shows the amount tendered and change due.

#### Card
1. Tap **Card**.
2. Process the payment on your card terminal.
3. Tap **Confirm & Charge** — the sale is complete.

#### Split (Card + Cash)
1. Tap **Split**.
2. Enter how much goes on card and how much is cash.
3. Confirm both portions.

### After the Sale

- The receipt prints automatically.
- Tap **WhatsApp** to send the receipt to the customer's phone.
- Tap **Email** to send it to their email address.
- Stock is deducted automatically for each variant sold.

### Closing Your Shift

1. Tap the **lock icon** in the POS toolbar.
2. Enter the physical cash count from the drawer.
3. Review the variance (balanced / over / short).
4. Tap **Close Session** — an end-of-day report can be emailed.

---

## 4. Orders & Order History

Navigate to **Orders** in the sidebar.

### Viewing Sales

All completed sales appear in a table showing: order number, date/time, items, payment method, total, and status.

### Filtering

| Filter | Options |
|---|---|
| Date preset | Today, Yesterday, Last 7 Days, Last 30 Days |
| Custom dates | From / To date pickers |
| Payment method | Cash, Card, Split |
| Status | Completed, Voided, Refunded |
| Search | Order number or customer name |

### Reprinting a Receipt

- Expand an order row and tap **Reprint** — the receipt opens in the configured template.

### Voiding a Sale *(Manager PIN required)*

- Expand the order → tap **Void**.
- Enter a manager PIN.
- The order is cancelled and stock is returned automatically.

### Processing a Refund *(Manager PIN required)*

- Expand the order → tap **Refund**.
- Enter the refund amount and a reason.
- Stock is returned and the refund is recorded.

### Exporting Sales Data

- Tap **Export CSV** to download the filtered order list as a spreadsheet for your records or accountant.

---

## 5. Cash Management

Navigate to **Cash** in the sidebar.

### Opening a Session

1. Enter your PIN.
2. Select the branch (if multi-location).
3. Enter the opening cash float.
4. Tap **Open Shift**.

### During the Day

- **Cash Drop / Banking Run:** Tap **Payout** → enter the amount being removed from the drawer and the reason.
- Live totals for cash sales, card sales, and split payments are shown on-screen.

### Closing the Day

1. Tap **Close Session**.
2. Count the cash in the drawer and enter the total.
3. Review the variance — balanced means your cash matches expected; short/over flags a discrepancy.
4. Tap **Confirm Close**.
5. Tap **Email Report** to send the end-of-day summary to yourself.

### Session History

Previous sessions are listed with all totals, payouts, and variance figures. Expand any session for a full breakdown.

---

## 6. Customers & Loyalty

Navigate to **Customers** in the sidebar.

### Adding a Customer

Tap **New Customer** and enter:
- **Name** (required)
- **Email** — for emailed receipts and marketing
- **Phone** — for WhatsApp receipts

### Customer Profile

Each customer record shows:
- Total lifetime spend
- Order count
- Loyalty points balance
- Outstanding credit balance
- Full order history

### Loyalty Programme

- Points are earned on every sale (default: 1 point per $10 spent).
- Points can be redeemed at the POS as a discount.
- The current balance appears on every printed receipt.
- Adjust the earn rate in Settings if needed.

### Credit / Outstanding Balance

If a customer sometimes pays on account, their outstanding balance is tracked in Accounts Receivable (Section 9). The balance is shown at checkout so staff can remind the customer.

---

## 7. Staff & Roles

Navigate to **Staff** in the sidebar.

### Adding a Team Member

1. Tap **New Staff**.
2. Enter: Name, PIN (4–6 digits), Role, Active toggle.

### Built-In Roles

| Role | What They Can Do |
|---|---|
| Admin | Full access — settings, reports, voids, refunds, inventory |
| Manager | POS + orders + inventory + cash management; can void/refund |
| Cashier | POS sales and orders only; voids require a manager PIN |
| Inventory Clerk | Inventory and stock management only; no POS access |

### Custom Roles

Go to **Settings → Roles** to create a custom role with exactly the permissions you want (e.g. a role that can discount up to 20% without a PIN, or a role with reports-only access).

### Manager PIN Override

If a cashier needs to issue a void, refund, or large discount, the system will prompt for a manager PIN — you do not need to log out.

### Multi-Branch Staff

Click the **pin icon** on a staff member to assign them to one or more locations and mark their primary branch.

---

## 8. Inventory & Stock Control

### Stock Tracking

Every product with **Track Stock** enabled will have its count decremented automatically when sold and incremented when stock is received.

### Adjusting Stock Manually

1. Open the product → **Stock** tab.
2. Enter the adjustment quantity:
   - Positive number (+) = stock received / correction upward
   - Negative number (−) = damaged, lost, or correction downward
3. Select a reason (received, adjustment, damaged, other).
4. Save — the change is logged with timestamp and staff name.

### Stock History

Every movement (sale, receive, adjustment) is logged. Open a product → **Stock** tab → view the full history with dates and reasons.

### Low Stock Alerts

- Set a minimum threshold in **Settings** (e.g. 3 units).
- When any product drops below this level, an automated email is sent.
- Set the alert email and preferred time in **Settings → Low Stock Alerts**.

### Allowing Overselling

If you want to accept orders even when stock shows zero (e.g. items on back-order), toggle **Allow Overselling** in Settings. By default this is off.

### Receiving New Stock (Purchase Bills)

When a new shipment arrives from a supplier:
1. Go to **Inventory → Purchases** → **New Bill**.
2. Select the supplier (vendor).
3. Add each item and quantity received.
4. Tap **Confirm Bill** — stock is added and an Accounts Payable entry is created.

### Vendors / Suppliers

Go to **Inventory → Vendors** to manage your list of clothing suppliers: name, contact, address, and notes.

---

## 9. Accounts Receivable (AR)

Navigate to **AR** in the sidebar.

Use this when customers buy on credit (e.g. you have loyal customers who pay at end of month).

- Each credit sale creates an AR record showing: customer name, order number, amount, amount paid, status, and due date.
- Click any record to view payment history.
- Record a payment: open the record → **Record Payment** → enter amount, method, and date.
- Partial payments are supported — status moves from Open → Partial → Paid automatically.

---

## 10. Accounts Payable (AP)

Navigate to **AP** in the sidebar.

This tracks what you owe your clothing suppliers.

- AP entries are created automatically from confirmed Purchase Bills.
- You can also add manual entries for expenses (rent, utilities, bags, hangers).
- **Record a payment:** open an entry → **Record Payment**.
- **Aging Report:** see which bills are overdue — broken into: Current, 1–30 days, 31–60 days, 61–90 days, 90+ days overdue.
- **Supplier Ledger:** select any vendor to see their full history of bills and payments.

---

## 11. Reports

Navigate to **Reports** in the sidebar.

### Date Range

Choose a preset or enter custom dates:
- Today / Yesterday / Last 7 Days / Last 30 Days / Custom

### Key Reports for a Boutique

| Report | What It Tells You |
|---|---|
| Sales Summary | Total revenue, number of transactions, average sale value, tax collected |
| Top Products | Your best-selling items by units and revenue — know what to reorder |
| Sales by Category | Revenue per clothing category (Dresses vs Tops vs Accessories) |
| Payment Methods | How much came in via cash vs card |
| Hourly Sales | What time of day is busiest — useful for scheduling staff |
| Staff Performance | Revenue per cashier |
| Discounts Report | Total value discounted and by whom |
| Refunds & Voids | Cancellations summary |
| Low Stock | Products approaching your minimum threshold |

### Exporting

Every report section has an **Export CSV** button. Use these to share data with your accountant or analyse in Excel / Google Sheets.

---

## 12. Settings

Navigate to **Settings** in the sidebar (Admin only).

### Business Profile

| Setting | Description |
|---|---|
| Store Name | Appears on receipts and email headers |
| Address | Printed on receipts |
| Phone | Printed on receipts |
| Logo | Upload your store logo — shown on receipts and the login screen |

### Tax

| Setting | Description |
|---|---|
| Tax Rate | Enter your GCT rate (e.g. 15%) |
| Tax Mode | **Exclusive** — tax is added on top of prices. **Inclusive** — tax is built into the price. |

### Currency

| Setting | Description |
|---|---|
| Base Currency | JMD (Jamaican Dollar) — default |
| Secondary Currency | Optional, e.g. USD for tourists |
| Exchange Rate | Rate for converting to secondary currency |

### Receipts

| Setting | Options |
|---|---|
| Paper Size | 58 mm (narrow) or 80 mm (standard) |
| Template | Classic, Modern, Minimal, Bold — all show Amount Tendered and Change for cash sales |
| Footer Text | Custom message, e.g. "Thank you for shopping with us! No exchanges after 7 days." |

### Email Notifications

- **Daily Digest:** Receive a sales summary email every morning.
- **Low Stock Alert:** Automatic email when items fall below your set threshold.
- Choose between the built-in NEXXUS mailer or your own SMTP server.

### Payment Methods

Enable or disable which payment options appear at the POS checkout.

### Roles & Permissions

Create custom roles with fine-grained control over what each staff level can do.

---

## 13. Hardware

Navigate to **Hardware** in the sidebar.

Register and document every device in your store. This is especially useful when setting up a new branch or replacing equipment.

### Device Types Supported

| Device | Use |
|---|---|
| Receipt Printer | Print customer receipts (58 mm or 80 mm roll) |
| Barcode Scanner | Scan garment tags at the POS |
| Cash Drawer | Tracks opening float |
| Card Reader | Tap/chip/swipe card terminal |
| Customer Display | Facing screen showing cart total to the customer |
| Label Printer | Print price/barcode tags for garments |
| Tablet / PC | The device running NEXXUS POS |

### Adding a Device

1. Tap **Add Device**.
2. Select the type, enter a name (e.g. "Main Counter Scanner"), model, and serial number.
3. Add any setup notes.
4. Save.

### Driver Links

Attach download links for printer or scanner drivers. Tag by platform (Windows / macOS / Android) so staff or technicians can find the right installer quickly.

---

## 14. Receipts

### Templates

Choose from four templates in Settings — all are suitable for retail:

| Template | Style |
|---|---|
| Classic | Clean two-column layout — professional and familiar |
| Modern | Logo-prominent, branded look |
| Minimal | Compact — fastest to print, no decoration |
| Bold | High-contrast — easy to read in bright natural light |

### Cash Payment Lines

Every cash receipt always prints:
- **Amount Tendered** — what the customer handed over
- **Change Due** — the amount returned to them

### What Prints on Every Receipt

- Store name, address, phone, logo
- Order number, date, time, cashier name
- Itemised list with sizes/colours, quantity, and price
- Subtotal, GCT, any discount applied, and total
- Payment method
- Loyalty points earned this visit and running balance
- Customer name (if a customer was attached)
- Your custom footer message (e.g. exchange policy reminder)

### Sharing Receipts

- **Print** — opens the browser print dialog; connects to your receipt printer.
- **WhatsApp** — sends a formatted text receipt to the customer's phone.
- **Email** — sends to the customer's registered email.

---

## 15. Locations (Multi-Branch)

Navigate to **Locations** in the sidebar (Admin only).

If you operate more than one boutique branch:

### Adding a Branch

1. Tap **New Location** → enter name, address, phone → Save.

### Per-Branch Inventory

Each location has its own stock count. Products can have different quantities at each branch.

### Stock Transfers Between Branches

1. Go to Locations → **Transfer Stock**.
2. Select source branch, destination branch, product, and quantity.
3. Confirm — both branches update immediately.

### Staff Assignment

Assign staff to specific branches from the Staff page. Staff can be assigned to multiple locations with one marked as primary.

---

## 16. Audit Log

Navigate to **Audit** in the sidebar (Admin only).

The audit log records every significant action:

| Event | Description |
|---|---|
| Sale | Every completed transaction |
| Void | Orders cancelled after completion |
| Refund | Money returned to customers |
| Cash Open | When a shift was opened and by whom |
| Cash Close | When a shift was closed, by whom, and the count |
| Cash Payout | Cash removed from the drawer |
| Product Created / Updated / Deleted | Inventory changes |
| Staff Created / Updated / Deleted | Team changes |

Filter by action type or search by staff name. Each entry includes a timestamp and the full detail of what changed. The audit log cannot be modified or deleted.

---

## 17. Subscription & Billing

Navigate to **Subscription** in the sidebar.

### Plans

Choose monthly or annual billing. Annual plans offer a discount.

### Payment Options

| Method | Notes |
|---|---|
| PayPal | Instant activation |
| Credit / Debit Card | Processed securely with 3-D Secure (Visa / Mastercard) |
| Bank Transfer | Upload proof of transfer; activates after review |

### Trial

Your account starts on a free trial with full access. When the trial ends, subscribe to continue using all features.

---

## Quick Reference — Common Tasks

| Task | Where |
|---|---|
| Add a new clothing item | Inventory → New Product |
| Add sizes and colours | Inventory → open product → Variants tab |
| Receive new stock from supplier | Inventory → Purchases → New Bill |
| Process a sale | POS |
| Apply a store-wide discount | POS → Discount button |
| Void or refund an order | Orders → expand row → Void / Refund |
| Open the cash drawer | Cash → Open Shift |
| Close the day and count cash | Cash → Close Session |
| Add a new customer | Customers → New Customer (or at POS checkout) |
| Check today's revenue | Dashboard or Reports → Today |
| See best-selling styles | Reports → Top Products |
| Transfer stock between branches | Locations → Transfer Stock |
| Add a staff member | Staff → New Staff |
| Change the receipt footer | Settings → Receipts → Footer Text |
| Set up a low stock alert | Settings → Low Stock Alerts |
