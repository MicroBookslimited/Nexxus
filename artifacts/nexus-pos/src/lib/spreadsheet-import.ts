/**
 * Shared spreadsheet import/export helpers used by the product and customer
 * import dialogs. Keeping a single implementation here avoids drift between the
 * two importers (CSV + Excel parsing behaviour must stay identical).
 */

export type ImportResult = { row: number; name: string; status: "ok" | "error"; error?: string };

export function csvDownload(rows: string[][], filename: string) {
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

export async function parseSpreadsheet(file: File): Promise<(string | number | boolean | null)[][]> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "csv") {
    const Papa = (await import("papaparse")).default;
    const text = await file.text();
    const result = Papa.parse<(string | number | boolean | null)[]>(text, {
      header: false,
      skipEmptyLines: true,
      dynamicTyping: false,
    });
    return result.data;
  } else {
    // Use exceljs — handles real third-party exports (no <dimension> tag,
    // customHeight rows) that read-excel-file silently truncates to 1 row.
    const ExcelJS = await import("exceljs");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const ws = wb.worksheets[0];
    if (!ws) return [];
    const out: (string | number | boolean | null)[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      // exceljs row.values is 1-indexed (index 0 is undefined). Slice off
      // the leading hole and normalise cell types for downstream consumers.
      const raw = (row.values as unknown[]).slice(1);
      const cells = raw.map((c): string | number | boolean | null => {
        if (c === null || c === undefined) return null;
        if (c instanceof Date) return c.toLocaleDateString();
        if (typeof c === "object") {
          // Rich text { richText: [...] } or hyperlink { text, hyperlink }
          const rt = (c as { richText?: { text: string }[]; text?: string; result?: unknown }).richText;
          if (Array.isArray(rt)) return rt.map((s) => s.text).join("");
          const txt = (c as { text?: string }).text;
          if (typeof txt === "string") return txt;
          const res = (c as { result?: unknown }).result;
          if (typeof res === "string" || typeof res === "number" || typeof res === "boolean") return res;
          return String(c);
        }
        if (typeof c === "string" || typeof c === "number" || typeof c === "boolean") return c;
        return String(c);
      });
      out.push(cells);
    });
    return out;
  }
}
