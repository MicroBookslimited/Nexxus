/**
 * Work Order job-card HTML generator.
 *
 * Produces a self-contained printable HTML document with a Code128 barcode
 * (via JsBarcode), customer/asset details, and a signed-off intake checklist.
 *
 * Usage:
 *   const html = generateJobCard(wo, { businessName, currency });
 *   const win = window.open("", "_blank");
 *   win?.document.write(html);
 *   win?.document.close();
 *   win?.print();
 */

export type JobCardWorkOrder = {
  workOrderNumber: string;
  status: string;
  createdAt: string | null;
  promisedDate?: string | null;
  // Customer
  customerName?: string | null;
  customerPhone?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  // Asset
  itemDescription: string;
  brand?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  imei?: string | null;
  colour?: string | null;
  conditionReceived?: string | null;
  accessoriesReceived?: string | null;
  // Service
  problemDescription: string;
  serviceType?: string | null;
  priority?: string | null;
  assignedStaffName?: string | null;
  storageLocation?: string | null;
  // Financials
  items?: Array<{ type: string; description: string; price: number; quantity: number }>;
  subtotal?: number | null;
  tax?: number | null;
  total?: number | null;
  depositRequired?: number | null;
  depositPaid?: number | null;
  notes?: string | null;
};

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function fmtCurr(n: number | null | undefined, currency: string): string {
  if (n == null) return "—";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, currencyDisplay: "narrowSymbol" }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

function row(label: string, value: string | null | undefined): string {
  if (!value) return "";
  return `<tr><td class="lbl">${label}</td><td>${escHtml(value)}</td></tr>`;
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function generateJobCard(
  wo: JobCardWorkOrder,
  opts: { businessName?: string | null; currency?: string; portalUrl?: string | null },
): string {
  const currency = opts.currency || "JMD";
  const clientName = wo.customerName || wo.contactName || "Walk-in";
  const clientPhone = wo.customerPhone || wo.contactPhone || "";
  const hasItems = (wo.items?.length ?? 0) > 0;

  const itemRows = hasItems
    ? (wo.items ?? [])
        .map(
          (it) =>
            `<tr>
               <td>${escHtml(it.description)}</td>
               <td class="c">${it.quantity}</td>
               <td class="r">${fmtCurr(it.price, currency)}</td>
               <td class="r">${fmtCurr(it.price * it.quantity, currency)}</td>
             </tr>`,
        )
        .join("")
    : `<tr><td colspan="4" class="c muted">No parts or labour added yet</td></tr>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Job Card ${escHtml(wo.workOrderNumber)}</title>
<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;color:#111;background:#fff;padding:16px}
  h1{font-size:18px;font-weight:700;margin:0}
  h2{font-size:12px;font-weight:700;margin:0 0 4px;text-transform:uppercase;letter-spacing:.06em;color:#555;border-bottom:1px solid #ddd;padding-bottom:2px;margin-bottom:6px;margin-top:12px}
  .header{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:12px;border-bottom:2px solid #111;padding-bottom:10px}
  .biz{flex:1}
  .biz-name{font-size:16px;font-weight:700}
  .biz-sub{color:#555;font-size:10px}
  .wo-info{text-align:right}
  .wo-num{font-size:20px;font-weight:800;letter-spacing:.04em}
  .badge{display:inline-block;padding:2px 7px;border-radius:3px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;background:#f3f4f6;border:1px solid #ddd}
  .badge.received{background:#e0f2fe;color:#0369a1;border-color:#bae6fd}
  .badge.in_progress{background:#fef3c7;color:#b45309;border-color:#fde68a}
  .badge.awaiting_parts{background:#fff7ed;color:#c2410c;border-color:#fed7aa}
  .badge.ready{background:#dcfce7;color:#15803d;border-color:#bbf7d0}
  .badge.collected{background:#ede9fe;color:#6d28d9;border-color:#ddd6fe}
  .badge.on_hold{background:#f3f4f6;color:#4b5563;border-color:#d1d5db}
  .badge.cancelled{background:#fee2e2;color:#dc2626;border-color:#fca5a5}
  table.info{width:100%;border-collapse:collapse}
  table.info td{padding:3px 0;vertical-align:top}
  table.info td.lbl{width:120px;color:#555;font-weight:600;padding-right:8px}
  .two-col{display:grid;grid-template-columns:1fr 1fr;gap:16px}
  table.lines{width:100%;border-collapse:collapse;margin-top:4px}
  table.lines th{background:#f3f4f6;font-size:10px;text-transform:uppercase;letter-spacing:.06em;padding:4px 6px;border:1px solid #ddd}
  table.lines td{padding:4px 6px;border:1px solid #ddd}
  .c{text-align:center}
  .r{text-align:right}
  .muted{color:#888}
  .totals{margin-top:8px;display:grid;grid-template-columns:1fr auto auto;gap:2px 12px;max-width:300px;margin-left:auto}
  .totals .lbl{text-align:left;color:#555}
  .totals .big{font-size:13px;font-weight:700}
  .sig-row{display:flex;gap:24px;margin-top:20px}
  .sig-box{flex:1;border-top:1px solid #aaa;padding-top:4px;color:#555;font-size:10px;text-align:center}
  .barcode-wrap{text-align:center;margin-top:12px}
  .barcode-wrap svg{max-width:280px}
  .print-btn{display:inline-block;margin-bottom:16px;padding:8px 16px;background:#111;color:#fff;border:none;border-radius:4px;font-size:13px;cursor:pointer}
  @media print{.print-btn{display:none}body{padding:0}}
</style>
</head>
<body>
<button class="print-btn" onclick="window.print()">🖨️ Print Job Card</button>

<div class="header">
  <div class="biz">
    ${opts.businessName ? `<div class="biz-name">${escHtml(opts.businessName)}</div>` : ""}
    <div class="biz-sub">Work Order / Job Card</div>
  </div>
  <div class="wo-info">
    <div class="wo-num">${escHtml(wo.workOrderNumber)}</div>
    <div style="margin-top:4px">
      <span class="badge ${wo.status}">${wo.status.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}</span>
    </div>
    ${wo.priority && wo.priority !== "normal" ? `<div style="margin-top:4px;color:#b45309;font-weight:700;font-size:10px;text-transform:uppercase">${escHtml(wo.priority)} Priority</div>` : ""}
    <div style="margin-top:4px;color:#555;font-size:10px">Created: ${fmtDate(wo.createdAt)}</div>
    ${wo.promisedDate ? `<div style="color:#555;font-size:10px">Due: ${fmtDate(wo.promisedDate)}</div>` : ""}
  </div>
</div>

<div class="two-col">
  <div>
    <h2>Customer</h2>
    <table class="info">
      ${row("Name", clientName)}
      ${row("Phone", clientPhone)}
      ${row("Email", wo.contactEmail)}
    </table>
  </div>
  <div>
    <h2>Assignment</h2>
    <table class="info">
      ${row("Technician", wo.assignedStaffName || "Unassigned")}
      ${row("Service Type", wo.serviceType)}
      ${row("Storage Loc.", wo.storageLocation)}
    </table>
  </div>
</div>

<h2>Asset / Item</h2>
<div class="two-col">
  <table class="info">
    ${row("Description", wo.itemDescription)}
    ${row("Brand", wo.brand)}
    ${row("Model", wo.model)}
    ${row("Colour", wo.colour)}
  </table>
  <table class="info">
    ${row("Serial No.", wo.serialNumber)}
    ${row("IMEI", wo.imei)}
    ${row("Condition", wo.conditionReceived)}
    ${row("Accessories", wo.accessoriesReceived)}
  </table>
</div>

<h2>Problem Reported</h2>
<div style="padding:6px;border:1px solid #ddd;border-radius:3px;background:#fafafa;white-space:pre-wrap">${escHtml(wo.problemDescription)}</div>

${hasItems ? `
<h2>Parts &amp; Labour</h2>
<table class="lines">
  <thead><tr><th>Description</th><th class="c">Qty</th><th class="r">Unit</th><th class="r">Amount</th></tr></thead>
  <tbody>${itemRows}</tbody>
</table>
<div class="totals">
  ${wo.subtotal != null ? `<span class="lbl">Subtotal</span><span></span><span>${fmtCurr(wo.subtotal, currency)}</span>` : ""}
  ${wo.tax != null ? `<span class="lbl">Tax</span><span></span><span>${fmtCurr(wo.tax, currency)}</span>` : ""}
  ${wo.total != null ? `<span class="lbl big">Total</span><span></span><span class="big">${fmtCurr(wo.total, currency)}</span>` : ""}
  ${wo.depositRequired != null ? `<span class="lbl">Deposit Required</span><span></span><span>${fmtCurr(wo.depositRequired, currency)}</span>` : ""}
  ${(wo.depositPaid ?? 0) > 0 ? `<span class="lbl">Deposit Paid</span><span></span><span>${fmtCurr(wo.depositPaid ?? 0, currency)}</span>` : ""}
</div>
` : ""}

${wo.notes ? `<h2>Notes</h2><div style="padding:6px;border:1px solid #ddd;border-radius:3px;background:#fafafa;white-space:pre-wrap">${escHtml(wo.notes)}</div>` : ""}

<div class="sig-row">
  <div class="sig-box">Customer Signature<br><br><br>___________________________</div>
  <div class="sig-box">Staff Signature<br><br><br>___________________________</div>
  <div class="sig-box">Date<br><br><br>___________________________</div>
</div>

<div class="barcode-wrap">
  <svg id="wo-barcode"></svg>
  <div style="font-size:10px;color:#555;margin-top:2px">${escHtml(wo.workOrderNumber)}</div>
</div>

${opts.portalUrl ? `
<div style="margin-top:16px;border-top:1px solid #ddd;padding-top:12px;display:flex;align-items:center;gap:16px">
  <img src="https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(opts.portalUrl)}" width="80" height="80" alt="QR code" style="border:1px solid #ddd;border-radius:4px;flex-shrink:0" />
  <div style="font-size:10px;color:#555">
    <div style="font-weight:700;margin-bottom:2px">Check repair status online</div>
    <div style="word-break:break-all;color:#888">${escHtml(opts.portalUrl)}</div>
  </div>
</div>` : ""}

<script>
  document.addEventListener("DOMContentLoaded", function() {
    if (typeof JsBarcode !== "undefined") {
      JsBarcode("#wo-barcode", ${JSON.stringify(wo.workOrderNumber)}, {
        format: "CODE128",
        width: 2,
        height: 50,
        displayValue: false,
        margin: 4,
      });
    }
  });
</script>
</body>
</html>`;
}
