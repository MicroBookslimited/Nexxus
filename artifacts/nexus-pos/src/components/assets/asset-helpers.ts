import type {
  AssetCondition,
  AssetStatus,
  ServiceState,
  FixedAsset,
} from "@/lib/assets-api";

/**
 * Shared display helpers for the Fixed Assets page. Kept in one place so the
 * list, the create/edit dialog's live preview and the detail drawer all speak
 * the same language for money, dates, badges and depreciation.
 */

export function formatCurrency(n: number | null | undefined, currency = "JMD"): string {
  const value = n ?? 0;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
    }).format(value);
  } catch {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value);
  }
}

export function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function fmtDateTime(d: string | null | undefined): string {
  if (!d) return "—";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", {
    year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

/** Trim a full ISO/datetime string to the yyyy-mm-dd a <input type="date"> wants. */
export function toDateInput(d: string | null | undefined): string {
  if (!d) return "";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export const CONDITION_LABEL: Record<AssetCondition, string> = {
  good: "Good",
  fair: "Fair",
  needs_repair: "Needs Repair",
  out_of_service: "Out of Service",
};

export const CONDITION_STYLES: Record<AssetCondition, string> = {
  good: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  fair: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  needs_repair: "bg-orange-500/15 text-orange-600 border-orange-500/30",
  out_of_service: "bg-rose-500/15 text-rose-600 border-rose-500/30",
};

export const STATUS_LABEL: Record<AssetStatus, string> = {
  in_store: "In Store",
  assigned: "Assigned",
  in_repair: "In Repair",
  retired: "Retired",
  lost: "Lost",
};

export const STATUS_STYLES: Record<AssetStatus, string> = {
  in_store: "bg-sky-500/15 text-sky-600 border-sky-500/30",
  assigned: "bg-violet-500/15 text-violet-600 border-violet-500/30",
  in_repair: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  retired: "bg-muted text-muted-foreground border-border",
  lost: "bg-rose-500/15 text-rose-600 border-rose-500/30",
};

/** Colour a next-service-due date by how urgent it is (matches server serviceState). */
export const SERVICE_STATE_STYLES: Record<ServiceState, string> = {
  none: "text-muted-foreground",
  ok: "text-emerald-600",
  due_soon: "text-amber-600",
  overdue: "text-rose-600 font-medium",
};

export const SERVICE_TYPE_LABEL: Record<string, string> = {
  service: "Service",
  calibration: "Calibration",
  repair: "Repair",
  inspection: "Inspection",
};

/** Who is holding an asset right now, as a short human string ("— " when idle). */
export function holderLabel(asset: FixedAsset): { text: string; job: string | null } {
  const a = asset.currentAssignment;
  if (!a) return { text: "In store", job: null };
  const who = a.assigneeType === "team" ? a.teamName : a.staffName;
  return {
    text: who || (a.assigneeType === "team" ? "Team" : "Technician"),
    job: a.workOrderNumber ?? null,
  };
}

/* ─── Client-side straight-line depreciation ───
 * Mirrors artifacts/api-server/src/lib/asset-custody.ts:computeDepreciation so
 * the create/edit dialog can show a live monthly-depreciation + book-value
 * preview that agrees with what the server will store. */

export interface DepreciationPreview {
  monthlyDepreciation: number;
  accumulatedDepreciation: number;
  bookValue: number;
  monthsElapsed: number;
  monthsRemaining: number;
  fullyDepreciatedOn: string | null;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function wholeMonthsBetween(from: Date, to: Date): number {
  let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  if (to.getDate() < from.getDate()) months -= 1; // only count completed months
  return months;
}

function addMonths(d: Date, months: number): Date {
  const out = new Date(d.getTime());
  out.setMonth(out.getMonth() + months);
  return out;
}

export function computeDepreciation(input: {
  purchaseCost: number;
  salvageValue: number;
  usefulLifeMonths: number | null;
  depreciationMethod: "straight_line" | "none";
  depreciationStartDate: string | null;
  purchaseDate: string | null;
}, asOf: Date = new Date()): DepreciationPreview {
  const cost = input.purchaseCost ?? 0;
  const idle: DepreciationPreview = {
    monthlyDepreciation: 0,
    accumulatedDepreciation: 0,
    bookValue: round2(cost),
    monthsElapsed: 0,
    monthsRemaining: 0,
    fullyDepreciatedOn: null,
  };

  const life = input.usefulLifeMonths ?? 0;
  const startRaw = input.depreciationStartDate ?? input.purchaseDate;
  if (input.depreciationMethod !== "straight_line" || life <= 0 || !startRaw) return idle;
  const start = new Date(startRaw);
  if (Number.isNaN(start.getTime())) return idle;

  const depreciable = Math.max(0, cost - (input.salvageValue ?? 0));
  const monthly = depreciable / life;
  const elapsed = Math.max(0, wholeMonthsBetween(start, asOf));
  const used = Math.min(elapsed, life);
  const accumulated = round2(monthly * used);

  return {
    monthlyDepreciation: round2(monthly),
    accumulatedDepreciation: accumulated,
    bookValue: round2(cost - accumulated),
    monthsElapsed: elapsed,
    monthsRemaining: Math.max(0, life - elapsed),
    fullyDepreciatedOn: addMonths(start, life).toISOString(),
  };
}

/**
 * Downscale a chosen photo to a JPEG data URL small enough for the API. The
 * server rejects photoUrl over 400,000 chars, so we cap the long edge at 800px
 * and use quality 0.7. Rejects if the browser can't decode the file.
 */
export function downscaleImageToDataUrl(file: File, maxEdge = 800, quality = 0.7): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that image file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("That file isn't a readable image."));
      img.onload = () => {
        const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Your browser can't process this image."));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Open a print window with a scannable asset tag: the tag text, asset name and
 * a Code128 barcode rendered with JsBarcode (same dependency the receipts and
 * job-cards already use — no new package).
 */
export async function printAssetTag(asset: Pick<FixedAsset, "assetTag" | "name" | "barcode">): Promise<void> {
  const { default: JsBarcode } = await import("jsbarcode");
  const code = asset.barcode || asset.assetTag;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  try {
    JsBarcode(svg, code, { format: "CODE128", width: 2, height: 60, fontSize: 14, margin: 6, displayValue: true });
  } catch {
    /* JsBarcode throws on values it can't encode; fall back to plain text below. */
  }
  const barcodeMarkup = svg.childNodes.length ? svg.outerHTML : `<div class="code">${code}</div>`;
  const win = window.open("", "_blank", "width=420,height=320");
  if (!win) throw new Error("Pop-up blocked — allow pop-ups to print the tag.");
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
  win.document.write(`<!doctype html><html><head><title>${esc(asset.assetTag)}</title>
    <style>
      *{box-sizing:border-box}
      body{font-family:system-ui,-apple-system,sans-serif;margin:0;padding:16px;text-align:center}
      .tag{font-size:20px;font-weight:700;letter-spacing:.5px}
      .name{font-size:13px;color:#444;margin:2px 0 10px}
      .code{font-family:monospace;font-size:16px;letter-spacing:2px}
      svg{max-width:100%}
      @media print{@page{margin:6mm}}
    </style></head><body>
      <div class="tag">${esc(asset.assetTag)}</div>
      <div class="name">${esc(asset.name)}</div>
      ${barcodeMarkup}
      <script>window.onload=function(){setTimeout(function(){window.print();},150);};<\/script>
    </body></html>`);
  win.document.close();
}
