import { Router, type IRouter } from "express";
import { Resend } from "resend";
import { SendMailClient } from "zeptomail";
import { db, ordersTable, orderItemsTable, cashSessionsTable, cashPayoutsTable, productsTable } from "@workspace/db";
import { eq, and, gte, lte, isNotNull, desc, sql, asc } from "drizzle-orm";
import { z } from "zod";
import { getSetting, getAllSettings } from "./settings";
import { verifyTenantToken } from "./saas-auth";

const router: IRouter = Router();

/* ─── Auth helper ─── */
function getTenantId(req: { headers: Record<string, string | undefined> }): number | null {
  const auth = req.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) return null;
  const p = verifyTenantToken(auth.slice(7));
  return p ? p.tenantId : null;
}

const ZEPTOMAIL_API_URL = "api.zeptomail.com/";

type EmailProvider = "resend" | "zeptomail";

async function getActiveProvider(): Promise<EmailProvider> {
  const pref = await getSetting("email_provider");
  return pref === "zeptomail" ? "zeptomail" : "resend";
}

async function getFromDetails(): Promise<{ fromAddress: string; fromName: string }> {
  const [fromAddress, fromName] = await Promise.all([
    getSetting("from_email"),
    getSetting("from_name"),
  ]);
  return {
    fromAddress: fromAddress || "onboarding@resend.dev",
    fromName: fromName || "NEXXUS POS",
  };
}

async function sendEmail(opts: { to: string; subject: string; html: string; fromName: string; fromAddress: string }): Promise<{ messageId?: string }> {
  const provider = await getActiveProvider();

  if (provider === "zeptomail") {
    const token = process.env["ZEPTOMAIL_TOKEN"];
    if (!token) throw new Error("ZEPTOMAIL_TOKEN is not configured");
    const zepto = new SendMailClient({ url: ZEPTOMAIL_API_URL, token });
    const response = await zepto.sendMail({
      from: { address: opts.fromAddress, name: opts.fromName },
      to: [{ email_address: { address: opts.to } }],
      subject: opts.subject,
      htmlbody: opts.html,
    });
    return { messageId: (response as { data?: { message_id?: string } })?.data?.message_id };
  } else {
    const key = process.env["RESEND_API_KEY"];
    if (!key) throw new Error("RESEND_API_KEY is not configured");
    const resend = new Resend(key);
    const { data, error } = await resend.emails.send({
      from: `${opts.fromName} <${opts.fromAddress}>`,
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
    });
    if (error) throw new Error(error.message);
    return { messageId: data?.id };
  }
}

function fmt(n: number) {
  return `$${Math.abs(n).toFixed(2)}`;
}

function formatDate(d: string | Date) {
  return new Date(d).toLocaleString("en-JM", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}
function formatTime(d: string | Date) {
  return new Date(d).toLocaleString("en-JM", { hour: "numeric", minute: "2-digit", hour12: true });
}

/* ───── Receipt HTML (Loyverse / Lavu style) ───── */
function buildReceiptEmailHtml(order: {
  orderNumber: string;
  createdAt: string | Date;
  items: { productName: string; quantity: number; lineTotal: number; variantChoices?: { optionName: string }[] | null; modifierChoices?: { optionName: string }[] | null }[];
  subtotal: number;
  discountValue?: number | null;
  tax: number;
  total: number;
  paymentMethod?: string | null;
  splitCashAmount?: number | null;
  splitCardAmount?: number | null;
  notes?: string | null;
  customerName?: string | null;
}) {
  const row = (left: string, right: string, bold = false, color = "") =>
    `<tr><td style="padding:2px 0;color:${color || "#333"};${bold ? "font-weight:bold;" : ""}">${left}</td><td style="padding:2px 0;text-align:right;${bold ? "font-weight:bold;" : ""}color:${color || "#333"};">${right}</td></tr>`;

  const itemRows = order.items.map((item) => `
    ${row(`${item.quantity}&nbsp;×&nbsp;${item.productName}`, fmt(item.lineTotal))}
    ${(item.variantChoices ?? []).map((v) => `<tr><td colspan="2" style="padding:1px 0 1px 12px;color:#888;font-size:11px;">↳ ${v.optionName}</td></tr>`).join("")}
    ${(item.modifierChoices ?? []).map((m) => `<tr><td colspan="2" style="padding:1px 0 1px 12px;color:#888;font-size:11px;">+ ${m.optionName}</td></tr>`).join("")}
  `).join("");

  const paymentRows = order.paymentMethod === "split"
    ? `${row("Card:", fmt(order.splitCardAmount ?? 0))}${row("Cash:", fmt(order.splitCashAmount ?? 0))}`
    : row("Payment:", (order.paymentMethod ?? "—").toUpperCase());

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Receipt</title></head>
<body style="margin:0;padding:20px;background:#f4f4f4;font-family:'Courier New',Courier,monospace;">
<div style="max-width:400px;margin:0 auto;background:#fff;border-radius:4px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.12);">

  <!-- Header -->
  <div style="background:#0f1729;color:#fff;text-align:center;padding:20px 16px 16px;">
    <div style="font-size:22px;font-weight:bold;letter-spacing:2px;">NEXXUS POS</div>
    <div style="font-size:11px;color:#94a3b8;margin-top:4px;">Your Business, Connected.</div>
  </div>

  <!-- Body -->
  <div style="padding:16px;">
    <!-- Order info -->
    <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:10px;">
      ${row("Order:", order.orderNumber)}
      ${row("Date:", formatDate(order.createdAt))}
      ${order.customerName ? row("Customer:", order.customerName) : ""}
    </table>

    <div style="border-top:2px dashed #ddd;margin:8px 0;"></div>

    <!-- Items -->
    <table style="width:100%;border-collapse:collapse;font-size:12px;">
      ${itemRows}
    </table>

    <div style="border-top:1px dashed #ddd;margin:8px 0;"></div>

    <!-- Totals -->
    <table style="width:100%;border-collapse:collapse;font-size:12px;">
      ${row("Subtotal:", fmt(order.subtotal))}
      ${(order.discountValue ?? 0) > 0 ? row("Discount:", `-${fmt(order.discountValue ?? 0)}`, false, "#d97706") : ""}
      ${row("Tax:", fmt(order.tax))}
    </table>

    <div style="border-top:2px dashed #ddd;margin:8px 0;"></div>

    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      ${row("TOTAL:", fmt(order.total), true, "#1e40af")}
    </table>

    <div style="border-top:1px dashed #ddd;margin:8px 0;"></div>

    <!-- Payment -->
    <table style="width:100%;border-collapse:collapse;font-size:12px;">
      ${paymentRows}
    </table>

    ${order.notes ? `<div style="margin-top:8px;font-size:11px;color:#666;border-top:1px dashed #ddd;padding-top:6px;">Note: ${order.notes}</div>` : ""}
  </div>

  <!-- Footer -->
  <div style="text-align:center;padding:12px 16px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;">
    Thank you for your business!<br>
    <strong>Powered by MicroBooks</strong>
  </div>

</div>
</body></html>`;
}

/* ───── EOD Report Email HTML ───── */
function buildEodEmailHtml(data: {
  session: { staffName: string; openedAt: string | Date; closedAt?: string | Date | null; openingCash: number; actualCash?: number | null; actualCard?: number | null; closingNotes?: string | null };
  payouts: { reason: string; amount: number; staffName: string }[];
  orders: { orderNumber: string; total: number; paymentMethod: string | null; createdAt: string | Date }[];
  salesSummary: { cashSales: number; cardSales: number; splitSales: number; totalSales: number };
  expectedCash: number;
  totalPayouts: number;
}) {
  const { session, payouts, orders, salesSummary, expectedCash, totalPayouts } = data;
  const cashVariance = (session.actualCash ?? 0) - expectedCash;
  const cardVariance = (session.actualCard ?? 0) - salesSummary.cardSales;

  const row = (left: string, right: string, bold = false, color = "") =>
    `<tr><td style="padding:3px 0;color:${color || "#333"};${bold ? "font-weight:bold;" : ""}">${left}</td><td style="padding:3px 0;text-align:right;${bold ? "font-weight:bold;" : ""}color:${color || "#333"};">${right}</td></tr>`;

  const varianceColor = cashVariance === 0 ? "#16a34a" : cashVariance > 0 ? "#2563eb" : "#dc2626";
  const varianceLabel = cashVariance === 0 ? "Balanced ✓" : cashVariance > 0 ? "Over" : "Short";

  const orderRows = orders.map((o) => `
    <tr>
      <td style="padding:2px 0;font-size:11px;color:#64748b;">${formatTime(o.createdAt)}</td>
      <td style="padding:2px 0;font-size:11px;">${o.orderNumber}</td>
      <td style="padding:2px 0;font-size:11px;text-transform:capitalize;">${o.paymentMethod ?? "—"}</td>
      <td style="padding:2px 0;font-size:11px;text-align:right;">${fmt(o.total)}</td>
    </tr>
  `).join("");

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>End of Day Report</title></head>
<body style="margin:0;padding:20px;background:#f4f4f4;font-family:'Courier New',Courier,monospace;">
<div style="max-width:500px;margin:0 auto;background:#fff;border-radius:4px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.12);">

  <!-- Header -->
  <div style="background:#0f1729;color:#fff;text-align:center;padding:20px 16px 16px;">
    <div style="font-size:22px;font-weight:bold;letter-spacing:2px;">NEXXUS POS</div>
    <div style="font-size:13px;font-weight:bold;color:#94a3b8;margin-top:4px;">END OF DAY REPORT</div>
    <div style="font-size:11px;color:#64748b;margin-top:4px;">${formatDate(session.openedAt)}</div>
  </div>

  <div style="padding:16px;font-size:12px;">

    <!-- Shift info -->
    <table style="width:100%;border-collapse:collapse;margin-bottom:12px;">
      ${row("Cashier:", session.staffName)}
      ${row("Opened:", formatTime(session.openedAt))}
      ${session.closedAt ? row("Closed:", formatTime(session.closedAt)) : ""}
    </table>

    <!-- Sales summary -->
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px;padding:10px;margin-bottom:10px;">
      <div style="font-size:10px;font-weight:bold;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Sales Summary (${orders.length} transactions)</div>
      <table style="width:100%;border-collapse:collapse;">
        ${row("Cash sales:", fmt(salesSummary.cashSales))}
        ${row("Card sales:", fmt(salesSummary.cardSales))}
        ${salesSummary.splitSales > 0 ? row("Split sales:", fmt(salesSummary.splitSales)) : ""}
        <tr><td colspan="2" style="border-top:1px dashed #ddd;padding-top:4px;"></td></tr>
        ${row("Total sales:", fmt(salesSummary.totalSales), true)}
      </table>
    </div>

    <!-- Cash reconciliation -->
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px;padding:10px;margin-bottom:10px;">
      <div style="font-size:10px;font-weight:bold;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Cash Reconciliation</div>
      <table style="width:100%;border-collapse:collapse;">
        ${row("Opening cash:", fmt(session.openingCash))}
        ${row("+ Cash sales:", fmt(salesSummary.cashSales))}
        ${totalPayouts > 0 ? row("− Payouts:", `-${fmt(totalPayouts)}`, false, "#d97706") : ""}
        <tr><td colspan="2" style="border-top:1px dashed #ddd;padding-top:4px;"></td></tr>
        ${row("Expected cash:", fmt(expectedCash), true)}
        ${row("Actual cash:", fmt(session.actualCash ?? 0))}
        ${row(`Variance (${varianceLabel}):`, `${cashVariance >= 0 ? "+" : ""}${fmt(cashVariance)}`, true, varianceColor)}
        ${session.actualCard != null ? `<tr><td colspan="2" style="border-top:1px dashed #ddd;padding-top:4px;"></td></tr>` : ""}
        ${session.actualCard != null ? row("Card sales (system):", fmt(salesSummary.cardSales)) : ""}
        ${session.actualCard != null ? row("Actual card:", fmt(session.actualCard)) : ""}
        ${session.actualCard != null ? row("Card variance:", `${cardVariance >= 0 ? "+" : ""}${fmt(cardVariance)}`, false, cardVariance === 0 ? "#16a34a" : cardVariance > 0 ? "#2563eb" : "#dc2626") : ""}
      </table>
    </div>

    ${payouts.length > 0 ? `
    <div style="background:#fefce8;border:1px solid #fde68a;border-radius:4px;padding:10px;margin-bottom:10px;">
      <div style="font-size:10px;font-weight:bold;color:#92400e;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Payouts (${payouts.length})</div>
      <table style="width:100%;border-collapse:collapse;">
        ${payouts.map((p) => row(p.reason, `-${fmt(p.amount)}`)).join("")}
        <tr><td colspan="2" style="border-top:1px dashed #ddd;padding-top:4px;"></td></tr>
        ${row("Total payouts:", `-${fmt(totalPayouts)}`, true, "#d97706")}
      </table>
    </div>
    ` : ""}

    ${orders.length > 0 ? `
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px;padding:10px;margin-bottom:10px;">
      <div style="font-size:10px;font-weight:bold;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Transactions</div>
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr style="border-bottom:1px solid #e2e8f0;">
          <th style="text-align:left;padding:2px 0;font-size:10px;color:#94a3b8;">Time</th>
          <th style="text-align:left;padding:2px 0;font-size:10px;color:#94a3b8;">Order</th>
          <th style="text-align:left;padding:2px 0;font-size:10px;color:#94a3b8;">Method</th>
          <th style="text-align:right;padding:2px 0;font-size:10px;color:#94a3b8;">Total</th>
        </tr></thead>
        <tbody>${orderRows}</tbody>
      </table>
    </div>
    ` : ""}

    ${session.closingNotes ? `<div style="background:#fef3c7;border:1px solid #fde68a;border-radius:4px;padding:8px;margin-bottom:10px;font-size:11px;color:#92400e;">Notes: ${session.closingNotes}</div>` : ""}

  </div>

  <!-- Footer -->
  <div style="text-align:center;padding:12px 16px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;">
    <strong>Powered by MicroBooks</strong>
  </div>

</div>
</body></html>`;
}

/* ───── Daily Digest HTML ───── */

function buildDailyDigestHtml(data: {
  businessName: string;
  date: string;
  currency: string;
  yesterday: { revenue: number; orders: number; avgOrder: number; tax: number };
  bestSellers: { productName: string; quantity: number; revenue: number; rank: number }[];
  lowStock: { name: string; category: string; stockCount: number; status: string }[];
  outOfStock: { name: string; category: string }[];
}) {
  const { businessName, date, currency, yesterday, bestSellers, lowStock, outOfStock } = data;

  const fmtCurr = (n: number) => {
    try { return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n); }
    catch { return `${currency} ${n.toFixed(2)}`; }
  };

  const statusDot = (s: string) => s === "out" ? "#ef4444" : "#f59e0b";

  const bestSellerRows = bestSellers.slice(0, 10).map((p, i) => `
    <tr style="border-bottom:1px solid #f1f5f9;">
      <td style="padding:7px 8px;font-size:12px;color:#64748b;font-weight:bold;">${i + 1}</td>
      <td style="padding:7px 8px;font-size:12px;font-weight:600;color:#1e293b;">${p.productName}</td>
      <td style="padding:7px 8px;font-size:12px;text-align:center;color:#1e293b;">${p.quantity} units</td>
      <td style="padding:7px 8px;font-size:12px;text-align:right;font-weight:bold;color:#1d4ed8;">${fmtCurr(p.revenue)}</td>
    </tr>
  `).join("");

  const lowStockRows = [...lowStock, ...outOfStock.map(p => ({ ...p, stockCount: 0, status: "out" }))].map(p => `
    <tr style="border-bottom:1px solid #f1f5f9;">
      <td style="padding:7px 8px;">
        <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${statusDot(p.status)};margin-right:6px;"></span>
        <span style="font-size:12px;font-weight:600;color:#1e293b;">${p.name}</span>
      </td>
      <td style="padding:7px 8px;font-size:11px;color:#64748b;">${p.category}</td>
      <td style="padding:7px 8px;font-size:12px;font-weight:bold;color:${statusDot(p.status)};text-align:right;">
        ${p.stockCount === 0 ? "Out of stock" : `${p.stockCount} remaining`}
      </td>
    </tr>
  `).join("");

  const hasAlerts = lowStock.length > 0 || outOfStock.length > 0;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Daily Digest — ${date}</title></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:560px;margin:24px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.08);">

  <!-- Header -->
  <div style="background:linear-gradient(135deg,#0f1729 0%,#1e3a6e 100%);padding:28px 32px;">
    <div style="font-size:11px;font-weight:700;letter-spacing:3px;color:#60a5fa;text-transform:uppercase;margin-bottom:4px;">NEXXUS POS</div>
    <div style="font-size:22px;font-weight:800;color:#fff;margin-bottom:4px;">Daily Business Digest</div>
    <div style="font-size:13px;color:#94a3b8;">${businessName} &nbsp;·&nbsp; ${date}</div>
  </div>

  <!-- Yesterday's Performance -->
  <div style="padding:24px 32px 0;">
    <div style="font-size:11px;font-weight:700;letter-spacing:2px;color:#94a3b8;text-transform:uppercase;margin-bottom:14px;">Yesterday's Performance</div>
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;">
      ${[
        { label: "Revenue",    value: fmtCurr(yesterday.revenue),             color: "#1d4ed8" },
        { label: "Orders",     value: yesterday.orders.toString(),             color: "#1e293b" },
        { label: "Avg Order",  value: fmtCurr(yesterday.avgOrder),             color: "#1e293b" },
        { label: "Tax Collected", value: fmtCurr(yesterday.tax),              color: "#6b7280" },
      ].map(s => `
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:14px 16px;">
          <div style="font-size:10px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">${s.label}</div>
          <div style="font-size:20px;font-weight:800;color:${s.color};">${s.value}</div>
        </div>
      `).join("")}
    </div>
    ${yesterday.orders === 0 ? `<div style="margin-top:12px;padding:10px 14px;background:#fef9c3;border-radius:6px;font-size:12px;color:#92400e;">No orders were recorded yesterday.</div>` : ""}
  </div>

  <!-- Best Sellers -->
  ${bestSellers.length > 0 ? `
  <div style="padding:24px 32px 0;">
    <div style="font-size:11px;font-weight:700;letter-spacing:2px;color:#94a3b8;text-transform:uppercase;margin-bottom:10px;">🏆 Best Sellers — Last 7 Days</div>
    <table style="width:100%;border-collapse:collapse;background:#f8fafc;border-radius:6px;overflow:hidden;border:1px solid #e2e8f0;">
      <thead>
        <tr style="background:#f1f5f9;">
          <th style="padding:8px;font-size:10px;color:#94a3b8;text-align:left;font-weight:600;">#</th>
          <th style="padding:8px;font-size:10px;color:#94a3b8;text-align:left;font-weight:600;">Product</th>
          <th style="padding:8px;font-size:10px;color:#94a3b8;text-align:center;font-weight:600;">Sold</th>
          <th style="padding:8px;font-size:10px;color:#94a3b8;text-align:right;font-weight:600;">Revenue</th>
        </tr>
      </thead>
      <tbody>${bestSellerRows}</tbody>
    </table>
  </div>` : ""}

  <!-- Stock Alerts -->
  ${hasAlerts ? `
  <div style="padding:24px 32px 0;">
    <div style="font-size:11px;font-weight:700;letter-spacing:2px;color:#94a3b8;text-transform:uppercase;margin-bottom:10px;">⚠️ Stock Alerts</div>
    <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:6px;overflow:hidden;">
      <div style="padding:10px 14px;background:#fff3e0;border-bottom:1px solid #fed7aa;font-size:11px;color:#92400e;font-weight:600;">
        ${outOfStock.length} out of stock &nbsp;·&nbsp; ${lowStock.length} low stock
      </div>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#fef3e2;">
            <th style="padding:7px 8px;font-size:10px;color:#92400e;text-align:left;font-weight:600;">Product</th>
            <th style="padding:7px 8px;font-size:10px;color:#92400e;text-align:left;font-weight:600;">Category</th>
            <th style="padding:7px 8px;font-size:10px;color:#92400e;text-align:right;font-weight:600;">Status</th>
          </tr>
        </thead>
        <tbody>${lowStockRows}</tbody>
      </table>
    </div>
  </div>` : `
  <div style="padding:24px 32px 0;">
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:12px 16px;display:flex;align-items:center;gap:10px;">
      <span style="font-size:18px;">✅</span>
      <div>
        <div style="font-size:12px;font-weight:600;color:#166534;">All stock levels look healthy!</div>
        <div style="font-size:11px;color:#4ade80;">No items are low or out of stock.</div>
      </div>
    </div>
  </div>`}

  <!-- Footer -->
  <div style="padding:24px 32px;margin-top:24px;border-top:1px solid #f1f5f9;text-align:center;">
    <p style="font-size:11px;color:#94a3b8;margin:0;">This report is automatically generated every day by <strong>NEXXUS POS</strong>.</p>
    <p style="font-size:11px;color:#cbd5e1;margin:4px 0 0;">Powered by MicroBooks</p>
  </div>

</div>
</body></html>`;
}

/* ───── Core digest function — exported for cron ───── */

export async function sendDailyDigest(): Promise<{ sent: boolean; to?: string; error?: string }> {
  try {
    const settings = await getAllSettings();

    const enabled = settings["daily_digest_enabled"] === "true";
    if (!enabled) return { sent: false };

    const recipientEmail = settings["daily_digest_email"] ?? "";
    if (!recipientEmail) return { sent: false };

    const threshold     = parseInt(settings["low_stock_threshold"] ?? "5", 10);
    const businessName  = settings["business_name"]  ?? "NEXXUS POS";
    const currency      = settings["base_currency"]  ?? "JMD";

    // Yesterday
    const now       = new Date();
    const yStart    = new Date(now); yStart.setDate(yStart.getDate() - 1); yStart.setHours(0, 0, 0, 0);
    const yEnd      = new Date(now); yEnd.setDate(yEnd.getDate() - 1);     yEnd.setHours(23, 59, 59, 999);

    // Yesterday sales
    const yOrders = await db.select({
      revenue: sql<number>`COALESCE(SUM(${ordersTable.total}), 0)`,
      orders:  sql<number>`COUNT(*)`,
      tax:     sql<number>`COALESCE(SUM(${ordersTable.tax}), 0)`,
    }).from(ordersTable)
      .where(and(eq(ordersTable.status, "completed"), gte(ordersTable.createdAt, yStart), lte(ordersTable.createdAt, yEnd)));

    const rev = Number(yOrders[0]?.revenue ?? 0);
    const ord = Number(yOrders[0]?.orders  ?? 0);
    const tax = Number(yOrders[0]?.tax     ?? 0);

    // Best sellers — last 7 days
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7); weekAgo.setHours(0, 0, 0, 0);
    const bsRows = await db.select({
      productName: orderItemsTable.productName,
      quantity:    sql<number>`SUM(${orderItemsTable.quantity})`,
      revenue:     sql<number>`SUM(${orderItemsTable.lineTotal})`,
    }).from(orderItemsTable)
      .innerJoin(ordersTable, eq(orderItemsTable.orderId, ordersTable.id))
      .where(and(eq(ordersTable.status, "completed"), gte(ordersTable.createdAt, weekAgo)))
      .groupBy(orderItemsTable.productName)
      .orderBy(desc(sql`SUM(${orderItemsTable.quantity})`))
      .limit(10);

    // Low stock
    const allProducts = await db.select().from(productsTable).orderBy(asc(productsTable.stockCount));
    const lowStock   = allProducts.filter(p => p.inStock && p.stockCount > 0 && p.stockCount <= threshold);
    const outOfStock = allProducts.filter(p => !p.inStock || p.stockCount === 0);

    const dateLabel = yStart.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

    const html = buildDailyDigestHtml({
      businessName,
      date: dateLabel,
      currency,
      yesterday: { revenue: Math.round(rev * 100) / 100, orders: ord, avgOrder: ord > 0 ? Math.round((rev / ord) * 100) / 100 : 0, tax: Math.round(tax * 100) / 100 },
      bestSellers: bsRows.map((p, i) => ({ productName: p.productName, quantity: Number(p.quantity), revenue: Math.round(Number(p.revenue) * 100) / 100, rank: i + 1 })),
      lowStock:   lowStock.map(p => ({ name: p.name, category: p.category, stockCount: p.stockCount, status: "low" })),
      outOfStock: outOfStock.map(p => ({ name: p.name, category: p.category })),
    });

    const { fromAddress: digestFrom, fromName: digestFromName } = await getFromDetails();
    await sendEmail({
      to: recipientEmail,
      subject: `📊 Daily Digest — ${dateLabel} | ${businessName}`,
      html,
      fromName:    digestFromName,
      fromAddress: digestFrom,
    });

    return { sent: true, to: recipientEmail };
  } catch (err) {
    return { sent: false, error: String(err) };
  }
}

/* ───── Routes ───── */

const SendReceiptBody = z.object({
  orderId: z.number().int().positive(),
  to: z.string().email(),
});

const SendEodReportBody = z.object({
  sessionId: z.number().int().positive(),
  to: z.string().email(),
});

router.post("/email/receipt", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = SendReceiptBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.issues });
    return;
  }

  const [order] = await db.select().from(ordersTable)
    .where(and(eq(ordersTable.id, parsed.data.orderId), eq(ordersTable.tenantId, tenantId)));
  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, order.id));

  const orderData = {
    orderNumber: order.orderNumber,
    createdAt: order.createdAt,
    items: items.map((item) => ({
      productName: item.productName,
      quantity: item.quantity,
      lineTotal: item.lineTotal,
      variantChoices: (item.variantChoices as { optionName: string }[] | null) ?? null,
      modifierChoices: (item.modifierChoices as { optionName: string }[] | null) ?? null,
    })),
    subtotal: order.subtotal,
    discountValue: order.discountValue,
    tax: order.tax,
    total: order.total,
    paymentMethod: order.paymentMethod,
    splitCashAmount: order.splitCashAmount,
    splitCardAmount: order.splitCardAmount,
    notes: order.notes,
  };

  const html = buildReceiptEmailHtml(orderData);
  const { fromAddress, fromName } = await getFromDetails();

  try {
    const result = await sendEmail({
      to: parsed.data.to,
      subject: `Receipt — ${order.orderNumber}`,
      html,
      fromName,
      fromAddress,
    });
    res.json({ success: true, messageId: result.messageId });
  } catch (err) {
    res.status(500).json({ error: "Failed to send email", details: String(err) });
  }
});

router.post("/email/daily-digest", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const result = await sendDailyDigest();
  if (result.error) {
    res.status(500).json({ error: result.error });
    return;
  }
  if (!result.sent) {
    res.status(400).json({ error: "Daily digest is disabled or no recipient email is configured." });
    return;
  }
  res.json({ success: true, to: result.to });
});

router.post("/email/eod-report", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req as never);
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = SendEodReportBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.issues });
    return;
  }

  const [session] = await db
    .select()
    .from(cashSessionsTable)
    .where(and(eq(cashSessionsTable.id, parsed.data.sessionId), eq(cashSessionsTable.tenantId, tenantId)));

  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const payouts = await db
    .select()
    .from(cashPayoutsTable)
    .where(eq(cashPayoutsTable.sessionId, session.id));

  const closedAt = session.closedAt ?? new Date();
  const orderRows = await db
    .select({
      orderNumber: ordersTable.orderNumber,
      total: ordersTable.total,
      paymentMethod: ordersTable.paymentMethod,
      createdAt: ordersTable.createdAt,
    })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.tenantId, tenantId),
        gte(ordersTable.createdAt, session.openedAt),
        lte(ordersTable.createdAt, closedAt),
        isNotNull(ordersTable.paymentMethod)
      )
    )
    .orderBy(ordersTable.createdAt);

  function computeSales(orders: { paymentMethod: string | null; total: number | null }[]) {
    const cashSales = orders.filter((r) => r.paymentMethod === "cash").reduce((s, r) => s + Number(r.total ?? 0), 0);
    const cardSales = orders.filter((r) => r.paymentMethod === "card").reduce((s, r) => s + Number(r.total ?? 0), 0);
    const splitSales = orders.filter((r) => r.paymentMethod === "split").reduce((s, r) => s + Number(r.total ?? 0), 0);
    return { cashSales, cardSales, splitSales, totalSales: cashSales + cardSales + splitSales };
  }

  const salesSummary = computeSales(orderRows);
  const totalPayouts = payouts.reduce((s, p) => s + p.amount, 0);
  const expectedCash = session.openingCash + salesSummary.cashSales - totalPayouts;

  const html = buildEodEmailHtml({
    session,
    payouts,
    orders: orderRows,
    salesSummary,
    expectedCash,
    totalPayouts,
  });

  const dateLabel = new Date(session.openedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  const { fromAddress: eodFrom, fromName: eodFromName } = await getFromDetails();

  try {
    const result = await sendEmail({
      to: parsed.data.to,
      subject: `End of Day Report — ${dateLabel} (${session.staffName})`,
      html,
      fromName: eodFromName,
      fromAddress: eodFrom,
    });
    res.json({ success: true, messageId: result.messageId });
  } catch (err) {
    res.status(500).json({ error: "Failed to send email", details: String(err) });
  }
});

export default router;
