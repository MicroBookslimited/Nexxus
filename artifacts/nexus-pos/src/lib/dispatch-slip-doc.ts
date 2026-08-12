/**
 * Materials Dispatch Slip / Cable Allocation Sheet HTML generator.
 *
 * Mirrors the paper field forms (Petcom dispatch slip + CAT6 wire allocation
 * sheet): Section A dispatched items, a per-cable run log with start/end
 * footage and used/remaining totals, and acknowledgement signature lines for
 * office issue, technician receipt, and return verification.
 *
 * Follows the same self-contained window.open + document.write print pattern
 * as generateJobCard (src/lib/work-order-doc.ts).
 */
import type { WorkOrderAllocation, CableRun } from "@workspace/api-client-react";

export type DispatchSlipMeta = {
  workOrderNumber: string;
  businessName?: string | null;
  /** Site / destination — customer name and/or address. */
  siteName?: string | null;
  technicianNames?: string[] | null;
  dispatchDate?: string | null;
};

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function fmtFt(n: number | null | undefined): string {
  if (n == null) return "";
  return Number.isInteger(n) ? n.toLocaleString("en-US") : n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function runsUsedFt(runs: CableRun[]): number {
  return runs.reduce((s, r) => s + (r.lengthFt ?? 0), 0);
}

function materialRow(a: WorkOrderAllocation, i: number): string {
  const condition = a.isReturnable ? "Tool — return required" : "";
  const remarks = [
    a.remarks || "",
    a.qtyReturned > 0 ? `${fmtFt(a.qtyReturned)} ${a.unit} returned` : "",
  ].filter(Boolean).join(" · ");
  return `<tr>
    <td class="c">${i + 1}</td>
    <td>${escHtml(a.description)}</td>
    <td class="c">${escHtml(a.category ?? "")}</td>
    <td class="c">${fmtFt(a.qtyAllocated)}</td>
    <td class="c">${escHtml(a.unit)}</td>
    <td>${escHtml(condition)}</td>
    <td>${escHtml(remarks)}</td>
  </tr>`;
}

function cableSection(a: WorkOrderAllocation): string {
  // When no footage has been logged yet, Used/Remaining render as handwritten
  // blanks (matching the paper form — technicians fill these in the field).
  const usedFt = runsUsedFt(a.runs);
  const totalFt = a.boxSizeFt != null ? a.boxSizeFt * a.qtyAllocated : null;
  const remainingFt = totalFt != null ? totalFt - usedFt : null;
  const minRows = 12;
  const blank = Math.max(0, minRows - a.runs.length);

  const runRows = a.runs.map((r, i) => `<tr>
      <td class="c">${i + 1}</td>
      <td>${escHtml(r.label)}</td>
      <td>${escHtml(r.location ?? "")}</td>
      <td class="c">${escHtml(r.port ?? "")}</td>
      <td class="c">${fmtFt(r.startFt)}</td>
      <td class="c">${fmtFt(r.endFt)}</td>
      <td class="c b">${r.lengthFt != null ? fmtFt(r.lengthFt) : ""}</td>
      <td class="c">${r.tested === true ? "✓" : r.tested === false ? "✗" : ""}</td>
      <td>${escHtml(r.remarks ?? "")}</td>
    </tr>`).join("");

  const blankRows = Array.from({ length: blank }, (_, j) => `<tr class="blank">
      <td class="c">${a.runs.length + j + 1}</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
    </tr>`).join("");

  return `
<h2>Cable Allocation — ${escHtml(a.description)}</h2>
<table class="meta">
  <tr>
    <th>Cable Type</th><th>Boxes Issued</th><th>Box Size</th><th>Total Available</th><th>Used (ft)</th><th>Remaining (ft)</th>
  </tr>
  <tr>
    <td>${escHtml(a.category ?? "CABLE")}</td>
    <td>${fmtFt(a.qtyAllocated)} ${escHtml(a.unit)}</td>
    <td>${a.boxSizeFt != null ? `${fmtFt(a.boxSizeFt)} ft` : "—"}</td>
    <td>${totalFt != null ? `${fmtFt(totalFt)} ft` : "—"}</td>
    <td class="b">${usedFt > 0 ? fmtFt(usedFt) : "________"}</td>
    <td class="b">${remainingFt != null && usedFt > 0 ? fmtFt(remainingFt) : "________"}</td>
  </tr>
</table>

<table class="lines runs">
  <thead><tr>
    <th>#</th><th>Run / Camera ID</th><th>Location / Label</th><th>NVR / Switch Port</th>
    <th>Cable Start (ft)</th><th>Cable End (ft)</th><th>Run Length (ft)</th><th>Tested ✓/✗</th><th>Remarks</th>
  </tr></thead>
  <tbody>${runRows}${blankRows}</tbody>
  <tfoot><tr>
    <td colspan="6" class="r b">Total Cable Used (ft): &nbsp; ${usedFt > 0 ? fmtFt(usedFt) : "____________"}</td>
    <td colspan="3" class="r b">Remaining in Box (ft): &nbsp; ${remainingFt != null && usedFt > 0 ? fmtFt(remainingFt) : "____________"}</td>
  </tr></tfoot>
</table>`;
}

export function generateDispatchSlip(
  meta: DispatchSlipMeta,
  allocations: WorkOrderAllocation[],
): string {
  const cables = allocations.filter((a) => a.isCable);
  const materials = allocations.filter((a) => !a.isCable);
  const techs = (meta.technicianNames ?? []).filter(Boolean);
  const dispatchedBy = allocations.find((a) => a.dispatchedByName)?.dispatchedByName ?? "";
  const generated = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const materialRows = materials.length > 0
    ? materials.map(materialRow).join("")
    : `<tr><td colspan="7" class="c muted">No materials dispatched</td></tr>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Dispatch Slip ${escHtml(meta.workOrderNumber)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;color:#111;background:#fff;padding:16px}
  h1{font-size:18px;font-weight:800;margin:0}
  h2{font-size:12px;font-weight:700;margin:16px 0 6px;text-transform:uppercase;letter-spacing:.06em;color:#333;background:#f3f4f6;border:1px solid #ddd;padding:4px 8px}
  .header{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:12px;border-bottom:2px solid #111;padding-bottom:10px}
  .biz-name{font-size:16px;font-weight:700}
  .biz-sub{color:#555;font-size:10px}
  .doc-info{text-align:right}
  .doc-title{font-size:16px;font-weight:800}
  .doc-sub{color:#555;font-size:10px;margin-top:2px}
  table.meta{width:100%;border-collapse:collapse;margin-bottom:4px}
  table.meta th{background:#f3f4f6;font-size:9px;text-transform:uppercase;letter-spacing:.06em;padding:4px 6px;border:1px solid #ddd;text-align:left;color:#555}
  table.meta td{padding:6px;border:1px solid #ddd;font-weight:600}
  table.lines{width:100%;border-collapse:collapse;margin-top:2px}
  table.lines th{background:#f3f4f6;font-size:9px;text-transform:uppercase;letter-spacing:.05em;padding:4px 5px;border:1px solid #ddd}
  table.lines td{padding:4px 5px;border:1px solid #ddd}
  table.lines tfoot td{background:#fafafa;padding:6px}
  table.runs td{height:18px}
  tr.blank td{color:#bbb}
  .c{text-align:center}
  .r{text-align:right}
  .b{font-weight:700}
  .muted{color:#888}
  .note{margin-top:10px;padding:6px 8px;border:1px solid #ddd;background:#fafafa;font-size:10px;color:#444}
  .sig-title{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin:22px 0 14px;border-top:2px solid #111;padding-top:8px}
  .sig-row{display:flex;gap:24px}
  .sig-box{flex:1}
  .sig-line{border-top:1px solid #555;margin-top:44px;padding-top:4px;font-size:10px;color:#555;display:flex;justify-content:space-between}
  .sig-name{font-weight:700;font-size:11px}
  .footer{margin-top:18px;border-top:1px solid #ddd;padding-top:6px;display:flex;justify-content:space-between;color:#777;font-size:9px}
  .print-btn{display:inline-block;margin-bottom:16px;padding:8px 16px;background:#111;color:#fff;border:none;border-radius:4px;font-size:13px;cursor:pointer}
  @media print{.print-btn{display:none}body{padding:0}}
</style>
</head>
<body>
<button class="print-btn" onclick="window.print()">🖨️ Print Dispatch Slip</button>

<div class="header">
  <div>
    ${meta.businessName ? `<div class="biz-name">${escHtml(meta.businessName)}</div>` : ""}
    <div class="biz-sub">Materials Dispatch &amp; Cable Allocation Record</div>
  </div>
  <div class="doc-info">
    <div class="doc-title">Materials Dispatch Slip</div>
    <div class="doc-sub">${meta.siteName ? `Site: ${escHtml(meta.siteName)} | ` : ""}Ref: ${escHtml(meta.workOrderNumber)}</div>
  </div>
</div>

<table class="meta">
  <tr>
    <th>Dispatch Date</th><th>Dispatched By</th><th>Technician / Receiver</th><th>Site / Destination</th><th>Expected Return</th>
  </tr>
  <tr>
    <td>${fmtDate(meta.dispatchDate)}</td>
    <td>${escHtml(dispatchedBy)}</td>
    <td>${escHtml(techs.join(", "))}</td>
    <td>${escHtml(meta.siteName ?? "")}</td>
    <td></td>
  </tr>
</table>

<h2>Section A — Dispatched From Office <span style="float:right;font-weight:600">${materials.length} Item${materials.length === 1 ? "" : "s"}</span></h2>
<table class="lines">
  <thead><tr>
    <th style="width:24px">#</th><th>Material / Item Description</th><th style="width:50px">Cat.</th>
    <th style="width:50px">Qty</th><th style="width:55px">Unit</th><th style="width:130px">Condition</th><th>Remarks</th>
  </tr></thead>
  <tbody>${materialRows}</tbody>
</table>

${cables.map(cableSection).join("")}

<div class="note">
  <strong>Instructions:</strong> Technician to fill in camera location/label, NVR or switch port number, cable start and end
  footage readings from the box, and calculated run length for each run. Mark tested column with ✓ (pass) or ✗ (fail).
  All cable must be labelled at both ends. Any remaining cable on the reel must be logged and returned with this sheet.
  Tools marked "return required" must be returned to office after job completion.
</div>

<div class="sig-title">Acknowledgement &amp; Signatures</div>
<div class="sig-row">
  <div class="sig-box">
    ${dispatchedBy ? `<div class="sig-name">${escHtml(dispatchedBy)}</div>` : "<div class='sig-name'>&nbsp;</div>"}
    <div class="sig-line"><span>Issued By (Office) — Signature</span><span>Date</span></div>
  </div>
  <div class="sig-box">
    ${techs.length > 0 ? `<div class="sig-name">${escHtml(techs.join(", "))}</div>` : "<div class='sig-name'>&nbsp;</div>"}
    <div class="sig-line"><span>Received By (Technician) — Signature</span><span>Date</span></div>
  </div>
  <div class="sig-box">
    <div class="sig-name">&nbsp;</div>
    <div class="sig-line"><span>Returned &amp; Verified By — Signature</span><span>Date</span></div>
  </div>
</div>

<div class="footer">
  <span>${meta.businessName ? escHtml(meta.businessName) + " · " : ""}Materials Dispatch Record · For Internal Use Only</span>
  <span>OFFICE COPY</span>
  <span>Generated: ${generated}</span>
</div>
</body>
</html>`;
}
