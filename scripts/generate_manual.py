#!/usr/bin/env python3
"""Generate NEXXUS POS User Manual PDF."""

import sys
sys.path.insert(0, ".pythonlibs/lib/python3.11/site-packages")

from weasyprint import HTML, CSS

MANUAL_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>NEXXUS POS — User Manual</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

  @page {
    size: A4;
    margin: 2cm 2.2cm 2.5cm 2.2cm;
    @bottom-center {
      content: "NEXXUS POS  •  User Manual  •  Page " counter(page) " of " counter(pages);
      font-size: 8pt;
      color: #6b7280;
      font-family: Inter, sans-serif;
    }
  }

  @page cover {
    margin: 0;
    @bottom-center { content: none; }
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: Inter, 'Segoe UI', Arial, sans-serif;
    font-size: 10pt;
    line-height: 1.65;
    color: #1f2937;
    background: #fff;
  }

  /* ── Cover ── */
  .cover {
    page: cover;
    width: 100%;
    height: 297mm;
    background: #0f1729;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 60px 40px;
    page-break-after: always;
  }

  .cover-logo-box {
    background: rgba(59,130,246,0.15);
    border: 2px solid rgba(59,130,246,0.4);
    border-radius: 20px;
    padding: 16px 32px;
    margin-bottom: 32px;
  }

  .cover-brand {
    font-size: 36pt;
    font-weight: 800;
    color: #3b82f6;
    letter-spacing: -1px;
  }

  .cover-brand span {
    color: #ffffff;
  }

  .cover-tagline {
    font-size: 15pt;
    color: #93c5fd;
    margin-top: 6px;
    font-weight: 400;
    letter-spacing: 0.5px;
  }

  .cover-divider {
    width: 80px;
    height: 3px;
    background: linear-gradient(90deg, #3b82f6, #60a5fa);
    border-radius: 2px;
    margin: 40px auto;
  }

  .cover-title {
    font-size: 28pt;
    font-weight: 700;
    color: #ffffff;
    margin-bottom: 10px;
  }

  .cover-subtitle {
    font-size: 13pt;
    color: #94a3b8;
    font-weight: 400;
  }

  .cover-footer {
    position: absolute;
    bottom: 40px;
    left: 0;
    right: 0;
    text-align: center;
    color: #475569;
    font-size: 9pt;
  }

  /* ── TOC ── */
  .toc-page {
    page-break-after: always;
    padding-top: 10px;
  }

  .toc-title {
    font-size: 18pt;
    font-weight: 700;
    color: #0f1729;
    border-bottom: 3px solid #3b82f6;
    padding-bottom: 8px;
    margin-bottom: 24px;
  }

  .toc-section {
    margin-bottom: 6px;
  }

  .toc-item {
    display: flex;
    align-items: baseline;
    gap: 4px;
    font-size: 10pt;
    color: #374151;
    padding: 3px 0;
  }

  .toc-num {
    font-weight: 700;
    color: #3b82f6;
    min-width: 28px;
  }

  .toc-dots {
    flex: 1;
    border-bottom: 1px dotted #d1d5db;
    margin: 0 6px;
    position: relative;
    top: -3px;
  }

  .toc-page-num {
    color: #6b7280;
    font-size: 9pt;
  }

  .toc-sub {
    padding-left: 28px;
    font-size: 9pt;
    color: #6b7280;
  }

  /* ── Content ── */
  .section-header {
    page-break-before: always;
    margin-bottom: 20px;
  }

  .section-number {
    font-size: 9pt;
    font-weight: 600;
    color: #3b82f6;
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: 4px;
  }

  h1 {
    font-size: 20pt;
    font-weight: 800;
    color: #0f1729;
    border-bottom: 3px solid #3b82f6;
    padding-bottom: 8px;
    margin-bottom: 18px;
  }

  h2 {
    font-size: 14pt;
    font-weight: 700;
    color: #1e3a8a;
    margin-top: 22px;
    margin-bottom: 10px;
    padding-left: 10px;
    border-left: 4px solid #3b82f6;
  }

  h3 {
    font-size: 11pt;
    font-weight: 600;
    color: #1f2937;
    margin-top: 16px;
    margin-bottom: 8px;
  }

  p { margin-bottom: 10px; }

  ul, ol {
    margin: 8px 0 12px 22px;
  }

  li { margin-bottom: 4px; }

  li > ul { margin-top: 4px; margin-bottom: 4px; }

  /* ── Info boxes ── */
  .callout {
    border-radius: 8px;
    padding: 12px 16px;
    margin: 14px 0;
    font-size: 9.5pt;
  }

  .callout-tip {
    background: #eff6ff;
    border-left: 4px solid #3b82f6;
    color: #1e40af;
  }

  .callout-warn {
    background: #fffbeb;
    border-left: 4px solid #f59e0b;
    color: #92400e;
  }

  .callout-danger {
    background: #fef2f2;
    border-left: 4px solid #ef4444;
    color: #991b1b;
  }

  .callout strong { display: block; margin-bottom: 4px; }

  /* ── Step boxes ── */
  .steps { counter-reset: step; margin: 12px 0; }

  .step {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    margin-bottom: 10px;
  }

  .step-num {
    counter-increment: step;
    content: counter(step);
    min-width: 26px;
    height: 26px;
    background: #3b82f6;
    color: #fff;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 9pt;
    font-weight: 700;
    flex-shrink: 0;
  }

  .step-body { flex: 1; padding-top: 3px; }

  /* ── Table ── */
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 12px 0 18px;
    font-size: 9pt;
  }

  th {
    background: #0f1729;
    color: #fff;
    padding: 8px 10px;
    text-align: left;
    font-weight: 600;
  }

  td {
    padding: 7px 10px;
    border-bottom: 1px solid #e5e7eb;
    vertical-align: top;
  }

  tr:nth-child(even) td { background: #f9fafb; }

  td strong { color: #1e3a8a; }

  /* ── Badges ── */
  .badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 9999px;
    font-size: 8pt;
    font-weight: 600;
  }

  .badge-blue { background: #dbeafe; color: #1d4ed8; }
  .badge-green { background: #dcfce7; color: #166534; }
  .badge-amber { background: #fef3c7; color: #92400e; }
  .badge-red { background: #fee2e2; color: #991b1b; }
  .badge-purple { background: #ede9fe; color: #6d28d9; }

  /* ── Shortcut table ── */
  .kbd {
    background: #e5e7eb;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    padding: 1px 6px;
    font-family: monospace;
    font-size: 8.5pt;
    color: #374151;
  }

  /* ── Role matrix ── */
  .role-yes { color: #16a34a; font-weight: 600; }
  .role-no  { color: #dc2626; }
  .role-mgr { color: #2563eb; font-weight: 600; }

  /* ── PIN hint ── */
  code {
    background: #f1f5f9;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    padding: 1px 6px;
    font-family: monospace;
    font-size: 9pt;
    color: #1e40af;
  }
</style>
</head>
<body>

<!-- ════════════════════════════════════════════════════════ COVER ═══ -->
<div class="cover">
  <div class="cover-logo-box">
    <div class="cover-brand">NEXXUS<span> POS</span></div>
    <div class="cover-tagline">Your Business, Connected.</div>
  </div>
  <div class="cover-divider"></div>
  <div class="cover-title">User Manual</div>
  <div class="cover-subtitle">Complete Guide to NEXXUS POS — Version 2.0</div>
  <div class="cover-footer">Powered by MicroBooks &nbsp;|&nbsp; microbookspos.com &nbsp;|&nbsp; April 2026</div>
</div>

<!-- ════════════════════════════════════════════════════════ TOC ════ -->
<div class="toc-page">
  <div class="toc-title">Table of Contents</div>

  <div class="toc-section">
    <div class="toc-item"><span class="toc-num">1.</span> Getting Started<span class="toc-dots"></span><span class="toc-page-num">3</span></div>
    <div class="toc-item toc-sub">System Requirements, First Login, Onboarding Wizard</div>
  </div>

  <div class="toc-section">
    <div class="toc-item"><span class="toc-num">2.</span> Dashboard<span class="toc-dots"></span><span class="toc-page-num">4</span></div>
    <div class="toc-item toc-sub">KPI Cards, Charts, Low-Stock Alerts</div>
  </div>

  <div class="toc-section">
    <div class="toc-item"><span class="toc-num">3.</span> Point of Sale (POS)<span class="toc-dots"></span><span class="toc-page-num">5</span></div>
    <div class="toc-item toc-sub">Making a Sale, Discounts, Payments, Receipts, Hold &amp; Recall</div>
  </div>

  <div class="toc-section">
    <div class="toc-item"><span class="toc-num">4.</span> Orders<span class="toc-dots"></span><span class="toc-page-num">7</span></div>
    <div class="toc-item toc-sub">Order History, Voids &amp; Refunds</div>
  </div>

  <div class="toc-section">
    <div class="toc-item"><span class="toc-num">5.</span> Tables (Restaurant)<span class="toc-dots"></span><span class="toc-page-num">7</span></div>
    <div class="toc-item toc-sub">Floor Plan, Table Status, Dine-in Orders</div>
  </div>

  <div class="toc-section">
    <div class="toc-item"><span class="toc-num">6.</span> Kitchen Display<span class="toc-dots"></span><span class="toc-page-num">8</span></div>
    <div class="toc-item toc-sub">KDS Kanban, Status Workflow</div>
  </div>

  <div class="toc-section">
    <div class="toc-item"><span class="toc-num">7.</span> Products &amp; Inventory<span class="toc-dots"></span><span class="toc-page-num">8</span></div>
    <div class="toc-item toc-sub">Product CRUD, Variants, Modifiers, Stock Management</div>
  </div>

  <div class="toc-section">
    <div class="toc-item"><span class="toc-num">8.</span> Customers &amp; Loyalty<span class="toc-dots"></span><span class="toc-page-num">10</span></div>
    <div class="toc-item toc-sub">Customer Profiles, Loyalty Points</div>
  </div>

  <div class="toc-section">
    <div class="toc-item"><span class="toc-num">9.</span> Staff Management<span class="toc-dots"></span><span class="toc-page-num">10</span></div>
    <div class="toc-item toc-sub">Roles, PIN Authentication, Branch Assignment</div>
  </div>

  <div class="toc-section">
    <div class="toc-item"><span class="toc-num">10.</span> Locations / Branches<span class="toc-dots"></span><span class="toc-page-num">11</span></div>
    <div class="toc-item toc-sub">Multi-location Setup, Inventory per Branch, Stock Transfers</div>
  </div>

  <div class="toc-section">
    <div class="toc-item"><span class="toc-num">11.</span> Cash Management<span class="toc-dots"></span><span class="toc-page-num">12</span></div>
    <div class="toc-item toc-sub">Opening/Closing Shifts, Payouts, EOD Reports</div>
  </div>

  <div class="toc-section">
    <div class="toc-item"><span class="toc-num">12.</span> Reports<span class="toc-dots"></span><span class="toc-page-num">13</span></div>
    <div class="toc-item toc-sub">Summary, Hourly Sales, CSV Export</div>
  </div>

  <div class="toc-section">
    <div class="toc-item"><span class="toc-num">13.</span> Accounting Module<span class="toc-dots"></span><span class="toc-page-num">13</span></div>
    <div class="toc-item toc-sub">Chart of Accounts, Journal Entries, P&amp;L, Balance Sheet, Stock Counts, QuickBooks</div>
  </div>

  <div class="toc-section">
    <div class="toc-item"><span class="toc-num">14.</span> Customer Menu &amp; Online Ordering<span class="toc-dots"></span><span class="toc-page-num">15</span></div>
    <div class="toc-item toc-sub">QR Code, Kiosk Mode, Online Orders</div>
  </div>

  <div class="toc-section">
    <div class="toc-item"><span class="toc-num">15.</span> Customer Display<span class="toc-dots"></span><span class="toc-page-num">16</span></div>
    <div class="toc-item toc-sub">Second-screen Setup, Live Order Feed</div>
  </div>

  <div class="toc-section">
    <div class="toc-item"><span class="toc-num">16.</span> Accounts Receivable (AR)<span class="toc-dots"></span><span class="toc-page-num">16</span></div>
    <div class="toc-item toc-sub">Credit Sales, Invoices, Payments</div>
  </div>

  <div class="toc-section">
    <div class="toc-item"><span class="toc-num">17.</span> Ingredients &amp; Production<span class="toc-dots"></span><span class="toc-page-num">17</span></div>
    <div class="toc-item toc-sub">Ingredients, Recipes, Production Runs</div>
  </div>

  <div class="toc-section">
    <div class="toc-item"><span class="toc-num">18.</span> Settings<span class="toc-dots"></span><span class="toc-page-num">17</span></div>
    <div class="toc-item toc-sub">Business Info, Receipt Settings, Email, QR Codes</div>
  </div>

  <div class="toc-section">
    <div class="toc-item"><span class="toc-num">19.</span> Subscription &amp; Plans<span class="toc-dots"></span><span class="toc-page-num">18</span></div>
    <div class="toc-item toc-sub">Plan Comparison, Payments, Upgrades</div>
  </div>

  <div class="toc-section">
    <div class="toc-item"><span class="toc-num">20.</span> Reseller Portal<span class="toc-dots"></span><span class="toc-page-num">18</span></div>
    <div class="toc-item toc-sub">Referrals, Commissions, Payouts</div>
  </div>

  <div class="toc-section">
    <div class="toc-item"><span class="toc-num">App.</span> Role Permissions Reference<span class="toc-dots"></span><span class="toc-page-num">19</span></div>
  </div>
</div>


<!-- ══════════════════════════════════════════════ 1. GETTING STARTED ═══ -->
<div class="section-header">
  <div class="section-number">Chapter 1</div>
  <h1>Getting Started</h1>
</div>

<h2>1.1 System Requirements</h2>
<ul>
  <li><strong>Device:</strong> iPad, Android tablet (10"+), or any desktop/laptop browser</li>
  <li><strong>Browser:</strong> Chrome 110+, Edge 110+, Safari 16+, Firefox 110+</li>
  <li><strong>Internet:</strong> Required for cloud sync; offline mode supported for POS sales</li>
  <li><strong>Receipt Printer:</strong> Any network or USB thermal printer supported by your OS; Bluetooth printing via browser supported</li>
  <li><strong>Screen:</strong> 1024 × 768 px minimum; 1280 × 800 optimised (landscape preferred for POS)</li>
</ul>

<div class="callout callout-tip">
  <strong>Pro Tip — Install as PWA</strong>
  Open NEXXUS POS in Chrome or Edge on your tablet, tap the browser menu and choose <em>Add to Home Screen</em>. The app installs as a full-screen app with offline support and no browser chrome.
</div>

<h2>1.2 Signing Up — The Onboarding Wizard</h2>
<p>Navigate to <strong>/app/signup</strong> to begin the 5-step onboarding wizard:</p>

<table>
  <tr><th>Step</th><th>What you enter</th></tr>
  <tr><td><strong>1 — Account</strong></td><td>Your name, email, password</td></tr>
  <tr><td><strong>2 — Business</strong></td><td>Business name, phone, address, tax number, currency (JMD default)</td></tr>
  <tr><td><strong>3 — Plan</strong></td><td>Choose Starter, Professional, or Enterprise</td></tr>
  <tr><td><strong>4 — Payment</strong></td><td>Pay via PayPal or credit card (PowerTranz)</td></tr>
  <tr><td><strong>5 — Launch</strong></td><td>Review summary and launch your dashboard</td></tr>
</table>

<h2>1.3 Logging In</h2>
<p>Go to <strong>/app/login</strong> and enter your email and password. A successful login takes you to the Dashboard. From there you can select a staff profile via PIN to begin a session.</p>

<div class="callout callout-warn">
  <strong>Session Tip</strong>
  Your tenant session persists in the browser. Staff PIN sessions are stored only for the current browser tab (sessionStorage) — closing the tab logs out the staff member but keeps the tenant logged in.
</div>


<!-- ═══════════════════════════════════════════════════ 2. DASHBOARD ═══ -->
<div class="section-header">
  <div class="section-number">Chapter 2</div>
  <h1>Dashboard</h1>
</div>

<p>The Dashboard gives you an at-a-glance view of your business health using live data from today's and recent activity.</p>

<h2>2.1 KPI Cards</h2>
<ul>
  <li><strong>Today's Revenue</strong> — Total of all completed orders today</li>
  <li><strong>Orders Today</strong> — Count of completed orders</li>
  <li><strong>Average Order Value</strong> — Revenue ÷ Orders</li>
  <li><strong>Top Product</strong> — Best-selling item by revenue today</li>
</ul>

<h2>2.2 Charts</h2>
<ul>
  <li><strong>7-day Revenue Trend</strong> — Area chart showing daily revenue for the past week</li>
  <li><strong>Sales by Category</strong> — Pie / donut chart breaking down revenue by product category</li>
  <li><strong>Payment Methods</strong> — Breakdown of Cash / Card / Online / Loyalty payments</li>
  <li><strong>Top Products</strong> — Bar chart ranking your top 5 products by revenue</li>
</ul>

<h2>2.3 Low-Stock Alerts</h2>
<p>Products at or below the stock threshold (default: 10 units) appear in a highlighted panel. Click a product to go directly to its edit form.</p>

<h2>2.4 Recent Orders Feed</h2>
<p>The last 10 orders are shown with timestamp, order total, payment method, and status badge.</p>


<!-- ══════════════════════════════════════════════════════ 3. POS ════ -->
<div class="section-header">
  <div class="section-number">Chapter 3</div>
  <h1>Point of Sale (POS)</h1>
</div>

<h2>3.1 Starting a Sale</h2>
<div class="steps">
  <div class="step"><span class="step-num">1</span><div class="step-body">Navigate to <strong>POS</strong> from the sidebar. Enter the staff PIN when prompted.</div></div>
  <div class="step"><span class="step-num">2</span><div class="step-body">Browse the product grid or use the <strong>search bar</strong> to find items by name or barcode.</div></div>
  <div class="step"><span class="step-num">3</span><div class="step-body">Tap a product to add it to the cart. Tap again to increase quantity, or use the +/− buttons on the cart line.</div></div>
  <div class="step"><span class="step-num">4</span><div class="step-body">If a product has <strong>variants</strong> (e.g. size, colour) or <strong>modifiers</strong> (e.g. add-ons), a dialog opens for the customer to choose. Select options then tap <strong>Add to Cart</strong>.</div></div>
  <div class="step"><span class="step-num">5</span><div class="step-body">Tap <strong>Charge</strong> when the order is ready.</div></div>
</div>

<h2>3.2 Product Search &amp; Barcode Scanning</h2>
<p>Type in the search bar to instantly filter products. Hold a USB or Bluetooth barcode scanner to the field and scan — the matching product is added to the cart automatically.</p>

<h2>3.3 Category Filters</h2>
<p>Tap a category chip above the product grid to show only that category. Tap <strong>All</strong> to clear the filter.</p>

<h2>3.4 Discounts</h2>
<table>
  <tr><th>Type</th><th>How to Apply</th><th>Required Role</th></tr>
  <tr><td>Line-item %</td><td>Tap the discount icon on a cart line item</td><td>Cashier+</td></tr>
  <tr><td>Order % discount</td><td>Tap <strong>Discount</strong> in the cart header</td><td>Manager+ (override PIN)</td></tr>
  <tr><td>Fixed amount</td><td>Toggle to "Fixed" in the discount dialog</td><td>Manager+ (override PIN)</td></tr>
  <tr><td>Loyalty redemption</td><td>Select a customer → <strong>Redeem Points</strong></td><td>Cashier+</td></tr>
</table>

<div class="callout callout-warn">
  <strong>Manager Override</strong>
  Discounts above the cashier threshold require a manager or admin PIN. The system will prompt for it automatically.
</div>

<h2>3.5 Selecting a Customer</h2>
<p>Tap <strong>Add Customer</strong> in the cart. Search by name or phone number. Selecting a customer enables loyalty point tracking and allows redemption at checkout.</p>

<h2>3.6 Loyalty Points</h2>
<ul>
  <li><strong>Earn rate:</strong> 1 point per $10 JMD spent (automatically awarded on order completion)</li>
  <li><strong>Redeem rate:</strong> 100 points = $1.00 JMD discount</li>
  <li>To redeem, tap <strong>Redeem Points</strong> after selecting a customer, enter the amount of points to use, and confirm</li>
</ul>

<h2>3.7 Order Types</h2>
<ul>
  <li><span class="badge badge-blue">Counter</span> — Default; walk-in over-the-counter sales</li>
  <li><span class="badge badge-green">Dine-in</span> — Links the order to a restaurant table (see Chapter 5)</li>
  <li><span class="badge badge-amber">Takeout</span> — Walk-in but for collection; shows on KDS</li>
</ul>

<h2>3.8 Order Notes</h2>
<p>Tap the <strong>Notes</strong> icon to attach a free-text note to the order (e.g. "extra sauce"). Notes appear on the kitchen display and the receipt.</p>

<h2>3.9 Hold &amp; Recall</h2>
<p>Tap <strong>Hold</strong> to save the current cart temporarily. Use <strong>Recall</strong> to restore any held order. Multiple orders can be held simultaneously. Held orders persist until recalled or discarded.</p>

<h2>3.10 Payment &amp; Checkout</h2>
<p>After tapping <strong>Charge</strong>, select one or more payment methods:</p>
<table>
  <tr><th>Method</th><th>Notes</th></tr>
  <tr><td><strong>Cash</strong></td><td>Enter amount tendered; change is calculated automatically</td></tr>
  <tr><td><strong>Card</strong></td><td>Process on your card terminal; record the amount in NEXXUS</td></tr>
  <tr><td><strong>Online / Transfer</strong></td><td>Record bank transfer or online payment reference</td></tr>
  <tr><td><strong>Loyalty</strong></td><td>Deducted from customer points balance</td></tr>
  <tr><td><strong>Split</strong></td><td>Combine any two methods (e.g. part cash / part card)</td></tr>
</table>

<h2>3.11 Receipts</h2>
<p>After completing a payment, the receipt modal appears. Options:</p>
<ul>
  <li><strong>Print</strong> — Sends to the default thermal printer via the browser print dialog</li>
  <li><strong>WhatsApp</strong> — Opens a pre-filled WhatsApp message with receipt text to share with the customer</li>
  <li><strong>Email</strong> — Sends the receipt via ZeptoMail to the customer's email on file</li>
  <li><strong>Close</strong> — Dismiss and start the next sale</li>
</ul>


<!-- ════════════════════════════════════════════════════ 4. ORDERS ════ -->
<div class="section-header">
  <div class="section-number">Chapter 4</div>
  <h1>Orders</h1>
</div>

<p>The Orders screen shows the full history of all transactions for your business.</p>

<h2>4.1 Filtering Orders</h2>
<p>Use the status tabs — <span class="badge badge-green">Completed</span>, <span class="badge badge-amber">Pending</span>, <span class="badge badge-red">Voided</span> — to filter the list. Use the date picker to select a custom range.</p>

<h2>4.2 Viewing an Order</h2>
<p>Click any order row to expand its details: line items with quantities and prices, payment method, staff member, customer (if any), discount applied, and notes.</p>

<h2>4.3 Void &amp; Refund</h2>
<ul>
  <li><strong>Void:</strong> Cancels an order and reverses stock deductions. Requires Manager or Admin role.</li>
  <li><strong>Refund:</strong> Records a cash or card refund against a completed order. Logged as a separate transaction.</li>
</ul>

<div class="callout callout-danger">
  <strong>Void is Permanent</strong>
  Voided orders cannot be restored. Always confirm before voiding.
</div>


<!-- ══════════════════════════════════════════════════ 5. TABLES ════ -->
<div class="section-header">
  <div class="section-number">Chapter 5</div>
  <h1>Tables (Restaurant Mode)</h1>
</div>

<p>The Tables module provides a visual floor plan for restaurants and cafés with table-based ordering.</p>

<h2>5.1 Setting Up Tables</h2>
<div class="steps">
  <div class="step"><span class="step-num">1</span><div class="step-body">Go to <strong>Tables</strong> in the sidebar.</div></div>
  <div class="step"><span class="step-num">2</span><div class="step-body">Tap <strong>Add Table</strong>. Enter a name (e.g. "Table 1"), capacity, and choose a colour.</div></div>
  <div class="step"><span class="step-num">3</span><div class="step-body">Drag tables to arrange them on the floor plan. Tap a table shape to edit or delete it.</div></div>
</div>

<h2>5.2 Table Statuses</h2>
<ul>
  <li><span class="badge badge-green">Available</span> — No active order</li>
  <li><span class="badge badge-red">Occupied</span> — Has a live in-progress order linked to it</li>
  <li><span class="badge badge-amber">Reserved</span> — Manually marked as reserved</li>
</ul>

<h2>5.3 Opening a Dine-in Order</h2>
<p>Tap an available table → tap <strong>Open Order</strong>. This takes you to the POS with the order type set to Dine-in and the table linked. Multiple orders can run on the same table (e.g. if you split the bill).</p>


<!-- ════════════════════════════════════════════════ 6. KITCHEN ════ -->
<div class="section-header">
  <div class="section-number">Chapter 6</div>
  <h1>Kitchen Display (KDS)</h1>
</div>

<p>The Kitchen Display System gives your kitchen staff real-time visibility of incoming orders without paper tickets.</p>

<h2>6.1 The Kanban Board</h2>
<p>Orders are shown in three columns:</p>
<ul>
  <li><span class="badge badge-amber">Pending</span> — Just placed, not yet acknowledged</li>
  <li><span class="badge badge-blue">Preparing</span> — Kitchen is working on it</li>
  <li><span class="badge badge-green">Ready</span> — Done, waiting for pick-up or table service</li>
</ul>

<h2>6.2 Advancing an Order</h2>
<p>Tap the <strong>→ Next Status</strong> button on an order card to move it to the next column. Orders in <em>Ready</em> are automatically removed from the board when marked as completed at the POS.</p>

<p>The KDS auto-refreshes every 15 seconds. A chime sounds when a new order appears.</p>


<!-- ═══════════════════════════════════════════════ 7. PRODUCTS ════ -->
<div class="section-header">
  <div class="section-number">Chapter 7</div>
  <h1>Products &amp; Inventory</h1>
</div>

<h2>7.1 Adding a Product</h2>
<div class="steps">
  <div class="step"><span class="step-num">1</span><div class="step-body">Go to <strong>Products</strong> → tap <strong>Add Product</strong>.</div></div>
  <div class="step"><span class="step-num">2</span><div class="step-body">Enter the product name, category, price (JMD), and optionally a barcode, cost price, and stock count.</div></div>
  <div class="step"><span class="step-num">3</span><div class="step-body">Toggle <strong>Has Variants</strong> (e.g. Small / Medium / Large) or <strong>Has Modifiers</strong> (e.g. Extra Cheese +$150) if needed.</div></div>
  <div class="step"><span class="step-num">4</span><div class="step-body">Add your variant groups and options, each with an optional price adjustment.</div></div>
  <div class="step"><span class="step-num">5</span><div class="step-body">Tap <strong>Save</strong>.</div></div>
</div>

<h2>7.2 Variants vs Modifiers</h2>
<table>
  <tr><th></th><th>Variants</th><th>Modifiers</th></tr>
  <tr><td><strong>Purpose</strong></td><td>Different versions of the same product</td><td>Optional add-ons or customisations</td></tr>
  <tr><td><strong>Selection</strong></td><td>Customer must pick exactly one per group</td><td>Customer can pick zero or more</td></tr>
  <tr><td><strong>Example</strong></td><td>Size: Small / Medium / Large</td><td>Add-ons: Extra cheese, No onion</td></tr>
</table>

<h2>7.3 Managing Stock</h2>
<ul>
  <li><strong>Stock Count:</strong> Set on the product form. Auto-decrements on every sale.</li>
  <li><strong>Low-stock threshold:</strong> Default 10 units; shown as an alert on the Dashboard.</li>
  <li><strong>Mark Out of Stock:</strong> Toggle the <em>In Stock</em> switch to hide the product from the POS grid without deleting it.</li>
  <li><strong>Stock Purchases:</strong> Record a stock purchase (Accounting → Inventory → Purchases) to increment the count.</li>
</ul>

<h2>7.4 Stock Adjustments</h2>
<p>Go to <strong>Accounting → Inventory → Stock Adjustments</strong> to manually adjust a product's stock count up or down with a reason code. An optional journal entry is created automatically.</p>

<h2>7.5 Stock Counts (Physical Count)</h2>
<ol>
  <li>Go to <strong>Accounting → Inventory → Stock Count</strong> and tap <strong>New Count</strong>. The system snapshots all current stock levels.</li>
  <li>Physically count each product and enter the physical quantity in the count sheet.</li>
  <li>Review discrepancies (system vs physical) highlighted in red.</li>
  <li>Tap <strong>Apply Count</strong> to update stock levels to match your physical count. A journal entry records the variance.</li>
</ol>


<!-- ════════════════════════════════════════════ 8. CUSTOMERS ════ -->
<div class="section-header">
  <div class="section-number">Chapter 8</div>
  <h1>Customers &amp; Loyalty</h1>
</div>

<h2>8.1 Customer Profiles</h2>
<p>Go to <strong>Customers</strong> to manage your customer database. Each profile stores:</p>
<ul>
  <li>Name, email, phone number</li>
  <li>Total spent, number of orders</li>
  <li>Loyalty points balance</li>
  <li>Full order history</li>
</ul>

<h2>8.2 Adding a Customer</h2>
<p>Tap <strong>Add Customer</strong>, enter name, email, and/or phone. The customer is now selectable at the POS.</p>

<h2>8.3 Loyalty Programme</h2>
<table>
  <tr><th>Action</th><th>Details</th></tr>
  <tr><td>Earn points</td><td>1 point per $10 JMD spent; awarded automatically on order completion</td></tr>
  <tr><td>Redeem points</td><td>100 points = $1.00 JMD off the order total</td></tr>
  <tr><td>View balance</td><td>Shown on the customer profile and at POS checkout</td></tr>
  <tr><td>Manual adjustment</td><td>Admins can edit the points balance on the customer profile page</td></tr>
</table>


<!-- ═══════════════════════════════════════════════ 9. STAFF ════ -->
<div class="section-header">
  <div class="section-number">Chapter 9</div>
  <h1>Staff Management</h1>
</div>

<h2>9.1 Staff Roles</h2>
<table>
  <tr><th>Role</th><th>Access Level</th></tr>
  <tr><td><span class="badge badge-red">Admin</span></td><td>Full access — settings, staff, accounting, reports, voids, discounts</td></tr>
  <tr><td><span class="badge badge-blue">Manager</span></td><td>All POS functions, discount overrides, staff view, reports, void orders</td></tr>
  <tr><td><span class="badge badge-green">Cashier</span></td><td>POS, orders (view own), customers, basic reports</td></tr>
  <tr><td><span class="badge badge-purple">Kitchen</span></td><td>Kitchen Display only</td></tr>
</table>

<h2>9.2 Adding a Staff Member</h2>
<div class="steps">
  <div class="step"><span class="step-num">1</span><div class="step-body">Go to <strong>Staff</strong> → tap <strong>Add Staff</strong>.</div></div>
  <div class="step"><span class="step-num">2</span><div class="step-body">Enter the staff member's name and role.</div></div>
  <div class="step"><span class="step-num">3</span><div class="step-body">Set a 4–6 digit PIN. This PIN is used to authenticate at the POS.</div></div>
  <div class="step"><span class="step-num">4</span><div class="step-body">Assign the staff member to one or more branches (Locations).</div></div>
  <div class="step"><span class="step-num">5</span><div class="step-body">Tap <strong>Save</strong>.</div></div>
</div>

<h2>9.3 PIN Authentication</h2>
<p>When launching the POS, staff select their name from a list and enter their PIN. The session is stored for that browser tab only. If a manager-level action is required (e.g. a discount override), a second PIN prompt appears.</p>

<h2>9.4 Deactivating Staff</h2>
<p>Tap a staff member → toggle <strong>Active</strong> to deactivate them. Deactivated staff cannot log in but their historical data is preserved.</p>


<!-- ══════════════════════════════════════════ 10. LOCATIONS ════ -->
<div class="section-header">
  <div class="section-number">Chapter 10</div>
  <h1>Locations / Branches</h1>
</div>

<p>NEXXUS POS supports multiple business locations under one account. Each location has its own inventory and can be staffed independently.</p>

<h2>10.1 Creating a Location</h2>
<p>Go to <strong>Locations</strong> → tap <strong>Add Location</strong>. Enter the branch name, address, and phone. Tap <strong>Save</strong>.</p>

<h2>10.2 Per-branch Inventory</h2>
<p>Each branch maintains its own stock levels. After creating a location, tap <strong>Initialise Inventory</strong> to seed it with all your products at zero stock. Then record purchases or transfers to build up stock.</p>

<h2>10.3 Stock Transfers</h2>
<div class="steps">
  <div class="step"><span class="step-num">1</span><div class="step-body">Go to <strong>Locations</strong> → select the source branch → tap <strong>Transfer Stock</strong>.</div></div>
  <div class="step"><span class="step-num">2</span><div class="step-body">Choose the destination branch, product, and quantity.</div></div>
  <div class="step"><span class="step-num">3</span><div class="step-body">Confirm — stock is deducted from the source and added to the destination instantly.</div></div>
</div>

<p>All transfers are logged in the Transfer History with timestamp, user, and quantity.</p>


<!-- ══════════════════════════════════════════════ 11. CASH ════ -->
<div class="section-header">
  <div class="section-number">Chapter 11</div>
  <h1>Cash Management</h1>
</div>

<p>Track your cash drawer from opening to closing with full shift reconciliation.</p>

<h2>11.1 Opening a Shift</h2>
<div class="steps">
  <div class="step"><span class="step-num">1</span><div class="step-body">Go to <strong>Cash Management</strong>.</div></div>
  <div class="step"><span class="step-num">2</span><div class="step-body">Tap <strong>Open Shift</strong> and enter the opening cash amount (float in the drawer).</div></div>
  <div class="step"><span class="step-num">3</span><div class="step-body">Confirm. The shift timer starts.</div></div>
</div>

<h2>11.2 Mid-shift Payouts</h2>
<p>To record cash removed from the drawer during the shift (e.g. petty cash, banking), tap <strong>Record Payout</strong>. Enter the amount and reason. This is deducted from the expected closing balance.</p>

<h2>11.3 Closing a Shift</h2>
<div class="steps">
  <div class="step"><span class="step-num">1</span><div class="step-body">Tap <strong>Close Shift</strong>.</div></div>
  <div class="step"><span class="step-num">2</span><div class="step-body">Count the cash in the drawer and enter the <strong>Closing Cash</strong> amount.</div></div>
  <div class="step"><span class="step-num">3</span><div class="step-body">Review the reconciliation: Opening + Cash Sales − Payouts = Expected. Any variance (over/short) is highlighted.</div></div>
  <div class="step"><span class="step-num">4</span><div class="step-body">Tap <strong>Confirm &amp; Close</strong>.</div></div>
</div>

<h2>11.4 End-of-Day Reports</h2>
<p>After closing a shift, tap <strong>EOD Report</strong> to view or print the shift summary. Two print options:</p>
<ul>
  <li><strong>Print Summary</strong> — Totals only (cash, card, online, loyalty)</li>
  <li><strong>Print with Sales Detail</strong> — Summary plus all individual orders</li>
</ul>


<!-- ═══════════════════════════════════════════ 12. REPORTS ════ -->
<div class="section-header">
  <div class="section-number">Chapter 12</div>
  <h1>Reports</h1>
</div>

<h2>12.1 Summary Report</h2>
<p>Select a date range (or use a preset: Today / This Week / This Month / Last Month / Custom). The report shows:</p>
<ul>
  <li>Total Revenue, Total Orders, Average Order Value</li>
  <li>Top Product of the period</li>
  <li>Revenue by payment method</li>
</ul>

<h2>12.2 Hourly Sales Chart</h2>
<p>Pick a specific date to see revenue broken down by hour of the day. Useful for identifying peak trading hours.</p>

<h2>12.3 CSV Export</h2>
<p>Tap <strong>Export CSV</strong> to download all orders for the selected date range as a spreadsheet-compatible file. Each row includes order ID, date/time, items, total, payment method, staff, and customer.</p>


<!-- ═══════════════════════════════════════ 13. ACCOUNTING ════ -->
<div class="section-header">
  <div class="section-number">Chapter 13</div>
  <h1>Accounting Module</h1>
</div>

<p>NEXXUS POS includes a full double-entry accounting system tailored for small businesses.</p>

<h2>13.1 Overview Tab</h2>
<p>Shows KPI cards for Revenue, Expenses, Net Income, and Tax Collected for the selected period (Week / Month / Year).</p>

<h2>13.2 Chart of Accounts</h2>
<p>22 default accounts are seeded automatically covering Assets, Liabilities, Equity, Revenue, and Expenses. You can:</p>
<ul>
  <li>Create new accounts with a code, name, and type</li>
  <li>Edit existing accounts</li>
  <li>Deactivate accounts that are no longer needed</li>
  <li>Filter by account type using the tabs</li>
</ul>

<h2>13.3 Journal Entries</h2>
<p>Record manual double-entry transactions (e.g. depreciation, accruals).</p>
<div class="steps">
  <div class="step"><span class="step-num">1</span><div class="step-body">Tap <strong>New Entry</strong>. Enter a date and description.</div></div>
  <div class="step"><span class="step-num">2</span><div class="step-body">Add debit and credit lines using your chart of accounts. Total debits must equal total credits.</div></div>
  <div class="step"><span class="step-num">3</span><div class="step-body">Tap <strong>Post</strong> to save.</div></div>
</div>

<div class="callout callout-tip">
  <strong>Auto-entries</strong>
  NEXXUS POS automatically creates journal entries for every sale, stock adjustment, and stock count discrepancy. You rarely need to enter these manually.
</div>

<h2>13.4 Financial Reports</h2>
<table>
  <tr><th>Report</th><th>What it shows</th></tr>
  <tr><td><strong>Profit &amp; Loss</strong></td><td>Revenue minus expenses for a date range</td></tr>
  <tr><td><strong>Balance Sheet</strong></td><td>Assets, liabilities, and equity as at a specific date</td></tr>
  <tr><td><strong>Trial Balance</strong></td><td>All account balances (debits and credits) as at a date</td></tr>
</table>
<p>All reports support custom date ranges and can be printed from the browser.</p>

<h2>13.5 QuickBooks Integration</h2>
<div class="steps">
  <div class="step"><span class="step-num">1</span><div class="step-body">Go to <strong>Accounting → QuickBooks</strong> tab.</div></div>
  <div class="step"><span class="step-num">2</span><div class="step-body">Tap <strong>Connect to QuickBooks</strong>. You will be redirected to QuickBooks for OAuth authorisation.</div></div>
  <div class="step"><span class="step-num">3</span><div class="step-body">Once connected, tap <strong>Sync Orders</strong> to push recent POS sales to QuickBooks as Sales Receipts.</div></div>
  <div class="step"><span class="step-num">4</span><div class="step-body">To disconnect, tap <strong>Disconnect</strong>.</div></div>
</div>

<div class="callout callout-warn">
  <strong>Requires QuickBooks Online</strong>
  The integration works with QuickBooks Online only (not Desktop). Admin credentials for <code>QUICKBOOKS_CLIENT_ID</code> and <code>QUICKBOOKS_CLIENT_SECRET</code> must be configured by your system administrator.
</div>


<!-- ════════════════════════════════════════════════ 14. MENU ════ -->
<div class="section-header">
  <div class="section-number">Chapter 14</div>
  <h1>Customer Menu &amp; Online Ordering</h1>
</div>

<p>Share a branded digital menu with your customers for online browsing or kiosk self-ordering.</p>

<h2>14.1 Accessing Your Menu URL</h2>
<p>Go to <strong>Settings → QR Codes</strong>. Your unique menu URL is displayed in three modes:</p>
<ul>
  <li><strong>View Menu</strong> — Browse only, no ordering</li>
  <li><strong>Online Order</strong> — Full ordering for delivery or collection</li>
  <li><strong>Kiosk Mode</strong> — Self-service ordering for an in-store tablet</li>
</ul>
<p>Each mode has a downloadable QR code (SVG format, print-ready).</p>

<h2>14.2 Customer Experience</h2>
<ol>
  <li>Customer scans QR or opens the link</li>
  <li>Browses menu by category, searches products</li>
  <li>Adds items to cart, customises variants and modifiers</li>
  <li>Proceeds to checkout, enters name and contact details</li>
  <li>Order is received instantly in your POS Orders screen and on the Kitchen Display</li>
</ol>

<h2>14.3 Kiosk Mode</h2>
<p>Mount a tablet at your counter, open the kiosk URL in full-screen mode. Customers self-order; the order goes directly to the kitchen. Payment is collected at the counter.</p>


<!-- ══════════════════════════════════════ 15. CUSTOMER DISPLAY ════ -->
<div class="section-header">
  <div class="section-number">Chapter 15</div>
  <h1>Customer Display</h1>
</div>

<p>Show customers a live view of their order total on a second screen facing them.</p>

<h2>15.1 Setup</h2>
<ol>
  <li>Connect a second monitor or TV to your POS terminal, or use a second device (tablet/monitor).</li>
  <li>Open the URL <strong>/customer-display</strong> in a browser on the second screen.</li>
  <li>Set the browser to full-screen (F11).</li>
</ol>
<p>The display automatically listens for POS activity on the same network. When a sale is in progress, the customer sees a live itemised list and running total.</p>

<h2>15.2 What Customers See</h2>
<ul>
  <li>Business logo and name</li>
  <li>Itemised cart with product names, quantities, and prices</li>
  <li>Subtotal, discounts, tax, and grand total</li>
  <li>Payment confirmation screen after checkout</li>
  <li>Idle branded screen between transactions</li>
</ul>


<!-- ══════════════════════════════════════════════ 16. AR ════ -->
<div class="section-header">
  <div class="section-number">Chapter 16</div>
  <h1>Accounts Receivable (AR)</h1>
</div>

<p>Track credit sales and outstanding customer balances.</p>

<h2>16.1 Creating a Credit Sale</h2>
<p>At the POS checkout, select <strong>Credit / On Account</strong> as the payment method (requires a customer to be attached to the order). The order completes and the balance is logged as a receivable.</p>

<h2>16.2 AR Dashboard</h2>
<p>Go to <strong>AR</strong> in the sidebar to see:</p>
<ul>
  <li>Total outstanding balance across all customers</li>
  <li>List of open invoices with customer, amount, due date, and aging</li>
  <li>Overdue invoices highlighted in red</li>
</ul>

<h2>16.3 Recording a Payment</h2>
<p>Tap an invoice → tap <strong>Record Payment</strong>. Enter the amount received and payment method. Partial payments are supported; the remaining balance is tracked.</p>


<!-- ══════════════════════════════════ 17. INGREDIENTS & PRODUCTION ════ -->
<div class="section-header">
  <div class="section-number">Chapter 17</div>
  <h1>Ingredients &amp; Production</h1>
</div>

<p>Manage raw ingredient stock and track production of finished goods from recipes.</p>

<h2>17.1 Ingredients</h2>
<p>Go to <strong>Ingredients</strong> to manage your ingredient list. Each ingredient has a name, unit of measure (kg, litre, each, etc.), current stock level, and reorder threshold.</p>

<h2>17.2 Recipes</h2>
<p>Go to <strong>Recipes</strong> to link a product to a list of ingredients and quantities. When a production run is recorded, ingredient stock is automatically deducted.</p>

<h2>17.3 Production Runs</h2>
<div class="steps">
  <div class="step"><span class="step-num">1</span><div class="step-body">Go to <strong>Production</strong> → tap <strong>New Production Run</strong>.</div></div>
  <div class="step"><span class="step-num">2</span><div class="step-body">Select the recipe (product) and the quantity produced.</div></div>
  <div class="step"><span class="step-num">3</span><div class="step-body">Confirm — ingredient stock is deducted according to the recipe, and the product's stock count is increased by the produced quantity.</div></div>
</div>


<!-- ═══════════════════════════════════════════ 18. SETTINGS ════ -->
<div class="section-header">
  <div class="section-number">Chapter 18</div>
  <h1>Settings</h1>
</div>

<h2>18.1 Business Information</h2>
<p>Go to <strong>Settings → Business Info</strong> to update:</p>
<ul>
  <li>Business name, address, phone, email, website</li>
  <li>Tax number / TRN</li>
  <li>Currency (defaults to JMD)</li>
  <li>Tax rate (default: 10%)</li>
  <li>Logo upload</li>
</ul>

<h2>18.2 Receipt Settings</h2>
<ul>
  <li>Custom receipt header and footer messages</li>
  <li>Toggle to show/hide tax breakdown on receipt</li>
  <li>Toggle to show loyalty points balance on receipt</li>
  <li>Choose thermal receipt format (58mm or 80mm)</li>
</ul>

<h2>18.3 Email Provider</h2>
<p>NEXXUS POS uses <strong>ZeptoMail</strong> to send email receipts. The system is pre-configured with the domain <code>microbookspos.com</code>. No additional setup is required for the default sender.</p>

<h2>18.4 QR Codes</h2>
<p>The Settings → QR Codes section generates print-ready SVG QR codes for:</p>
<ul>
  <li>Menu / Browse only</li>
  <li>Online order link</li>
  <li>Kiosk mode link</li>
  <li>Customer Display URL (for a second screen)</li>
</ul>


<!-- ══════════════════════════════════════ 19. SUBSCRIPTION ════ -->
<div class="section-header">
  <div class="section-number">Chapter 19</div>
  <h1>Subscription &amp; Plans</h1>
</div>

<h2>19.1 Plan Comparison</h2>
<table>
  <tr><th>Feature</th><th>Starter<br/>$29/mo</th><th>Professional<br/>$79/mo</th><th>Enterprise<br/>$199/mo</th></tr>
  <tr><td>Staff accounts</td><td>5</td><td>15</td><td>Unlimited</td></tr>
  <tr><td>Products</td><td>100</td><td>500</td><td>Unlimited</td></tr>
  <tr><td>Locations</td><td>1</td><td>3</td><td>Unlimited</td></tr>
  <tr><td>Online ordering</td><td>✓</td><td>✓</td><td>✓</td></tr>
  <tr><td>Accounting module</td><td>—</td><td>✓</td><td>✓</td></tr>
  <tr><td>QuickBooks sync</td><td>—</td><td>✓</td><td>✓</td></tr>
  <tr><td>Annual discount</td><td>Save $58/yr</td><td>Save $158/yr</td><td>Save $398/yr</td></tr>
</table>

<h2>19.2 Upgrading or Changing Plans</h2>
<p>Go to <strong>Subscription</strong> in the sidebar. Select your new plan and complete payment via PayPal or credit card. The new plan activates immediately.</p>

<h2>19.3 Payment Methods Accepted</h2>
<ul>
  <li><strong>PayPal</strong> — PayPal account or any card via PayPal guest checkout</li>
  <li><strong>Credit / Debit Card</strong> — Via PowerTranz (Visa, Mastercard, AMEX accepted)</li>
</ul>


<!-- ══════════════════════════════════════ 20. RESELLER PORTAL ════ -->
<div class="section-header">
  <div class="section-number">Chapter 20</div>
  <h1>Reseller Portal</h1>
</div>

<p>The NEXXUS POS Reseller Programme lets partners earn recurring commissions by referring businesses to the platform.</p>

<h2>20.1 Joining as a Reseller</h2>
<p>Go to <strong>/reseller/signup</strong> and complete the registration form. Once approved, you receive a unique referral code (e.g. <code>ACME-X4K7PQ</code>).</p>

<h2>20.2 Sharing Your Referral Code</h2>
<p>Direct prospects to <strong>/app/signup?ref=YOUR_CODE</strong>. When they subscribe, the referral is automatically attributed to you.</p>

<h2>20.3 Commissions</h2>
<ul>
  <li><strong>Default rate:</strong> 30% of every monthly subscription payment made by your referred businesses</li>
  <li>Commissions are generated automatically when a referred business pays</li>
  <li>View all commissions in the <strong>Commissions</strong> tab of the portal</li>
</ul>

<h2>20.4 Requesting a Payout</h2>
<p>Once you have accumulated pending commissions, go to the <strong>Payouts</strong> tab and tap <strong>Request Payout</strong>. This bundles all pending commissions into a single payout request. Payments are processed within 5 business days.</p>

<h2>20.5 Dashboard Overview</h2>
<ul>
  <li>Total referrals and active referrals</li>
  <li>Lifetime earnings</li>
  <li>This month's earnings</li>
  <li>Pending payout balance</li>
  <li>Monthly earnings chart</li>
</ul>


<!-- ══════════════════════════════════════ APPENDIX ════ -->
<div class="section-header">
  <div class="section-number">Appendix</div>
  <h1>Role Permissions Reference</h1>
</div>

<table>
  <tr>
    <th>Feature</th>
    <th>Kitchen</th>
    <th>Cashier</th>
    <th>Manager</th>
    <th>Admin</th>
  </tr>
  <tr>
    <td>Make a sale (POS)</td>
    <td class="role-no">—</td>
    <td class="role-yes">✓</td>
    <td class="role-yes">✓</td>
    <td class="role-yes">✓</td>
  </tr>
  <tr>
    <td>Apply discount (cashier level)</td>
    <td class="role-no">—</td>
    <td class="role-yes">✓</td>
    <td class="role-yes">✓</td>
    <td class="role-yes">✓</td>
  </tr>
  <tr>
    <td>Apply manager discount/override</td>
    <td class="role-no">—</td>
    <td class="role-no">PIN needed</td>
    <td class="role-yes">✓</td>
    <td class="role-yes">✓</td>
  </tr>
  <tr>
    <td>View orders</td>
    <td class="role-no">—</td>
    <td class="role-yes">✓ (own)</td>
    <td class="role-yes">✓ (all)</td>
    <td class="role-yes">✓</td>
  </tr>
  <tr>
    <td>Void / refund order</td>
    <td class="role-no">—</td>
    <td class="role-no">—</td>
    <td class="role-yes">✓</td>
    <td class="role-yes">✓</td>
  </tr>
  <tr>
    <td>Kitchen Display</td>
    <td class="role-yes">✓</td>
    <td class="role-yes">✓</td>
    <td class="role-yes">✓</td>
    <td class="role-yes">✓</td>
  </tr>
  <tr>
    <td>Products (view)</td>
    <td class="role-no">—</td>
    <td class="role-yes">✓</td>
    <td class="role-yes">✓</td>
    <td class="role-yes">✓</td>
  </tr>
  <tr>
    <td>Products (add/edit/delete)</td>
    <td class="role-no">—</td>
    <td class="role-no">—</td>
    <td class="role-yes">✓</td>
    <td class="role-yes">✓</td>
  </tr>
  <tr>
    <td>Customers</td>
    <td class="role-no">—</td>
    <td class="role-yes">✓</td>
    <td class="role-yes">✓</td>
    <td class="role-yes">✓</td>
  </tr>
  <tr>
    <td>Staff management</td>
    <td class="role-no">—</td>
    <td class="role-no">—</td>
    <td class="role-yes">✓ (view)</td>
    <td class="role-yes">✓</td>
  </tr>
  <tr>
    <td>Reports</td>
    <td class="role-no">—</td>
    <td class="role-no">—</td>
    <td class="role-yes">✓</td>
    <td class="role-yes">✓</td>
  </tr>
  <tr>
    <td>Cash Management</td>
    <td class="role-no">—</td>
    <td class="role-yes">✓ (open only)</td>
    <td class="role-yes">✓</td>
    <td class="role-yes">✓</td>
  </tr>
  <tr>
    <td>Accounting</td>
    <td class="role-no">—</td>
    <td class="role-no">—</td>
    <td class="role-no">—</td>
    <td class="role-yes">✓</td>
  </tr>
  <tr>
    <td>Settings</td>
    <td class="role-no">—</td>
    <td class="role-no">—</td>
    <td class="role-no">—</td>
    <td class="role-yes">✓</td>
  </tr>
  <tr>
    <td>Subscription management</td>
    <td class="role-no">—</td>
    <td class="role-no">—</td>
    <td class="role-no">—</td>
    <td class="role-yes">✓</td>
  </tr>
  <tr>
    <td>Locations / Branches</td>
    <td class="role-no">—</td>
    <td class="role-no">—</td>
    <td class="role-yes">✓</td>
    <td class="role-yes">✓</td>
  </tr>
  <tr>
    <td>Ingredients &amp; Production</td>
    <td class="role-no">—</td>
    <td class="role-no">—</td>
    <td class="role-yes">✓</td>
    <td class="role-yes">✓</td>
  </tr>
</table>

<div style="margin-top: 32px; padding: 16px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 9pt; color: #64748b; text-align: center;">
  <strong style="color: #0f1729;">NEXXUS POS</strong> — Your Business, Connected.<br/>
  Powered by MicroBooks &nbsp;|&nbsp; support@microbookspos.com &nbsp;|&nbsp; microbookspos.com<br/>
  &copy; 2026 MicroBooks Limited. All rights reserved.
</div>

</body>
</html>
"""

print("Generating PDF...", flush=True)
from weasyprint import HTML, CSS

HTML(string=MANUAL_HTML, base_url=".").write_pdf(
    "NEXXUS_POS_User_Manual.pdf",
    stylesheets=[CSS(string="@page { size: A4; }")]
)
print("Done! PDF saved as NEXXUS_POS_User_Manual.pdf")
