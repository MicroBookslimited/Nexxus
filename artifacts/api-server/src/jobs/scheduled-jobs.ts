import {
  db,
  tenantsTable,
  subscriptionsTable,
  subscriptionPlansTable,
  ordersTable,
  orderItemsTable,
  productsTable,
  tenantAdminUsersTable,
} from "@workspace/db";
import { eq, and, gte, lte, desc, asc, sql, or } from "drizzle-orm";
import { getAllSettings } from "../routes/settings";
import { sendMail, getFromDetails } from "../lib/mail";
import { logger } from "../lib/logger";

/* ─── Helpers ─── */

/** Returns the primary admin user's email for a tenant, falling back to the tenant's own email. */
async function getPrimaryAdminEmail(tenantId: number, fallback: string): Promise<string> {
  const [admin] = await db
    .select({ email: tenantAdminUsersTable.email })
    .from(tenantAdminUsersTable)
    .where(and(
      eq(tenantAdminUsersTable.tenantId, tenantId),
      eq(tenantAdminUsersTable.isPrimary, true),
    ))
    .limit(1);
  return admin?.email ?? fallback;
}

function fmtCurr(n: number, currency = "JMD"): string {
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n); }
  catch { return `${currency} ${n.toFixed(2)}`; }
}

function todayRange(offsetDays = 0): { start: Date; end: Date } {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const start = new Date(d); start.setHours(0, 0, 0, 0);
  const end   = new Date(d); end.setHours(23, 59, 59, 999);
  return { start, end };
}

/* ─────────────────────────────────────────────────────────────────
   EMAIL HTML BUILDERS
──────────────────────────────────────────────────────────────────── */

function emailShell(title: string, body: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:600px;margin:24px auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08);">
${body}
<div style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;">
  <p style="font-size:11px;color:#94a3b8;margin:0;">Automated report from <strong>NEXXUS POS</strong> &nbsp;·&nbsp; Powered by MicroBooks</p>
</div>
</div></body></html>`;
}

function emailHeader(title: string, subtitle: string, icon = ""): string {
  return `<div style="background:linear-gradient(135deg,#0f1729 0%,#1e3a6e 100%);padding:28px 32px;">
  <div style="font-size:10px;font-weight:700;letter-spacing:3px;color:#60a5fa;text-transform:uppercase;margin-bottom:4px;">NEXXUS POS</div>
  <div style="font-size:22px;font-weight:800;color:#fff;margin-bottom:4px;">${icon ? icon + " " : ""}${title}</div>
  <div style="font-size:13px;color:#94a3b8;">${subtitle}</div>
</div>`;
}

/* ── Build: Daily Digest with Best + Worst Sellers ── */
function buildDigestHtml(data: {
  businessName: string;
  date: string;
  currency: string;
  yesterday: { revenue: number; orders: number; avgOrder: number; tax: number };
  bestSellers: { productName: string; quantity: number; revenue: number }[];
  worstSellers: { productName: string; quantity: number; revenue: number }[];
  lowStock: { name: string; category: string; stockCount: number }[];
  outOfStock: { name: string; category: string }[];
}): string {
  const { businessName, date, currency, yesterday, bestSellers, worstSellers, lowStock, outOfStock } = data;
  const fmt = (n: number) => fmtCurr(n, currency);
  const hasAlerts = lowStock.length > 0 || outOfStock.length > 0;

  const statsCards = [
    { label: "Revenue",      value: fmt(yesterday.revenue),            color: "#2563eb" },
    { label: "Orders",       value: String(yesterday.orders),          color: "#0f172a" },
    { label: "Avg Order",    value: fmt(yesterday.avgOrder),           color: "#0f172a" },
    { label: "Tax Collected",value: fmt(yesterday.tax),                color: "#64748b" },
  ].map(s => `
    <td style="width:50%;padding:0 6px 12px;">
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px 16px;">
        <div style="font-size:10px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">${s.label}</div>
        <div style="font-size:20px;font-weight:800;color:${s.color};">${s.value}</div>
      </div>
    </td>
  `).join("");

  const sellerTable = (rows: { productName: string; quantity: number; revenue: number }[], isWorst: boolean) => {
    if (rows.length === 0) return `<p style="font-size:12px;color:#94a3b8;padding:12px;">No data for this period.</p>`;
    return `<table style="width:100%;border-collapse:collapse;">
      <thead><tr style="background:#f1f5f9;">
        <th style="padding:7px 8px;font-size:10px;color:#94a3b8;text-align:left;font-weight:600;">#</th>
        <th style="padding:7px 8px;font-size:10px;color:#94a3b8;text-align:left;font-weight:600;">Product</th>
        <th style="padding:7px 8px;font-size:10px;color:#94a3b8;text-align:center;font-weight:600;">Units</th>
        <th style="padding:7px 8px;font-size:10px;color:#94a3b8;text-align:right;font-weight:600;">Revenue</th>
      </tr></thead>
      <tbody>${rows.map((p, i) => `
        <tr style="border-bottom:1px solid #f1f5f9;">
          <td style="padding:7px 8px;font-size:12px;color:#64748b;font-weight:bold;">${i + 1}</td>
          <td style="padding:7px 8px;font-size:12px;font-weight:600;color:#1e293b;">${p.productName}</td>
          <td style="padding:7px 8px;font-size:12px;text-align:center;color:#1e293b;">${p.quantity}</td>
          <td style="padding:7px 8px;font-size:12px;text-align:right;font-weight:bold;color:${isWorst ? "#dc2626" : "#2563eb"};">${fmt(p.revenue)}</td>
        </tr>`).join("")}
      </tbody>
    </table>`;
  };

  const sectionTitle = (icon: string, text: string) =>
    `<div style="font-size:11px;font-weight:700;letter-spacing:2px;color:#94a3b8;text-transform:uppercase;margin-bottom:10px;">${icon} ${text}</div>`;

  const body = `
${emailHeader("Daily Business Digest", `${businessName} · ${date}`)}

<!-- Stats -->
<div style="padding:24px 32px 0;">
  ${sectionTitle("📊", "Yesterday's Performance")}
  <table style="width:100%;border-collapse:collapse;margin-left:-6px;"><tr>${statsCards}</tr></table>
  ${yesterday.orders === 0 ? `<div style="padding:10px 14px;background:#fef9c3;border-radius:6px;font-size:12px;color:#92400e;margin-top:4px;">No completed orders yesterday.</div>` : ""}
</div>

<!-- Best Sellers -->
<div style="padding:20px 32px 0;">
  ${sectionTitle("🏆", "Best Sellers — Last 7 Days")}
  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
    ${sellerTable(bestSellers, false)}
  </div>
</div>

<!-- Worst Sellers -->
<div style="padding:20px 32px 0;">
  ${sectionTitle("📉", "Worst Sellers — Last 7 Days")}
  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
    ${sellerTable(worstSellers, true)}
  </div>
</div>

<!-- Stock Alerts -->
<div style="padding:20px 32px 24px;">
  ${sectionTitle("⚠️", "Stock Status")}
  ${hasAlerts ? `
  <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;overflow:hidden;">
    <div style="padding:10px 14px;background:#fff3e0;border-bottom:1px solid #fed7aa;font-size:11px;color:#92400e;font-weight:600;">
      ${outOfStock.length} out of stock &nbsp;·&nbsp; ${lowStock.length} low stock
    </div>
    <table style="width:100%;border-collapse:collapse;">
      <thead><tr style="background:#fef3e2;">
        <th style="padding:7px 8px;font-size:10px;color:#92400e;text-align:left;">Product</th>
        <th style="padding:7px 8px;font-size:10px;color:#92400e;text-align:left;">Category</th>
        <th style="padding:7px 8px;font-size:10px;color:#92400e;text-align:right;">Stock</th>
      </tr></thead>
      <tbody>
        ${outOfStock.map(p => `<tr style="border-bottom:1px solid #fed7aa;">
          <td style="padding:7px 8px;font-size:12px;font-weight:600;color:#1e293b;">
            <span style="display:inline-block;width:7px;height:7px;background:#ef4444;border-radius:50%;margin-right:5px;"></span>${p.name}
          </td>
          <td style="padding:7px 8px;font-size:11px;color:#64748b;">${p.category ?? ""}</td>
          <td style="padding:7px 8px;font-size:12px;font-weight:bold;color:#ef4444;text-align:right;">Out of stock</td>
        </tr>`).join("")}
        ${lowStock.map(p => `<tr style="border-bottom:1px solid #fed7aa;">
          <td style="padding:7px 8px;font-size:12px;font-weight:600;color:#1e293b;">
            <span style="display:inline-block;width:7px;height:7px;background:#f59e0b;border-radius:50%;margin-right:5px;"></span>${p.name}
          </td>
          <td style="padding:7px 8px;font-size:11px;color:#64748b;">${p.category ?? ""}</td>
          <td style="padding:7px 8px;font-size:12px;font-weight:bold;color:#f59e0b;text-align:right;">${p.stockCount} remaining</td>
        </tr>`).join("")}
      </tbody>
    </table>
  </div>` : `
  <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 16px;display:flex;align-items:center;gap:10px;">
    <span style="font-size:18px;">✅</span>
    <div><div style="font-size:12px;font-weight:600;color:#166534;">All stock levels healthy</div></div>
  </div>`}
</div>`;

  return emailShell(`Daily Digest — ${date}`, body);
}

/* ── Build: Low Stock Alert ── */
function buildLowStockHtml(data: {
  businessName: string;
  date: string;
  outOfStock: { name: string; category: string }[];
  lowStock: { name: string; category: string; stockCount: number; threshold: number }[];
}): string {
  const { businessName, date, outOfStock, lowStock } = data;

  const body = `
${emailHeader("Low Stock Alert", `${businessName} · ${date}`, "⚠️")}
<div style="padding:24px 32px;">

  ${outOfStock.length > 0 ? `
  <div style="margin-bottom:20px;">
    <div style="font-size:11px;font-weight:700;letter-spacing:2px;color:#dc2626;text-transform:uppercase;margin-bottom:10px;">🔴 Out of Stock (${outOfStock.length})</div>
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;overflow:hidden;">
      <table style="width:100%;border-collapse:collapse;">
        ${outOfStock.map(p => `
        <tr style="border-bottom:1px solid #fecaca;">
          <td style="padding:10px 14px;font-size:13px;font-weight:600;color:#1e293b;">${p.name}</td>
          <td style="padding:10px 14px;font-size:11px;color:#64748b;">${p.category ?? ""}</td>
          <td style="padding:10px 14px;font-size:12px;font-weight:800;color:#dc2626;text-align:right;">OUT OF STOCK</td>
        </tr>`).join("")}
      </table>
    </div>
  </div>` : ""}

  ${lowStock.length > 0 ? `
  <div>
    <div style="font-size:11px;font-weight:700;letter-spacing:2px;color:#d97706;text-transform:uppercase;margin-bottom:10px;">🟡 Running Low (${lowStock.length})</div>
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;overflow:hidden;">
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr style="background:#fef9c3;">
          <th style="padding:8px 14px;font-size:10px;color:#92400e;text-align:left;font-weight:600;">Product</th>
          <th style="padding:8px 14px;font-size:10px;color:#92400e;text-align:left;font-weight:600;">Category</th>
          <th style="padding:8px 14px;font-size:10px;color:#92400e;text-align:right;font-weight:600;">In Stock</th>
          <th style="padding:8px 14px;font-size:10px;color:#92400e;text-align:right;font-weight:600;">Threshold</th>
        </tr></thead>
        <tbody>
          ${lowStock.map(p => `
          <tr style="border-bottom:1px solid #fde68a;">
            <td style="padding:9px 14px;font-size:12px;font-weight:600;color:#1e293b;">${p.name}</td>
            <td style="padding:9px 14px;font-size:11px;color:#64748b;">${p.category ?? ""}</td>
            <td style="padding:9px 14px;font-size:13px;font-weight:800;color:#d97706;text-align:right;">${p.stockCount}</td>
            <td style="padding:9px 14px;font-size:11px;color:#92400e;text-align:right;">≤ ${p.threshold}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>
  </div>` : ""}

  <div style="margin-top:20px;padding:14px 16px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;font-size:12px;color:#1e40af;">
    Please restock these items soon to avoid lost sales. Log in to NEXXUS POS to update inventory.
  </div>
</div>`;

  return emailShell(`Low Stock Alert — ${date}`, body);
}

/* ── Build: Subscription Renewal Reminder ── */
function buildRenewalReminderHtml(data: {
  businessName: string;
  ownerName: string;
  planName: string;
  renewsAt: Date;
  daysLeft: number;
  status: string;
}): string {
  const { businessName, ownerName, planName, renewsAt, daysLeft, status } = data;
  const renewsStr = renewsAt.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const isTrial = status === "trial";

  // Tone tiers: friendly (14–7 days) → warning (5–2 days) → urgent (1 day)
  const isEarly    = daysLeft >= 7;
  const isUrgent   = daysLeft === 1;
  const urgencyColor  = isUrgent ? "#dc2626" : isEarly ? "#2563eb" : "#d97706";
  const urgencyBg     = isUrgent ? "#fef2f2" : isEarly ? "#eff6ff" : "#fffbeb";
  const urgencyBorder = isUrgent ? "#fecaca" : isEarly ? "#bfdbfe" : "#fde68a";

  const icon    = isUrgent ? "🚨" : isEarly ? "🔔" : "⏰";
  const heading = isUrgent
    ? (isTrial ? "Trial Ends Tomorrow!" : "Subscription Renews Tomorrow!")
    : isEarly
      ? (isTrial ? `Trial Ends in ${daysLeft} Days` : `Renewal Reminder — ${daysLeft} Days`)
      : (isTrial ? `Trial Ends in ${daysLeft} Days` : `Renew Soon — ${daysLeft} Days Left`);

  const intro = isEarly
    ? `Just a friendly heads-up — your ${isTrial ? "free trial" : "subscription"} is coming up for renewal in <strong>${daysLeft} days</strong>.`
    : isUrgent
      ? `This is your final reminder — your ${isTrial ? "free trial" : "subscription"} ${isTrial ? "ends" : "renews"} <strong>tomorrow</strong>.`
      : `Your ${isTrial ? "free trial" : "subscription"} is renewing in <strong>${daysLeft} days</strong>. Please make sure your payment method is up to date.`;

  const body = `
${emailHeader(heading, `${businessName} · NEXXUS POS`, icon)}
<div style="padding:24px 32px;">
  <p style="font-size:14px;color:#475569;margin:0 0 20px;">Hi ${ownerName},</p>
  <p style="font-size:13px;color:#475569;line-height:1.6;margin:0 0 20px;">${intro}</p>

  <div style="background:${urgencyBg};border:1px solid ${urgencyBorder};border-radius:10px;padding:20px;margin-bottom:20px;">
    <table style="width:100%;border-collapse:collapse;">
      <tr>
        <td style="padding:5px 0;font-size:12px;color:#64748b;">Business</td>
        <td style="padding:5px 0;font-size:12px;font-weight:600;color:#1e293b;text-align:right;">${businessName}</td>
      </tr>
      <tr>
        <td style="padding:5px 0;font-size:12px;color:#64748b;">Plan</td>
        <td style="padding:5px 0;font-size:12px;font-weight:600;color:#1e293b;text-align:right;">${planName}</td>
      </tr>
      <tr>
        <td style="padding:5px 0;font-size:12px;color:#64748b;">${isTrial ? "Trial ends" : "Renewal date"}</td>
        <td style="padding:5px 0;font-size:12px;font-weight:700;color:${urgencyColor};text-align:right;">${renewsStr}</td>
      </tr>
    </table>
  </div>

  <p style="font-size:13px;color:#475569;line-height:1.6;">
    ${isTrial
      ? "After your trial ends, you'll lose access to NEXXUS POS until you subscribe to a paid plan."
      : daysLeft <= 3
        ? "To avoid any disruption to your business, please ensure your subscription is renewed before the date above."
        : "No action is needed if your payment method is already on file — we'll take care of the renewal automatically on the date above."}
  </p>

  <div style="text-align:center;margin-top:24px;">
    <a href="https://nexxus.microbookspos.com/app/subscription" style="display:inline-block;background:#3b82f6;color:#fff;font-weight:700;font-size:14px;padding:14px 32px;border-radius:8px;text-decoration:none;">
      ${isTrial ? "Choose a Plan" : "Manage Subscription"} →
    </a>
  </div>
</div>`;

  return emailShell(`${heading} — ${businessName}`, body);
}

/* ─────────────────────────────────────────────────────────────────
   JOB 1 — Daily Digest for All Tenants (Best + Worst Sellers)
──────────────────────────────────────────────────────────────────── */
export async function runDigestForAllTenants(
  currentHour = new Date().getHours(),
  opts: { forceTenantId?: number } = {}
): Promise<{ sent: number; failed: number; skipped: number }> {
  let sent = 0, failed = 0, skipped = 0;

  const allTenants = await db.select().from(tenantsTable);
  const tenants = opts.forceTenantId
    ? allTenants.filter(t => t.id === opts.forceTenantId)
    : allTenants;

  for (const tenant of tenants) {
    try {
      const settings = await getAllSettings(tenant.id);
      if (settings["daily_digest_enabled"] !== "true" && !opts.forceTenantId) { skipped++; continue; }

      // Only send if it's the tenant's configured hour (unless forced)
      if (!opts.forceTenantId) {
        const configuredHour = parseInt(settings["daily_digest_hour"] ?? "7", 10);
        if (currentHour !== configuredHour) { skipped++; continue; }
      }

      const recipientEmail = await getPrimaryAdminEmail(tenant.id, tenant.email);
      if (!recipientEmail) { skipped++; continue; }

      const currency  = settings["base_currency"]     ?? "JMD";
      const threshold = parseInt(settings["low_stock_threshold"] ?? "5", 10);

      // Yesterday window
      const yStart = new Date(); yStart.setDate(yStart.getDate() - 1); yStart.setHours(0, 0, 0, 0);
      const yEnd   = new Date(); yEnd.setDate(yEnd.getDate() - 1);     yEnd.setHours(23, 59, 59, 999);
      const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7); weekAgo.setHours(0, 0, 0, 0);

      // Yesterday's stats
      const [yStats] = await db.select({
        revenue: sql<number>`COALESCE(SUM(${ordersTable.total}), 0)`,
        orders:  sql<number>`COUNT(*)`,
        tax:     sql<number>`COALESCE(SUM(${ordersTable.tax}), 0)`,
      }).from(ordersTable).where(
        and(eq(ordersTable.tenantId, tenant.id), eq(ordersTable.status, "completed"),
          gte(ordersTable.createdAt, yStart), lte(ordersTable.createdAt, yEnd))
      );

      const rev = Number(yStats?.revenue ?? 0);
      const ord = Number(yStats?.orders  ?? 0);
      const tax = Number(yStats?.tax     ?? 0);

      // Best sellers (top 5)
      const bestSellers = await db.select({
        productName: orderItemsTable.productName,
        quantity:    sql<number>`SUM(${orderItemsTable.quantity})`,
        revenue:     sql<number>`SUM(${orderItemsTable.lineTotal})`,
      }).from(orderItemsTable)
        .innerJoin(ordersTable, eq(orderItemsTable.orderId, ordersTable.id))
        .where(and(eq(ordersTable.tenantId, tenant.id), eq(ordersTable.status, "completed"), gte(ordersTable.createdAt, weekAgo)))
        .groupBy(orderItemsTable.productName)
        .orderBy(desc(sql`SUM(${orderItemsTable.quantity})`))
        .limit(5);

      // Worst sellers (bottom 5 with at least 1 unit sold)
      const worstSellers = await db.select({
        productName: orderItemsTable.productName,
        quantity:    sql<number>`SUM(${orderItemsTable.quantity})`,
        revenue:     sql<number>`SUM(${orderItemsTable.lineTotal})`,
      }).from(orderItemsTable)
        .innerJoin(ordersTable, eq(orderItemsTable.orderId, ordersTable.id))
        .where(and(eq(ordersTable.tenantId, tenant.id), eq(ordersTable.status, "completed"), gte(ordersTable.createdAt, weekAgo)))
        .groupBy(orderItemsTable.productName)
        .orderBy(asc(sql`SUM(${orderItemsTable.quantity})`))
        .limit(5);

      // Stock
      const products = await db.select().from(productsTable).where(eq(productsTable.tenantId, tenant.id));
      const outOfStock = products.filter(p => !p.inStock || p.stockCount === 0);
      const lowStock   = products.filter(p => p.inStock && p.stockCount > 0 && p.stockCount <= threshold);

      const dateLabel = yStart.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

      const html = buildDigestHtml({
        businessName: tenant.businessName,
        date:         dateLabel,
        currency,
        yesterday: { revenue: rev, orders: ord, avgOrder: ord > 0 ? rev / ord : 0, tax },
        bestSellers:  bestSellers.map(p => ({ productName: p.productName, quantity: Number(p.quantity), revenue: Number(p.revenue) })),
        worstSellers: worstSellers.map(p => ({ productName: p.productName, quantity: Number(p.quantity), revenue: Number(p.revenue) })),
        lowStock:     lowStock.map(p => ({ name: p.name, category: p.category ?? "", stockCount: p.stockCount ?? 0 })),
        outOfStock:   outOfStock.map(p => ({ name: p.name, category: p.category ?? "" })),
      });

      const { fromAddress, fromName } = await getFromDetails(tenant.id);
      await sendMail({
        to: recipientEmail,
        subject: `📊 Daily Digest — ${dateLabel} | ${tenant.businessName}`,
        html,
        fromAddress,
        fromName,
        tenantId: tenant.id,
      });

      logger.info({ tenantId: tenant.id, to: recipientEmail }, "Daily digest sent");
      sent++;
    } catch (err) {
      logger.error({ tenantId: tenant.id, err }, "Daily digest failed");
      failed++;
    }
  }

  return { sent, failed, skipped };
}

/* ─────────────────────────────────────────────────────────────────
   JOB 2 — Low Stock Alerts for All Tenants
──────────────────────────────────────────────────────────────────── */
export async function runLowStockAlertsForAllTenants(
  currentHour = new Date().getHours(),
  opts: { forceTenantId?: number } = {}
): Promise<{ sent: number; failed: number; skipped: number }> {
  let sent = 0, failed = 0, skipped = 0;

  const allTenants = await db.select().from(tenantsTable);
  const tenants = opts.forceTenantId
    ? allTenants.filter(t => t.id === opts.forceTenantId)
    : allTenants;

  for (const tenant of tenants) {
    try {
      const settings  = await getAllSettings(tenant.id);
      if (settings["low_stock_alerts_enabled"] !== "true" && !opts.forceTenantId) { skipped++; continue; }

      // Only send at the configured hour (unless forced)
      if (!opts.forceTenantId) {
        const configuredHour = parseInt(settings["low_stock_alerts_hour"] ?? "8", 10);
        if (currentHour !== configuredHour) { skipped++; continue; }
      }

      const threshold = parseInt(settings["low_stock_threshold"] ?? "5", 10);
      const recipientEmail = await getPrimaryAdminEmail(tenant.id, tenant.email);
      if (!recipientEmail) { skipped++; continue; }

      const products = await db.select().from(productsTable)
        .where(eq(productsTable.tenantId, tenant.id))
        .orderBy(asc(productsTable.stockCount));

      const outOfStock = products.filter(p => !p.inStock || p.stockCount === 0);
      const lowStock   = products.filter(p => p.inStock && p.stockCount > 0 && p.stockCount <= threshold);

      if (outOfStock.length === 0 && lowStock.length === 0) { skipped++; continue; }

      const dateLabel = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
      const html = buildLowStockHtml({
        businessName: tenant.businessName,
        date:         dateLabel,
        outOfStock:   outOfStock.map(p => ({ name: p.name, category: p.category ?? "" })),
        lowStock:     lowStock.map(p => ({ name: p.name, category: p.category ?? "", stockCount: p.stockCount ?? 0, threshold })),
      });

      const { fromAddress, fromName } = await getFromDetails(tenant.id);
      await sendMail({
        to: recipientEmail,
        subject: `⚠️ Low Stock Alert — ${tenant.businessName}`,
        html,
        fromAddress,
        fromName,
        tenantId: tenant.id,
      });

      logger.info({ tenantId: tenant.id, to: recipientEmail, outOfStock: outOfStock.length, lowStock: lowStock.length }, "Low stock alert sent");
      sent++;
    } catch (err) {
      logger.error({ tenantId: tenant.id, err }, "Low stock alert failed");
      failed++;
    }
  }

  return { sent, failed, skipped };
}

/* ─────────────────────────────────────────────────────────────────
   JOB 3 — Subscription Renewal Reminders
   Fires at 14 / 10 / 7 / 5 / 4 / 3 / 2 / 1 days before renewal.
──────────────────────────────────────────────────────────────────── */
export async function runSubscriptionExpiryAlerts(): Promise<{ sent: number; failed: number }> {
  let sent = 0, failed = 0;

  const WARN_DAYS = [14, 10, 7, 5, 4, 3, 2, 1];

  for (const daysLeft of WARN_DAYS) {
    const { start, end } = todayRange(daysLeft);

    // Fetch subscriptions whose renewal date falls in exactly this window today.
    const expiring = await db.select({
      tenantId:     subscriptionsTable.tenantId,
      status:       subscriptionsTable.status,
      trialEndsAt:  subscriptionsTable.trialEndsAt,
      periodEnd:    subscriptionsTable.currentPeriodEnd,
      planName:     subscriptionPlansTable.name,
      businessName: tenantsTable.businessName,
      ownerName:    tenantsTable.ownerName,
      email:        tenantsTable.email,
    })
    .from(subscriptionsTable)
    .leftJoin(subscriptionPlansTable, eq(subscriptionsTable.planId, subscriptionPlansTable.id))
    .innerJoin(tenantsTable, eq(subscriptionsTable.tenantId, tenantsTable.id))
    .where(
      or(
        and(
          eq(subscriptionsTable.status, "trial"),
          gte(subscriptionsTable.trialEndsAt, start),
          lte(subscriptionsTable.trialEndsAt, end),
        ),
        and(
          eq(subscriptionsTable.status, "active"),
          gte(subscriptionsTable.currentPeriodEnd, start),
          lte(subscriptionsTable.currentPeriodEnd, end),
        )
      )
    );

    for (const row of expiring) {
      try {
        const renewsAt = (row.status === "trial" ? row.trialEndsAt : row.periodEnd) as Date;
        const html = buildRenewalReminderHtml({
          businessName: row.businessName,
          ownerName:    row.ownerName,
          planName:     row.planName ?? "NEXXUS POS Plan",
          renewsAt,
          daysLeft,
          status:       row.status,
        });

        const isTrial = row.status === "trial";
        const subject = daysLeft === 1
          ? `🚨 ${isTrial ? "Your trial ends tomorrow" : "Your subscription renews tomorrow"} — ${row.businessName}`
          : daysLeft <= 4
            ? `⏰ ${isTrial ? "Trial ends" : "Subscription renews"} in ${daysLeft} days — ${row.businessName}`
            : `🔔 Renewal reminder: ${daysLeft} days to go — ${row.businessName}`;

        const { fromAddress, fromName } = await getFromDetails(0);
        await sendMail({
          to: row.email,
          subject,
          html,
          fromAddress,
          fromName,
          tenantId: 0,
        });

        logger.info({ tenantId: row.tenantId, daysLeft, to: row.email }, "Subscription renewal reminder sent");
        sent++;
      } catch (err) {
        logger.error({ tenantId: row.tenantId, daysLeft, err }, "Subscription renewal reminder failed");
        failed++;
      }
    }
  }

  return { sent, failed };
}
