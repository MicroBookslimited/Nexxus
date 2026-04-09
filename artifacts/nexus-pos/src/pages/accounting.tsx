import { useState, useEffect, useCallback } from "react";
import { TENANT_TOKEN_KEY } from "@/lib/saas-api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  TrendingUp, TrendingDown, DollarSign, BookOpen, FileText,
  Plus, Trash2, RefreshCw, Link2, Unlink, CheckCircle2,
  AlertTriangle, BarChart2, ChevronRight, Building2, Calculator,
  ArrowUpRight, ArrowDownRight, Wallet, Package, ClipboardList,
  ArrowUp, ArrowDown, Search, ChevronDown, ChevronUp,
} from "lucide-react";
import { format, startOfMonth, endOfMonth, startOfYear } from "date-fns";

/* ─── Types ─── */
interface Account { id: number; code: string; name: string; type: string; subtype: string | null; description: string | null; isSystem: boolean; isActive: boolean; }
interface JournalEntryLine { accountId: number; accountName: string | null; accountCode: string | null; accountType: string | null; description: string | null; debit: number; credit: number; }
interface JournalEntry { id: number; date: string; description: string; reference: string | null; type: string; status: string; createdAt: string; lines: JournalEntryLine[]; }
interface PLReport {
  period: { from: string; to: string };
  revenue: { sales: number; manual: number; total: number; byPaymentMethod: { method: string | null; total: number; count: number }[] };
  taxCollected: number;
  expenses: { accountId: number; name: string; code: string; amount: number }[];
  totalExpenses: number;
  grossProfit: number;
  netIncome: number;
}
interface BalanceSheet {
  asOf: string;
  assets: (Account & { balance: number })[];
  liabilities: (Account & { balance: number })[];
  equity: (Account & { balance: number })[];
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  isBalanced: boolean;
}
interface TrialBalance {
  asOf: string;
  accounts: (Account & { totalDebit: number; totalCredit: number })[];
  totalDebits: number;
  totalCredits: number;
  isBalanced: boolean;
}
interface Overview { period: string; from: string; to: string; revenue: number; taxCollected: number; totalRevenue: number; totalExpenses: number; netIncome: number; orderCount: number; journalEntryCount: number; }
interface QBStatus { configured: boolean; connected: boolean; realmId?: string; connectedAt?: string; tokenExpired?: boolean; lastSyncAt?: string; lastSyncStatus?: string; lastSyncMessage?: string; }
interface StockProduct { id: number; name: string; category: string; price: number; stockCount: number; inStock: boolean; }
interface StockAdjustment { id: number; productId: number; productName: string; adjustmentType: string; quantity: number; reason: string; notes: string | null; previousStock: number; newStock: number; createdAt: string; createdBy: string | null; journalEntryId: number | null; }
interface StockCountItem { id: number; sessionId: number; productId: number; productName: string; productCategory: string | null; systemCount: number; physicalCount: number | null; discrepancy: number | null; isAdjusted: boolean; unitCost: number | null; }
interface StockCountSession { id: number; name: string; status: string; notes: string | null; startedAt: string; completedAt: string | null; createdBy: string | null; totalItems: number | null; totalDiscrepancies: number | null; items?: StockCountItem[]; }

/* ─── API helpers ─── */
function authHeaders(): Record<string, string> {
  const t = localStorage.getItem(TENANT_TOKEN_KEY);
  return t ? { Authorization: `Bearer ${t}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
}
async function api<T>(path: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(`/api${path}`, { headers: authHeaders(), ...opts });
  if (!r.ok) { const e = await r.json().catch(() => ({ error: r.statusText })) as { error?: string }; throw new Error(e.error ?? r.statusText); }
  return r.json() as Promise<T>;
}

/* ─── Currency formatter ─── */
function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "JMD", minimumFractionDigits: 2 }).format(n);
}

/* ─── KPI Card ─── */
function KpiCard({ label, value, icon: Icon, trend, sub, color = "blue" }: { label: string; value: string; icon: any; trend?: "up" | "down" | null; sub?: string; color?: "blue" | "green" | "red" | "yellow" }) {
  const colors = { blue: "text-blue-400 bg-blue-500/10 border-blue-500/20", green: "text-green-400 bg-green-500/10 border-green-500/20", red: "text-red-400 bg-red-500/10 border-red-500/20", yellow: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20" };
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
        <div className={cn("h-8 w-8 rounded-lg border flex items-center justify-center", colors[color])}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="text-xl font-bold">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      {trend && (
        <div className={cn("flex items-center gap-1 mt-2 text-xs", trend === "up" ? "text-green-400" : "text-red-400")}>
          {trend === "up" ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
        </div>
      )}
    </div>
  );
}

/* ─── Account Badge ─── */
const accountTypeColor: Record<string, string> = {
  asset: "border-blue-500/40 text-blue-400",
  liability: "border-red-500/40 text-red-400",
  equity: "border-purple-500/40 text-purple-400",
  revenue: "border-green-500/40 text-green-400",
  expense: "border-orange-500/40 text-orange-400",
};

/* ─── Account Form Modal ─── */
function AccountModal({ account, onClose, onSaved }: { account?: Account; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ code: account?.code ?? "", name: account?.name ?? "", type: account?.type ?? "expense", subtype: account?.subtype ?? "", description: account?.description ?? "", isActive: account?.isActive ?? true });
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!form.code || !form.name) { toast({ title: "Code and name are required", variant: "destructive" }); return; }
    setSaving(true);
    try {
      if (account) {
        await api(`/accounting/accounts/${account.id}`, { method: "PATCH", body: JSON.stringify(form) });
        toast({ title: "Account updated" });
      } else {
        await api(`/accounting/accounts`, { method: "POST", body: JSON.stringify(form) });
        toast({ title: "Account created" });
      }
      onSaved(); onClose();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{account ? "Edit Account" : "New Account"}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Account Code *</Label><Input placeholder="e.g. 5100" value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value }))} /></div>
            <div className="space-y-1">
              <Label>Type *</Label>
              <Select value={form.type} onValueChange={v => setForm(p => ({ ...p, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["asset", "liability", "equity", "revenue", "expense"].map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1"><Label>Account Name *</Label><Input placeholder="e.g. Office Supplies" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></div>
          <div className="space-y-1"><Label>Description</Label><Input placeholder="Optional description" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Journal Entry Form Modal ─── */
function JournalEntryModal({ accounts, onClose, onSaved }: { accounts: Account[]; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ date: format(new Date(), "yyyy-MM-dd"), description: "", reference: "", type: "manual" });
  const [lines, setLines] = useState([
    { accountId: "", description: "", debit: "", credit: "" },
    { accountId: "", description: "", debit: "", credit: "" },
  ]);
  const [saving, setSaving] = useState(false);

  const totalDebit = lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;

  function updateLine(idx: number, field: string, val: string) {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: val } : l));
  }

  async function save() {
    if (!form.description) { toast({ title: "Description is required", variant: "destructive" }); return; }
    if (!isBalanced) { toast({ title: `Debits (${fmt(totalDebit)}) must equal Credits (${fmt(totalCredit)})`, variant: "destructive" }); return; }
    const validLines = lines.filter(l => l.accountId && (parseFloat(l.debit) > 0 || parseFloat(l.credit) > 0));
    if (validLines.length < 2) { toast({ title: "At least 2 valid lines required", variant: "destructive" }); return; }

    setSaving(true);
    try {
      await api("/accounting/journal-entries", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          lines: validLines.map(l => ({ accountId: parseInt(l.accountId, 10), description: l.description || undefined, debit: parseFloat(l.debit) || 0, credit: parseFloat(l.credit) || 0 })),
        }),
      });
      toast({ title: "Journal entry posted" });
      onSaved(); onClose();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><BookOpen className="h-4 w-4" /> New Journal Entry</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1"><Label>Date *</Label><Input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} /></div>
            <div className="space-y-1">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={v => setForm(p => ({ ...p, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="adjustment">Adjustment</SelectItem>
                  <SelectItem value="purchase">Purchase</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Reference</Label><Input placeholder="Invoice # or Order #" value={form.reference} onChange={e => setForm(p => ({ ...p, reference: e.target.value }))} /></div>
          </div>
          <div className="space-y-1"><Label>Description *</Label><Input placeholder="e.g. Monthly rent payment for June" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} /></div>

          <div>
            <div className="grid grid-cols-[1fr_1fr_90px_90px_32px] gap-2 mb-2 text-xs text-muted-foreground font-medium px-1">
              <span>Account</span><span>Description</span><span>Debit</span><span>Credit</span><span></span>
            </div>
            <div className="space-y-2">
              {lines.map((line, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_1fr_90px_90px_32px] gap-2 items-center">
                  <Select value={line.accountId} onValueChange={v => updateLine(idx, "accountId", v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select account" /></SelectTrigger>
                    <SelectContent>
                      {["asset", "liability", "equity", "revenue", "expense"].map(type => (
                        <div key={type}>
                          <p className="px-2 py-1 text-xs text-muted-foreground font-semibold uppercase">{type}</p>
                          {accounts.filter(a => a.type === type).map(a => (
                            <SelectItem key={a.id} value={String(a.id)} className="text-xs">{a.code} — {a.name}</SelectItem>
                          ))}
                        </div>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input className="h-8 text-xs" placeholder="Line description" value={line.description} onChange={e => updateLine(idx, "description", e.target.value)} />
                  <Input className="h-8 text-xs" type="number" min={0} step={0.01} placeholder="0.00" value={line.debit} onChange={e => updateLine(idx, "debit", e.target.value)} />
                  <Input className="h-8 text-xs" type="number" min={0} step={0.01} placeholder="0.00" value={line.credit} onChange={e => updateLine(idx, "credit", e.target.value)} />
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground" onClick={() => setLines(prev => prev.filter((_, i) => i !== idx))} disabled={lines.length <= 2}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
            <Button size="sm" variant="outline" className="mt-2 h-7 text-xs" onClick={() => setLines(prev => [...prev, { accountId: "", description: "", debit: "", credit: "" }])}>
              <Plus className="h-3 w-3 mr-1" /> Add Line
            </Button>
          </div>

          <div className={cn("flex justify-between items-center px-3 py-2 rounded-lg text-sm font-medium", isBalanced ? "bg-green-500/10 border border-green-500/30 text-green-400" : "bg-red-500/10 border border-red-500/30 text-red-400")}>
            <span>{isBalanced ? "✓ Balanced" : "✗ Not balanced"}</span>
            <div className="flex gap-6 text-xs">
              <span>Debit: {fmt(totalDebit)}</span>
              <span>Credit: {fmt(totalCredit)}</span>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving || !isBalanced}>{saving ? "Posting…" : "Post Entry"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── P&L Report ─── */
function PLReportView({ accounts }: { accounts: Account[] }) {
  const [from, setFrom] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [report, setReport] = useState<PLReport | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try { setReport(await api<PLReport>(`/accounting/reports/profit-loss?from=${from}&to=${to}`)); }
    catch (e: any) { toast({ title: "Failed to load report", description: e.message, variant: "destructive" }); }
    finally { setLoading(false); }
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  const presets = [
    { label: "This Month", from: format(startOfMonth(new Date()), "yyyy-MM-dd"), to: format(endOfMonth(new Date()), "yyyy-MM-dd") },
    { label: "This Year", from: format(startOfYear(new Date()), "yyyy-MM-dd"), to: format(new Date(), "yyyy-MM-dd") },
    { label: "Last 30 Days", from: format(new Date(Date.now() - 30 * 86400000), "yyyy-MM-dd"), to: format(new Date(), "yyyy-MM-dd") },
    { label: "Last 90 Days", from: format(new Date(Date.now() - 90 * 86400000), "yyyy-MM-dd"), to: format(new Date(), "yyyy-MM-dd") },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-end">
        <div className="space-y-1"><Label className="text-xs">From</Label><Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-8 text-xs w-36" /></div>
        <div className="space-y-1"><Label className="text-xs">To</Label><Input type="date" value={to} onChange={e => setTo(e.target.value)} className="h-8 text-xs w-36" /></div>
        <Button size="sm" className="h-8 text-xs gap-1" onClick={load} disabled={loading}><RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} /> Apply</Button>
        <div className="flex gap-1 ml-2">
          {presets.map(p => <Button key={p.label} size="sm" variant="outline" className="h-8 text-xs px-2" onClick={() => { setFrom(p.from); setTo(p.to); }}>{p.label}</Button>)}
        </div>
      </div>

      {!report ? null : (
        <div className="max-w-xl space-y-0 rounded-xl border border-border overflow-hidden">
          <div className="bg-card/70 px-4 py-3 border-b border-border">
            <h3 className="font-semibold text-sm">Profit & Loss Statement</h3>
            <p className="text-xs text-muted-foreground">{format(new Date(report.period.from), "MMM d, yyyy")} — {format(new Date(report.period.to), "MMM d, yyyy")}</p>
          </div>

          {/* Revenue section */}
          <div className="divide-y divide-border/50">
            <div className="px-4 py-2 bg-green-500/5">
              <p className="text-xs font-semibold text-green-400 uppercase tracking-wide">Revenue</p>
            </div>
            <div className="px-4 py-2 flex justify-between text-sm"><span className="text-muted-foreground">POS Sales Revenue</span><span>{fmt(report.revenue.sales)}</span></div>
            {report.revenue.manual > 0 && <div className="px-4 py-2 flex justify-between text-sm"><span className="text-muted-foreground">Other Revenue</span><span>{fmt(report.revenue.manual)}</span></div>}
            <div className="px-4 py-2 flex justify-between text-sm font-semibold bg-card/30"><span>Total Revenue</span><span className="text-green-400">{fmt(report.revenue.total)}</span></div>
            <div className="px-4 py-2 flex justify-between text-xs text-muted-foreground"><span>Tax Collected (GCT/VAT)</span><span>{fmt(report.taxCollected)}</span></div>

            {/* Expenses section */}
            <div className="px-4 py-2 bg-red-500/5 mt-2">
              <p className="text-xs font-semibold text-red-400 uppercase tracking-wide">Expenses</p>
            </div>
            {report.expenses.length === 0 ? (
              <div className="px-4 py-3 text-xs text-muted-foreground italic">No expenses recorded in this period</div>
            ) : (
              report.expenses.map(exp => (
                <div key={exp.accountId} className="px-4 py-2 flex justify-between text-sm">
                  <span className="text-muted-foreground">{exp.code} — {exp.name}</span>
                  <span className="text-red-400">{fmt(exp.amount)}</span>
                </div>
              ))
            )}
            <div className="px-4 py-2 flex justify-between text-sm font-semibold bg-card/30"><span>Total Expenses</span><span className="text-red-400">{fmt(report.totalExpenses)}</span></div>

            {/* Net Income */}
            <div className={cn("px-4 py-3 flex justify-between text-base font-bold", report.netIncome >= 0 ? "bg-green-500/10" : "bg-red-500/10")}>
              <span>Net Income</span>
              <span className={report.netIncome >= 0 ? "text-green-400" : "text-red-400"}>{fmt(report.netIncome)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Balance Sheet ─── */
function BalanceSheetView() {
  const [asOf, setAsOf] = useState(format(new Date(), "yyyy-MM-dd"));
  const [report, setReport] = useState<BalanceSheet | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try { setReport(await api<BalanceSheet>(`/accounting/reports/balance-sheet?as_of=${asOf}`)); }
    catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setLoading(false); }
  }, [asOf]);

  useEffect(() => { load(); }, [load]);

  function Section({ title, items, total, color }: { title: string; items: (Account & { balance: number })[]; total: number; color: string }) {
    const nonZero = items.filter(i => i.balance !== 0);
    return (
      <div>
        <div className={cn("px-4 py-2", color)}><p className="text-xs font-semibold uppercase tracking-wide">{title}</p></div>
        {nonZero.length === 0 ? (
          <div className="px-4 py-2 text-xs text-muted-foreground italic">No balances</div>
        ) : nonZero.map(item => (
          <div key={item.id} className="px-4 py-1.5 flex justify-between text-sm border-t border-border/30">
            <span className="text-muted-foreground">{item.code} — {item.name}</span>
            <span>{fmt(item.balance)}</span>
          </div>
        ))}
        <div className="px-4 py-2 flex justify-between text-sm font-semibold bg-card/30 border-t border-border/50"><span>Total {title}</span><span>{fmt(total)}</span></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-end">
        <div className="space-y-1"><Label className="text-xs">As of date</Label><Input type="date" value={asOf} onChange={e => setAsOf(e.target.value)} className="h-8 text-xs w-36" /></div>
        <Button size="sm" className="h-8 text-xs gap-1" onClick={load} disabled={loading}><RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} /> Apply</Button>
      </div>

      {report && (
        <div className="max-w-xl rounded-xl border border-border overflow-hidden">
          <div className="bg-card/70 px-4 py-3 border-b border-border">
            <h3 className="font-semibold text-sm">Balance Sheet</h3>
            <p className="text-xs text-muted-foreground">As of {format(new Date(report.asOf), "PPP")}</p>
          </div>
          <div className="divide-y divide-border/50">
            <Section title="Assets" items={report.assets} total={report.totalAssets} color="bg-blue-500/5 text-blue-400" />
            <Section title="Liabilities" items={report.liabilities} total={report.totalLiabilities} color="bg-red-500/5 text-red-400" />
            <Section title="Equity" items={report.equity} total={report.totalEquity} color="bg-purple-500/5 text-purple-400" />
            <div className={cn("px-4 py-3 flex justify-between text-base font-bold", report.isBalanced ? "bg-green-500/10" : "bg-red-500/10")}>
              <span>Liabilities + Equity</span>
              <span className={report.isBalanced ? "text-green-400" : "text-red-400"}>{fmt(report.totalLiabilities + report.totalEquity)}</span>
            </div>
            {!report.isBalanced && <div className="px-4 py-2 text-xs text-red-400 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Balance sheet does not balance. Record journal entries to correct.</div>}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Trial Balance ─── */
function TrialBalanceView() {
  const [asOf, setAsOf] = useState(format(new Date(), "yyyy-MM-dd"));
  const [report, setReport] = useState<TrialBalance | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try { setReport(await api<TrialBalance>(`/accounting/reports/trial-balance?as_of=${asOf}`)); }
    catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setLoading(false); }
  }, [asOf]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-end">
        <div className="space-y-1"><Label className="text-xs">As of date</Label><Input type="date" value={asOf} onChange={e => setAsOf(e.target.value)} className="h-8 text-xs w-36" /></div>
        <Button size="sm" className="h-8 text-xs gap-1" onClick={load} disabled={loading}><RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} /> Apply</Button>
      </div>

      {report && (
        <div className="max-w-2xl rounded-xl border border-border overflow-hidden">
          <div className="bg-card/70 px-4 py-3 border-b border-border flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-sm">Trial Balance</h3>
              <p className="text-xs text-muted-foreground">As of {format(new Date(report.asOf), "PPP")}</p>
            </div>
            <Badge variant="outline" className={report.isBalanced ? "border-green-500/40 text-green-400" : "border-red-500/40 text-red-400"}>
              {report.isBalanced ? "✓ Balanced" : "✗ Out of Balance"}
            </Badge>
          </div>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/30">
                <tr>
                  <th className="px-4 py-2 text-left text-xs text-muted-foreground font-medium">Code</th>
                  <th className="px-4 py-2 text-left text-xs text-muted-foreground font-medium">Account</th>
                  <th className="px-4 py-2 text-left text-xs text-muted-foreground font-medium">Type</th>
                  <th className="px-4 py-2 text-right text-xs text-muted-foreground font-medium">Debit</th>
                  <th className="px-4 py-2 text-right text-xs text-muted-foreground font-medium">Credit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {report.accounts.filter(a => a.totalDebit > 0 || a.totalCredit > 0).map(acc => (
                  <tr key={acc.id} className="hover:bg-muted/20">
                    <td className="px-4 py-1.5 text-xs text-muted-foreground">{acc.code}</td>
                    <td className="px-4 py-1.5">{acc.name}</td>
                    <td className="px-4 py-1.5"><Badge variant="outline" className={cn("text-xs", accountTypeColor[acc.type])}>{acc.type}</Badge></td>
                    <td className="px-4 py-1.5 text-right font-mono text-xs">{acc.totalDebit > 0 ? fmt(acc.totalDebit) : "—"}</td>
                    <td className="px-4 py-1.5 text-right font-mono text-xs">{acc.totalCredit > 0 ? fmt(acc.totalCredit) : "—"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-border bg-card/40">
                <tr>
                  <td colSpan={3} className="px-4 py-2 text-sm font-bold">Totals</td>
                  <td className="px-4 py-2 text-right text-sm font-bold font-mono">{fmt(report.totalDebits)}</td>
                  <td className="px-4 py-2 text-right text-sm font-bold font-mono">{fmt(report.totalCredits)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── QuickBooks Panel ─── */
function QuickBooksPanel() {
  const { toast } = useToast();
  const [status, setStatus] = useState<QBStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncDays, setSyncDays] = useState("7");
  const [disconnecting, setDisconnecting] = useState(false);

  const loadStatus = useCallback(async () => {
    try { setStatus(await api<QBStatus>("/accounting/quickbooks/status")); }
    catch { setStatus({ configured: false, connected: false }); }
  }, []);

  useEffect(() => {
    loadStatus();
    // Check URL params for OAuth callback
    const params = new URLSearchParams(window.location.search);
    if (params.get("qb") === "connected") {
      toast({ title: "QuickBooks connected successfully!" });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [loadStatus]);

  async function sync() {
    setSyncing(true);
    try {
      const result = await api<{ synced: number; failed: number; message: string }>("/accounting/quickbooks/sync", { method: "POST", body: JSON.stringify({ days: syncDays }) });
      toast({ title: `Sync complete: ${result.synced} orders synced`, description: result.failed > 0 ? `${result.failed} failed` : undefined });
      await loadStatus();
    } catch (e: any) { toast({ title: "Sync failed", description: e.message, variant: "destructive" }); }
    finally { setSyncing(false); }
  }

  async function disconnect() {
    setDisconnecting(true);
    try {
      await api("/accounting/quickbooks/disconnect", { method: "POST" });
      toast({ title: "Disconnected from QuickBooks" });
      await loadStatus();
    } catch { toast({ title: "Error disconnecting", variant: "destructive" }); }
    finally { setDisconnecting(false); }
  }

  return (
    <div className="max-w-lg space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-xl bg-[#2CA01C]/10 border border-[#2CA01C]/30 flex items-center justify-center">
          <Building2 className="h-5 w-5 text-[#2CA01C]" />
        </div>
        <div>
          <h2 className="font-bold text-base">QuickBooks Online</h2>
          <p className="text-xs text-muted-foreground">Sync your POS sales directly to QuickBooks</p>
        </div>
      </div>

      {/* Status card */}
      <div className="rounded-xl border border-border bg-card/50 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Connection Status</span>
          {status?.connected ? (
            <Badge variant="outline" className="border-green-500/40 text-green-400 gap-1">
              <CheckCircle2 className="h-3 w-3" /> Connected
            </Badge>
          ) : (
            <Badge variant="outline" className="border-muted-foreground/30 text-muted-foreground gap-1">
              <Unlink className="h-3 w-3" /> Not Connected
            </Badge>
          )}
        </div>

        {status?.connected && (
          <>
            <div className="grid grid-cols-2 gap-3 text-xs">
              {status.realmId && <div><p className="text-muted-foreground">Company ID</p><p className="font-mono mt-0.5">{status.realmId}</p></div>}
              {status.connectedAt && <div><p className="text-muted-foreground">Connected</p><p className="mt-0.5">{format(new Date(status.connectedAt), "MMM d, yyyy")}</p></div>}
              {status.lastSyncAt && <div><p className="text-muted-foreground">Last Synced</p><p className="mt-0.5">{format(new Date(status.lastSyncAt), "MMM d, h:mm a")}</p></div>}
              {status.lastSyncStatus && (
                <div>
                  <p className="text-muted-foreground">Last Sync Status</p>
                  <Badge variant="outline" className={cn("text-xs mt-0.5", status.lastSyncStatus === "success" ? "border-green-500/40 text-green-400" : status.lastSyncStatus === "partial" ? "border-yellow-500/40 text-yellow-400" : "border-red-500/40 text-red-400")}>
                    {status.lastSyncStatus}
                  </Badge>
                </div>
              )}
            </div>
            {status.lastSyncMessage && <p className="text-xs text-muted-foreground italic">{status.lastSyncMessage}</p>}
            {status.tokenExpired && <div className="flex items-center gap-2 p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-xs"><AlertTriangle className="h-3 w-3 shrink-0" /> Token expired. Reconnect to QuickBooks.</div>}
          </>
        )}

        {!status?.configured && (
          <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 space-y-2">
            <p className="text-xs text-yellow-400 font-medium flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> QuickBooks credentials not configured</p>
            <p className="text-xs text-muted-foreground">To connect QuickBooks, you need to add your API credentials. Contact your administrator to set up <code className="bg-muted px-1 rounded">QUICKBOOKS_CLIENT_ID</code> and <code className="bg-muted px-1 rounded">QUICKBOOKS_CLIENT_SECRET</code>.</p>
            <div className="text-xs text-muted-foreground space-y-1">
              <p className="font-medium">How to get credentials:</p>
              <ol className="list-decimal list-inside space-y-0.5 text-muted-foreground/80">
                <li>Go to <a href="https://developer.intuit.com" target="_blank" rel="noopener noreferrer" className="text-primary underline">developer.intuit.com</a></li>
                <li>Create a new app and select "QuickBooks Online Accounting"</li>
                <li>Copy the Client ID and Client Secret</li>
                <li>Add the redirect URI: <code className="bg-muted px-1 rounded">{window.location.origin}/api/accounting/quickbooks/callback</code></li>
              </ol>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="space-y-3">
        {status?.configured && !status?.connected && (
          <Button className="w-full gap-2" onClick={() => { window.location.href = "/api/accounting/quickbooks/auth"; }}>
            <Link2 className="h-4 w-4" /> Connect to QuickBooks
          </Button>
        )}

        {status?.connected && (
          <>
            <div className="flex gap-2">
              <div className="space-y-1 flex-1">
                <Label className="text-xs">Sync orders from last</Label>
                <Select value={syncDays} onValueChange={setSyncDays}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 day</SelectItem>
                    <SelectItem value="7">7 days</SelectItem>
                    <SelectItem value="30">30 days</SelectItem>
                    <SelectItem value="90">90 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button className="gap-2 h-9" onClick={sync} disabled={syncing}>
                  <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
                  {syncing ? "Syncing…" : "Sync Now"}
                </Button>
              </div>
            </div>
            <Button variant="outline" className="w-full gap-2 text-destructive hover:text-destructive border-destructive/30" onClick={disconnect} disabled={disconnecting}>
              <Unlink className="h-4 w-4" /> {disconnecting ? "Disconnecting…" : "Disconnect QuickBooks"}
            </Button>
          </>
        )}

        {status?.configured && status?.connected && status?.tokenExpired && (
          <Button className="w-full gap-2" variant="outline" onClick={() => { window.location.href = "/api/accounting/quickbooks/auth"; }}>
            <Link2 className="h-4 w-4" /> Reconnect to QuickBooks
          </Button>
        )}
      </div>

      {/* What gets synced */}
      <div className="rounded-xl border border-border/50 bg-muted/20 p-4 space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">What gets synced</h3>
        <div className="space-y-2">
          {[
            "POS sales orders → QuickBooks Sales Receipts",
            "Payment method (cash/card) mapped to QB payment method",
            "Tax amounts recorded in each receipt",
            "Order number used as document reference",
          ].map(item => (
            <div key={item} className="flex items-start gap-2 text-xs">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-400 shrink-0 mt-0.5" />
              <span className="text-muted-foreground">{item}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Stock Adjustment Modal ─── */
const ADJUSTMENT_REASONS = ["received", "returned", "damaged", "theft", "expired", "manual", "other"] as const;

function StockAdjustmentModal({ products, onClose, onSaved }: { products: StockProduct[]; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ productId: "", adjustmentType: "increase", quantity: "1", reason: "received", notes: "", createJournalEntry: false });
  const [saving, setSaving] = useState(false);
  const selectedProduct = products.find(p => String(p.id) === form.productId);

  async function save() {
    if (!form.productId) { toast({ title: "Please select a product", variant: "destructive" }); return; }
    setSaving(true);
    try {
      await api("/accounting/stock-adjustments", {
        method: "POST",
        body: JSON.stringify({ productId: parseInt(form.productId, 10), adjustmentType: form.adjustmentType, quantity: parseInt(form.quantity, 10), reason: form.reason, notes: form.notes || undefined, createJournalEntry: form.createJournalEntry }),
      });
      toast({ title: "Stock adjusted successfully" });
      onSaved(); onClose();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setSaving(false); }
  }

  const previewStock = selectedProduct ? (form.adjustmentType === "increase" ? selectedProduct.stockCount + (parseInt(form.quantity, 10) || 0) : Math.max(0, selectedProduct.stockCount - (parseInt(form.quantity, 10) || 0))) : null;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Package className="h-4 w-4" /> New Stock Adjustment</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Product *</Label>
            <Select value={form.productId} onValueChange={v => setForm(p => ({ ...p, productId: v }))}>
              <SelectTrigger><SelectValue placeholder="Select a product…" /></SelectTrigger>
              <SelectContent className="max-h-60">
                {Array.from(new Set(products.map(p => p.category))).sort().map(cat => (
                  <div key={cat}>
                    <p className="px-2 py-1 text-xs text-muted-foreground font-semibold uppercase">{cat}</p>
                    {products.filter(p => p.category === cat).map(p => (
                      <SelectItem key={p.id} value={String(p.id)} className="text-sm">
                        <span>{p.name}</span>
                        <span className="ml-2 text-muted-foreground text-xs">({p.stockCount} in stock)</span>
                      </SelectItem>
                    ))}
                  </div>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedProduct && (
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50 text-sm">
              <span className="text-muted-foreground">Current stock</span>
              <span className="font-bold">{selectedProduct.stockCount} units</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Adjustment Type *</Label>
              <Select value={form.adjustmentType} onValueChange={v => setForm(p => ({ ...p, adjustmentType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="increase"><span className="flex items-center gap-1.5"><ArrowUp className="h-3 w-3 text-green-400" /> Increase</span></SelectItem>
                  <SelectItem value="decrease"><span className="flex items-center gap-1.5"><ArrowDown className="h-3 w-3 text-red-400" /> Decrease</span></SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Quantity *</Label>
              <Input type="number" min={1} value={form.quantity} onChange={e => setForm(p => ({ ...p, quantity: e.target.value }))} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Reason *</Label>
            <Select value={form.reason} onValueChange={v => setForm(p => ({ ...p, reason: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ADJUSTMENT_REASONS.map(r => <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Input placeholder="Optional notes…" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer select-none p-3 rounded-lg border border-border/50 hover:bg-muted/20">
            <input type="checkbox" className="h-4 w-4 accent-blue-500" checked={form.createJournalEntry} onChange={e => setForm(p => ({ ...p, createJournalEntry: e.target.checked }))} />
            <div>
              <p className="text-sm font-medium">Create accounting journal entry</p>
              <p className="text-xs text-muted-foreground">Records this adjustment in the ledger with estimated cost value</p>
            </div>
          </label>

          {previewStock !== null && (
            <div className={cn("flex items-center justify-between p-3 rounded-lg border text-sm font-medium", form.adjustmentType === "increase" ? "bg-green-500/10 border-green-500/30 text-green-400" : "bg-red-500/10 border-red-500/30 text-red-400")}>
              <span>New stock after adjustment</span>
              <span className="font-bold">{previewStock} units</span>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Apply Adjustment"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── New Stock Count Session Modal ─── */
function NewStockCountModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ name: `Stock Count — ${format(new Date(), "MMM d, yyyy")}`, notes: "" });
  const [creating, setCreating] = useState(false);

  async function create() {
    if (!form.name) { toast({ title: "Name is required", variant: "destructive" }); return; }
    setCreating(true);
    try {
      const session = await api<{ id: number; itemCount: number }>("/accounting/stock-counts", { method: "POST", body: JSON.stringify(form) });
      toast({ title: `Stock count created with ${session.itemCount} products` });
      onCreated(session.id);
      onClose();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setCreating(false); }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><ClipboardList className="h-4 w-4" /> New Stock Count</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5"><Label>Count Name *</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></div>
          <div className="space-y-1.5"><Label>Notes</Label><Input placeholder="e.g. End of month physical count" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} /></div>
          <p className="text-xs text-muted-foreground">This will snapshot the current stock levels for all products. You can then enter physical counts and compare.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={create} disabled={creating}>{creating ? "Creating…" : "Start Count"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Stock Count Detail View ─── */
function StockCountDetail({ sessionId, onBack, onApplied }: { sessionId: number; onBack: () => void; onApplied: () => void }) {
  const { toast } = useToast();
  const [session, setSession] = useState<StockCountSession | null>(null);
  const [items, setItems] = useState<StockCountItem[]>([]);
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [searchQ, setSearchQ] = useState("");
  const [applying, setApplying] = useState(false);
  const [createJE, setCreateJE] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<StockCountSession & { items: StockCountItem[] }>(`/accounting/stock-counts/${sessionId}`);
      setSession(data);
      setItems(data.items ?? []);
      const initCounts: Record<number, string> = {};
      for (const item of data.items ?? []) { if (item.physicalCount !== null) initCounts[item.id] = String(item.physicalCount); }
      setCounts(initCounts);
    } catch (e: any) { toast({ title: "Error loading session", description: e.message, variant: "destructive" }); }
    finally { setLoading(false); }
  }, [sessionId]);

  useEffect(() => { load(); }, [load]);

  async function updateCount(itemId: number, value: string) {
    setCounts(prev => ({ ...prev, [itemId]: value }));
    const n = parseInt(value, 10);
    if (isNaN(n) || n < 0) return;
    try {
      const updated = await api<StockCountItem>(`/accounting/stock-counts/${sessionId}/items/${itemId}`, { method: "PATCH", body: JSON.stringify({ physicalCount: n }) });
      setItems(prev => prev.map(i => i.id === itemId ? updated : i));
    } catch { /* silent — allow optimistic UI */ }
  }

  async function applyCount() {
    setApplying(true);
    try {
      const result = await api<{ adjusted: number; discrepancies: number; message: string }>(`/accounting/stock-counts/${sessionId}/apply`, { method: "POST", body: JSON.stringify({ createJournalEntries: createJE }) });
      toast({ title: "Stock count applied", description: result.message });
      onApplied();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setApplying(false); }
  }

  const filteredItems = items.filter(i => !searchQ || i.productName.toLowerCase().includes(searchQ.toLowerCase()) || (i.productCategory ?? "").toLowerCase().includes(searchQ.toLowerCase()));
  const groupedItems = filteredItems.reduce<Record<string, StockCountItem[]>>((acc, item) => {
    const cat = item.productCategory ?? "Uncategorized";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  const counted = items.filter(i => i.physicalCount !== null).length;
  const discrepancies = items.filter(i => i.physicalCount !== null && i.discrepancy !== null && i.discrepancy !== 0);
  const isCompleted = session?.status === "completed";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs" onClick={onBack}>← Back</Button>
        <div className="flex-1">
          <h2 className="font-bold text-base">{session?.name ?? "Loading…"}</h2>
          <p className="text-xs text-muted-foreground">{session?.startedAt ? format(new Date(session.startedAt), "MMM d, yyyy 'at' h:mm a") : ""}</p>
        </div>
        <Badge variant="outline" className={cn("shrink-0", isCompleted ? "border-green-500/40 text-green-400" : session?.status === "voided" ? "border-red-500/40 text-red-400" : "border-yellow-500/40 text-yellow-400")}>
          {session?.status ?? "…"}
        </Badge>
      </div>

      {/* Progress bar */}
      <div className="rounded-xl border border-border bg-card/50 p-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Counted</span>
          <span className="font-medium">{counted} / {items.length} products</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${items.length > 0 ? (counted / items.length) * 100 : 0}%` }} />
        </div>
        <div className="flex gap-4 text-xs text-muted-foreground pt-1">
          <span className={discrepancies.length > 0 ? "text-red-400" : "text-green-400"}>{discrepancies.length} discrepancies</span>
          <span>{items.length - counted} remaining</span>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <Input className="pl-8 h-8 text-sm" placeholder="Search products…" value={searchQ} onChange={e => setSearchQ(e.target.value)} />
      </div>

      {/* Product list grouped by category */}
      {loading ? (
        <div className="text-center py-8 text-muted-foreground text-sm">Loading products…</div>
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedItems).map(([category, catItems]) => (
            <div key={category}>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{category}</p>
              <div className="rounded-xl border border-border overflow-hidden">
                <div className="grid grid-cols-[1fr_80px_80px_80px] text-xs text-muted-foreground font-medium bg-muted/30 px-4 py-2 border-b border-border">
                  <span>Product</span><span className="text-right">System</span><span className="text-right">Physical</span><span className="text-right">Diff</span>
                </div>
                <div className="divide-y divide-border/30">
                  {catItems.map(item => {
                    const phys = counts[item.id];
                    const physNum = phys !== undefined ? parseInt(phys, 10) : item.physicalCount;
                    const diff = physNum !== null && physNum !== undefined && !isNaN(physNum) ? physNum - item.systemCount : null;
                    const hasDiff = diff !== null && diff !== 0;
                    return (
                      <div key={item.id} className={cn("grid grid-cols-[1fr_80px_80px_80px] px-4 py-2.5 items-center", item.isAdjusted && "opacity-60 bg-green-500/5")}>
                        <div>
                          <p className="text-sm font-medium">{item.productName}</p>
                          {item.isAdjusted && <p className="text-xs text-green-400">✓ Applied</p>}
                        </div>
                        <p className="text-sm text-right text-muted-foreground">{item.systemCount}</p>
                        <div className="flex justify-end">
                          {isCompleted ? (
                            <span className="text-sm">{item.physicalCount ?? "—"}</span>
                          ) : (
                            <Input
                              className="w-16 h-7 text-sm text-right px-2"
                              type="number"
                              min={0}
                              placeholder="—"
                              value={counts[item.id] ?? ""}
                              onChange={e => updateCount(item.id, e.target.value)}
                            />
                          )}
                        </div>
                        <p className={cn("text-sm text-right font-medium", hasDiff ? diff! > 0 ? "text-green-400" : "text-red-400" : diff === 0 ? "text-muted-foreground" : "text-muted-foreground/50")}>
                          {diff === null ? "—" : diff > 0 ? `+${diff}` : diff === 0 ? "✓" : diff}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Apply section (only for in-progress) */}
      {!isCompleted && session?.status === "in_progress" && (
        <div className="rounded-xl border border-border bg-card/50 p-4 space-y-3">
          <h3 className="text-sm font-semibold">Apply Stock Count</h3>
          <p className="text-xs text-muted-foreground">This will update product stock levels to match physical counts for all {discrepancies.length} discrepancy items.</p>
          <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
            <input type="checkbox" className="h-4 w-4 accent-blue-500" checked={createJE} onChange={e => setCreateJE(e.target.checked)} />
            <span>Create a journal entry for inventory adjustments</span>
          </label>
          <Button className="w-full gap-2" onClick={applyCount} disabled={applying || discrepancies.length === 0}>
            <CheckCircle2 className="h-4 w-4" />
            {applying ? "Applying…" : `Apply ${discrepancies.length} Adjustments`}
          </Button>
        </div>
      )}

      {isCompleted && session?.completedAt && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 text-sm">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Completed on {format(new Date(session.completedAt), "MMM d, yyyy 'at' h:mm a")} · {session.totalDiscrepancies ?? 0} adjustments applied
        </div>
      )}
    </div>
  );
}

/* ─── Inventory Tab Panel ─── */
function InventoryPanel({ products }: { products: StockProduct[] }) {
  const { toast } = useToast();
  const [subTab, setSubTab] = useState<"adjustments" | "counts">("adjustments");
  const [adjustments, setAdjustments] = useState<StockAdjustment[]>([]);
  const [sessions, setSessions] = useState<StockCountSession[]>([]);
  const [showAdjModal, setShowAdjModal] = useState(false);
  const [showNewCountModal, setShowNewCountModal] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [loadingAdj, setLoadingAdj] = useState(true);
  const [loadingCounts, setLoadingCounts] = useState(true);

  const loadAdjustments = useCallback(async () => {
    setLoadingAdj(true);
    try { setAdjustments(await api<StockAdjustment[]>("/accounting/stock-adjustments?limit=50")); }
    catch { setAdjustments([]); }
    finally { setLoadingAdj(false); }
  }, []);

  const loadSessions = useCallback(async () => {
    setLoadingCounts(true);
    try { setSessions(await api<StockCountSession[]>("/accounting/stock-counts")); }
    catch { setSessions([]); }
    finally { setLoadingCounts(false); }
  }, []);

  useEffect(() => { loadAdjustments(); loadSessions(); }, [loadAdjustments, loadSessions]);

  const reasonColors: Record<string, string> = {
    received: "border-green-500/40 text-green-400",
    returned: "border-blue-500/40 text-blue-400",
    damaged: "border-orange-500/40 text-orange-400",
    theft: "border-red-500/40 text-red-400",
    expired: "border-yellow-500/40 text-yellow-400",
    correction: "border-purple-500/40 text-purple-400",
    manual: "border-muted-foreground/30 text-muted-foreground",
    other: "border-muted-foreground/30 text-muted-foreground",
  };

  // If viewing a session
  if (activeSessionId !== null) {
    return <StockCountDetail sessionId={activeSessionId} onBack={() => setActiveSessionId(null)} onApplied={() => { setActiveSessionId(null); loadSessions(); }} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b border-border pb-3">
        <Button size="sm" variant={subTab === "adjustments" ? "default" : "outline"} className="h-8 text-xs gap-1.5" onClick={() => setSubTab("adjustments")}><ArrowUp className="h-3 w-3" /> Stock Adjustments</Button>
        <Button size="sm" variant={subTab === "counts" ? "default" : "outline"} className="h-8 text-xs gap-1.5" onClick={() => setSubTab("counts")}><ClipboardList className="h-3 w-3" /> Stock Counts</Button>
        <div className="flex-1" />
        {subTab === "adjustments" && <Button size="sm" className="h-8 text-xs gap-1" onClick={() => setShowAdjModal(true)}><Plus className="h-3.5 w-3.5" /> New Adjustment</Button>}
        {subTab === "counts" && <Button size="sm" className="h-8 text-xs gap-1" onClick={() => setShowNewCountModal(true)}><Plus className="h-3.5 w-3.5" /> New Count</Button>}
      </div>

      {/* Stock Adjustments List */}
      {subTab === "adjustments" && (
        <div className="max-w-3xl">
          {loadingAdj ? (
            <div className="text-center py-8 text-muted-foreground text-sm">Loading…</div>
          ) : adjustments.length === 0 ? (
            <div className="text-center py-16 space-y-2">
              <Package className="h-10 w-10 mx-auto text-muted-foreground/30" />
              <p className="text-muted-foreground">No stock adjustments recorded yet</p>
              <Button size="sm" className="gap-1 mt-2" onClick={() => setShowAdjModal(true)}><Plus className="h-3.5 w-3.5" /> Create First Adjustment</Button>
            </div>
          ) : (
            <div className="rounded-xl border border-border overflow-hidden">
              <div className="grid grid-cols-[1fr_80px_80px_80px_100px_100px] text-xs text-muted-foreground font-medium bg-muted/30 px-4 py-2.5 border-b border-border">
                <span>Product</span><span className="text-center">Type</span><span className="text-center">Qty</span><span className="text-center">Before</span><span className="text-center">After</span><span className="text-right">Date</span>
              </div>
              <div className="divide-y divide-border/30">
                {adjustments.map(adj => (
                  <div key={adj.id} className="grid grid-cols-[1fr_80px_80px_80px_100px_100px] px-4 py-3 items-center hover:bg-muted/20">
                    <div>
                      <p className="text-sm font-medium">{adj.productName}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Badge variant="outline" className={cn("text-xs", reasonColors[adj.reason] ?? "border-muted-foreground/30 text-muted-foreground")}>{adj.reason}</Badge>
                        {adj.notes && <span className="text-xs text-muted-foreground italic truncate max-w-40">{adj.notes}</span>}
                        {adj.journalEntryId && <Badge variant="outline" className="text-xs border-blue-500/30 text-blue-400">JE #{adj.journalEntryId}</Badge>}
                      </div>
                    </div>
                    <div className="text-center">
                      {adj.adjustmentType === "increase" ? (
                        <span className="inline-flex items-center gap-0.5 text-xs text-green-400"><ArrowUp className="h-3 w-3" /> Add</span>
                      ) : (
                        <span className="inline-flex items-center gap-0.5 text-xs text-red-400"><ArrowDown className="h-3 w-3" /> Remove</span>
                      )}
                    </div>
                    <p className={cn("text-sm text-center font-semibold", adj.adjustmentType === "increase" ? "text-green-400" : "text-red-400")}>
                      {adj.adjustmentType === "increase" ? "+" : "-"}{adj.quantity}
                    </p>
                    <p className="text-sm text-center text-muted-foreground">{adj.previousStock}</p>
                    <p className="text-sm text-center font-medium">{adj.newStock}</p>
                    <p className="text-xs text-right text-muted-foreground">{format(new Date(adj.createdAt), "MMM d, h:mm a")}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Stock Count Sessions */}
      {subTab === "counts" && (
        <div className="max-w-3xl space-y-3">
          {loadingCounts ? (
            <div className="text-center py-8 text-muted-foreground text-sm">Loading…</div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-16 space-y-2">
              <ClipboardList className="h-10 w-10 mx-auto text-muted-foreground/30" />
              <p className="text-muted-foreground">No stock count sessions yet</p>
              <Button size="sm" className="gap-1 mt-2" onClick={() => setShowNewCountModal(true)}><Plus className="h-3.5 w-3.5" /> Start a Count</Button>
            </div>
          ) : (
            <div className="rounded-xl border border-border overflow-hidden">
              <div className="divide-y divide-border/30">
                {sessions.map(session => (
                  <button
                    key={session.id}
                    className="w-full grid grid-cols-[1fr_auto_auto] px-4 py-3.5 items-center hover:bg-muted/20 text-left gap-4"
                    onClick={() => setActiveSessionId(session.id)}
                  >
                    <div>
                      <p className="text-sm font-medium">{session.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{format(new Date(session.startedAt), "MMM d, yyyy 'at' h:mm a")} · {session.totalItems ?? 0} products</p>
                      {session.notes && <p className="text-xs text-muted-foreground/70 italic mt-0.5">{session.notes}</p>}
                    </div>
                    {session.totalDiscrepancies !== null && session.status === "completed" && (
                      <span className="text-xs text-muted-foreground">{session.totalDiscrepancies} adjusted</span>
                    )}
                    <Badge variant="outline" className={cn("shrink-0 text-xs", session.status === "completed" ? "border-green-500/40 text-green-400" : session.status === "voided" ? "border-red-500/40 text-red-400" : "border-yellow-500/40 text-yellow-400")}>
                      {session.status}
                    </Badge>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {showAdjModal && <StockAdjustmentModal products={products} onClose={() => setShowAdjModal(false)} onSaved={loadAdjustments} />}
      {showNewCountModal && <NewStockCountModal onClose={() => setShowNewCountModal(false)} onCreated={(id) => { loadSessions(); setActiveSessionId(id); }} />}
    </div>
  );
}

/* ─── Main Page ─── */
export function Accounting() {
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [overviewPeriod, setOverviewPeriod] = useState("month");
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("overview");
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [editAccount, setEditAccount] = useState<Account | undefined>();
  const [showJEModal, setShowJEModal] = useState(false);
  const [reportType, setReportType] = useState("pl");
  const [acctTypeFilter, setAcctTypeFilter] = useState<string>("all");
  const [products, setProducts] = useState<StockProduct[]>([]);

  const loadAccounts = useCallback(async () => {
    try { setAccounts(await api<Account[]>("/accounting/accounts")); }
    catch { setAccounts([]); }
  }, []);

  const loadEntries = useCallback(async () => {
    try { setEntries(await api<JournalEntry[]>("/accounting/journal-entries?limit=50")); }
    catch { setEntries([]); }
  }, []);

  const loadOverview = useCallback(async () => {
    try { setOverview(await api<Overview>(`/accounting/overview?period=${overviewPeriod}`)); }
    catch { setOverview(null); }
  }, [overviewPeriod]);

  const loadProducts = useCallback(async () => {
    try { setProducts(await api<StockProduct[]>("/products")); }
    catch { setProducts([]); }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadAccounts(), loadEntries(), loadOverview(), loadProducts()]).finally(() => setLoading(false));
  }, [loadAccounts, loadEntries, loadOverview, loadProducts]);

  useEffect(() => { loadOverview(); }, [loadOverview]);

  async function deleteAccount(id: number) {
    if (!confirm("Deactivate this account?")) return;
    try {
      await api(`/accounting/accounts/${id}`, { method: "DELETE" });
      toast({ title: "Account deactivated" });
      await loadAccounts();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  }

  async function voidEntry(id: number) {
    if (!confirm("Void this journal entry?")) return;
    try {
      await api(`/accounting/journal-entries/${id}`, { method: "DELETE" });
      toast({ title: "Entry voided" });
      await loadEntries();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  }

  const filteredAccounts = acctTypeFilter === "all" ? accounts : accounts.filter(a => a.type === acctTypeFilter);

  return (
    <>
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="border-b border-border px-6 py-4 flex items-center justify-between bg-card shrink-0">
          <div className="flex items-center gap-3">
            <Calculator className="h-5 w-5 text-primary" />
            <div>
              <h1 className="text-lg font-bold">Accounting</h1>
              <p className="text-xs text-muted-foreground">Double-entry bookkeeping & financial reports</p>
            </div>
          </div>
          <div className="flex gap-2">
            {tab === "accounts" && (
              <Button size="sm" className="gap-1" onClick={() => { setEditAccount(undefined); setShowAccountModal(true); }}>
                <Plus className="h-4 w-4" /> New Account
              </Button>
            )}
            {tab === "journal" && (
              <Button size="sm" className="gap-1" onClick={() => setShowJEModal(true)}>
                <Plus className="h-4 w-4" /> New Entry
              </Button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col overflow-hidden">
          <div className="px-6 pt-3 border-b border-border">
            <TabsList className="h-9">
              <TabsTrigger value="overview" className="text-xs gap-1"><BarChart2 className="h-3.5 w-3.5" /> Overview</TabsTrigger>
              <TabsTrigger value="accounts" className="text-xs gap-1"><BookOpen className="h-3.5 w-3.5" /> Chart of Accounts</TabsTrigger>
              <TabsTrigger value="journal" className="text-xs gap-1"><FileText className="h-3.5 w-3.5" /> Journal Entries</TabsTrigger>
              <TabsTrigger value="reports" className="text-xs gap-1"><TrendingUp className="h-3.5 w-3.5" /> Reports</TabsTrigger>
              <TabsTrigger value="inventory" className="text-xs gap-1"><Package className="h-3.5 w-3.5" /> Inventory</TabsTrigger>
              <TabsTrigger value="quickbooks" className="text-xs gap-1"><Link2 className="h-3.5 w-3.5" /> QuickBooks</TabsTrigger>
            </TabsList>
          </div>

          {/* Overview */}
          <TabsContent value="overview" className="flex-1 overflow-y-auto p-6 m-0">
            <div className="space-y-6 max-w-4xl">
              <div className="flex gap-2">
                {["week", "month", "year"].map(p => (
                  <Button key={p} size="sm" variant={overviewPeriod === p ? "default" : "outline"} className="h-7 text-xs capitalize" onClick={() => setOverviewPeriod(p)}>{p === "week" ? "This Week" : p === "month" ? "This Month" : "This Year"}</Button>
                ))}
              </div>

              {overview ? (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <KpiCard label="Total Revenue" value={fmt(overview.totalRevenue)} icon={TrendingUp} color="green" sub={`${overview.orderCount} orders`} />
                    <KpiCard label="Total Expenses" value={fmt(overview.totalExpenses)} icon={TrendingDown} color="red" sub={`${overview.journalEntryCount} journal entries`} />
                    <KpiCard label="Net Income" value={fmt(overview.netIncome)} icon={DollarSign} color={overview.netIncome >= 0 ? "green" : "red"} />
                    <KpiCard label="Tax Collected" value={fmt(overview.taxCollected)} icon={Wallet} color="yellow" sub="GCT/VAT" />
                  </div>

                  <div className="rounded-xl border border-border bg-card/50 p-4">
                    <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><ChevronRight className="h-4 w-4 text-primary" /> Quick Links</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[
                        { label: "P&L Report", tab: "reports", icon: TrendingUp },
                        { label: "Balance Sheet", tab: "reports", icon: BarChart2 },
                        { label: "New Entry", tab: "journal", icon: BookOpen },
                        { label: "QuickBooks", tab: "quickbooks", icon: Link2 },
                      ].map(item => (
                        <button
                          key={item.label}
                          className="flex items-center gap-2 p-3 rounded-lg border border-border/50 hover:border-primary/40 hover:bg-primary/5 transition-colors text-sm text-left"
                          onClick={() => { setTab(item.tab); if (item.label === "New Entry") setTimeout(() => setShowJEModal(true), 100); if (item.label === "Balance Sheet") setTimeout(() => setReportType("bs"), 100); }}
                        >
                          <item.icon className="h-4 w-4 text-primary" />
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-12 text-muted-foreground">{loading ? "Loading…" : "No data"}</div>
              )}
            </div>
          </TabsContent>

          {/* Chart of Accounts */}
          <TabsContent value="accounts" className="flex-1 overflow-y-auto p-6 m-0">
            <div className="max-w-3xl space-y-3">
              <div className="flex gap-2 flex-wrap">
                {["all", "asset", "liability", "equity", "revenue", "expense"].map(t => (
                  <Button key={t} size="sm" variant={acctTypeFilter === t ? "default" : "outline"} className="h-7 text-xs capitalize" onClick={() => setAcctTypeFilter(t)}>{t === "all" ? "All Types" : t}</Button>
                ))}
              </div>
              <div className="rounded-xl border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 border-b border-border">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-xs text-muted-foreground font-medium w-20">Code</th>
                      <th className="px-4 py-2.5 text-left text-xs text-muted-foreground font-medium">Account Name</th>
                      <th className="px-4 py-2.5 text-left text-xs text-muted-foreground font-medium w-28">Type</th>
                      <th className="px-4 py-2.5 text-right text-xs text-muted-foreground font-medium w-20">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {filteredAccounts.map(acc => (
                      <tr key={acc.id} className="hover:bg-muted/20">
                        <td className="px-4 py-2 text-xs text-muted-foreground font-mono">{acc.code}</td>
                        <td className="px-4 py-2">
                          <p className="font-medium">{acc.name}</p>
                          {acc.description && <p className="text-xs text-muted-foreground mt-0.5">{acc.description}</p>}
                          {acc.isSystem && <Badge variant="outline" className="text-xs mt-0.5 border-muted-foreground/30 text-muted-foreground">System</Badge>}
                        </td>
                        <td className="px-4 py-2"><Badge variant="outline" className={cn("text-xs", accountTypeColor[acc.type])}>{acc.type}</Badge></td>
                        <td className="px-4 py-2 text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground" onClick={() => { setEditAccount(acc); setShowAccountModal(true); }}>✏</Button>
                            {!acc.isSystem && <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => deleteAccount(acc.id)}><Trash2 className="h-3 w-3" /></Button>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>

          {/* Journal Entries */}
          <TabsContent value="journal" className="flex-1 overflow-y-auto p-6 m-0">
            <div className="max-w-4xl space-y-3">
              {entries.length === 0 ? (
                <div className="text-center py-16">
                  <FileText className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
                  <p className="text-muted-foreground">No journal entries yet</p>
                  <Button size="sm" className="mt-3 gap-1" onClick={() => setShowJEModal(true)}><Plus className="h-3.5 w-3.5" /> Create First Entry</Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {entries.map(entry => {
                    const totalDebit = entry.lines.reduce((s, l) => s + l.debit, 0);
                    return (
                      <div key={entry.id} className="rounded-xl border border-border bg-card/50 overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
                          <div className="flex items-center gap-3">
                            <div>
                              <p className="text-sm font-medium">{entry.description}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <p className="text-xs text-muted-foreground">{format(new Date(entry.date), "MMM d, yyyy")}</p>
                                {entry.reference && <Badge variant="outline" className="text-xs border-muted-foreground/30 text-muted-foreground">{entry.reference}</Badge>}
                                <Badge variant="outline" className="text-xs border-muted-foreground/30 text-muted-foreground capitalize">{entry.type}</Badge>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold">{fmt(totalDebit)}</span>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => voidEntry(entry.id)} title="Void entry">
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        <div className="divide-y divide-border/30">
                          {entry.lines.map((line, idx) => (
                            <div key={idx} className="px-4 py-1.5 grid grid-cols-[auto_1fr_auto_auto] gap-4 text-xs items-center">
                              <Badge variant="outline" className={cn("text-xs shrink-0", line.debit > 0 ? "border-blue-500/40 text-blue-400" : "border-orange-500/40 text-orange-400")}>
                                {line.debit > 0 ? "DR" : "CR"}
                              </Badge>
                              <span className="text-muted-foreground">{line.accountCode} — {line.accountName}{line.description ? ` (${line.description})` : ""}</span>
                              <span className="font-mono text-right">{line.debit > 0 ? fmt(line.debit) : "—"}</span>
                              <span className="font-mono text-right">{line.credit > 0 ? fmt(line.credit) : "—"}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </TabsContent>

          {/* Reports */}
          <TabsContent value="reports" className="flex-1 overflow-y-auto p-6 m-0">
            <div className="space-y-4">
              <div className="flex gap-2">
                <Button size="sm" variant={reportType === "pl" ? "default" : "outline"} className="h-8 text-xs" onClick={() => setReportType("pl")}>Profit & Loss</Button>
                <Button size="sm" variant={reportType === "bs" ? "default" : "outline"} className="h-8 text-xs" onClick={() => setReportType("bs")}>Balance Sheet</Button>
                <Button size="sm" variant={reportType === "tb" ? "default" : "outline"} className="h-8 text-xs" onClick={() => setReportType("tb")}>Trial Balance</Button>
              </div>
              {reportType === "pl" && <PLReportView accounts={accounts} />}
              {reportType === "bs" && <BalanceSheetView />}
              {reportType === "tb" && <TrialBalanceView />}
            </div>
          </TabsContent>

          {/* Inventory */}
          <TabsContent value="inventory" className="flex-1 overflow-y-auto p-6 m-0">
            <InventoryPanel products={products} />
          </TabsContent>

          {/* QuickBooks */}
          <TabsContent value="quickbooks" className="flex-1 overflow-y-auto p-6 m-0">
            <QuickBooksPanel />
          </TabsContent>
        </Tabs>
      </div>

      {/* Modals */}
      {showAccountModal && (
        <AccountModal account={editAccount} onClose={() => { setShowAccountModal(false); setEditAccount(undefined); }} onSaved={loadAccounts} />
      )}
      {showJEModal && (
        <JournalEntryModal accounts={accounts} onClose={() => setShowJEModal(false)} onSaved={loadEntries} />
      )}
    </>
  );
}
