/**
 * Materials Dispatch Slip / Cable Allocation Sheet — PDF (PDFKit).
 *
 * Server-side twin of the printable office slip in NEXXUS POS Web
 * (nexus-pos/src/lib/dispatch-slip-doc.ts). Same document: Section A
 * office-dispatched items, the parts list carried on the job, a per-cable run
 * log with used/remaining footage, and three acknowledgement signature lines.
 *
 * Kept as a separate renderer from work-order-pdf.ts because this sheet is
 * landscape (the cable run log has nine columns) and carries no pricing —
 * technicians must not see cost/sell figures on a materials slip.
 */
import PDFDocument from "pdfkit";

export interface DispatchSlipRun {
  label: string;
  location?: string;
  port?: string;
  startFt?: number | null;
  endFt?: number | null;
  lengthFt?: number | null;
  tested?: boolean | null;
  remarks?: string;
}

export interface DispatchSlipAllocation {
  description: string;
  category: string | null;
  unit: string;
  qtyAllocated: number;
  qtyReturned: number;
  isReturnable: boolean;
  isCable: boolean;
  boxSizeFt: number | null;
  runs: DispatchSlipRun[];
  dispatchedByName: string | null;
  remarks: string | null;
}

/** A parts line carried on the work order itself (items of type "part"). */
export interface DispatchSlipPart {
  description: string;
  quantity: number;
}

export interface DispatchSlipData {
  workOrderNumber: string;
  dispatchDate: Date;
  /** Customer name and/or service address. */
  siteName: string | null;
  /** Comma-separated assigned technician names. */
  technicianNames: string;
  jobDescription: string;
  allocations: DispatchSlipAllocation[];
  parts: DispatchSlipPart[];
  business: {
    name: string;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    logoBuffer?: Buffer | null;
  };
}

const M = 40;          // page margin
const BOTTOM = 46;     // reserved bottom margin before a page break

const C = {
  ink:    "#111111",
  muted:  "#6b7280",
  line:   "#dddddd",
  head:   "#f3f4f6",
  brand:  "#00AEEF",
  faint:  "#bbbbbb",
};

type Align = "left" | "center" | "right";
interface Col { title: string; width: number; align?: Align }

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
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(d);
}

/** Footage / quantity formatting — integers stay clean, decimals keep 2 places. */
function fmtNum(n: number | null | undefined): string {
  if (n == null) return "";
  return Number.isInteger(n)
    ? n.toLocaleString("en-US")
    : n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function runsUsedFt(runs: DispatchSlipRun[]): number {
  return runs.reduce((s, r) => s + (r.lengthFt ?? 0), 0);
}

// ─── Layout primitives ────────────────────────────────────────────────────────

function innerWidth(doc: PDFKit.PDFDocument): number {
  return doc.page.width - M * 2;
}

/** Letterhead bar + brand rule. Returns the Y below it. */
function drawLetterhead(doc: PDFKit.PDFDocument, biz: DispatchSlipData["business"]): number {
  const IW = innerWidth(doc);
  const hasLogo = !!biz.logoBuffer;
  const barH = hasLogo ? 56 : 34;
  doc.rect(0, 0, doc.page.width, barH).fill(C.head);

  const contact = [biz.address, biz.phone, biz.email].filter(Boolean).join("  |  ");

  if (hasLogo) {
    const logoH = 38;
    try {
      doc.image(biz.logoBuffer!, M, (barH - logoH) / 2, { height: logoH, fit: [150, logoH] });
    } catch { /* unusable image — fall through to text only */ }
    const textX = M + 160;
    const textW = IW - 160;
    doc.font("Helvetica-Bold").fontSize(11).fillColor(C.ink)
      .text(biz.name, textX, 12, { width: textW, align: "right" });
    if (contact) {
      doc.font("Helvetica").fontSize(7.5).fillColor(C.muted)
        .text(contact, textX, 28, { width: textW, align: "right" });
    }
  } else {
    doc.font("Helvetica-Bold").fontSize(10).fillColor(C.ink)
      .text(biz.name, M, 8, { width: IW, align: "center" });
    if (contact) {
      doc.font("Helvetica").fontSize(7.5).fillColor(C.muted)
        .text(contact, M, 21, { width: IW, align: "center" });
    }
  }

  doc.moveTo(0, barH).lineTo(doc.page.width, barH).strokeColor(C.brand).lineWidth(2).stroke();
  return barH + 14;
}

/** Document title block (left caption, right title + reference). Returns new Y. */
function drawTitle(doc: PDFKit.PDFDocument, data: DispatchSlipData, y: number): number {
  const IW = innerWidth(doc);
  doc.font("Helvetica-Bold").fontSize(15).fillColor(C.ink)
    .text("Materials Dispatch Slip", M, y, { width: IW / 2 });
  doc.font("Helvetica").fontSize(8.5).fillColor(C.muted)
    .text("Materials Dispatch & Cable Allocation Record", M, y + 19, { width: IW / 2 });

  const refLines = [
    `Ref: ${data.workOrderNumber}`,
    data.siteName ? `Site: ${data.siteName}` : "",
    data.jobDescription ? `Job: ${data.jobDescription}` : "",
  ].filter(Boolean).join("\n");
  doc.font("Helvetica").fontSize(9).fillColor(C.ink)
    .text(refLines, M + IW / 2, y, { width: IW / 2, align: "right" });

  const bottom = Math.max(doc.y, y + 34) + 6;
  doc.moveTo(M, bottom).lineTo(doc.page.width - M, bottom).strokeColor(C.ink).lineWidth(1.2).stroke();
  return bottom + 12;
}

/** Uppercase section heading on a shaded strip. Returns new Y. */
function drawSection(doc: PDFKit.PDFDocument, title: string, y: number, right?: string): number {
  const IW = innerWidth(doc);
  const h = 17;
  y = ensureSpace(doc, h + 40, y); // never strand a heading at the page foot
  doc.rect(M, y, IW, h).fillAndStroke(C.head, C.line);
  // Single line, clipped: a long cable description must not burst the strip.
  doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#333333")
    .text(title.toUpperCase(), M + 6, y + 5, {
      width: right ? IW - 120 : IW - 12,
      height: 10, ellipsis: true, lineBreak: false, characterSpacing: 0.6,
    });
  if (right) {
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#333333")
      .text(right, M + 6, y + 5, { width: IW - 12, align: "right" });
  }
  return y + h + 2;
}

function drawHeaderRow(doc: PDFKit.PDFDocument, cols: Col[], y: number): number {
  const h = 16;
  let x = M;
  for (const col of cols) {
    doc.rect(x, y, col.width, h).fillAndStroke(C.head, C.line);
    doc.font("Helvetica-Bold").fontSize(7).fillColor("#555555")
      .text(col.title.toUpperCase(), x + 4, y + 5, {
        width: col.width - 8, align: col.align ?? "left", lineBreak: false,
      });
    x += col.width;
  }
  return y + h;
}

/**
 * Bordered table with automatic page breaks (header repeats on each page).
 * `blankRows` appends empty ruled rows for handwriting in the field.
 */
function drawTable(
  doc: PDFKit.PDFDocument,
  cols: Col[],
  rows: string[][],
  y: number,
  opts: { blankRows?: number; blankLabelFrom?: number } = {},
): number {
  y = drawHeaderRow(doc, cols, y);

  // A row taller than one page can never fit — clip it instead of letting
  // PDFKit auto-paginate the text out from under its own cell borders.
  const maxRowH = doc.page.height - BOTTOM - M - 16;

  const measureRow = (cells: string[]): number => {
    doc.font("Helvetica").fontSize(8);
    const heights = cells.map((cell, i) =>
      doc.heightOfString(cell || " ", { width: (cols[i]?.width ?? 40) - 8 }));
    return Math.min(maxRowH, Math.max(15, ...heights) + 6);
  };

  const renderRow = (cells: string[], startY: number, faint: boolean, rowH: number): number => {
    let x = M;
    cells.forEach((cell, i) => {
      const col = cols[i];
      if (!col) return;
      doc.rect(x, startY, col.width, rowH).strokeColor(C.line).lineWidth(0.5).stroke();
      if (cell) {
        doc.font("Helvetica").fontSize(8).fillColor(faint ? C.faint : C.ink)
          .text(cell, x + 4, startY + 4, {
            width: col.width - 8,
            height: rowH - 8,   // clips rather than spilling onto a new page
            ellipsis: true,
            align: col.align ?? "left",
          });
      }
      x += col.width;
    });
    return startY + rowH;
  };

  /** Measured-first page break: the row height is known before it is placed. */
  const place = (cells: string[], faint: boolean, startY: number): number => {
    const rowH = measureRow(cells);
    let rowY = startY;
    if (rowY + rowH > doc.page.height - BOTTOM) {
      doc.addPage();
      rowY = drawHeaderRow(doc, cols, M);
    }
    return renderRow(cells, rowY, faint, rowH);
  };

  for (const cells of rows) y = place(cells, false, y);

  const blanks = opts.blankRows ?? 0;
  for (let i = 0; i < blanks; i++) {
    const cells = cols.map(() => "");
    if (opts.blankLabelFrom != null) cells[0] = String(opts.blankLabelFrom + i);
    y = place(cells, true, y);
  }

  return y + 10;
}

/** Page-break helper for non-table blocks. */
function ensureSpace(doc: PDFKit.PDFDocument, needed: number, y: number): number {
  if (y + needed <= doc.page.height - BOTTOM) return y;
  doc.addPage();
  return M;
}

function drawNote(doc: PDFKit.PDFDocument, text: string, y: number): number {
  const IW = innerWidth(doc);
  doc.font("Helvetica").fontSize(8);
  const h = doc.heightOfString(text, { width: IW - 16 }) + 12;
  y = ensureSpace(doc, h + 6, y);
  doc.rect(M, y, IW, h).fillAndStroke("#fafafa", C.line);
  doc.font("Helvetica").fontSize(8).fillColor("#444444")
    .text(text, M + 8, y + 6, { width: IW - 16 });
  return y + h + 12;
}

/** Three signature boxes: office issue, technician receipt, return verification. */
function drawSignatures(doc: PDFKit.PDFDocument, data: DispatchSlipData, y: number): number {
  const IW = innerWidth(doc);
  y = ensureSpace(doc, 108, y);

  doc.moveTo(M, y).lineTo(M + IW, y).strokeColor(C.ink).lineWidth(1.2).stroke();
  y += 8;
  doc.font("Helvetica-Bold").fontSize(9).fillColor(C.ink)
    .text("ACKNOWLEDGEMENT & SIGNATURES", M, y, { characterSpacing: 0.6 });
  y += 20;

  const dispatchedBy = data.allocations.find((a) => a.dispatchedByName)?.dispatchedByName ?? "";
  const boxes: Array<[string, string]> = [
    [dispatchedBy, "Issued By (Office) — Signature"],
    [data.technicianNames, "Received By (Technician) — Signature"],
    ["", "Returned & Verified By — Signature"],
  ];

  const gap = 24;
  const boxW = (IW - gap * 2) / 3;
  boxes.forEach(([name, caption], i) => {
    const x = M + i * (boxW + gap);
    doc.font("Helvetica-Bold").fontSize(9).fillColor(C.ink)
      .text(name || " ", x, y, { width: boxW, lineBreak: false });
    const lineY = y + 44;
    doc.moveTo(x, lineY).lineTo(x + boxW, lineY).strokeColor("#555555").lineWidth(0.8).stroke();
    doc.font("Helvetica").fontSize(7.5).fillColor(C.muted)
      .text(caption, x, lineY + 4, { width: boxW - 34 })
      .text("Date", x + boxW - 30, lineY + 4, { width: 30, align: "right" });
  });

  return y + 70;
}

// ─── Document ─────────────────────────────────────────────────────────────────

export async function renderDispatchSlipPdf(data: DispatchSlipData): Promise<Buffer> {
  // Landscape: the cable run log carries nine columns.
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: M, bufferPages: true });
  const IW = innerWidth(doc);

  let y = drawLetterhead(doc, data.business);
  y = drawTitle(doc, data, y);

  // ── Dispatch metadata ──────────────────────────────────────────────────────
  const dispatchedBy = data.allocations.find((a) => a.dispatchedByName)?.dispatchedByName ?? "";
  const metaCols: Col[] = [
    { title: "Dispatch Date", width: IW * 0.16 },
    { title: "Dispatched By", width: IW * 0.18 },
    { title: "Technician / Receiver", width: IW * 0.24 },
    { title: "Site / Destination", width: IW * 0.28 },
    { title: "Expected Return", width: IW * 0.14 },
  ];
  y = drawTable(doc, metaCols, [[
    fmtDate(data.dispatchDate),
    dispatchedBy,
    data.technicianNames || "",
    data.siteName ?? "",
    "",
  ]], y);

  // ── Section A: office-dispatched materials ─────────────────────────────────
  const materials = data.allocations.filter((a) => !a.isCable);
  y = ensureSpace(doc, 70, y);
  y = drawSection(doc, "Section A — Dispatched From Office", y,
    `${materials.length} Item${materials.length === 1 ? "" : "s"}`);

  const matCols: Col[] = [
    { title: "#",    width: 26, align: "center" },
    { title: "Material / Item Description", width: IW - 26 - 70 - 60 - 60 - 130 - 180 },
    { title: "Cat.", width: 70,  align: "center" },
    { title: "Qty",  width: 60,  align: "center" },
    { title: "Unit", width: 60,  align: "center" },
    { title: "Condition", width: 130 },
    { title: "Remarks",   width: 180 },
  ];
  const matRows = materials.map((a, i) => [
    String(i + 1),
    a.description,
    a.category ?? "",
    fmtNum(a.qtyAllocated),
    a.unit,
    a.isReturnable ? "Tool — return required" : "",
    [a.remarks || "", a.qtyReturned > 0 ? `${fmtNum(a.qtyReturned)} ${a.unit} returned` : ""]
      .filter(Boolean).join(" · "),
  ]);
  y = matRows.length > 0
    ? drawTable(doc, matCols, matRows, y)
    : drawTable(doc, matCols, [["", "No materials dispatched from office", "", "", "", "", ""]], y);

  // ── Parts listed on the job itself (not office stock) ──────────────────────
  if (data.parts.length > 0) {
    y = ensureSpace(doc, 70, y);
    y = drawSection(doc, "Section B — Parts Listed On This Job", y,
      `${data.parts.length} Line${data.parts.length === 1 ? "" : "s"}`);
    const partCols: Col[] = [
      { title: "#", width: 26, align: "center" },
      { title: "Part / Description", width: IW - 26 - 80 - 200 },
      { title: "Qty", width: 80, align: "center" },
      { title: "Collected / Fitted", width: 200 },
    ];
    y = drawTable(doc, partCols, data.parts.map((p, i) => [
      String(i + 1), p.description, fmtNum(p.quantity), "",
    ]), y);
  }

  // ── Cable allocation sheets (one per cable line) ───────────────────────────
  const cables = data.allocations.filter((a) => a.isCable);
  for (const a of cables) {
    const usedFt = runsUsedFt(a.runs);
    const totalFt = a.boxSizeFt != null ? a.boxSizeFt * a.qtyAllocated : null;
    const remainingFt = totalFt != null ? totalFt - usedFt : null;

    y = ensureSpace(doc, 120, y);
    y = drawSection(doc, `Cable Allocation — ${a.description}`, y);

    const capCols: Col[] = [
      { title: "Cable Type",   width: IW * 0.2 },
      { title: "Boxes Issued", width: IW * 0.16, align: "center" },
      { title: "Box Size",     width: IW * 0.16, align: "center" },
      { title: "Total Available", width: IW * 0.16, align: "center" },
      { title: "Used (ft)",    width: IW * 0.16, align: "center" },
      { title: "Remaining (ft)", width: IW * 0.16, align: "center" },
    ];
    y = drawTable(doc, capCols, [[
      a.category ?? "CABLE",
      `${fmtNum(a.qtyAllocated)} ${a.unit}`,
      a.boxSizeFt != null ? `${fmtNum(a.boxSizeFt)} ft` : "—",
      totalFt != null ? `${fmtNum(totalFt)} ft` : "—",
      usedFt > 0 ? fmtNum(usedFt) : "________",
      remainingFt != null && usedFt > 0 ? fmtNum(remainingFt) : "________",
    ]], y);

    const runCols: Col[] = [
      { title: "#", width: 24, align: "center" },
      { title: "Run / Camera ID", width: IW * 0.15 },
      { title: "Location / Label", width: IW * 0.17 },
      { title: "NVR Port", width: IW * 0.1, align: "center" },
      { title: "Start (ft)", width: IW * 0.09, align: "center" },
      { title: "End (ft)",   width: IW * 0.09, align: "center" },
      { title: "Length (ft)", width: IW * 0.09, align: "center" },
      { title: "Tested",           width: IW * 0.06, align: "center" },
      { title: "Remarks",          width: IW - 24 - IW * 0.75 },
    ];
    const runRows = a.runs.map((r, i) => [
      String(i + 1),
      r.label,
      r.location ?? "",
      r.port ?? "",
      fmtNum(r.startFt),
      fmtNum(r.endFt),
      r.lengthFt != null ? fmtNum(r.lengthFt) : "",
      r.tested === true ? "PASS" : r.tested === false ? "FAIL" : "",
      r.remarks ?? "",
    ]);
    // The paper form always carries 12 lines so runs can be logged by hand.
    y = drawTable(doc, runCols, runRows, y, {
      blankRows: Math.max(0, 12 - a.runs.length),
      blankLabelFrom: a.runs.length + 1,
    });

    y = ensureSpace(doc, 24, y);
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor(C.ink)
      .text(`Total Cable Used (ft): ${usedFt > 0 ? fmtNum(usedFt) : "____________"}`, M, y, { width: IW / 2 })
      .text(`Remaining in Box (ft): ${remainingFt != null && usedFt > 0 ? fmtNum(remainingFt) : "____________"}`,
        M + IW / 2, y, { width: IW / 2, align: "right" });
    y += 20;
  }

  y = drawNote(doc,
    "Instructions: Technician to fill in camera location/label, NVR or switch port number, cable start and end "
    + "footage readings from the box, and calculated run length for each run. Mark the tested column PASS or FAIL. "
    + "All cable must be labelled at both ends. Any remaining cable on the reel must be logged and returned with "
    + "this sheet. Tools marked \"return required\" must be returned to office after job completion.", y);

  y = drawSignatures(doc, data, y);

  // Footer on every page.
  const range = doc.bufferedPageRange();
  const generated = fmtDate(new Date());
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    // Writing below the bottom margin makes PDFKit spill onto a fresh page —
    // drop the margin while the footer is drawn, then restore it.
    const keepBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const fy = doc.page.height - 30;
    doc.moveTo(M, fy - 6).lineTo(doc.page.width - M, fy - 6).strokeColor(C.line).lineWidth(0.5).stroke();
    doc.font("Helvetica").fontSize(7).fillColor("#777777")
      .text(`${data.business.name} · Materials Dispatch Record · For Internal Use Only`, M, fy, { width: IW * 0.5 })
      .text(`${data.workOrderNumber} · Generated ${generated} · Page ${i - range.start + 1} of ${range.count}`,
        M + IW * 0.5, fy, { width: IW * 0.5, align: "right" });
    doc.page.margins.bottom = keepBottom;
  }

  // toBuffer() ends the document — nothing may be drawn after this point.
  return toBuffer(doc);
}
