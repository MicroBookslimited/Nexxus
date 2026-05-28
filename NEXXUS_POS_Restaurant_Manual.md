# NEXXUS POS — Restaurant Manual
**Version:** May 2026 | **Currency:** JMD | **Business Type:** Restaurant / Bar / Café

---

## 1. Getting Started

### Creating Your Account
1. Go to the app URL and click **Get Started** or navigate to `/signup`.
2. Enter your restaurant name, email address, and a password (minimum 8 characters).
3. During onboarding, select **Restaurant** as your business type — this enables Tables, Kitchen Display, and Recipe tracking.
4. Your account begins on a free trial. See Section 17 to activate a paid plan.

### Logging In
- Go to `/login`, enter your email and password, and you will land on the Dashboard.
- The Dashboard shows today's sales, top items, covers served, and payment method summary at a glance.

### Staff PIN Login
- Every staff member enters a 4–8 digit PIN before taking orders or running the till.
- Admins and Managers see all controls. Servers / Cashiers see a sale-focused view; Kitchen staff see only the KDS.

---

## 2. Setting Up Your Menu

Navigate to **Inventory** in the sidebar — this is where both menu items and raw ingredients live.

### Adding a Menu Item

1. Tap **New Product**.
2. Fill in the following fields:

| Field | Notes |
|---|---|
| Name | e.g. "Jerk Chicken Quarter" |
| Category | e.g. Mains, Starters, Sides, Drinks, Desserts |
| Price | Selling price (JMD) |
| Cost Price | Plate cost — used in profit reports (auto-calculated if you set up a Recipe) |
| Is Taxable | OFF for zero-rated items (e.g. some bottled water); GCT skips them |
| Track Stock | OFF for cook-to-order plates; ON for bottled drinks and packaged items |
| Image | Photo shown on the POS tile and the customer-display menu |

3. Tap **Save**.

### Variants — Sizes, Spice Levels, Cuts

Variants let one item have multiple choices that change the price or the stock that's deducted. Examples:

- **Wings:** Variant group "Size" → 6 pcs, 12 pcs, 24 pcs
- **Steak:** Variant group "Doneness" → Rare, Medium, Well; group "Cut" → Sirloin, Ribeye
- **Smoothie:** Variant group "Size" → 12 oz, 16 oz, 20 oz

Open the item → **Variants** tab → create a group, add options, set price overrides per option.

### Modifiers — Add-Ons & Customisations

Modifiers are optional extras the customer chooses at the point of order — they don't change which item is sold, only what comes with it.

| Modifier Group | Example Options |
|---|---|
| Sides | Rice & Peas, Festival, Bammy, Fries (each priced separately) |
| Extras | Extra Sauce (+$100), Extra Cheese (+$150) |
| Cooking Notes | Mild, Medium, Hot, Extra Hot (no charge) |
| Allergens / Dietary | No Onion, No Salt, Gluten-Free Bun (+$200) |

Open the item → **Modifiers** tab → add groups; mark groups **Required** when the customer must choose (e.g. doneness for steak).

### Multi-Unit Items

For items sold by more than one measure — e.g. draft beer by the pint or the pitcher, or wine by the glass or the bottle — enable **Multi-Unit Sales** on the product:

1. Open product → **Units** tab → add each sale unit with its conversion factor and price.
2. At the POS, the cart shows a unit badge next to the item; different unit choices appear as separate cart lines.

### Categories That Work Well for Restaurants

Good categories speed up the POS and make reports more useful:

- Starters / Appetisers
- Soups & Salads
- Mains / Entrées
- Sides
- Kids' Menu
- Desserts
- Soft Drinks
- Juices & Smoothies
- Beer
- Wine
- Spirits & Cocktails
- Hot Drinks
- Packaged / Retail

### Menu Photos & the Customer Display

If you have a second screen mounted toward the dining room, every item with a photo and price will appear on it as a digital menu when the POS is idle.

---

## 3. Recipes & Ingredient Tracking

Restaurants don't sell raw stock — they sell prepared dishes. Recipes let one sale (e.g. one "Oxtail Plate") automatically deduct the right amount of raw ingredients from your inventory.

Navigate to **Inventory → Ingredients** to manage raw stock, and **Inventory → Recipes** to link them to menu items.

### Adding an Ingredient

1. Tap **New Ingredient**.
2. Fill in: Name (e.g. "Oxtail"), Unit (kg, g, L, ml, pcs), Cost per Unit, On-Hand Quantity, Vendor.
3. Save.

### Building a Recipe

1. Go to **Recipes → New Recipe**.
2. Link the recipe to the menu item it represents (e.g. "Oxtail Plate").
3. Add each ingredient and the quantity used per plate:

| Ingredient | Qty per Plate | Unit |
|---|---|---|
| Oxtail | 0.350 | kg |
| Butter Beans | 0.060 | kg |
| Rice | 0.180 | kg |
| Coconut Milk | 0.080 | L |
| Onion | 0.040 | kg |

4. Save — the **Plate Cost** is calculated automatically from the ingredients' unit costs.

### What Happens When You Sell

When a "Oxtail Plate" is rung in at the POS:
- The menu item's plate cost is logged for your margin report.
- Each linked ingredient's on-hand quantity is decremented in the right units.
- Low-stock alerts fire on the **ingredient**, not the dish.

### Production / Prep Runs

For sub-recipes you prep in bulk (e.g. jerk marinade, brown stew sauce) use **Inventory → Production**:

1. Tap **New Production Run** → select the prepared item and the batch size.
2. The system deducts each raw ingredient and adds the prepared item to stock at the calculated cost.

### Why This Matters

- **Real plate cost** — see exactly what each dish costs to make today (because ingredient prices change).
- **Real margin** — Reports → Margin by Item shows what's actually profitable.
- **Stock alerts on ingredients** — never run out of oxtail mid-service because the system warned you yesterday.

---

## 4. Point of Sale (POS)

Navigate to **POS** in the sidebar.

### Starting Your Shift

1. Open the POS.
2. Enter your staff PIN.
3. Select your location if you have more than one branch.
4. Enter the opening cash float in the drawer.
5. Tap **Open Shift** — you are now ready to take orders.

### Taking an Order

**By menu tile:**
- Tap a category, then tap a menu item to add it to the cart.
- If the item has required variants/modifiers (size, doneness, sides), a dialog opens — make the selections and confirm.

**By search:**
- Type the dish name in the search bar (e.g. "wings"). Tap the matching tile to add.

**By barcode (for bottled drinks / packaged items):**
- Focus the search bar and scan the item. The line is added instantly.

**Quick Add (Admin / Manager only):**
- Tap the green **Add** button beside the search to create a brand-new item on the spot — useful for daily specials.

### Managing the Cart

| Action | How |
|---|---|
| Increase quantity | Tap **+** on the cart row |
| Decrease quantity | Tap **−** |
| Remove item | Tap the **trash** icon |
| Per-item discount | Tap the **%** or **$** icon on the row |
| Per-item note | Tap the **note** icon (e.g. "no onion", "well done", "allergy: nuts") |
| Re-open modifier choices | Tap the modifier icon on the row |

### Applying Discounts

- **Order discount:** Tap **Discount** at the bottom. Enter a percentage or a fixed JMD amount.
- **Item discount:** Tap the **%** icon on a specific cart row.
- A manager PIN is required for discounts above the configured threshold.

### Course / Fire Timing

Tap **Course** on a cart row to tag it as Starter, Main, or Dessert. When the order fires to the kitchen, courses print on separate tickets so the kitchen sends them in the right order.

### Attaching a Customer

- Tap the **customer icon** (person+) in the toolbar.
- Search by name or phone number, or tap **New Customer** to create one.
- Customers earn loyalty points and can be billed on account (Section 10).

### Order Type

Restaurants use:

- **Dine-In** — assign a table (Section 5) and capture guest count.
- **Takeaway** — pickup at the counter, no table.
- **Delivery** — capture address; integrates with the delivery driver workflow.

### Sending to the Kitchen

- After building the cart for a dine-in table, tap **Send to Kitchen** — items appear on the Kitchen Display (Section 6).
- The cart stays open under that table so you can add another round and re-send.
- The bill is only printed when the customer asks to settle.

### Holding a Sale (Takeaway / Counter)

- Tap **Hold** to park the current cart when the customer is still browsing or waiting.
- Tap the **clipboard icon** to recall held orders. Up to 99 can be held at once.

### Payment

#### Cash
1. Tap **Cash**.
2. Type the amount the customer hands over on the numpad.
3. Tap **Confirm** — the receipt shows the amount tendered and change due.

#### Card
1. Tap **Card**.
2. Process the payment on your terminal (or charge through the integrated PowerTranz / FAC card flow if enabled).
3. Tap **Confirm & Charge**.

#### Split (Card + Cash, or split between guests)
1. Tap **Split**.
2. Enter how much goes on card and how much is cash.
3. Confirm both portions.

#### On Account (House Tab / Corporate)
- Select the customer first, then tap **Charge to Account**. The amount is added to Accounts Receivable (Section 10).

#### Tips
- For card payments, a tip prompt appears after the amount is entered (configurable in Settings → POS).
- Cash tips can be entered separately on the cash screen.

### After the Sale

- The receipt prints automatically (or sends to the customer's WhatsApp / email).
- Stock for ingredients, variants, and packaged items is deducted automatically.
- The table is freed for the next sitting.

### Closing Your Shift

1. Tap the **lock icon** in the POS toolbar.
2. Enter the physical cash count from the drawer (and tips, if separated).
3. Review the variance (balanced / over / short).
4. Tap **Close Session** — an end-of-day report can be emailed.

---

## 5. Tables & Floor Plan

Navigate to **Tables** in the sidebar.

### Setting Up the Floor

1. Tap **Manage Floor Plan** → drag tables onto the canvas.
2. Set each table's name (e.g. "T1", "Patio 3", "Bar"), seat count, and section (Indoor, Patio, Bar, VIP).
3. Save — the floor plan is what every server sees on the POS.

### Sections

Group tables by section so reports can show revenue per area (Patio vs Indoor) and so servers can be assigned to a section.

### Opening a Table

1. From the POS, tap **Tables**.
2. Tap an open table — enter the guest count.
3. Build the order as normal and **Send to Kitchen** to fire the first round.

### Table Statuses

| Colour | Meaning |
|---|---|
| Grey | Open / available |
| Yellow | Seated, no order yet |
| Blue | Order sent, food in kitchen |
| Green | Food delivered, awaiting bill |
| Red | Bill requested |

### Adding Rounds

Open the seated table → add items → **Send to Kitchen** again. Kitchen tickets are stamped "Round 2", "Round 3", etc.

### Transferring a Table

If the party moves: open the table → **Transfer** → pick the destination table. All items, courses, and the customer move together.

### Splitting a Bill

- **By item:** Tap **Split** → drag each item into a separate sub-bill → settle each independently.
- **Evenly:** Tap **Split Evenly** → enter the number of payers → each sub-bill shows the share.

### Merging Tables

If two tables join: open the first table → **Merge With** → pick the second table.

### Closing the Table

After payment, the table flips back to grey and is ready for the next sitting.

---

## 6. Kitchen Display System (KDS)

Navigate to **Kitchen** in the sidebar — usually run on a dedicated screen in the kitchen.

### What the Cooks See

Each order appears as a ticket showing:
- Table number and guest count (or "Takeaway" / "Delivery")
- Round number
- Server name
- Each item with its variants, modifiers, and notes
- Course tag (Starter / Main / Dessert)
- Time since the order was fired (the timer turns yellow at 10 min, red at 20 min — adjustable in Settings)

### Working a Ticket

- Tap an item to mark it **In Progress**.
- Tap again to mark it **Ready** — the line strikes through.
- When every line is Ready, tap **Bump** to send the ticket off the screen — the server is notified that the food is ready.

### Recall

If a ticket was bumped by mistake, tap **Recall** to bring back the last 10 bumped tickets.

### Stations (Optional)

Set up multiple KDS screens — Hot Line, Cold Line, Grill, Bar — and route items to the right station based on the menu category.

### Bar Display

Drinks fire to a separate **Bar Display** so bartenders see only their tickets. Set this up in Settings → Kitchen.

---

## 7. Online Ordering & QR Menu

Each tenant gets a public menu URL (e.g. `yourbusiness.nexxus.app/menu`) that customers can browse from their phone.

### Enabling Online Ordering

Settings → Online Ordering → toggle **Accept Online Orders** ON. Choose:
- Pickup only
- Delivery only
- Both

### QR Codes at the Table

Print a QR code per table (Settings → Tables → Print QR Codes). Customers scan, browse, and order — the order arrives in NEXXUS, fires to the kitchen automatically, and the server delivers and settles.

### Delivery

Capture the address and contact phone. The order shows on the **Delivery** tab so a driver can be dispatched. Mark **Out for Delivery** and **Delivered** to complete the order.

### Order Acceptance

Online orders ring an alert. The manager / cashier accepts (optionally setting a prep time the customer will see) or rejects with a reason.

---

## 8. Orders & Order History

Navigate to **Orders** in the sidebar.

### Viewing Sales

All sales (dine-in, takeaway, delivery, online) appear in one table showing: order number, date/time, table, items, payment method, total, and status.

### Filtering

| Filter | Options |
|---|---|
| Date preset | Today, Yesterday, Last 7 Days, Last 30 Days |
| Custom dates | From / To date pickers |
| Order type | Dine-In, Takeaway, Delivery |
| Payment method | Cash, Card, Split, On Account |
| Status | Open, Completed, Voided, Refunded |
| Search | Order number, table, or customer name |

### Reprinting a Receipt

- Expand the order → tap **Reprint** — opens in the configured template.

### Reprinting a Kitchen Ticket

- Expand the order → tap **Reprint Kitchen** — useful if a ticket was lost.

### Voiding a Sale *(Manager PIN required)*

- Expand the order → tap **Void**.
- Stock for ingredients and packaged items is returned automatically.

### Processing a Refund *(Manager PIN required)*

- Expand the order → tap **Refund**.
- Enter the refund amount and a reason — full or partial refunds are supported.

### Exporting Sales Data

- Tap **Export CSV** to download for your accountant.

---

## 9. Cash Management

Navigate to **Cash** in the sidebar.

### Opening a Session

1. Enter your PIN.
2. Select the branch (if multi-location).
3. Enter the opening float.
4. Tap **Open Shift**.

### During Service

- **Cash Drop / Banking Run:** Tap **Payout** → enter the amount being removed and the reason.
- **Tips:** Cash tips can be tracked separately and paid out at the end of service.
- Live totals for cash sales, card sales, split, and on-account are shown on-screen.

### Closing the Day

1. Tap **Close Session**.
2. Count the cash in the drawer and enter the total.
3. Review the variance.
4. Tap **Confirm Close**.
5. Tap **Email Report** to send the end-of-day summary.

### Session History

Previous sessions are listed with totals, payouts, tips, and variance.

---

## 10. Customers, Loyalty & House Accounts

Navigate to **Customers** in the sidebar.

### Adding a Customer

Tap **New Customer** and enter Name (required), Email (for receipts), Phone (for WhatsApp), and any internal notes (e.g. "VIP", "allergic to shellfish").

### Customer Profile

- Total lifetime spend and order count
- Loyalty points balance
- Outstanding credit (house tab) balance
- Full order history with itemised receipts

### Loyalty Programme

- Points earned on every sale (default: 1 point per $10 spent).
- Points can be redeemed at the POS as a discount.
- Balance prints on every receipt.

### House Accounts / Tabs

For regulars and corporate accounts who settle weekly or monthly:

1. Attach the customer at the POS.
2. Charge to **On Account**.
3. The amount goes to Accounts Receivable (Section 11).
4. Send a statement at month-end from the customer profile.

---

## 11. Accounts Receivable (AR)

Navigate to **AR** in the sidebar.

Use this for charges on account, corporate tabs, and event invoicing.

- Each on-account sale creates an AR record showing customer, order number, amount, amount paid, status, and due date.
- Click any record to view payment history.
- Record a payment: open the record → **Record Payment** → enter amount, method, and date.
- Partial payments are supported — status moves from Open → Partial → Paid automatically.

---

## 12. Accounts Payable (AP) & Purchasing

Navigate to **AP** in the sidebar.

This tracks what you owe your suppliers (meat, produce, dry goods, beverage, equipment).

### Vendors

Go to **Inventory → Vendors** to manage suppliers: name, contact, address, payment terms, notes.

### Receiving a Delivery (Purchase Bill)

When a shipment arrives:
1. Go to **Inventory → Purchases** → **New Bill**.
2. Select the supplier.
3. Add each ingredient and the quantity received, the unit cost, and the tax rate.
4. The bill shows subtotal, tax, total, and a margin column.
5. Tap **Confirm Bill** — ingredient stock is added, the cost-per-unit is updated (only if higher than the current cost), and an AP entry is created.

### Suggested Price Updates

If a new cost is higher than the old one, the system suggests new selling prices that preserve your prior margin. Accept, edit, or skip each suggestion.

### Supplier Returns / Debit Notes

If you have to send goods back (spoiled, wrong order):
1. Go to **Inventory → Supplier Returns** → **New Return**.
2. Choose **Bill-Linked** (caps qty to the original delivery) or **Standalone**.
3. On confirm, stock is decremented, the AP balance is reversed.

### Aging Report

See which bills are overdue — Current, 1–30, 31–60, 61–90, 90+.

### Recording a Payment

Open an AP entry → **Record Payment** → enter amount, method, and date.

---

## 13. Reports

Navigate to **Reports** in the sidebar.

### Date Range

Today / Yesterday / Last 7 Days / Last 30 Days / Custom.

### Key Reports for a Restaurant

| Report | What It Tells You |
|---|---|
| Sales Summary | Total revenue, covers, average cheque, tax collected |
| Top Items | Best-selling dishes by units and revenue — your true crowd-pleasers |
| Sales by Category | Mains vs Drinks vs Desserts — your menu mix |
| Sales by Section | Patio vs Indoor vs Bar revenue |
| Sales by Order Type | Dine-In vs Takeaway vs Delivery |
| Hourly Sales | Busiest hours — drives staff scheduling |
| Cover Count | Number of guests served per day / hour |
| Average Cheque per Cover | Track if guests are spending more or less per head |
| Server Performance | Revenue, covers, and tips per server |
| Payment Methods | Cash vs Card vs Split vs On-Account |
| Discounts | Total discounted, by whom and by reason |
| Voids & Refunds | Cancellations summary |
| Margin by Item | Plate cost vs price — your most profitable dishes |
| Recipe Cost Drift | Plates whose cost has risen — candidates for a price review |
| Low Stock (Ingredients) | Ingredients approaching your minimum threshold |
| Wastage | Stock written off through adjustments tagged "spoiled" / "wasted" |

### Exporting

Every report has an **Export CSV** button.

---

## 14. Settings

Navigate to **Settings** in the sidebar (Admin only).

### Business Profile

| Setting | Description |
|---|---|
| Restaurant Name | Appears on receipts and email headers |
| Address | Printed on receipts and the menu page |
| Phone | Printed on receipts |
| Logo | Upload — shown on receipts and the login screen |

### Tax

| Setting | Description |
|---|---|
| Tax Rate | Enter your GCT rate (e.g. 15%) |
| Tax Mode | **Exclusive** — tax added on top. **Inclusive** — tax baked into menu prices (common in restaurants) |
| Service Charge | Optional automatic charge (e.g. 10% on parties of 6+) |

### Currency

| Setting | Description |
|---|---|
| Base Currency | JMD — default |
| Secondary Currency | Optional (e.g. USD for tourist areas) — prints on the receipt |
| Exchange Rate | Used for the secondary line on receipts |

### Receipts

| Setting | Options |
|---|---|
| Paper Size | 58 mm or 80 mm |
| Template | Classic, Modern, Minimal, Bold (plus Supermarket / Convenience / Staple for retail-style restaurants) |
| Footer Text | Custom message (e.g. "Service not included — tips appreciated") |
| Show Unit Price | ON by default — each line shows `qty × name @ unit` |

### Kitchen / KDS

| Setting | Description |
|---|---|
| Bump Threshold (Yellow / Red) | Minutes before tickets turn yellow and red |
| Course Routing | Whether to print/display courses on separate tickets |
| Stations | Define hot line, cold line, grill, bar, etc. and map categories to them |
| Bar Display | Toggle ON to route drinks to a separate screen |
| Reprint Header | Custom text printed at the top of every kitchen ticket |

### POS Interface

| Setting | Description |
|---|---|
| Hardware Layout | ON for hardware-store-style restaurants doing a lot of packaged item sales; otherwise leave OFF |
| Supermarket Mode | Manager PIN required for decrease qty / remove / clear cart |
| Tip Prompt | ON for card payments |
| Required Guest Count | Force a cover count on every dine-in order |

### Online Ordering

| Setting | Description |
|---|---|
| Accept Online Orders | Pickup / Delivery / Both |
| Default Prep Time | Minutes shown to customer when an online order is accepted |
| Delivery Zones | Define zones with fees and minimum order amounts |

### Email Notifications

- Daily Digest — sales summary every morning.
- Low Stock Alert — ingredients dropping below threshold.
- New Online Order — instant ping when a customer orders.

### Payment Methods

Enable or disable cash, card, split, on-account.

### Roles & Permissions

Create custom roles, e.g. "Server" (POS + tables + tip-out, no voids), "Bar Lead" (POS + cash close), "Sous Chef" (KDS + recipes only).

### POS Security (Override Cards)

- Set a Supermarket-mode PIN requirement.
- Issue managers/supervisors a swipeable override card (HID magstripe) so they can authorise voids/discounts without typing a PIN.

---

## 15. Staff & Roles

Navigate to **Staff** in the sidebar.

### Adding a Team Member

1. Tap **New Staff**.
2. Enter Name, PIN (4–8 digits), Role, Active toggle.
3. Optionally assign an Override Card from the **Override Cards** section (swipe to capture).

### Built-In Roles

| Role | What They Can Do |
|---|---|
| Owner | Everything, including billing and superadmin features |
| Admin | All settings, reports, voids, refunds, inventory, recipes |
| Manager | POS + tables + KDS + inventory + cash; can void/refund |
| Server / Cashier | Take orders, settle bills; voids require manager PIN |
| Kitchen | KDS only — no POS or financial access |
| Bartender | Bar tickets and cash; can settle bar tabs |
| Inventory Clerk | Inventory and stock management only |

### Custom Roles

Settings → Roles → create a role with exactly the permissions you need.

### Manager PIN Override

When a cashier needs to issue a void, refund, or large discount, the system prompts for a manager PIN or swipe of a manager override card — no logout required.

### Multi-Branch Staff

Click the **pin icon** on a staff member to assign them to one or more locations.

### Clock In / Out & Shifts

Staff clock in on the POS at the start of their shift and clock out at the end. Reports → Staff Performance shows hours worked alongside revenue.

---

## 16. Inventory & Stock Control

### What's Tracked vs Cook-to-Order

- **Packaged items** (bottled drinks, beer, sealed snacks) — track stock; deducted on every sale.
- **Cook-to-order plates** — usually don't track the plate itself; instead track the ingredients via a Recipe (Section 3).

### Adjusting Stock Manually

1. Open the item or ingredient → **Stock** tab.
2. Enter adjustment quantity (+ received / − damaged or wasted).
3. Select a reason (Received, Adjustment, Spoiled, Wasted, Other).
4. Save — the change is logged with timestamp and staff name.

### Stock History

Every movement (sale, recipe deduction, receive, adjustment) is logged with date, staff, and reason.

### Low Stock Alerts

Set a minimum threshold per item / ingredient in Settings → Low Stock. An automated email goes out when stock drops below.

### Allowing Overselling

Toggle **Allow Overselling** in Settings. Off by default — the till blocks sales that would exceed stock. Turn it on for ingredients you trust your kitchen to substitute on the fly.

### Stock Transfers (Multi-Branch)

If you operate more than one outlet (e.g. main kitchen and a sister bar), go to Locations → Transfer Stock to move ingredients between branches.

### Batch / Lot / Expiry Tracking

For ingredients with expiry dates (meat, dairy, fresh produce), enable **Track Batches** on the ingredient. Each purchase records a batch with batch number and expiry; sales deduct from the oldest batch first (FIFO) so older stock is used first.

### Bulk Stock Count

For end-of-month inventory:
1. Go to Inventory → **Stock Count** → **New Count**.
2. Walk the kitchen with a tablet and enter the physical count of each ingredient.
3. Submit — variances are calculated and posted as adjustments tagged "Stock Count".

---

## 17. Subscription & Billing

Navigate to **Subscription** in the sidebar.

### Plans

Choose monthly or annual billing. Annual plans offer a discount.

### Payment Options

| Method | Notes |
|---|---|
| PayPal | Instant activation |
| Credit / Debit Card | Processed securely via PowerTranz (3-D Secure for Visa/Mastercard) |
| Bank Transfer | Upload proof; activated after review |

### Trial

Your account starts on a free trial with full access. Subscribe before the trial ends to continue.

---

## 18. Hardware

Navigate to **Hardware** in the sidebar.

Register and document every device in your restaurant.

### Device Types

| Device | Use |
|---|---|
| POS Terminal | Tablet or PC running NEXXUS POS |
| Receipt Printer | 80 mm thermal at the counter / bar |
| Kitchen Printer | 80 mm impact (heat-tolerant) at the line |
| KDS Screen | Display for the kitchen tickets |
| Bar Display | Drinks-only ticket screen |
| Card Reader | Tap/chip/swipe terminal |
| Barcode Scanner | Packaged item / bottle sales |
| Cash Drawer | Tracks opening float |
| Customer Display | Shows the running cheque to the diner |
| Mag-Stripe Reader | Swipe override cards for manager overrides |

### Adding a Device

1. Tap **Add Device**.
2. Enter type, name (e.g. "Pass Printer"), model, serial number, and setup notes.
3. Attach driver links by platform (Windows / macOS / Android) so the next technician knows what to install.

---

## 19. Receipts

### Templates

Choose in Settings → Receipts:

| Template | Style |
|---|---|
| Classic | Clean two-column layout — restaurant standard |
| Modern | Logo-prominent, branded |
| Minimal | Compact — fastest to print |
| Bold | High-contrast — easy to read in dim light |
| Supermarket / Convenience / Staple | Retail-style — useful for counter-service shops attached to a restaurant |

### Cash Payment Lines

Every cash receipt prints:
- **Amount Tendered** — what the customer handed over
- **Change Due** — returned to them

### What Prints on Every Receipt

- Restaurant name, address, phone, logo
- Order number, date, time, server name, table & cover count (dine-in)
- Itemised list with `qty × name @ unit-price` and the line total
- Per-line savings (if a promo or volume tier brought the unit price below the regular price)
- Subtotal, GCT, any discount applied, overall "You Save" line, optional service charge, and total
- Payment method and any tip
- Loyalty points earned and running balance
- Customer name and any outstanding house-tab balance
- Your custom footer message

### Sharing Receipts

- **Print** — to the connected counter printer.
- **WhatsApp** — formatted text receipt to the customer's phone.
- **Email** — to the customer's registered address.

### Kitchen Tickets

Separate from customer receipts:
- One ticket per round, per station.
- Course-stamped (Starter / Main / Dessert) when courses are used.
- Big-text item names and modifiers — readable from a metre away.

---

## 20. Locations (Multi-Outlet)

Navigate to **Locations** in the sidebar (Admin only).

### Adding a Branch

Tap **New Location** → enter name, address, phone, section colour (for the floor plan) → Save.

### Per-Branch Inventory

Each location has its own stock for ingredients and packaged items.

### Stock Transfers

Locations → Transfer Stock → source → destination → ingredient → quantity → Confirm. Both branches update immediately.

### Staff Assignment

Assign staff to specific branches; mark one as primary.

### Consolidated Reporting

Reports run across all branches by default, with a per-location breakdown. Filter to a single branch when needed.

---

## 21. Promotions & Happy Hour

Navigate to **Promotions** in the sidebar.

### Time-Based Promotions

Run a promo price on selected items during a date / time window — perfect for Happy Hour, Lunch Specials, or Two-for-Tuesday.

1. Tap **New Promotion**.
2. Pick the items.
3. Set the promo price (or % off).
4. Set the window (e.g. Mon–Fri, 4 pm – 7 pm).
5. Activate.

At checkout, qualifying items show a **PROMO** badge and the regular price is shown crossed out. The receipt's "You Save" line is updated automatically. Volume-pricing tiers are bypassed while a promo is active.

### Bulk Price Manager

For seasonal or across-the-board changes (e.g. 10% off all desserts for a week), use **Price Manager** to update many items at once with a percentage, a cost-based markup, or a fixed amount — with optional rounding.

---

## 22. Audit Log

Navigate to **Audit** in the sidebar (Admin only).

| Event | Description |
|---|---|
| Sale | Every completed transaction |
| Void / Refund | Orders cancelled or refunded |
| Cash Open / Close / Payout | Drawer activity |
| Recipe Updated | Plate-cost-affecting changes |
| Price Change | Menu price updates with old and new values |
| Promotion Activated | Who turned a happy-hour on and when |
| Stock Adjustment | Spoilage / wastage / counts |
| Staff Created / Updated / Deleted | Team changes |
| Override Card Used | Who authorised an override and when |

Filter by action type or staff name. Entries cannot be modified or deleted.

---

## Quick Reference — Common Tasks

| Task | Where |
|---|---|
| Add a new menu item | Inventory → New Product |
| Add sizes / doneness / sides | Inventory → open product → Variants / Modifiers tab |
| Build or update a recipe | Inventory → Recipes |
| Receive ingredients from a supplier | Inventory → Purchases → New Bill |
| Open a table and seat guests | Tables → tap open table → enter cover count |
| Fire food to the kitchen | POS → Send to Kitchen |
| Bump a finished ticket | Kitchen Display → tap **Bump** |
| Split a bill | Table → Split → drag items or split evenly |
| Apply a discount | POS → Discount (order) or % icon on a cart row (item) |
| Set up Happy Hour | Promotions → New Promotion |
| Void or refund an order | Orders → expand row → Void / Refund |
| Charge a regular's tab | POS → attach customer → Charge to Account |
| Record a customer payment toward their tab | AR → open record → Record Payment |
| Open the cash drawer | Cash → Open Shift |
| Close the day and count cash | Cash → Close Session |
| Print QR codes for tables | Settings → Tables → Print QR Codes |
| See best-selling dishes | Reports → Top Items |
| See most profitable dishes | Reports → Margin by Item |
| Set up an override card for a manager | Staff → edit manager → Override Cards → Add |
| Transfer ingredients between branches | Locations → Transfer Stock |
| Change the receipt footer | Settings → Receipts → Footer Text |
| Set a low-stock alert on an ingredient | Inventory → Ingredients → edit → Min Threshold |
