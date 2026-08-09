import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  useListCustomers,
  useCreateCustomer,
  useUpdateCustomer,
  useDeleteCustomer,
  useGetCustomerOrders,
  useGetSettings,
} from "@workspace/api-client-react";
import type { GetCustomerResponse } from "@workspace/api-zod";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Search, Pencil, Trash2, Users, Star, Phone, Mail, ShoppingBag, Upload, FileDown, FileSpreadsheet, ChevronRight, AlertTriangle, CreditCard, Printer } from "lucide-react";
import { format } from "date-fns";
import { csvDownload, parseSpreadsheet, type ImportResult } from "@/lib/spreadsheet-import";
import { printCustomerCard, cardBarcodeDataUrl } from "@/lib/customer-card-doc";

type CustomerForm = {
  name: string;
  email: string;
  phone: string;
  company: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  notes: string;
  openingBalance: string;
};
const emptyForm = (): CustomerForm => ({
  name: "",
  email: "",
  phone: "",
  company: "",
  address: "",
  city: "",
  state: "",
  postalCode: "",
  notes: "",
  openingBalance: "",
});

function formatCurrency(v: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);
}

function CustomerOrderHistory({ customerId }: { customerId: number }) {
  const { data: orders, isLoading } = useGetCustomerOrders({ id: customerId });

  if (isLoading) return <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;
  if (!orders?.length) return <p className="text-sm text-muted-foreground py-4 text-center">No orders yet</p>;

  return (
    <div className="space-y-2">
      {orders.map((order) => (
        <div key={order.id} className="flex items-center justify-between rounded-lg bg-secondary/30 px-3 py-2">
          <div>
            <p className="text-sm font-medium">{order.orderNumber}</p>
            <p className="text-xs text-muted-foreground">{format(new Date(order.createdAt), "MMM d, yyyy")}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={order.status === "completed" ? "default" : "destructive"} className="text-xs capitalize">
              {order.status}
            </Badge>
            <span className="font-mono text-sm font-semibold text-primary">{formatCurrency(order.total)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Customer import ─── */

const CUSTOMER_IMPORT_FIELDS = [
  { key: "name",       label: "Full Name" },
  { key: "firstName",  label: "First Name" },
  { key: "lastName",   label: "Last Name" },
  { key: "company",    label: "Company" },
  { key: "email",      label: "Email" },
  { key: "phone",      label: "Phone" },
  { key: "address",    label: "Address" },
  { key: "city",       label: "City" },
  { key: "state",      label: "State / Province" },
  { key: "postalCode",     label: "Postal Code" },
  { key: "notes",          label: "Notes" },
  { key: "openingBalance", label: "Opening Balance" },
];

const CUSTOMER_TEMPLATE_ROWS = [
  ["Name", "Company", "Email", "Phone", "Address", "City", "State", "Postal Code", "Notes", "Opening Balance"],
  ["Jane Smith", "Acme Inc.", "jane@example.com", "+1 555 000 0001", "123 Main St", "Nassau", "NP", "00000", "VIP customer", "0.00"],
  ["John Brown", "", "john@example.com", "+1 555 000 0002", "456 Bay St", "Freeport", "GB", "00000", "", "1500.00"],
];

/**
 * QuickBooks Desktop Point of Sale customer-list export format (matches the
 * exact column layout QuickBooks POS produces when you export the Customer
 * List to Excel). A user can export from QuickBooks POS and upload the file
 * as-is — the importer skips the report-title preamble rows, finds the real
 * header row, and auto-maps every recognizable column. First + Last name are
 * combined automatically when no usable Full Name is present.
 */
const QUICKBOOKS_CUSTOMER_TEMPLATE_ROWS = [
  [
    "Last Name", "First Name", "Bill To Street", "Bill To City", "Bill To State", "Bill To ZIP",
    "Account Balance", "Company", "Title", "Phone", "Mobile", "Alt. Phone", "Alt. Contact",
    "Full Name", "Customer Type", "E-Mail", "Account Limit", "Past Due",
  ],
  [
    "Smith", "Jane", "123 Main St", "Kingston", "", "00000",
    "0.00", "Acme Inc.", "Mrs.", "8765550001", "", "", "",
    "Mrs. JANE SMITH", "Retail", "jane@example.com", "50,000.00", "0",
  ],
  [
    "Brown", "John", "456 Bay St", "Montego Bay", "", "00000",
    "0.00", "", "Mr.", "", "8765550002", "", "",
    "Mr. JOHN BROWN", "Wholesale", "john@example.com", "100,000.00", "0",
  ],
];

/** Parse a spreadsheet balance like "5,421.00", "$1,200", "(500)" or "680-" into a number. */
function parseImportedBalance(raw: string | undefined): number | undefined {
  if (!raw?.trim()) return undefined;
  const s = raw.trim();
  const negative = /^\(.*\)$/.test(s) || /-\s*$/.test(s) || s.startsWith("-");
  const cleaned = s.replace(/[^0-9.]/g, "");
  if (!cleaned) return undefined;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return undefined;
  return negative ? -n : n;
}

function downloadCustomerTemplate()           { csvDownload(CUSTOMER_TEMPLATE_ROWS,            "NEXXUS_Customer_Import_Template.csv"); }
function downloadQuickbooksCustomerTemplate() { csvDownload(QUICKBOOKS_CUSTOMER_TEMPLATE_ROWS, "NEXXUS_QuickBooks_POS_Customer_Template.csv"); }

function ImportCustomersDialog({ open, onClose, onImported }: {
  open: boolean;
  onClose: () => void;
  onImported: (count: number) => void;
}) {
  const createCustomer = useCreateCustomer();
  const { toast } = useToast();
  const fileRef = React.useRef<HTMLInputElement>(null);

  const [step, setStep]           = useState<"upload" | "map" | "done">("upload");
  const [headers, setHeaders]     = useState<string[]>([]);
  const [rows, setRows]           = useState<string[][]>([]);
  const [headerRowIdx, setHeaderRowIdx] = useState(0);
  const [mapping, setMapping]     = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [progress, setProgress]   = useState(0);
  const [results, setResults]     = useState<ImportResult[]>([]);

  const reset = () => { setStep("upload"); setHeaders([]); setRows([]); setHeaderRowIdx(0); setMapping({}); setImporting(false); setProgress(0); setResults([]); };
  const handleClose = () => { reset(); onClose(); };

  /**
   * QuickBooks POS exports start with report-title preamble rows (store name,
   * date, "Customer List") before the real header row. Scan the first rows and
   * pick the one with the most recognizable header tokens as the header.
   */
  const findHeaderRowIndex = (data: string[][]): number => {
    const known = /^(last name|first name|full name|name|customer name|company|phone|mobile|alt\.? phone|alt\.? contact|title|e-?mail|email|customer type|bill to street|bill to city|bill to state|bill to zip|address(?: line 1)?|street|city|state|zip|zip code|postal code|notes?|account balance|account limit|past due)$/;
    let bestIdx = 0, bestScore = 0;
    const limit = Math.min(data.length, 15);
    for (let i = 0; i < limit; i++) {
      const score = data[i].filter(c => known.test(String(c ?? "").trim().toLowerCase())).length;
      if (score > bestScore) { bestScore = score; bestIdx = i; }
    }
    return bestScore >= 2 ? bestIdx : 0;
  };

  const parseFile = async (file: File) => {
    try {
      const data = await parseSpreadsheet(file) as string[][];
      if (!data.length) { toast({ title: "Empty file", variant: "destructive" }); return; }
      const headerIdx = findHeaderRowIndex(data);
      setHeaderRowIdx(headerIdx);
      const hdr = data[headerIdx];
      const body = data.slice(headerIdx + 1);
      const clean = hdr.map(h => String(h).trim());
      setHeaders(clean);
      setRows(body.filter(r => r.some(c => c !== null && c !== undefined && String(c).trim() !== "")));
      const auto: Record<string, string> = {};
      clean.forEach(h => {
        const l = h.toLowerCase().replace(/\s*\[[^\]]*\]\s*$/, "").trim();
        if      (l === "bill to street")                                                    auto[h] = "address";
        else if (l === "bill to city")                                                      auto[h] = "city";
        else if (l === "bill to state")                                                     auto[h] = "state";
        else if (l === "bill to zip")                                                       auto[h] = "postalCode";
        else if (l === "customer type")                                                     auto[h] = "notes";
        else if (l === "account balance" || l === "opening balance" || l === "balance")     auto[h] = "openingBalance";
        else if (l === "title" || l === "account limit" || l === "past due" || l === "alt. contact" || l === "alt contact") auto[h] = "__skip__";
        else if (l === "first name" || l === "first" || l === "given name")                 auto[h] = "firstName";
        else if (l === "last name" || l === "last" || l === "surname" || l === "family name") auto[h] = "lastName";
        else if (l === "name" || l === "full name" || l === "customer name" || l === "customer") auto[h] = "name";
        else if (l === "company" || l === "company name" || l === "business")               auto[h] = "company";
        else if (l === "email" || l === "e-mail" || l === "email address")                  auto[h] = "email";
        else if (/^(phone|telephone|mobile|cell|phone 1|phone number|contact)/.test(l))     auto[h] = "phone";
        else if (l === "address" || l === "address line 1" || l === "street" || l === "addr 1" || l === "address 1") auto[h] = "address";
        else if (l === "city" || l === "town")                                              auto[h] = "city";
        else if (l === "state" || l === "province" || l === "region" || l === "state/province") auto[h] = "state";
        else if (l === "zip" || l === "zip code" || l === "postal code" || l === "postal" || l === "postcode") auto[h] = "postalCode";
        else if (l === "notes" || l === "note" || l === "comment" || l === "comments")      auto[h] = "notes";
        // Fuzzy fallbacks
        else if (/first.*name/.test(l))                                                     auto[h] = "firstName";
        else if (/last.*name|surname/.test(l))                                              auto[h] = "lastName";
        else if (/company|business/.test(l))                                                auto[h] = "company";
        else if (/e-?mail/.test(l))                                                         auto[h] = "email";
        else if (/phone|mobile|cell|tel/.test(l))                                           auto[h] = "phone";
        else if (/address|street/.test(l))                                                  auto[h] = "address";
        else if (/city|town/.test(l))                                                       auto[h] = "city";
        else if (/state|province|region/.test(l))                                           auto[h] = "state";
        else if (/zip|postal|postcode/.test(l))                                             auto[h] = "postalCode";
        else if (/note|comment/.test(l))                                                    auto[h] = "notes";
        else if (/name/.test(l))                                                            auto[h] = "name";
      });
      setMapping(auto);
      setStep("map");
    } catch {
      toast({ title: "Could not read file", description: "Please use a valid CSV or Excel file.", variant: "destructive" });
    }
  };

  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) parseFile(f); };

  const getMapped = (header: string) => mapping[header] ?? "__skip__";
  const setMapped = (header: string, val: string) => setMapping(m => ({ ...m, [header]: val }));

  const extractRow = (row: string[]): Record<string, string> => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      const f = mapping[h];
      if (!f || f === "__skip__") return;
      const val = String(row[i] ?? "").trim();
      // When several columns map to the same field (e.g. Phone + Mobile +
      // Alt. Phone in a QuickBooks export), keep the first non-empty value
      // instead of letting a later empty column wipe out an earlier one.
      if (val && !obj[f]) obj[f] = val;
    });
    const combined = [obj.firstName, obj.lastName].filter(Boolean).join(" ").trim();
    const name = (obj.name ?? "").trim() || combined;
    return { ...obj, name };
  };

  const mappedFields = Object.values(mapping);
  const hasName = mappedFields.includes("name") || mappedFields.includes("firstName") || mappedFields.includes("lastName");

  const handleImport = async () => {
    setImporting(true);
    const out: ImportResult[] = [];
    for (let i = 0; i < rows.length; i++) {
      const d = extractRow(rows[i]);
      setProgress(i + 1);
      const sheetRow = headerRowIdx + i + 2;
      if (!d.name?.trim()) { out.push({ row: sheetRow, name: `Row ${sheetRow}`, status: "error", error: "Name is required" }); continue; }
      const payload = {
        name: d.name.trim(),
        email: d.email?.trim() || undefined,
        phone: d.phone?.trim() || undefined,
        company: d.company?.trim() || undefined,
        address: d.address?.trim() || undefined,
        city: d.city?.trim() || undefined,
        state: d.state?.trim() || undefined,
        postalCode: d.postalCode?.trim() || undefined,
        notes: d.notes?.trim() || undefined,
        openingBalance: parseImportedBalance(d.openingBalance),
      };
      try {
        await new Promise<void>((resolve, reject) => {
          createCustomer.mutate({ data: payload }, { onSuccess: () => resolve(), onError: (e) => reject(e) });
        });
        out.push({ row: sheetRow, name: d.name, status: "ok" });
      } catch { out.push({ row: sheetRow, name: d.name, status: "error", error: "Server error" }); }
    }
    setResults(out);
    setImporting(false);
    setStep("done");
    const ok = out.filter(r => r.status === "ok").length;
    if (ok > 0) onImported(ok);
  };

  const previewRows = rows.slice(0, 5);
  const okCount  = results.filter(r => r.status === "ok").length;
  const errCount = results.filter(r => r.status === "error").length;

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Import Customers
          </DialogTitle>
          <div className="flex items-center gap-1.5 text-xs pt-2">
            {(["upload", "map", "done"] as const).map((s, i) => (
              <React.Fragment key={s}>
                <span className={`flex items-center gap-1.5 ${step === s ? "text-primary font-semibold" : "text-muted-foreground"}`}>
                  <span className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${step === s ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>{i + 1}</span>
                  {s === "upload" ? "Upload File" : s === "map" ? "Map Columns" : "Results"}
                </span>
                {i < 2 && <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />}
              </React.Fragment>
            ))}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Step 1: Upload */}
          {step === "upload" && (
            <div className="space-y-4">
              <div
                onDrop={handleDrop} onDragOver={e => e.preventDefault()}
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-border rounded-xl p-14 flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-primary/60 hover:bg-primary/5 transition-all text-center"
              >
                <Upload className="h-10 w-10 text-muted-foreground" />
                <div>
                  <p className="font-semibold">Drop your file here, or click to browse</p>
                  <p className="text-xs text-muted-foreground mt-1">Supports CSV (.csv) and Excel (.xlsx, .xls)</p>
                </div>
                <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) parseFile(f); }} />
              </div>

              <div className="flex items-center gap-4 rounded-lg border border-border bg-secondary/20 p-4">
                <FileDown className="h-8 w-8 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Download the import template</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Pre-filled with example rows and the exact column layout expected.</p>
                </div>
                <Button variant="outline" size="sm" onClick={e => { e.stopPropagation(); downloadCustomerTemplate(); }} className="shrink-0">
                  <FileDown className="h-3.5 w-3.5 mr-1.5" />Template
                </Button>
              </div>

              <div className="flex items-center gap-4 rounded-lg border border-indigo-500/30 bg-indigo-500/5 p-4">
                <FileDown className="h-8 w-8 text-indigo-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Migrating from QuickBooks POS?</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Export your customer list from QuickBooks Point of Sale and upload it as-is — the report-title rows are skipped automatically, columns are auto-matched, and First &amp; Last name are combined when needed.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={e => { e.stopPropagation(); downloadQuickbooksCustomerTemplate(); }} className="shrink-0 border-indigo-500/40 hover:bg-indigo-500/10">
                  <FileDown className="h-3.5 w-3.5 mr-1.5" />QuickBooks Template
                </Button>
              </div>

              <div className="rounded-lg border border-border bg-secondary/10 p-4 text-xs text-muted-foreground space-y-1">
                <p className="font-semibold text-foreground text-sm mb-2">Mappable fields</p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                  {CUSTOMER_IMPORT_FIELDS.map(f => (
                    <span key={f.key}><span className="font-medium text-foreground">{f.label}</span></span>
                  ))}
                </div>
                <p className="pt-1">A full name (or First + Last name) is required for each customer.</p>
              </div>
            </div>
          )}

          {/* Step 2: Map columns */}
          {step === "map" && (
            <div className="space-y-5">
              <p className="text-sm text-muted-foreground">
                Found <span className="font-semibold text-foreground">{rows.length} customer row{rows.length !== 1 ? "s" : ""}</span>.
                Match each spreadsheet column to the correct customer field.
              </p>

              <div className="rounded-lg border border-border overflow-hidden">
                <div className="grid grid-cols-[1fr_24px_1fr] gap-x-3 px-4 py-2.5 bg-secondary/40 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  <span>Spreadsheet Column</span><span />
                  <span>Customer Field</span>
                </div>
                <div className="divide-y divide-border/60">
                  {headers.map(h => (
                    <div key={h} className="grid grid-cols-[1fr_24px_1fr] items-center gap-x-3 px-4 py-2.5">
                      <p className="text-sm font-medium truncate">{h}</p>
                      <span className="text-muted-foreground text-center text-xs">→</span>
                      <Select value={getMapped(h)} onValueChange={v => setMapped(h, v)}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__skip__">— Skip this column —</SelectItem>
                          {CUSTOMER_IMPORT_FIELDS.map(f => (
                            <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>

              {previewRows.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Data Preview — first {previewRows.length} row{previewRows.length !== 1 ? "s" : ""}</p>
                  <div className="rounded-lg border border-border overflow-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-secondary/40 border-b border-border">
                          {headers.map(h => (
                            <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">
                              {h}
                              {mapping[h] && mapping[h] !== "__skip__" && (
                                <span className="ml-1 text-[10px] text-primary font-normal">→ {CUSTOMER_IMPORT_FIELDS.find(f => f.key === mapping[h])?.label}</span>
                              )}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((row, i) => (
                          <tr key={i} className="border-b border-border/40 last:border-0 hover:bg-secondary/20">
                            {headers.map((_, j) => (
                              <td key={j} className="px-3 py-1.5 text-muted-foreground whitespace-nowrap max-w-[160px] truncate">{row[j]}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {!hasName && (
                <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 px-4 py-2.5 text-sm">
                  <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                  <span className="text-amber-400">Map a Full Name column, or both First Name and Last Name, before importing.</span>
                </div>
              )}

              {importing && (
                <div className="space-y-2">
                  <div className="h-2 rounded-full bg-secondary overflow-hidden">
                    <div className="h-full bg-primary transition-all duration-300 rounded-full" style={{ width: `${(progress / rows.length) * 100}%` }} />
                  </div>
                  <p className="text-xs text-muted-foreground text-center">Importing {progress} of {rows.length}…</p>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Results */}
          {step === "done" && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-5 text-center">
                  <p className="text-3xl font-bold text-emerald-400">{okCount}</p>
                  <p className="text-xs text-muted-foreground mt-1">Customers imported</p>
                </div>
                <div className={`rounded-lg border p-5 text-center ${errCount > 0 ? "border-red-500/30 bg-red-500/5" : "border-border bg-secondary/10"}`}>
                  <p className={`text-3xl font-bold ${errCount > 0 ? "text-red-400" : "text-muted-foreground"}`}>{errCount}</p>
                  <p className="text-xs text-muted-foreground mt-1">Failed rows</p>
                </div>
              </div>

              <div className="rounded-lg border border-border overflow-hidden">
                <div className="grid grid-cols-[3rem_1fr_7rem_1fr] gap-0 px-4 py-2.5 bg-secondary/40 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  <span>Row</span><span>Name</span><span>Status</span><span>Note</span>
                </div>
                <div className="divide-y divide-border/60 max-h-64 overflow-y-auto">
                  {results.map((r, i) => (
                    <div key={i} className="grid grid-cols-[3rem_1fr_7rem_1fr] items-center gap-0 px-4 py-2 text-sm">
                      <span className="text-muted-foreground text-xs">{r.row}</span>
                      <span className="font-medium truncate pr-3">{r.name}</span>
                      <span>
                        {r.status === "ok"
                          ? <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs">Imported</Badge>
                          : <Badge variant="destructive" className="text-xs">Failed</Badge>}
                      </span>
                      <span className="text-xs text-muted-foreground truncate pl-3">{r.error ?? ""}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border shrink-0">
          {step === "upload" && <Button variant="outline" onClick={handleClose}>Cancel</Button>}
          {step === "map" && (
            <>
              <Button variant="outline" onClick={() => { setStep("upload"); setHeaders([]); setRows([]); }} disabled={importing}>Back</Button>
              <Button onClick={handleImport} disabled={importing || !hasName || rows.length === 0}>
                {importing ? `Importing… (${progress}/${rows.length})` : `Import ${rows.length} Customer${rows.length !== 1 ? "s" : ""}`}
              </Button>
            </>
          )}
          {step === "done" && (
            <>
              {errCount > 0 && <Button variant="outline" onClick={reset}>Import Another File</Button>}
              <Button onClick={handleClose}>Done</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function Customers() {
  const [search, setSearch] = useState("");
  const { data: customers, isLoading } = useListCustomers(search ? { search } : {});
  const createCustomer = useCreateCustomer();
  const updateCustomer = useUpdateCustomer();
  const deleteCustomer = useDeleteCustomer();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<GetCustomerResponse | null>(null);
  const [form, setForm] = useState<CustomerForm>(emptyForm());
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [historyCustomer, setHistoryCustomer] = useState<GetCustomerResponse | null>(null);
  const [cardCustomer, setCardCustomer] = useState<GetCustomerResponse | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const { data: settings } = useGetSettings();

  const openAdd = () => {
    setEditingCustomer(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (c: GetCustomerResponse) => {
    setEditingCustomer(c);
    setForm({
      name: c.name,
      email: c.email ?? "",
      phone: c.phone ?? "",
      company: c.company ?? "",
      address: c.address ?? "",
      city: c.city ?? "",
      state: c.state ?? "",
      postalCode: c.postalCode ?? "",
      notes: c.notes ?? "",
      openingBalance: c.openingBalance ? String(c.openingBalance) : "",
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }

    const payload = {
      name: form.name.trim(),
      email: form.email.trim() || undefined,
      phone: form.phone.trim() || undefined,
      company: form.company.trim() || undefined,
      address: form.address.trim() || undefined,
      city: form.city.trim() || undefined,
      state: form.state.trim() || undefined,
      postalCode: form.postalCode.trim() || undefined,
      notes: form.notes.trim() || undefined,
      openingBalance: form.openingBalance.trim() !== "" && Number.isFinite(Number(form.openingBalance)) ? Number(form.openingBalance) : undefined,
    };

    if (editingCustomer) {
      updateCustomer.mutate(
        { id: editingCustomer.id, data: payload },
        {
          onSuccess: () => {
            toast({ title: "Customer updated" });
            queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
            setDialogOpen(false);
          },
          onError: () => toast({ title: "Update failed", variant: "destructive" }),
        },
      );
    } else {
      createCustomer.mutate(
        { data: payload },
        {
          onSuccess: () => {
            toast({ title: "Customer created" });
            queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
            setDialogOpen(false);
          },
          onError: () => toast({ title: "Create failed", variant: "destructive" }),
        },
      );
    }
  };

  const handleDelete = () => {
    if (!deleteId) return;
    deleteCustomer.mutate(
      { id: deleteId },
      {
        onSuccess: () => {
          toast({ title: "Customer deleted" });
          queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
          setDeleteId(null);
        },
        onError: () => toast({ title: "Delete failed", variant: "destructive" }),
      },
    );
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-4 sm:p-8 space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Customers</h2>
          <p className="text-muted-foreground mt-1 text-sm">Manage your customer profiles and loyalty.</p>
        </div>
        <div className="flex gap-2 self-start sm:self-auto">
          <Button variant="outline" onClick={() => setImportOpen(true)} className="gap-2">
            <Upload className="h-4 w-4" />
            Import
          </Button>
          <Button onClick={openAdd} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Customer
          </Button>
        </div>
      </div>

      <div className="relative w-full sm:max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9 w-full"
          placeholder="Search customers..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
        </div>
      ) : !customers?.length ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
          <Users className="h-12 w-12 opacity-30" />
          <p className="text-lg">No customers yet</p>
          <Button variant="outline" onClick={openAdd}>Add your first customer</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence>
            {customers.map((customer) => (
              <motion.div key={customer.id} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}>
                <Card className="group hover:border-primary/50 transition-colors">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base truncate">{customer.name}</CardTitle>
                        <div className="flex flex-col gap-0.5 mt-1">
                          {customer.email && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Mail className="h-3 w-3" />{customer.email}
                            </p>
                          )}
                          {customer.phone && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Phone className="h-3 w-3" />{customer.phone}
                            </p>
                          )}
                        </div>
                      </div>
                      <Badge variant="outline" className="text-amber-400 border-amber-400/30 gap-1 shrink-0">
                        <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                        {customer.loyaltyPoints} pts
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                      <div className="rounded-md bg-secondary/30 p-2 text-center">
                        <p className="font-bold text-primary font-mono">{formatCurrency(customer.totalSpent)}</p>
                        <p className="text-xs text-muted-foreground">Lifetime</p>
                      </div>
                      <div className="rounded-md bg-secondary/30 p-2 text-center">
                        <p className="font-bold">{customer.orderCount}</p>
                        <p className="text-xs text-muted-foreground">Orders</p>
                      </div>
                    </div>
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button size="sm" variant="outline" className="flex-1 h-7 text-xs" onClick={() => setCardCustomer(customer)}>
                        <CreditCard className="h-3 w-3 mr-1" />Card
                      </Button>
                      <Button size="sm" variant="outline" className="flex-1 h-7 text-xs" onClick={() => setHistoryCustomer(customer)}>
                        <ShoppingBag className="h-3 w-3 mr-1" />History
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => openEdit(customer)}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 px-2 text-destructive hover:bg-destructive/10 hover:border-destructive" onClick={() => setDeleteId(customer.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingCustomer ? "Edit Customer" : "Add Customer"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Jane Smith" />
            </div>
            <div className="grid gap-1.5">
              <Label>Company</Label>
              <Input value={form.company} onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))} placeholder="Acme Inc." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="jane@example.com" />
              </div>
              <div className="grid gap-1.5">
                <Label>Phone</Label>
                <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="+1 555 000 0000" />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Address</Label>
              <Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} placeholder="123 Main St" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-1.5">
                <Label>City</Label>
                <Input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} placeholder="Nassau" />
              </div>
              <div className="grid gap-1.5">
                <Label>State</Label>
                <Input value={form.state} onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))} placeholder="NP" />
              </div>
              <div className="grid gap-1.5">
                <Label>Postal Code</Label>
                <Input value={form.postalCode} onChange={(e) => setForm((f) => ({ ...f, postalCode: e.target.value }))} placeholder="00000" />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Notes</Label>
              <Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Optional notes" />
            </div>
            <div className="grid gap-1.5">
              <Label>Opening Balance</Label>
              <Input type="number" step="0.01" value={form.openingBalance} onChange={(e) => setForm((f) => ({ ...f, openingBalance: e.target.value }))} placeholder="0.00" />
              <p className="text-xs text-muted-foreground">Balance carried over from a previous system (e.g. QuickBooks Account Balance).</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={createCustomer.isPending || updateCustomer.isPending}>
              {editingCustomer ? "Save Changes" : "Create Customer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Order history sheet */}
      <Sheet open={!!historyCustomer} onOpenChange={(o) => !o && setHistoryCustomer(null)}>
        <SheetContent className="w-[420px] sm:max-w-[420px]">
          <SheetHeader>
            <SheetTitle>{historyCustomer?.name}'s Order History</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            {historyCustomer && <CustomerOrderHistory customerId={historyCustomer.id} />}
          </div>
        </SheetContent>
      </Sheet>

      {/* Loyalty card dialog */}
      <Dialog open={!!cardCustomer} onOpenChange={(o) => !o && setCardCustomer(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Loyalty Card</DialogTitle>
          </DialogHeader>
          {cardCustomer && (
            <div className="space-y-4">
              {cardCustomer.cardNumber ? (
                <>
                  <div className="rounded-2xl overflow-hidden border-2 border-[#0B1E2D] bg-gradient-to-br from-[#0B1E2D] to-[#15324a] text-white p-5">
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-extrabold text-sm">
                        {settings?.business_name || "NEXXUS POS"}
                      </span>
                      <span className="text-[10px] uppercase tracking-[0.15em] opacity-80">
                        Loyalty Card
                      </span>
                    </div>
                    <p className="text-[10px] uppercase tracking-wider font-bold opacity-70">Member</p>
                    <p className="text-xl font-extrabold mb-2 truncate">{cardCustomer.name}</p>
                    <p className="text-xs opacity-90 mb-3">
                      Loyalty points: <b className="text-sm">{cardCustomer.loyaltyPoints.toLocaleString("en-US")}</b>
                    </p>
                    <div className="bg-white rounded-lg p-2 text-center">
                      <img
                        src={cardBarcodeDataUrl(cardCustomer.cardNumber)}
                        alt={cardCustomer.cardNumber}
                        className="max-w-full h-auto mx-auto"
                      />
                      <p className="font-mono font-bold tracking-[0.2em] text-[#0B1E2D] text-sm mt-1">
                        {cardCustomer.cardNumber}
                      </p>
                    </div>
                  </div>
                  <Button
                    className="w-full gap-2"
                    onClick={() =>
                      printCustomerCard(
                        {
                          name: cardCustomer.name,
                          cardNumber: cardCustomer.cardNumber!,
                          loyaltyPoints: cardCustomer.loyaltyPoints,
                          memberSince: cardCustomer.createdAt ?? null,
                        },
                        settings ?? {},
                      )
                    }
                  >
                    <Printer className="h-4 w-4" />Print card
                  </Button>
                </>
              ) : (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  This customer doesn't have a loyalty card number yet.
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete customer?</AlertDialogTitle>
            <AlertDialogDescription>
              This customer profile will be permanently removed. Their past orders will remain in the system.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90 text-destructive-foreground" onClick={handleDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Import customers dialog */}
      <ImportCustomersDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={(count) => {
          toast({ title: `${count} customer${count !== 1 ? "s" : ""} imported successfully` });
          queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
        }}
      />
    </motion.div>
  );
}
