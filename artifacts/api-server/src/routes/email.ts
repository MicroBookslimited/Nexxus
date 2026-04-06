import { Router, type IRouter } from "express";
import { SendMailClient } from "zeptomail";
import { db, ordersTable, orderItemsTable, cashSessionsTable, cashPayoutsTable } from "@workspace/db";
import { eq, and, gte, lte, isNotNull } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

const ZEPTOMAIL_API_URL = "api.zeptomail.com/";

function getZepto(): SendMailClient | null {
  const token = process.env["ZEPTOMAIL_TOKEN"];
  if (!token) return null;
  return new SendMailClient({ url: ZEPTOMAIL_API_URL, token });
}

function fmt(n: number) {
  return `$${Math.abs(n).toFixed(2)}`;
}

function formatDate(d: string | Date) {
  return new Date(d).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}
function formatTime(d: string | Date) {
  return new Date(d).toLocaleString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
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
    <div style="font-size:22px;font-weight:bold;letter-spacing:2px;">NEXUS POS</div>
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
    <div style="font-size:22px;font-weight:bold;letter-spacing:2px;">NEXUS POS</div>
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
  const zepto = getZepto();
  if (!zepto) {
    res.status(503).json({ error: "Email service not configured. Please set ZEPTOMAIL_TOKEN." });
    return;
  }

  const parsed = SendReceiptBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.issues });
    return;
  }

  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, parsed.data.orderId));
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

  try {
    const response = await zepto.sendMail({
      from: { address: "noreply@nexuspos.com", name: "Nexus POS" },
      to: [{ email_address: { address: parsed.data.to } }],
      subject: `Receipt — ${order.orderNumber}`,
      htmlbody: html,
    });
    res.json({ success: true, messageId: (response as { data?: { message_id?: string } })?.data?.message_id });
  } catch (err) {
    res.status(500).json({ error: "Failed to send email", details: String(err) });
  }
});

router.post("/email/eod-report", async (req, res): Promise<void> => {
  const zepto = getZepto();
  if (!zepto) {
    res.status(503).json({ error: "Email service not configured. Please set ZEPTOMAIL_TOKEN." });
    return;
  }

  const parsed = SendEodReportBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.issues });
    return;
  }

  const [session] = await db
    .select()
    .from(cashSessionsTable)
    .where(eq(cashSessionsTable.id, parsed.data.sessionId));

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

  try {
    const response = await zepto.sendMail({
      from: { address: "noreply@nexuspos.com", name: "Nexus POS" },
      to: [{ email_address: { address: parsed.data.to } }],
      subject: `End of Day Report — ${dateLabel} (${session.staffName})`,
      htmlbody: html,
    });
    res.json({ success: true, messageId: (response as { data?: { message_id?: string } })?.data?.message_id });
  } catch (err) {
    res.status(500).json({ error: "Failed to send email", details: String(err) });
  }
});

export default router;
