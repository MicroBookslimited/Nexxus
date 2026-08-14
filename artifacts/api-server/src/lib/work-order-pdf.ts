/**
 * Generates professional work-order PDFs (PDFKit) matching the
 * MicroBooks work order document format.
 *
 * renderWorkOrderPdf  — initial dispatch document + signed completion copy
 *                        (barcode + QR code embedded when signature present)
 * renderWorkOrderPhotosPdf — proof-of-work photo attachment
 */
import PDFDocument from "pdfkit";
import bwipjs from "bwip-js";
import QRCode from "qrcode";

export interface WorkOrderDocItem {
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface WorkOrderDocData {
  workOrderNumber: string;
  dateIssued: Date;
  clientName: string;
  siteAddress?: string | null;
  techniciansAssigned: string;   // comma-separated staff names
  scheduledVisit?: string | null;
  itemDescription: string;       // device / item being serviced
  scopeOfWork: string;           // problem description (may be multi-line)
  lineItems: WorkOrderDocItem[];  // parts & labour rows
  notes?: string | null;
  currency: string;
  /** Captured completion signature — when present the sign-off section renders
   *  the drawn signature and a barcode + QR code are appended. */
  signature?: {
    /** SVG data URL produced by the FSM signature pad (plain <polyline> strokes),
     *  or the sentinel string "otp-verified". */
    svgDataUrl: string;
    signedBy: string;
    signedAt: Date;
  } | null;
  business: {
    name: string;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    logoBuffer?: Buffer | null;  // tenant logo image — embedded in letterhead
  };
}

const M = 56;        // page margin
const PW = 595.28;   // A4 width
const IW = PW - M * 2; // inner width

const C = {
  ink:    "#1a1a1a",
  muted:  "#6b7280",
  line:   "#e5e7eb",
  brand:  "#00AEEF",
  header: "#f8f9fa",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long", day: "numeric", year: "numeric",
  }).format(d);
}

function money(n: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

/** CODE128 barcode as a PNG buffer (never throws — returns null on failure). */
async function generateBarcodeBuffer(text: string): Promise<Buffer | null> {
  try {
    return await bwipjs.toBuffer({
      bcid:         "code128",
      text,
      scale:        2,
      height:       10,   // bar height in mm
      includetext:  false,
      paddingwidth: 2,
      paddingheight: 2,
    });
  } catch {
    return null;
  }
}

/** QR code as a PNG buffer (never throws — returns null on failure). */
async function generateQrBuffer(text: string): Promise<Buffer | null> {
  try {
    return await QRCode.toBuffer(text, {
      type:   "png",
      width:  90,
      margin: 1,
      color:  { dark: "#1a1a1a", light: "#ffffff" },
    });
  } catch {
    return null;
  }
}

// ─── Layout primitives ────────────────────────────────────────────────────────

/** Draws the top letterhead bar.  Returns the Y coordinate of the bottom. */
function drawLetterhead(doc: PDFKit.PDFDocument, biz: WorkOrderDocData["business"]): number {
  const hasLogo = !!biz.logoBuffer;
  const barH = hasLogo ? 60 : 38;
  doc.rect(0, 0, PW, barH).fill(C.header);

  if (hasLogo) {
    const logoH = 40;
    const logoY = (barH - logoH) / 2;
    try {
      doc.image(biz.logoBuffer!, M, logoY, { height: logoH, fit: [160, logoH] });
    } catch { /* image embedding failed — fall through */ }

    const parts: string[] = [];
    if (biz.address) parts.push(biz.address);
    if (biz.phone)   parts.push(biz.phone.replace(/\D/g, "").replace(/^1?(\d{3})(\d{3})(\d{4})$/, "1($1)$2-$3") || biz.phone);
    if (biz.email)   parts.push(biz.email);
    const textX = M + 170;
    const textW = IW - 170;
    doc.font("Helvetica-Bold").fontSize(10).fillColor(C.ink)
      .text(biz.name, textX, 12, { width: textW, align: "right" });
    if (parts.length > 0) {
      doc.font("Helvetica").fontSize(7.5).fillColor(C.muted)
        .text(parts.join("  |  "), textX, 26, { width: textW, align: "right" });
    }
  } else {
    const parts: string[] = [biz.name];
    if (biz.address) parts.push(biz.address);
    if (biz.phone)   parts.push(biz.phone.replace(/\D/g, "").replace(/^1?(\d{3})(\d{3})(\d{4})$/, "1($1)$2-$3") || biz.phone);
    if (biz.email)   parts.push(biz.email);
    doc.font("Helvetica").fontSize(8).fillColor(C.muted)
      .text(parts.join("  |  "), M, 13, { width: IW, align: "center" });
  }

  doc.moveTo(0, barH).lineTo(PW, barH).strokeColor(C.brand).lineWidth(2).stroke();
  return barH;
}

/**
 * Two-column meta-info block (Work Order #, Date Issued, Client, …).
 * Returns the Y position after the block.
 */
function drawMetaBlock(doc: PDFKit.PDFDocument, data: WorkOrderDocData, startY: number): number {
  const techs = data.techniciansAssigned.split(",").map((s) => s.trim()).filter(Boolean);
  const techLabel = techs.length === 1 ? "Technician Assigned:" : "Technicians Assigned:";

  const rows: Array<[string, string]> = [
    ["Work Order #:",   data.workOrderNumber],
    ["Date Issued:",    fmtDate(data.dateIssued)],
    ["Client:",         data.clientName],
    ["Site Address:",   data.siteAddress ?? "—"],
    [techLabel,         data.techniciansAssigned || "—"],
    ["Scheduled Visit:", data.scheduledVisit ?? "—"],
  ];

  const labelW = 160;
  const valueW = IW - labelW;
  let y = startY;

  for (const [label, value] of rows) {
    doc.font("Helvetica-Bold").fontSize(9).fillColor(C.ink)
      .text(label, M, y, { width: labelW });
    const rowH = Math.max(
      doc.heightOfString(label, { width: labelW }),
      doc.heightOfString(value, { width: valueW }),
    );
    doc.font("Helvetica").fontSize(9).fillColor(C.ink)
      .text(value, M + labelW, y, { width: valueW });
    y += rowH + 7;
  }
  return y + 6;
}

/** Bold section heading + horizontal rule. Returns new Y. */
function drawSection(doc: PDFKit.PDFDocument, title: string, y: number): number {
  doc.font("Helvetica-Bold").fontSize(11).fillColor(C.ink).text(title, M, y);
  y += 16;
  doc.moveTo(M, y).lineTo(PW - M, y).strokeColor(C.line).lineWidth(1).stroke();
  return y + 8;
}

/**
 * Numbered paragraph list.  Each non-empty line becomes "1. …", "2. …", etc.
 * Returns new Y.
 */
function drawNumberedItems(doc: PDFKit.PDFDocument, text: string, y: number): number {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  lines.forEach((line, idx) => {
    const numStr = `${idx + 1}.`;
    const indent = 24;
    doc.font("Helvetica-Bold").fontSize(9).fillColor(C.ink)
      .text(numStr, M, y, { width: indent, continued: false });
    const lineH = doc.heightOfString(line, { width: IW - indent });
    doc.font("Helvetica").fontSize(9).fillColor(C.ink)
      .text(line, M + indent, y, { width: IW - indent });
    y = doc.y + 4;
  });
  return y;
}

/** Line-items table.  Returns new Y. */
function drawLineItems(doc: PDFKit.PDFDocument, items: WorkOrderDocItem[], currency: string, y: number): number {
  if (items.length === 0) return y;
  const right = PW - M;
  const cols  = { desc: M, qty: right - 200, unit: right - 110, total: right - 50 };

  doc.font("Helvetica").fontSize(8).fillColor(C.muted);
  doc.text("Description", cols.desc, y, { width: cols.qty - cols.desc - 8 });
  doc.text("Qty",         cols.qty,  y, { width: 50, align: "right" });
  doc.text("Unit Price",  cols.unit, y, { width: 60, align: "right" });
  doc.text("Total",       cols.total, y, { width: 50, align: "right" });
  y += 14;
  doc.moveTo(M, y).lineTo(right, y).strokeColor(C.line).lineWidth(0.5).stroke();
  y += 6;

  let grandTotal = 0;
  for (const item of items) {
    const total = item.quantity * item.unitPrice;
    grandTotal += total;
    const h = doc.heightOfString(item.description, { width: cols.qty - cols.desc - 8 });
    doc.font("Helvetica").fontSize(9).fillColor(C.ink)
      .text(item.description,             cols.desc,  y, { width: cols.qty - cols.desc - 8 });
    doc.text(String(item.quantity),        cols.qty,   y, { width: 50, align: "right" });
    doc.text(money(item.unitPrice, currency), cols.unit, y, { width: 60, align: "right" });
    doc.text(money(total, currency),       cols.total, y, { width: 50, align: "right" });
    y += Math.max(h, 12) + 6;
  }
  doc.moveTo(M, y - 2).lineTo(right, y - 2).strokeColor(C.line).lineWidth(0.5).stroke();
  doc.font("Helvetica-Bold").fontSize(9).fillColor(C.ink)
    .text("Total",                cols.unit - 40, y, { width: 100, align: "right" })
    .text(money(grandTotal, currency), cols.total, y, { width: 50,  align: "right" });
  return y + 20;
}

/** Parse the FSM SVG signature polylines.  Returns null when unparsable. */
function parseSignatureSvg(dataUrl: string): {
  strokes: Array<Array<{ x: number; y: number }>>;
  width: number;
  height: number;
} | null {
  if (!dataUrl.startsWith("data:image/svg+xml;base64,")) return null;
  let svg: string;
  try { svg = Buffer.from(dataUrl.split(",")[1] ?? "", "base64").toString("utf8"); }
  catch { return null; }

  const vb = svg.match(/viewBox\s*=\s*"\s*(-?[\d.]+)[\s,]+(-?[\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*"/i);
  let width  = vb ? parseFloat(vb[3]) : NaN;
  let height = vb ? parseFloat(vb[4]) : NaN;
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    const w = svg.match(/<svg[^>]*\swidth\s*=\s*"([\d.]+)"/i);
    const h = svg.match(/<svg[^>]*\sheight\s*=\s*"([\d.]+)"/i);
    width  = w ? parseFloat(w[1]) : NaN;
    height = h ? parseFloat(h[1]) : NaN;
  }
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;

  const strokes: Array<Array<{ x: number; y: number }>> = [];
  const re = /points="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(svg)) !== null) {
    const pts = m[1].trim().split(/\s+/).map((pair) => {
      const [x, y] = pair.split(",").map(Number);
      return { x, y };
    }).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
    if (pts.length > 1) strokes.push(pts);
  }
  return strokes.length > 0 ? { strokes, width, height } : null;
}

function drawSignatureStrokes(
  doc: PDFKit.PDFDocument,
  dataUrl: string,
  x: number, y: number,
  boxW: number, boxH: number,
): number {
  const parsed = parseSignatureSvg(dataUrl);
  if (!parsed) return 0;
  const scale = Math.min(boxW / parsed.width, boxH / parsed.height);
  doc.save();
  for (const stroke of parsed.strokes) {
    doc.moveTo(x + stroke[0].x * scale, y + stroke[0].y * scale);
    for (let i = 1; i < stroke.length; i++) {
      doc.lineTo(x + stroke[i].x * scale, y + stroke[i].y * scale);
    }
    doc.lineWidth(1.2).strokeColor(C.ink).stroke();
  }
  doc.restore();
  return parsed.height * scale;
}

/** COMPLETION SIGN-OFF section.  Returns the Y after rendering. */
function drawSignOff(doc: PDFKit.PDFDocument, data: WorkOrderDocData, y: number): number {
  if (y > 650) { doc.addPage(); y = M; }

  y = drawSection(doc, "COMPLETION SIGN-OFF", y);
  doc.font("Helvetica").fontSize(9).fillColor(C.muted)
    .text(
      "To be completed upon conclusion of the site visit, confirming that the above work was carried out and is satisfactory.",
      M, y, { width: IW },
    );
  y = doc.y + 18;

  // Technician signature line(s)
  const techs = data.techniciansAssigned.split(",").map((s) => s.trim()).filter(Boolean);
  if (techs.length > 0) {
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor(C.ink)
      .text(techs.length === 1 ? "Technician:" : "Technicians:", M, y);
    y += 14;
    for (const tech of techs) {
      doc.font("Helvetica").fontSize(9).fillColor(C.ink).text(tech, M + 12, y);
      y += 13;
      doc.moveTo(M + 12, y + 4).lineTo(M + 280, y + 4).strokeColor(C.muted).lineWidth(0.5).stroke();
      doc.font("Helvetica").fontSize(8).fillColor(C.muted)
        .text("Date: ___________________", M + 12, y + 8);
      y += 28;
    }
  }

  // Client representative
  y += 4;
  doc.font("Helvetica-Bold").fontSize(9.5).fillColor(C.ink).text("Client Representative:", M, y);
  y += 14;

  if (data.signature) {
    const isOtp = data.signature.svgDataUrl === "otp-verified";
    doc.font("Helvetica").fontSize(9).fillColor(C.ink)
      .text(data.signature.signedBy, M + 12, y);
    y += 13;
    const sigH = isOtp
      ? 0
      : drawSignatureStrokes(doc, data.signature.svgDataUrl, M + 12, y, 260, 80);
    y += (sigH > 0 ? sigH : 0) + 4;
    doc.moveTo(M + 12, y).lineTo(M + 280, y).strokeColor(C.muted).lineWidth(0.5).stroke();
    doc.font("Helvetica").fontSize(8).fillColor(C.muted)
      .text(
        isOtp
          ? `Completion verified via one-time email code on ${fmtDate(data.signature.signedAt)}`
          : `Digitally signed on ${fmtDate(data.signature.signedAt)}`,
        M + 12, y + 4,
      );
    y += 20;
  } else {
    doc.font("Helvetica").fontSize(9).fillColor(C.ink)
      .text(`Name & Signature — ${data.clientName}`, M + 12, y);
    y += 13;
    doc.moveTo(M + 12, y + 4).lineTo(M + 280, y + 4).strokeColor(C.muted).lineWidth(0.5).stroke();
    doc.font("Helvetica").fontSize(8).fillColor(C.muted)
      .text("Date: ___________________", M + 12, y + 8);
    y += 24;
  }

  return y;
}

/**
 * Barcode + QR code block placed at the bottom of the completion document.
 * Never throws — if either image can't be rendered the section is omitted.
 */
async function drawBarcodeQrBlock(
  doc: PDFKit.PDFDocument,
  workOrderNumber: string,
  barcodeBuffer: Buffer | null,
  qrBuffer: Buffer | null,
  y: number,
): Promise<void> {
  if (!barcodeBuffer && !qrBuffer) return;

  const PAGE_BOTTOM = 841.89 - M;
  if (y + 80 > PAGE_BOTTOM) { doc.addPage(); y = M; }

  y += 10;
  doc.moveTo(M, y).lineTo(PW - M, y).strokeColor(C.line).lineWidth(0.5).stroke();
  y += 10;

  // QR on the right, barcode centred-left
  const qrSize = 72;
  const qrX    = PW - M - qrSize;

  if (qrBuffer) {
    try {
      doc.image(qrBuffer, qrX, y, { width: qrSize, height: qrSize });
      doc.font("Helvetica").fontSize(7).fillColor(C.muted)
        .text(workOrderNumber, qrX, y + qrSize + 3, { width: qrSize, align: "center" });
    } catch { /* silently skip */ }
  }

  if (barcodeBuffer) {
    const bcW = qrBuffer ? qrX - M - 16 : IW;
    try {
      // Scale barcode to fit available width at reasonable height
      doc.image(barcodeBuffer, M, y + 8, { width: Math.min(bcW, 200), height: 40 });
      doc.font("Helvetica").fontSize(7.5).fillColor(C.muted)
        .text(workOrderNumber, M, y + 52, { width: Math.min(bcW, 200), align: "center" });
    } catch { /* silently skip */ }
  }
}

// ─── Photo report PDF ──────────────────────────────────────────────────────────

export interface WorkOrderPhotoDoc {
  data: string;              // data URL
  caption?: string | null;
  staffName?: string | null;
  createdAt?: Date | null;
}

function decodeEmbeddablePhoto(dataUrl: string): Buffer | null {
  const m = /^data:image\/(jpeg|jpg|png);base64,(.+)$/i.exec(dataUrl.trim());
  if (!m || !m[2]) return null;
  try { return Buffer.from(m[2], "base64"); } catch { return null; }
}

/** Returns null when no embeddable photos were provided. */
export async function renderWorkOrderPhotosPdf(
  workOrderNumber: string,
  itemDescription: string,
  business: WorkOrderDocData["business"],
  photos: WorkOrderPhotoDoc[],
): Promise<Buffer | null> {
  const decoded = photos
    .map((p) => ({ ...p, buffer: decodeEmbeddablePhoto(p.data) }))
    .filter((p): p is WorkOrderPhotoDoc & { buffer: Buffer } => p.buffer != null);
  if (decoded.length === 0) return null;

  // Stay within email attachment limits (12 MB raw budget).
  const RAW_BUDGET = 12 * 1024 * 1024;
  const embeddable: typeof decoded = [];
  let spent = 0;
  for (const p of decoded) {
    if (spent + p.buffer.length > RAW_BUDGET && embeddable.length > 0) break;
    embeddable.push(p);
    spent += p.buffer.length;
  }
  const omitted = decoded.length - embeddable.length;

  const doc = new PDFDocument({ size: "A4", margin: M, autoFirstPage: true });
  const letterheadBottom = drawLetterhead(doc, business);

  let y = letterheadBottom + 18;
  doc.font("Helvetica-Bold").fontSize(18).fillColor(C.ink)
    .text("WORK COMPLETION PHOTOS", M, y, { width: IW, align: "center" });
  y += 26;
  doc.font("Helvetica").fontSize(10).fillColor(C.muted)
    .text(`Work Order ${workOrderNumber} — ${itemDescription}`, M, y, { width: IW, align: "center" });
  y += 18;
  doc.moveTo(M, y).lineTo(PW - M, y).strokeColor(C.line).lineWidth(1).stroke();
  y += 16;

  const PAGE_BOTTOM = 841.89 - M;
  const MAX_IMG_H   = 300;
  let embeddedCount = 0;

  for (const photo of embeddable) {
    const captionLines = [
      photo.caption?.trim() || null,
      [
        photo.staffName ? `Taken by ${photo.staffName}` : null,
        photo.createdAt ? fmtDate(new Date(photo.createdAt)) : null,
      ].filter(Boolean).join(" — ") || null,
    ].filter((s): s is string => !!s);

    doc.font("Helvetica").fontSize(9);
    const captionH = captionLines.reduce(
      (h, line) => h + doc.heightOfString(line, { width: IW }) + 3, 0,
    ) + 6;

    if (y + MAX_IMG_H + captionH > PAGE_BOTTOM) { doc.addPage(); y = M; }
    try {
      doc.image(photo.buffer, M, y, { fit: [IW, MAX_IMG_H], align: "center" });
    } catch { continue; }
    embeddedCount++;
    y += MAX_IMG_H + 6;
    for (const line of captionLines) {
      doc.font("Helvetica").fontSize(9).fillColor(C.muted).text(line, M, y, { width: IW });
      y += doc.heightOfString(line, { width: IW }) + 3;
    }
    y += 14;
  }

  if (embeddedCount === 0) return null;
  if (omitted > 0) {
    if (y + 20 > PAGE_BOTTOM) { doc.addPage(); y = M; }
    doc.font("Helvetica").fontSize(9).fillColor(C.muted)
      .text(
        `${omitted} additional photo${omitted === 1 ? "" : "s"} could not be included due to size limits.`,
        M, y, { width: IW },
      );
  }

  return toBuffer(doc);
}

// ─── Main work order PDF ───────────────────────────────────────────────────────

export async function renderWorkOrderPdf(data: WorkOrderDocData): Promise<Buffer> {
  const isCompletion = !!data.signature;

  // Pre-render barcode + QR concurrently for completion documents only.
  const [barcodeBuffer, qrBuffer] = isCompletion
    ? await Promise.all([
        generateBarcodeBuffer(data.workOrderNumber),
        generateQrBuffer(data.workOrderNumber),
      ])
    : [null, null];

  const doc = new PDFDocument({ size: "A4", margin: M, autoFirstPage: true });

  // ── Letterhead ───────────────────────────────────────────────────────────────
  const letterheadBottom = drawLetterhead(doc, data.business);

  // ── Title ────────────────────────────────────────────────────────────────────
  let y = letterheadBottom + 18;
  const title = isCompletion ? "WORK ORDER — COMPLETION COPY" : "WORK ORDER";
  doc.font("Helvetica-Bold").fontSize(isCompletion ? 18 : 22).fillColor(C.ink)
    .text(title, M, y, { width: IW, align: "center" });
  y += isCompletion ? 26 : 32;
  doc.moveTo(M, y).lineTo(PW - M, y).strokeColor(C.line).lineWidth(1).stroke();
  y += 16;

  // ── Meta block ───────────────────────────────────────────────────────────────
  y = drawMetaBlock(doc, data, y);
  y += 8;
  doc.moveTo(M, y).lineTo(PW - M, y).strokeColor(C.line).lineWidth(1).stroke();
  y += 16;

  // ── Scope of work ────────────────────────────────────────────────────────────
  y = drawSection(doc, "SCOPE OF WORK", y);
  y = drawNumberedItems(doc, data.scopeOfWork, y);

  // ── Parts & Labour ───────────────────────────────────────────────────────────
  if (data.lineItems.length > 0) {
    y += 10;
    y = drawSection(doc, "PARTS & LABOUR", y);
    y = drawLineItems(doc, data.lineItems, data.currency, y);
  }

  // ── Notes ────────────────────────────────────────────────────────────────────
  if (data.notes?.trim()) {
    y += 10;
    y = drawSection(doc, "NOTES", y);
    doc.font("Helvetica").fontSize(9).fillColor(C.ink)
      .text(data.notes.trim(), M, y, { width: IW });
    y = doc.y + 16;
  }

  // ── Sign-off ─────────────────────────────────────────────────────────────────
  y += 10;
  y = drawSignOff(doc, data, y);

  // ── Barcode + QR (completion documents only) ─────────────────────────────────
  if (isCompletion) {
    await drawBarcodeQrBlock(doc, data.workOrderNumber, barcodeBuffer, qrBuffer, y);
  }

  return toBuffer(doc);
}
