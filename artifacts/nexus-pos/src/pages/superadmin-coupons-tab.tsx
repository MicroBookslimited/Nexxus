import { useState, useEffect, useCallback } from "react";
import {
  RefreshCw, Plus, Ticket, Trash2, CheckCircle, X, Copy, Users, Clock,
} from "lucide-react";
import {
  superadminGetCoupons, superadminCreateCoupon, superadminDeactivateCoupon,
  superadminUpdateCoupon, superadminGetCouponRedemptions, superadminGetPlans,
  type Coupon, type CouponInput, type CouponRedemption, type Plan,
} from "@/lib/saas-api";

function fmtDate(s?: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function CouponFormModal({ plans, onClose, onSave }: {
  plans: Plan[];
  onClose: () => void;
  onSave: (data: CouponInput) => Promise<void>;
}) {
  // Default to the first promotional plan if one exists, else the first active plan.
  const defaultPlan = plans.find(p => p.isPromotional) ?? plans[0];
  const [form, setForm] = useState<CouponInput>({
    code: "",
    planId: defaultPlan?.id ?? 0,
    billingCycle: "annual",
    maxRedemptions: 1,
    expiresAt: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function genCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let out = "";
    for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)];
    setForm(f => ({ ...f, code: out }));
  }

  async function submit() {
    if (!form.code.trim()) { setError("Please enter a code."); return; }
    if (!form.planId) { setError("Please select a plan."); return; }
    setError(""); setSaving(true);
    try {
      await onSave({
        ...form,
        code: form.code.trim().toUpperCase(),
        expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create coupon.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#1a2332] border border-[#2a3a55] rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-[#2a3a55]">
          <h2 className="text-lg font-semibold text-white">New Coupon</h2>
          <button onClick={onClose} className="text-[#475569] hover:text-white"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs text-[#94a3b8] mb-1.5">Code</label>
            <div className="flex gap-2">
              <input value={form.code}
                onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                placeholder="e.g. FREEYEAR2026"
                className="flex-1 bg-[#0f1729] border border-[#2a3a55] rounded-lg px-3 py-2 text-sm text-white uppercase tracking-wide focus:outline-none focus:border-[#3b82f6]" />
              <button onClick={genCode} className="text-xs bg-[#2a3a55] hover:bg-[#374966] text-white px-3 rounded-lg whitespace-nowrap">Generate</button>
            </div>
          </div>

          <div>
            <label className="block text-xs text-[#94a3b8] mb-1.5">Plan</label>
            <select value={form.planId}
              onChange={e => setForm(f => ({ ...f, planId: Number(e.target.value) }))}
              className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#3b82f6]">
              {plans.map(p => (
                <option key={p.id} value={p.id}>{p.name}{p.isPromotional ? " (Promo)" : ""}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[#94a3b8] mb-1.5">Billing cycle</label>
              <select value={form.billingCycle}
                onChange={e => setForm(f => ({ ...f, billingCycle: e.target.value as "monthly" | "annual" }))}
                className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#3b82f6]">
                <option value="annual">Annual</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#94a3b8] mb-1.5">Max redemptions</label>
              <input type="number" min={1} value={form.maxRedemptions}
                onChange={e => setForm(f => ({ ...f, maxRedemptions: Math.max(1, Number(e.target.value) || 1) }))}
                className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#3b82f6]" />
            </div>
          </div>
          <p className="text-xs text-[#475569] -mt-2">1 = single-use. A tenant can only redeem a code once.</p>

          <div>
            <label className="block text-xs text-[#94a3b8] mb-1.5">Expires (optional)</label>
            <input type="date" value={form.expiresAt ?? ""}
              onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))}
              className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#3b82f6]" />
          </div>

          <div>
            <label className="block text-xs text-[#94a3b8] mb-1.5">Notes (optional)</label>
            <input value={form.notes ?? ""}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Internal note"
              className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#3b82f6]" />
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
        <div className="flex gap-3 p-5 border-t border-[#2a3a55]">
          <button onClick={onClose} className="flex-1 bg-[#2a3a55] hover:bg-[#374966] text-white py-2.5 rounded-lg text-sm font-medium">Cancel</button>
          <button onClick={submit} disabled={saving}
            className="flex-1 bg-[#3b82f6] hover:bg-[#2563eb] disabled:opacity-60 text-white py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2">
            {saving ? <RefreshCw size={15} className="animate-spin" /> : <Plus size={15} />} Create
          </button>
        </div>
      </div>
    </div>
  );
}

function RedemptionsModal({ coupon, onClose }: { coupon: Coupon; onClose: () => void }) {
  const [rows, setRows] = useState<CouponRedemption[] | null>(null);
  useEffect(() => {
    superadminGetCouponRedemptions(coupon.id).then(setRows).catch(() => setRows([]));
  }, [coupon.id]);
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#1a2332] border border-[#2a3a55] rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-[#2a3a55]">
          <h2 className="text-lg font-semibold text-white">Redemptions — <span className="font-mono">{coupon.code}</span></h2>
          <button onClick={onClose} className="text-[#475569] hover:text-white"><X size={18} /></button>
        </div>
        <div className="p-5">
          {rows === null ? (
            <div className="text-center text-[#475569] py-6"><RefreshCw size={18} className="animate-spin mx-auto mb-2" />Loading…</div>
          ) : rows.length === 0 ? (
            <p className="text-center text-[#475569] py-6 text-sm">No redemptions yet.</p>
          ) : (
            <div className="space-y-2">
              {rows.map(r => (
                <div key={r.id} className="bg-[#0f1729] rounded-lg px-3 py-2.5 flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="text-sm text-white truncate">{r.businessName ?? `Tenant #${r.tenantId}`}</div>
                    <div className="text-xs text-[#475569] truncate">{r.email ?? ""}</div>
                  </div>
                  <div className="text-xs text-[#94a3b8] whitespace-nowrap">{fmtDate(r.redeemedAt)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function SuperadminCouponsTab() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [viewingRedemptions, setViewingRedemptions] = useState<Coupon | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, p] = await Promise.all([superadminGetCoupons(), superadminGetPlans()]);
      setCoupons(c);
      setPlans(p.filter(x => x.isActive));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function copyCode(c: Coupon) {
    try { await navigator.clipboard.writeText(c.code); setCopiedId(c.id); setTimeout(() => setCopiedId(null), 1500); }
    catch { /* ignore */ }
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">Coupons</h1>
          <p className="text-[#94a3b8] text-sm">Issue codes that unlock promotional plans. Each tenant can redeem a code once.</p>
        </div>
        <button onClick={() => setShowNew(true)}
          className="flex items-center gap-2 bg-[#3b82f6] hover:bg-[#2563eb] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shrink-0">
          <Plus size={16} /> New Coupon
        </button>
      </div>

      {showNew && (
        <CouponFormModal
          plans={plans}
          onClose={() => setShowNew(false)}
          onSave={async (data) => { await superadminCreateCoupon(data); await load(); setShowNew(false); }}
        />
      )}
      {viewingRedemptions && (
        <RedemptionsModal coupon={viewingRedemptions} onClose={() => setViewingRedemptions(null)} />
      )}

      {loading ? (
        <div className="p-8 text-center text-[#475569]"><RefreshCw size={20} className="animate-spin mx-auto mb-2" />Loading…</div>
      ) : coupons.length === 0 ? (
        <div className="text-center py-12 text-[#475569]">
          <Ticket size={32} className="mx-auto mb-3 opacity-40" />
          <p>No coupons yet. Create one to gate a promotional plan.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {coupons.map(c => {
            const exhausted = c.redemptionCount >= c.maxRedemptions;
            const expired = !!c.expiresAt && new Date(c.expiresAt).getTime() <= Date.now();
            return (
              <div key={c.id} className={`bg-[#1a2332] border rounded-xl p-4 transition-opacity ${c.isActive ? "border-[#2a3a55]" : "border-[#1a2332] opacity-60"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-10 h-10 bg-amber-500/10 rounded-lg flex items-center justify-center shrink-0">
                      <Ticket size={18} className="text-amber-400" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-white text-lg">{c.code}</span>
                        <button onClick={() => copyCode(c)} title="Copy" className="text-[#475569] hover:text-white">
                          {copiedId === c.id ? <CheckCircle size={13} className="text-green-400" /> : <Copy size={13} />}
                        </button>
                        {!c.isActive && <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full">Inactive</span>}
                        {c.isActive && exhausted && <span className="text-xs bg-[#2a3a55] text-[#94a3b8] px-2 py-0.5 rounded-full">Fully redeemed</span>}
                        {c.isActive && expired && <span className="text-xs bg-orange-500/15 text-orange-400 px-2 py-0.5 rounded-full">Expired</span>}
                      </div>
                      <div className="text-sm text-[#94a3b8] mt-0.5">
                        {c.planName ?? `Plan #${c.planId}`} · {c.billingCycle}
                      </div>
                      {c.notes && <div className="text-xs text-[#475569] mt-0.5">{c.notes}</div>}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {c.isActive ? (
                      <button onClick={async () => { if (confirm(`Deactivate coupon "${c.code}"? It can no longer be redeemed.`)) { await superadminDeactivateCoupon(c.id); await load(); } }}
                        className="p-1.5 rounded-lg text-[#475569] hover:text-red-400 hover:bg-red-500/10 transition-colors" title="Deactivate"><Trash2 size={14} /></button>
                    ) : (
                      <button onClick={async () => { await superadminUpdateCoupon(c.id, { isActive: true }); await load(); }}
                        className="p-1.5 rounded-lg text-[#475569] hover:text-green-400 hover:bg-green-500/10 transition-colors" title="Reactivate"><CheckCircle size={14} /></button>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 mt-3">
                  <button onClick={() => setViewingRedemptions(c)}
                    className="inline-flex items-center gap-1.5 text-xs bg-[#0f1729] border border-[#2a3a55] rounded-full px-3 py-1 text-[#94a3b8] hover:text-white transition-colors">
                    <Users size={11} /> {c.redemptionCount} / {c.maxRedemptions} redeemed
                  </button>
                  <span className="inline-flex items-center gap-1.5 text-xs bg-[#0f1729] border border-[#2a3a55] rounded-full px-3 py-1 text-[#94a3b8]">
                    <Clock size={11} /> {c.expiresAt ? `Expires ${fmtDate(c.expiresAt)}` : "No expiry"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
