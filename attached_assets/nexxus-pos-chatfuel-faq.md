# NEXXUS POS — Master Chatfuel FAQ

> Import-ready FAQ for the Chatfuel bot powering chat support on
> **nexxus.microbookspos.com**. Each entry is structured as a single
> question + a short, customer-facing answer. Group questions in
> Chatfuel under the suggested **Categories** below.

---

## How to use this file in Chatfuel

1. In Chatfuel, create one **Block** per Category below (e.g. "Getting Started", "POS & Sales").
2. Inside each block, add one **Q&A pair** per question — paste the **Q** as the user-said pattern, and the **A** as the bot reply.
3. Connect every block to a top-level **Main Menu** block with quick-reply buttons (one per Category).
4. Add a fallback block that says "Sorry, I don't have that one yet — chat with a human?" linking to your WhatsApp + email support.
5. Whitelist `nexxus.microbookspos.com` (and `www.` variant if used) under Chatfuel → Configure → Web Chat → Allowed Domains.

---

# 1. Getting Started

**Q: What is NEXXUS POS?**
A: NEXXUS POS is a tablet-friendly point-of-sale system for Jamaican businesses. It handles sales, inventory, customers, loyalty, accounting, multi-location, hardware integration, and more — all in one place. Powered by MicroBooks.

**Q: How do I sign up?**
A: Go to **nexxus.microbookspos.com**, click **Get Started** or **Sign Up**, enter your business details, choose a plan, set your PIN, and you're in. The whole onboarding takes about 2 minutes.

**Q: Is there a free plan?**
A: Yes. Our **Free** plan is $0 forever and includes 2 staff, 25 products, 1 location, 50 invoices per month, plus POS, Cash Management, and Customers.

**Q: What plans are available?**
A: Free, Starter, Growth, Professional, and Enterprise. Each tier raises the staff/product/location/invoice limits and unlocks more modules. See the full breakdown at **nexxus.microbookspos.com** → Plans.

**Q: Do I need a credit card to sign up?**
A: Not for the Free plan. Paid plans require a card at checkout, but you can start on Free and upgrade any time from **Plan → Subscription**.

**Q: What currency does NEXXUS POS use?**
A: All amounts are in **Jamaican Dollars (JMD)** by default. Multi-currency support is on the roadmap.

**Q: How do I verify my email?**
A: After signup we send a verification link to the email you registered with. Check your inbox (and spam). Click the link and your account is verified. You can also resend the link from your Account banner inside the app.

**Q: I didn't receive my verification email.**
A: 1) Check your spam/junk folder. 2) Inside the app, click **Resend verification** on the yellow banner. 3) Still nothing? Email us at **support@microbooksolutions.com**.

---

# 2. POS & Sales

**Q: How do I make a sale?**
A: Open the **POS** tab → tap items to add them to the cart → tap **Pay** → choose Cash, Card, or another method → confirm. A receipt prints automatically (if a printer is connected) and the customer can be emailed/WhatsApp'd a copy.

**Q: Can I scan barcodes?**
A: Yes. Plug in a USB or Bluetooth barcode scanner — most HID scanners work plug-and-play. You can also scan from a tablet camera on supported devices.

**Q: How do I apply a discount?**
A: Tap a line item or the cart total, choose **Discount**, enter the amount or %. Discounts above your role's limit will require a manager PIN override.

**Q: How do I issue a refund?**
A: Open **Order List**, find the order, tap **Refund** (full or partial). The cash drawer will prompt to return the amount and the inventory is restored automatically.

**Q: Can I hold a sale and come back to it?**
A: Yes — tap **Hold** in the POS. Held orders appear under **Order List → Held**. Resume them any time by tapping **Recall**.

**Q: Can I split a bill across multiple payment methods?**
A: Yes. On the payment screen, enter a partial amount under one method (e.g. $1,000 cash), then add another method for the remainder.

**Q: Can I tip on a sale?**
A: Yes — tip can be added during checkout and is tracked separately from the sale total.

---

# 3. Cash Management & Cash Register

**Q: How do I open the cash drawer for the day?**
A: Go to **Cash Mgmt** → **Open Session** → enter your opening float. The session stays open until you close it at end of day.

**Q: How do I close the cash drawer?**
A: **Cash Mgmt** → **Close Session** → count the drawer → enter actual cash on hand. The system shows you any over/short and saves the Z-report.

**Q: What's the difference between Cash Management and Cash Register?**
A: **Cash Mgmt** is for daily session open/close, paid-ins, paid-outs, and cash drops. **Cash Register** shows your detailed Z-reports, cash movements, and cashier reconciliation.

**Q: Can I do a cash payout (e.g. paying a supplier from the till)?**
A: Yes — **Cash Mgmt** → **Pay Out** → enter amount, reason, and (optionally) attach the receipt. It's logged against the open session.

---

# 4. Order List & Order Management

**Q: Where do I see all my orders?**
A: **Order List** shows every sale, refund, held order, and voided ticket. Filter by date, cashier, status, or location.

**Q: Can I reprint a receipt?**
A: Yes. Open **Order List**, tap the order, then **Reprint**.

**Q: Can I send a receipt by WhatsApp?**
A: Yes — open the order → **Send → WhatsApp**. Type or pick the customer's number and we open WhatsApp pre-filled with the receipt link.

**Q: Can I email a receipt?**
A: Yes — same flow, choose **Email** instead of WhatsApp.

---

# 5. Inventory & Products

**Q: How do I add a product?**
A: **Products** → **+ New Product** → fill in name, price, cost, barcode, category, and stock. Save and it's instantly sellable on the POS.

**Q: How do I import many products at once?**
A: **Products** → **Import** → download the CSV template → fill it in → upload. We validate and report any errors before importing.

**Q: How do I track low stock?**
A: Set a **Reorder Point** on each product. The Dashboard shows a Low Stock card; **Reports → Inventory** lists everything below threshold.

**Q: Can I do stock counts / adjustments?**
A: Yes — **Products → Stock Count**, scan or list items, enter actual on-hand, and submit. Variance is logged with reason and signed by your PIN.

**Q: What about product variants (sizes, colors)?**
A: Yes. On a product, switch to **Variants**, define attributes (Size, Color, etc.), and the system generates each combination with its own SKU and price.

---

# 6. Customers & Loyalty

**Q: How do I add a customer?**
A: **Customers → + New Customer**, or add them on-the-fly during checkout. Capture name, phone, email, and address.

**Q: How does the loyalty program work?**
A: Customers earn loyalty points on every qualifying sale. They can redeem points for discounts at checkout. Configure the earn/redeem rate in **Settings → Loyalty**.

**Q: Can I see what a customer has bought before?**
A: Yes — open the customer profile to see their full purchase history, total spend, last visit, and outstanding balance.

**Q: What is AR / Receivables?**
A: Accounts Receivable. If you let customers buy on credit, it tracks who owes you and how much. Take payments against open invoices from **Receivables**.

---

# 7. Staff & Permissions

**Q: How do I add a staff member?**
A: **Staff → + New Staff** → enter name, role, PIN. Assign a role (Owner, Manager, Cashier, etc.) which controls what they can do.

**Q: How do staff log in?**
A: Each staff member has their own **PIN**. Tap **Switch User** in the top bar, enter the PIN, and you're now operating as them. All actions are audit-logged to the right user.

**Q: I forgot my staff PIN — what do I do?**
A: An Owner or Manager can reset it from **Staff → [Name] → Reset PIN**. If the Owner PIN is lost, contact support to reset the tenant.

**Q: Can I customize what each role can do?**
A: Yes. **Staff → Roles**, edit the role, toggle individual permissions (sell, refund, discount, void, settings, etc.).

**Q: What is the Audit Trail?**
A: A full log of every sensitive action — refunds, voids, discount overrides, settings changes — with timestamp, user, and IP. Find it under **Audit Trail** in the menu.

---

# 8. Hardware

**Q: Do I need special hardware?**
A: No. NEXXUS POS runs on any modern tablet, laptop, or desktop with a browser. You can add a receipt printer, barcode scanner, and cash drawer when you're ready.

**Q: What hardware do you sell?**
A: We sell tablet stands, receipt printers (Bluetooth & USB), barcode scanners, cash drawers, and full bundles. See **Store** in the menu.

**Q: Can I bring my own device (BYOD)?**
A: Yes — head to **My Hardware** to register your existing receipt printer or scanner.

**Q: What receipt printers are supported?**
A: Most ESC/POS-compatible thermal printers (58mm and 80mm), including Epson, Star, Xprinter, and Bixolon — over USB, Bluetooth, or LAN.

**Q: My printer isn't printing.**
A: 1) Check the printer is on and has paper. 2) **My Hardware** → tap the printer → **Test Print**. 3) If still failing, re-pair Bluetooth or check the USB cable. 4) Contact support if it persists.

---

# 9. Multi-Location

**Q: Can I run more than one branch?**
A: Yes — depending on your plan. **Locations** lets you set up each branch with its own inventory, staff, and reports. The Owner sees consolidated dashboards.

**Q: How do I move stock between locations?**
A: **Locations → Stock Transfer** → choose source & destination, scan/select items, submit. Both locations' inventory updates automatically.

---

# 10. Restaurants (Tables, Kitchen, Recipes)

**Q: Can I use NEXXUS POS for a restaurant?**
A: Yes. Enable **Tables** for floor management, **Kitchen** for the kitchen display, and **Production/Recipes** for tracking ingredients used per dish.

**Q: What is the Kitchen Display?**
A: A separate screen for the kitchen that shows live tickets in real time as orders are placed at the POS. Bumps when items are ready.

**Q: How do I track ingredients used per dish?**
A: Define **Recipes** that link a sellable menu item to its raw **Ingredients**. When the dish sells, ingredient stock is auto-deducted.

---

# 11. Top-Up (Mobile Credit)

**Q: Can I sell mobile top-up?**
A: Yes — **Top-Up** in the menu lets you sell airtime to all major Jamaican carriers. Top-ups are processed in real time and tracked in your reports.

---

# 12. Reports & Accounting

**Q: What reports do I get?**
A: Sales by day/week/month, by cashier, by item, by category, by location; tax reports; inventory valuation; cash flow; profit & loss; outstanding receivables/payables. Everything in **Reports** and **Accounting**.

**Q: Can I export reports?**
A: Yes — every report has CSV and PDF export.

**Q: Does NEXXUS POS integrate with QuickBooks?**
A: QuickBooks integration is available for select plans. Contact support to enable it.

**Q: How do I do a Z-report (end of day)?**
A: **Cash Mgmt → Close Session**. The Z-report is generated and emailed to the Owner automatically.

---

# 13. Subscription & Billing

**Q: How do I upgrade or downgrade my plan?**
A: **Plan** in the top menu (or **Subscription**) → choose the new tier → confirm. Upgrades are immediate; downgrades take effect at the end of your current billing period.

**Q: How do I update my payment card?**
A: **Plan → Manage Billing → Update Card**.

**Q: How do I cancel?**
A: **Plan → Cancel Subscription**. You'll keep access until the end of your paid period. Your data stays for 90 days in case you change your mind.

**Q: Will I lose my data if I cancel?**
A: No — you can export your data first and we keep it for 90 days post-cancellation in case you reactivate.

---

# 14. Offline & PWA

**Q: Does NEXXUS POS work offline?**
A: Yes — once loaded, the POS keeps working without internet. Sales are queued locally and synced when you're back online.

**Q: Can I install it like an app?**
A: Yes — open **nexxus.microbookspos.com** in Chrome/Safari and tap **Install** (or **Add to Home Screen** on iPad). It runs full-screen like a native app.

**Q: I see a "New version available" notice.**
A: Tap **Update** to load the latest features and fixes. Your current sale is preserved.

---

# 15. Email & Marketing

**Q: I'm getting marketing emails I didn't ask for.**
A: Click **Unsubscribe** at the bottom of any marketing email. You'll be removed within seconds and won't receive marketing again. (Transactional emails like receipts and verification still go through — those are required.)

**Q: How do I re-subscribe?**
A: Email **support@microbooksolutions.com** with the address you'd like back on the list.

---

# 16. Security & Data

**Q: Is my data safe?**
A: Yes — all data is encrypted in transit (TLS) and at rest. Each business is fully isolated from every other business on our platform.

**Q: Where is my data stored?**
A: In secure, redundant cloud infrastructure with daily backups.

**Q: Can I export my data?**
A: Yes — every module (Products, Customers, Orders, Reports) has a CSV/PDF export. You own your data, always.

---

# 17. Troubleshooting

**Q: The screen is frozen / app won't load.**
A: 1) Pull down to refresh, or hard-refresh (Ctrl/Cmd-Shift-R on a laptop). 2) Check your internet. 3) Try a different browser tab. 4) Still stuck? Contact support.

**Q: I clicked the verification link but it says "expired".**
A: Verification links expire after 24 hours. Sign in and click **Resend verification** on the yellow banner.

**Q: My receipt printer suddenly stopped.**
A: 1) Check power and paper. 2) Re-pair Bluetooth (forget & re-add). 3) **My Hardware → Test Print**. 4) Restart the printer. 5) Contact support.

**Q: A sale didn't sync after I came back online.**
A: Open the POS — pending offline sales auto-sync within 30 seconds of reconnect. If a sale is stuck, open **Order List**, find it under **Pending Sync**, and tap **Retry**.

---

# 18. Talk to a Human

**Q: How do I contact support?**
A:
- **WhatsApp:** +1 (876) 787-1538
- **Email:** support@microbooksolutions.com
- **In-app:** chat bubble at the bottom-left of any page
- **Hours:** Mon–Sat, 9am–7pm Jamaica time

**Q: I want to give feedback or request a feature.**
A: We'd love to hear it — email **feedback@microbooksolutions.com** or message us on WhatsApp.

**Q: Do you offer training?**
A: Yes — every new business gets a free 30-minute onboarding call. Book one at **nexxus.microbookspos.com/onboarding** or ask support.

---

# 19. About

**Q: Who builds NEXXUS POS?**
A: NEXXUS POS is built by **MicroBooks Solutions** — a Jamaican fintech focused on connecting small businesses with the tools they need to grow. *Your Business, Connected.*

**Q: Where can I follow you?**
A: Visit **microbookspos.com** for the latest news, tutorials, and updates.

---

*End of Master FAQ — version 1.0.*
