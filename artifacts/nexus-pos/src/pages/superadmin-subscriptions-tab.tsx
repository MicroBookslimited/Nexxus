import { useState, useEffect, useCallback, useMemo } from "react";
import { RefreshCw, CreditCard, Trash2, Pencil, X, Search } from "lucide-react";
import {
  superadminGetSubscriptions, superadminUpdateSubscription, superadminDeleteSubscription,
  superadminGetPlans,
  type SubscriptionRow, type SubscriptionUpdate, type Plan,
} from "@/lib/saas-api";

function fmtDate(s?: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

// ISO string -> value for <input type="date"> (yyyy-mm-dd), local-time aware.
function toDateInput(s?: string | null): string {
  if (!s) return "";
  const d = new Date(s);
  if (isNaN(d.getTime())) return "";
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}
// date input value -> ISO string (or null when cleared)
function fromDateInput(v: string): string | null {
  if (!v) return null;
  return new Date(v + "T00:00:00").toISOString();
}

const STATUS_OPTIONS: SubscriptionUpdate["status"][] = ["trial", "active", "past_due", "cancelled", "expired"];

function statusBadge(status: string): string {
  switch (status) {
    case "active": return "bg-green-500/15 text-green-400";
    case "trial": return "bg-blue-500/15 text-blue-400";
    case "past_due": return "bg-amber-500/15 text-amber-400";
    case "cancelled": return "bg-red-500/15 text-red-400";
    case "expired": return "bg-[#2a3a55] text-[#94a3b8]";
    default: return "bg-[#2a3a55] text-[#94a3b8]";
  }
}

function EditModal({ sub, plans, onClose, onSave }: {
  sub: SubscriptionRow;
  plans: Plan[];
  onClose: () => void;
  onSave: (data: SubscriptionUpdate) => Promise<void>;
}) {
  const [form, setForm] = useState<SubscriptionUpdate>({
    planId: sub.planId ?? null,
    status: (STATUS_OPTIONS.includes(sub.status as SubscriptionUpdate["status"]) ? sub.status : "active") as SubscriptionUpdate["status"],
    billingCycle: (sub.billingCycle === "annual" ? "annual" : "monthly"),
    currentPeriodStart: sub.currentPeriodStart ?? null,
    currentPeriodEnd: sub.currentPeriodEnd ?? null,
    trialEndsAt: sub.trialEndsAt ?? null,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setError(""); setSaving(true);
    try { await onSave(form); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed to save."); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#1a2332] border border-[#2a3a55] rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-[#2a3a55]">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-white truncate">{sub.businessName ?? `Tenant #${sub.tenantId}`}</h2>
            <p className="text-xs text-[#475569] truncate">{sub.email ?? ""}</p>
          </div>
          <button onClick={onClose} className="text-[#475569] hover:text-white"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs text-[#94a3b8] mb-1.5">Plan</label>
            <select value={form.planId ?? ""}
              onChange={e => setForm(f => ({ ...f, planId: e.target.value ? Number(e.target.value) : null }))}
              className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#3b82f6]">
              <option value="">No plan</option>
              {plans.map(p => (
                <option key={p.id} value={p.id}>{p.name}{p.isPromotional ? " (Promo)" : ""}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[#94a3b8] mb-1.5">Status</label>
              <select value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value as SubscriptionUpdate["status"] }))}
                className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#3b82f6]">
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#94a3b8] mb-1.5">Billing cycle</label>
              <select value={form.billingCycle}
                onChange={e => setForm(f => ({ ...f, billingCycle: e.target.value as "monthly" | "annual" }))}
                className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#3b82f6]">
                <option value="monthly">Monthly</option>
                <option value="annual">Annual</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[#94a3b8] mb-1.5">Start date</label>
              <input type="date" value={toDateInput(form.currentPeriodStart)}
                onChange={e => setForm(f => ({ ...f, currentPeriodStart: fromDateInput(e.target.value) }))}
                className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#3b82f6]" />
            </div>
            <div>
              <label className="block text-xs text-[#94a3b8] mb-1.5">End date</label>
              <input type="date" value={toDateInput(form.currentPeriodEnd)}
                onChange={e => setForm(f => ({ ...f, currentPeriodEnd: fromDateInput(e.target.value) }))}
                className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#3b82f6]" />
            </div>
          </div>

          <div>
            <label className="block text-xs text-[#94a3b8] mb-1.5">Trial ends (optional)</label>
            <input type="date" value={toDateInput(form.trialEndsAt)}
              onChange={e => setForm(f => ({ ...f, trialEndsAt: fromDateInput(e.target.value) }))}
              className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#3b82f6]" />
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
        <div className="flex gap-3 p-5 border-t border-[#2a3a55]">
          <button onClick={onClose} className="flex-1 bg-[#2a3a55] hover:bg-[#374966] text-white py-2.5 rounded-lg text-sm font-medium">Cancel</button>
          <button onClick={submit} disabled={saving}
            className="flex-1 bg-[#3b82f6] hover:bg-[#2563eb] disabled:opacity-60 text-white py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2">
            {saving ? <RefreshCw size={15} className="animate-spin" /> : <Pencil size={15} />} Save
          </button>
        </div>
      </div>
    </div>
  );
}

export function SuperadminSubscriptionsTab() {
  const [subs, setSubs] = useState<SubscriptionRow[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editing, setEditing] = useState<SubscriptionRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, p] = await Promise.all([superadminGetSubscriptions(), superadminGetPlans()]);
      setSubs(s);
      setPlans(p.filter(x => x.isActive));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return subs.filter(s => {
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (!q) return true;
      return (s.businessName ?? "").toLowerCase().includes(q)
        || (s.email ?? "").toLowerCase().includes(q)
        || (s.ownerName ?? "").toLowerCase().includes(q)
        || (s.planName ?? "").toLowerCase().includes(q);
    });
  }, [subs, search, statusFilter]);

  async function markInactive(s: SubscriptionRow) {
    if (!confirm(`Set ${s.businessName ?? "this subscription"} to cancelled? The tenant will lose plan access.`)) return;
    await superadminUpdateSubscription(s.id, { status: "cancelled" });
    await load();
  }
  async function remove(s: SubscriptionRow) {
    if (!confirm(`Permanently delete the subscription record for ${s.businessName ?? `tenant #${s.tenantId}`}? This cannot be undone.`)) return;
    await superadminDeleteSubscription(s.id);
    await load();
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">Subscriptions</h1>
          <p className="text-[#94a3b8] text-sm">All tenant subscriptions with start &amp; end dates. Edit, cancel, or delete any record.</p>
        </div>
        <button onClick={load}
          className="flex items-center gap-2 bg-[#2a3a55] hover:bg-[#374966] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shrink-0">
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#475569]" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search business, owner, email, plan…"
            className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:border-[#3b82f6]" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="bg-[#0f1729] border border-[#2a3a55] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#3b82f6]">
          <option value="all">All statuses</option>
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {editing && (
        <EditModal
          sub={editing}
          plans={plans}
          onClose={() => setEditing(null)}
          onSave={async (data) => { await superadminUpdateSubscription(editing.id, data); await load(); setEditing(null); }}
        />
      )}

      {loading ? (
        <div className="p-8 text-center text-[#475569]"><RefreshCw size={20} className="animate-spin mx-auto mb-2" />Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-[#475569]">
          <CreditCard size={32} className="mx-auto mb-3 opacity-40" />
          <p>No subscriptions found.</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto bg-[#1a2332] border border-[#2a3a55] rounded-xl">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2a3a55] text-[#94a3b8] text-xs uppercase tracking-wide">
                  <th className="text-left font-medium px-4 py-3">Tenant</th>
                  <th className="text-left font-medium px-4 py-3">Plan</th>
                  <th className="text-left font-medium px-4 py-3">Status</th>
                  <th className="text-left font-medium px-4 py-3">Cycle</th>
                  <th className="text-left font-medium px-4 py-3">Start</th>
                  <th className="text-left font-medium px-4 py-3">End</th>
                  <th className="text-right font-medium px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => (
                  <tr key={s.id} className="border-b border-[#2a3a55]/50 last:border-0 hover:bg-[#0f1729]/40">
                    <td className="px-4 py-3">
                      <div className="text-white truncate max-w-[220px]">{s.businessName ?? `Tenant #${s.tenantId}`}</div>
                      <div className="text-xs text-[#475569] truncate max-w-[220px]">{s.email ?? ""}</div>
                    </td>
                    <td className="px-4 py-3 text-[#94a3b8]">{s.planName ?? "—"}</td>
                    <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full ${statusBadge(s.status)}`}>{s.status}</span></td>
                    <td className="px-4 py-3 text-[#94a3b8]">{s.billingCycle}</td>
                    <td className="px-4 py-3 text-[#94a3b8]">{fmtDate(s.currentPeriodStart)}</td>
                    <td className="px-4 py-3 text-[#94a3b8]">{fmtDate(s.currentPeriodEnd)}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5 justify-end">
                        <button onClick={() => setEditing(s)} title="Edit"
                          className="p-1.5 rounded-lg text-[#475569] hover:text-[#3b82f6] hover:bg-[#3b82f6]/10 transition-colors"><Pencil size={14} /></button>
                        {s.status !== "cancelled" && (
                          <button onClick={() => markInactive(s)} title="Set inactive (cancel)"
                            className="p-1.5 rounded-lg text-[#475569] hover:text-amber-400 hover:bg-amber-500/10 transition-colors"><X size={14} /></button>
                        )}
                        <button onClick={() => remove(s)} title="Delete"
                          className="p-1.5 rounded-lg text-[#475569] hover:text-red-400 hover:bg-red-500/10 transition-colors"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {filtered.map(s => (
              <div key={s.id} className="bg-[#1a2332] border border-[#2a3a55] rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-white truncate">{s.businessName ?? `Tenant #${s.tenantId}`}</div>
                    <div className="text-xs text-[#475569] truncate">{s.email ?? ""}</div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${statusBadge(s.status)}`}>{s.status}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                  <div><span className="text-[#475569]">Plan: </span><span className="text-[#94a3b8]">{s.planName ?? "—"}</span></div>
                  <div><span className="text-[#475569]">Cycle: </span><span className="text-[#94a3b8]">{s.billingCycle}</span></div>
                  <div><span className="text-[#475569]">Start: </span><span className="text-[#94a3b8]">{fmtDate(s.currentPeriodStart)}</span></div>
                  <div><span className="text-[#475569]">End: </span><span className="text-[#94a3b8]">{fmtDate(s.currentPeriodEnd)}</span></div>
                </div>
                <div className="flex gap-2 mt-3 pt-3 border-t border-[#2a3a55]">
                  <button onClick={() => setEditing(s)}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-[#0f1729] border border-[#2a3a55] text-[#94a3b8] hover:text-white py-1.5 rounded-lg text-xs"><Pencil size={12} /> Edit</button>
                  {s.status !== "cancelled" && (
                    <button onClick={() => markInactive(s)}
                      className="flex-1 flex items-center justify-center gap-1.5 bg-[#0f1729] border border-[#2a3a55] text-amber-400 py-1.5 rounded-lg text-xs"><X size={12} /> Cancel</button>
                  )}
                  <button onClick={() => remove(s)}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-[#0f1729] border border-[#2a3a55] text-red-400 py-1.5 rounded-lg text-xs"><Trash2 size={12} /> Delete</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
