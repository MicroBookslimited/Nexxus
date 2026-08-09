/**
 * Generates a professional work-order PDF (PDFKit) matching the
 * MicroBooks work order document format.
 */
import PDFDocument from "pdfkit";

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
  /** Captured completion signature — when present the sign-off section renders the drawn signature instead of blank lines. */
  signature?: {
    /** SVG data URL produced by the FSM signature pad (plain <polyline> strokes). */
    svgDataUrl: string;
    signedBy: string;
    signedAt: Date;
  } | null;
  business: {
    name: string;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    logoBuffer?: Buffer | null;  // tenant logo image — embedded in letterhead when provided
  };
}

const M = 56;  // page margin
const PW = 595.28; // A4 width
const IW = PW - M * 2; // inner width

const C = {
  ink:    "#1a1a1a",
  muted:  "#6b7280",
  line:   "#e5e7eb",
  brand:  "#00AEEF",
  header: "#f8f9fa",
};

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

/** Draws the top header bar: optional logo left + business info.
 *  Returns the Y coordinate of the bottom of the bar. */
function drawLetterhead(doc: PDFKit.PDFDocument, biz: WorkOrderDocData["business"]): number {
  const hasLogo = !!biz.logoBuffer;
  const barH = hasLogo ? 60 : 38;
  doc.rect(0, 0, PW, barH).fill(C.header);

  if (hasLogo) {
    // Logo on the left, contact text on the right
    const logoH = 40;
    const logoY = (barH - logoH) / 2;
    const logoX = M;
    try {
      doc.image(biz.logoBuffer!, logoX, logoY, { height: logoH, fit: [160, logoH] });
    } catch {
      // If image embedding fails, fall through to text-only
    }

    const parts: string[] = [biz.name];
    if (biz.address) parts.push(biz.address);
    if (biz.phone)   parts.push(biz.phone.replace(/\D/g, "").replace(/^1?(\d{3})(\d{3})(\d{4})$/, "1($1)$2-$3") || biz.phone);
    if (biz.email)   parts.push(biz.email);
    const textX = M + 170;
    const textW = IW - 170;
    doc.font("Helvetica-Bold").fontSize(10).fillColor(C.ink)
      .text(biz.name, textX, 12, { width: textW, align: "right" });
    if (parts.length > 1) {
      doc.font("Helvetica").fontSize(7.5).fillColor(C.muted)
        .text(parts.slice(1).join("  |  "), textX, 26, { width: textW, align: "right" });
    }
  } else {
    // Centered text-only layout
    const parts: string[] = [biz.name];
    if (biz.address) parts.push(biz.address);
    if (biz.phone)   parts.push(biz.phone.replace(/\D/g, "").replace(/^1?(\d{3})(\d{3})(\d{4})$/, "1($1)$2-$3") || biz.phone);
    if (biz.email)   parts.push(biz.email);
    const line = parts.join("  |  ");
    doc.font("Helvetica").fontSize(8).fillColor(C.muted)
      .text(line, M, 13, { width: IW, align: "center" });
  }

  // Thin brand accent line below the bar
  doc.moveTo(0, barH).lineTo(PW, barH).strokeColor(C.brand).lineWidth(2).stroke();
  return barH;
}

/**
 * Draws the two-column meta-info block (Work Order #, Date Issued, Client, …).
 * Returns the Y position after the block.
 */
function drawMetaBlock(
  doc: PDFKit.PDFDocument,
  data: WorkOrderDocData,
  startY: number,
): number {
  const rows: Array<[string, string]> = [
    ["Work Order #:",        data.workOrderNumber],
    ["Date Issued:",         fmtDate(data.dateIssued)],
    ["Client:",              data.clientName],
    ["Site Address:",        data.siteAddress ?? "—"],
    ["Technicians Assigned:", data.techniciansAssigned || "—"],
    ["Scheduled Visit:",     data.scheduledVisit ?? "—"],
  ];

  const labelW = 160;
  const valueW = IW - labelW;
  let y = startY;

  for (const [label, value] of rows) {
    doc.font("Helvetica-Bold").fontSize(9).fillColor(C.ink)
      .text(label, M, y, { width: labelW, continued: false });
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

/** Draws a bold section heading + horizontal rule. Returns new Y. */
function drawSection(doc: PDFKit.PDFDocument, title: string, y: number): number {
  doc.font("Helvetica-Bold").fontSize(11).fillColor(C.ink).text(title, M, y);
  y += 16;
  doc.moveTo(M, y).lineTo(PW - M, y).strokeColor(C.line).lineWidth(1).stroke();
  return y + 8;
}

/** Draws bullet list paragraphs. Returns new Y. */
function drawBullets(doc: PDFKit.PDFDocument, text: string, y: number): number {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    doc.font("Helvetica").fontSize(9).fillColor(C.ink)
      .text(`• ${line}`, M + 8, y, { width: IW - 8 });
    y = doc.y + 4;
  }
  return y;
}

/** Draws a line items table. Returns new Y. */
function drawLineItems(doc: PDFKit.PDFDocument, items: WorkOrderDocItem[], currency: string, y: number): number {
  if (items.length === 0) return y;

  const right = PW - M;
  const cols = { desc: M, qty: right - 200, unit: right - 110, total: right - 50 };

  // Header
  doc.font("Helvetica").fontSize(8).fillColor(C.muted);
  doc.text("Description",   cols.desc, y, { width: cols.qty - cols.desc - 8 });
  doc.text("Qty",           cols.qty,  y, { width: 50, align: "right" });
  doc.text("Unit Price",    cols.unit, y, { width: 60, align: "right" });
  doc.text("Total",         cols.total, y, { width: 50, align: "right" });
  y += 14;
  doc.moveTo(M, y).lineTo(right, y).strokeColor(C.line).lineWidth(0.5).stroke();
  y += 6;

  let grandTotal = 0;
  for (const item of items) {
    const total = item.quantity * item.unitPrice;
    grandTotal += total;
    const h = doc.heightOfString(item.description, { width: cols.qty - cols.desc - 8 });
    doc.font("Helvetica").fontSize(9).fillColor(C.ink)
      .text(item.description, cols.desc, y, { width: cols.qty - cols.desc - 8 });
    doc.text(String(item.quantity),         cols.qty,   y, { width: 50, align: "right" });
    doc.text(money(item.unitPrice, currency), cols.unit, y, { width: 60, align: "right" });
    doc.text(money(total, currency),          cols.total, y, { width: 50, align: "right" });
    y += Math.max(h, 12) + 6;
  }

  // Total row
  doc.moveTo(M, y - 2).lineTo(right, y - 2).strokeColor(C.line).lineWidth(0.5).stroke();
  doc.font("Helvetica-Bold").fontSize(9).fillColor(C.ink)
    .text("Total",           cols.unit - 40, y, { width: 100, align: "right" })
    .text(money(grandTotal, currency), cols.total, y, { width: 50, align: "right" });
  return y + 20;
}

/**
 * Parses the signature-pad SVG data URL (plain <polyline points="x,y …"> strokes)
 * and returns the strokes plus the source canvas size. Returns null when the
 * payload isn't the expected simple SVG (e.g. a raster signature).
 */
function parseSignatureSvg(dataUrl: string): { strokes: Array<Array<{ x: number; y: number }>>; width: number; height: number } | null {
  if (!dataUrl.startsWith("data:image/svg+xml;base64,")) return null;
  let svg: string;
  try {
    svg = Buffer.from(dataUrl.split(",")[1] ?? "", "base64").toString("utf8");
  } catch {
    return null;
  }
  // Tolerant viewBox parse (decimals, negative origin, comma/space separators),
  // falling back to width/height attributes.
  const vb = svg.match(/viewBox\s*=\s*"\s*(-?[\d.]+)[\s,]+(-?[\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*"/i);
  let width = vb ? parseFloat(vb[3]) : NaN;
  let height = vb ? parseFloat(vb[4]) : NaN;
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    const w = svg.match(/<svg[^>]*\swidth\s*=\s*"([\d.]+)"/i);
    const h = svg.match(/<svg[^>]*\sheight\s*=\s*"([\d.]+)"/i);
    width = w ? parseFloat(w[1]) : NaN;
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

/** Draws the captured signature strokes into a box at (x, y). Returns the box height, or 0 when unparsable. */
function drawSignatureStrokes(doc: PDFKit.PDFDocument, dataUrl: string, x: number, y: number, boxW: number, boxH: number): number {
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

/** Draws the COMPLETION SIGN-OFF section. */
function drawSignOff(doc: PDFKit.PDFDocument, data: WorkOrderDocData, y: number): void {
  if (y > 650) doc.addPage();

  y = drawSection(doc, "COMPLETION SIGN-OFF", y);
  doc.font("Helvetica").fontSize(9).fillColor(C.muted)
    .text(
      "To be completed upon conclusion of the site visit, confirming that the above work was carried out and is satisfactory.",
      M, y, { width: IW },
    );
  y = doc.y + 18;

  // Technician signature lines
  const techs = data.techniciansAssigned.split(",").map((s) => s.trim()).filter(Boolean);
  if (techs.length > 0) {
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor(C.ink).text("Technicians:", M, y);
    y += 14;
    for (const tech of techs) {
      doc.font("Helvetica").fontSize(9).fillColor(C.ink).text(tech, M + 12, y);
      y += 13;
      doc.moveTo(M + 12, y + 4).lineTo(M + 280, y + 4).strokeColor(C.muted).lineWidth(0.5).stroke();
      doc.font("Helvetica").fontSize(8).fillColor(C.muted).text("Date: ___________________", M + 12, y + 8);
      y += 28;
    }
  }

  // Client representative
  y += 4;
  doc.font("Helvetica-Bold").fontSize(9.5).fillColor(C.ink).text("Client Representative:", M, y);
  y += 14;

  if (data.signature) {
    // Captured digital signature
    doc.font("Helvetica").fontSize(9).fillColor(C.ink).text(data.signature.signedBy, M + 12, y);
    y += 13;
    const sigH = drawSignatureStrokes(doc, data.signature.svgDataUrl, M + 12, y, 260, 80);
    y += (sigH > 0 ? sigH : 0) + 4;
    doc.moveTo(M + 12, y).lineTo(M + 280, y).strokeColor(C.muted).lineWidth(0.5).stroke();
    doc.font("Helvetica").fontSize(8).fillColor(C.muted)
      .text(`Digitally signed on ${fmtDate(data.signature.signedAt)}`, M + 12, y + 4);
  } else {
    doc.font("Helvetica").fontSize(9).fillColor(C.ink).text(`Name & Signature — ${data.clientName}`, M + 12, y);
    y += 13;
    doc.moveTo(M + 12, y + 4).lineTo(M + 280, y + 4).strokeColor(C.muted).lineWidth(0.5).stroke();
    doc.font("Helvetica").fontSize(8).fillColor(C.muted).text("Date: ___________________", M + 12, y + 8);
  }
}

export async function renderWorkOrderPdf(data: WorkOrderDocData): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: M, autoFirstPage: true });

  // ── Letterhead ─────────────────────────────────────────────────────────────
  const letterheadBottom = drawLetterhead(doc, data.business);

  // ── Title ──────────────────────────────────────────────────────────────────
  let y = letterheadBottom + 18;
  doc.font("Helvetica-Bold").fontSize(22).fillColor(C.ink)
    .text("WORK ORDER", M, y, { width: IW, align: "center" });
  y += 32;

  doc.moveTo(M, y).lineTo(PW - M, y).strokeColor(C.line).lineWidth(1).stroke();
  y += 16;

  // ── Meta block ─────────────────────────────────────────────────────────────
  y = drawMetaBlock(doc, data, y);
  y += 8;
  doc.moveTo(M, y).lineTo(PW - M, y).strokeColor(C.line).lineWidth(1).stroke();
  y += 16;

  // ── Scope of work ──────────────────────────────────────────────────────────
  y = drawSection(doc, "SCOPE OF WORK", y);
  y = drawBullets(doc, data.scopeOfWork, y);

  // Line items (parts / labour) — only if any
  if (data.lineItems.length > 0) {
    y += 10;
    y = drawSection(doc, "PARTS & LABOUR", y);
    y = drawLineItems(doc, data.lineItems, data.currency, y);
  }

  // ── Notes ──────────────────────────────────────────────────────────────────
  if (data.notes?.trim()) {
    y += 10;
    y = drawSection(doc, "NOTES", y);
    doc.font("Helvetica").fontSize(9).fillColor(C.ink)
      .text(data.notes.trim(), M, y, { width: IW });
    y = doc.y + 16;
  }

  // ── Sign-off ───────────────────────────────────────────────────────────────
  y += 10;
  drawSignOff(doc, data, y);

  return toBuffer(doc);
}
