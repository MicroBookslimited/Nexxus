import PDFDocument from "pdfkit";
import { MB_LOGO_PNG_BASE64 } from "../assets/mb-logo";

/**
 * Generates MicroBooks-branded Invoice and Receipt PDFs for subscription
 * payments, styled after a Stripe/SaasAnt-style billing document.
 */

const LOGO = Buffer.from(MB_LOGO_PNG_BASE64, "base64");

export const MB_SELLER = {
  name: "MicroBooks Limited",
  lines: [
    "Shop 15, 12A Molynes Road",
    "Kingston 10",
    "Jamaica",
    "+1-876-787-1538",
    "accounts@microbookssolutions.com",
  ],
};

const C = {
  ink: "#1a1a1a",
  muted: "#6b7280",
  line: "#e5e7eb",
  brand: "#00AEEF",
};

export interface BillingDocData {
  invoiceNumber: string;
  receiptNumber: string;
  planName: string;
  billingCycle: string;
  description: string;
  amount: number;
  currency: string;
  paymentMethodLabel: string;
  issuedAt: Date;
  dueDate: Date;
  paidAt: Date;
  billTo: { name: string; email: string; address?: string | null };
}

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(d);
}

function toBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

const M = 56; // page margin

function drawHeader(doc: PDFKit.PDFDocument, title: string) {
  // Logo, top-right.
  try {
    doc.image(LOGO, doc.page.width - M - 150, M, { width: 150 });
  } catch {
    // If the logo fails to decode for any reason, fall back to a text mark.
    doc.fontSize(16).fillColor(C.brand).font("Helvetica-Bold")
      .text("MicroBooks", doc.page.width - M - 150, M + 8, { width: 150, align: "right" });
  }
  doc.fillColor(C.ink).font("Helvetica-Bold").fontSize(24).text(title, M, M);
  doc.moveDown(0.2);
}

function drawMetaRow(doc: PDFKit.PDFDocument, label: string, value: string, y: number) {
  doc.font("Helvetica-Bold").fontSize(9).fillColor(C.ink).text(label, M, y, { width: 120, continued: false });
  doc.font("Helvetica").fontSize(9).fillColor(C.ink).text(value, M + 120, y);
}

function drawParties(doc: PDFKit.PDFDocument, data: BillingDocData, y: number): number {
  const colW = (doc.page.width - M * 2 - 40) / 2;
  // Seller (left)
  doc.font("Helvetica-Bold").fontSize(10).fillColor(C.ink).text(MB_SELLER.name, M, y);
  doc.font("Helvetica").fontSize(9).fillColor(C.muted);
  MB_SELLER.lines.forEach((ln) => doc.text(ln, M, doc.y, { width: colW }));
  const leftEnd = doc.y;

  // Bill to (right)
  const rx = M + colW + 40;
  doc.font("Helvetica-Bold").fontSize(10).fillColor(C.ink).text("Bill to", rx, y);
  doc.font("Helvetica").fontSize(9).fillColor(C.muted);
  doc.text(data.billTo.name || "—", rx, doc.y, { width: colW });
  if (data.billTo.address) {
    data.billTo.address.split(/\r?\n/).forEach((ln) => doc.text(ln, rx, doc.y, { width: colW }));
  }
  if (data.billTo.email) doc.text(data.billTo.email, rx, doc.y, { width: colW });
  const rightEnd = doc.y;

  return Math.max(leftEnd, rightEnd);
}

function drawLineItems(doc: PDFKit.PDFDocument, data: BillingDocData, startY: number, amountLabel: string): number {
  const right = doc.page.width - M;
  const cols = { desc: M, qty: right - 200, unit: right - 130, amount: right - 70 };
  let y = startY;

  // Header row
  doc.font("Helvetica").fontSize(8).fillColor(C.muted);
  doc.text("Description", cols.desc, y);
  doc.text("Qty", cols.qty, y, { width: 40, align: "right" });
  doc.text("Unit price", cols.unit, y, { width: 60, align: "right" });
  doc.text("Amount", cols.amount, y, { width: 70, align: "right" });
  y += 14;
  doc.moveTo(M, y).lineTo(right, y).strokeColor(C.line).lineWidth(1).stroke();
  y += 10;

  // Item row
  doc.font("Helvetica").fontSize(9).fillColor(C.ink);
  const descHeight = doc.heightOfString(data.description, { width: cols.qty - cols.desc - 10 });
  doc.text(data.description, cols.desc, y, { width: cols.qty - cols.desc - 10 });
  doc.text("1", cols.qty, y, { width: 40, align: "right" });
  doc.text(money(data.amount, data.currency), cols.unit, y, { width: 60, align: "right" });
  doc.text(money(data.amount, data.currency), cols.amount, y, { width: 70, align: "right" });
  y += Math.max(descHeight, 12) + 16;

  // Totals block (right-aligned)
  const totLabelX = cols.unit - 60;
  const totValX = cols.amount;
  const totW = 130;
  const valW = 70;
  const rows: Array<[string, string, boolean]> = [
    ["Subtotal", money(data.amount, data.currency), false],
    ["Total", money(data.amount, data.currency), false],
    [amountLabel, money(data.amount, data.currency), true],
  ];
  doc.moveTo(totLabelX, y - 6).lineTo(right, y - 6).strokeColor(C.line).lineWidth(1).stroke();
  for (const [label, val, bold] of rows) {
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9).fillColor(C.ink);
    doc.text(label, totLabelX, y, { width: totW, align: "left" });
    doc.text(val, totValX, y, { width: valW, align: "right" });
    y += 16;
  }
  return y;
}

export async function renderInvoicePdf(data: BillingDocData): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: M });
  drawHeader(doc, "Invoice");

  let y = M + 44;
  drawMetaRow(doc, "Invoice number", data.invoiceNumber, y); y += 14;
  drawMetaRow(doc, "Date of issue", fmtDate(data.issuedAt), y); y += 14;
  drawMetaRow(doc, "Date due", fmtDate(data.dueDate), y); y += 24;

  const partiesEnd = drawParties(doc, data, y);
  y = partiesEnd + 24;

  doc.font("Helvetica-Bold").fontSize(14).fillColor(C.ink)
    .text(`${money(data.amount, data.currency)} ${data.currency} due ${fmtDate(data.dueDate)}`, M, y);
  y += 30;

  drawLineItems(doc, data, y, "Amount due");
  return toBuffer(doc);
}

export async function renderReceiptPdf(data: BillingDocData): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: M });
  drawHeader(doc, "Receipt");

  let y = M + 44;
  drawMetaRow(doc, "Invoice number", data.invoiceNumber, y); y += 14;
  drawMetaRow(doc, "Receipt number", data.receiptNumber, y); y += 14;
  drawMetaRow(doc, "Date paid", fmtDate(data.paidAt), y); y += 24;

  const partiesEnd = drawParties(doc, data, y);
  y = partiesEnd + 24;

  doc.font("Helvetica-Bold").fontSize(14).fillColor(C.ink)
    .text(`${money(data.amount, data.currency)} paid on ${fmtDate(data.paidAt)}`, M, y);
  y += 30;

  y = drawLineItems(doc, data, y, "Amount paid");
  y += 20;

  // Payment history
  const right = doc.page.width - M;
  doc.font("Helvetica-Bold").fontSize(12).fillColor(C.ink).text("Payment history", M, y);
  y += 20;
  const cols = { method: M, date: right - 260, amount: right - 150, receipt: right - 70 };
  doc.font("Helvetica").fontSize(8).fillColor(C.muted);
  doc.text("Payment method", cols.method, y);
  doc.text("Date", cols.date, y, { width: 90, align: "left" });
  doc.text("Amount paid", cols.amount, y, { width: 80, align: "left" });
  doc.text("Receipt number", cols.receipt, y, { width: 70, align: "right" });
  y += 14;
  doc.moveTo(M, y).lineTo(right, y).strokeColor(C.line).lineWidth(1).stroke();
  y += 8;
  doc.font("Helvetica").fontSize(9).fillColor(C.ink);
  doc.text(data.paymentMethodLabel || "—", cols.method, y, { width: cols.date - cols.method - 10 });
  doc.text(fmtDate(data.paidAt), cols.date, y, { width: 90, align: "left" });
  doc.text(money(data.amount, data.currency), cols.amount, y, { width: 80, align: "left" });
  doc.text(data.receiptNumber, cols.receipt, y, { width: 70, align: "right" });

  return toBuffer(doc);
}
