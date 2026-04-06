import { useState, useEffect, useCallback, useRef } from "react";
import {
  Users, TrendingUp, CreditCard, Activity, Search, ChevronDown,
  RefreshCw, LogOut, Zap, Shield, CheckCircle, XCircle, Clock,
  Eye, X, AlertTriangle, Plus, Building2, Banknote, FileCheck,
  LayoutDashboard, Settings, Pencil, Trash2, Download, ChevronRight,
} from "lucide-react";
import {
  SUPERADMIN_TOKEN_KEY, superadminLogin, superadminStats, superadminTenants,
  superadminUpdateTenant, superadminCreateTenant, superadminGetBankAccounts,
  superadminCreateBankAccount, superadminUpdateBankAccount, superadminDeleteBankAccount,
  superadminGetTransferProofs, superadminReviewTransferProof,
  getPlans,
  type TenantRow, type BankAccount, type TransferProofRow, type Plan,
} from "@/lib/saas-api";

type Stats = {
  totalTenants: number; activeSubscriptions: number; trialSubscriptions: number;
  pendingProofs: number; mrr: number; arr: number;
  planBreakdown: { planName: string; count: number }[];
};

type Tab = "overview" | "tenants" | "payments" | "settings";

/* ─── Login Screen ─── */
function SuperAdminLogin({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const res = await superadminLogin(email, password);
      localStorage.setItem(SUPERADMIN_TOKEN_KEY, res.token);
      onLogin();
    } catch (err) { setError(String(err)); }
    finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen bg-[#0f1729] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-[#3b82f6] rounded-lg flex items-center justify-center"><Shield size={16} className="text-white" /></div>
            <span className="text-xl font-bold text-white">Nexus POS</span>
          </div>
          <p className="text-[#94a3b8] text-sm">Super Admin Panel</p>
        </div>
        <div className="bg-[#1a2332] border border-[#2a3a55] rounded-2xl p-8">
          <h2 className="text-xl font-bold text-white mb-6">Admin Sign In</h2>
          {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm mb-4">{error}</div>}
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm text-[#94a3b8] mb-1">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-4 py-2.5 text-white focus:border-[#3b82f6] outline-none"
                placeholder="admin@nexuspos.com" />
            </div>
            <div>
              <label className="block text-sm text-[#94a3b8] mb-1">Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-4 py-2.5 text-white focus:border-[#3b82f6] outline-none" />
            </div>
            <button type="submit" disabled={loading}
              className="w-full bg-[#3b82f6] hover:bg-blue-500 text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-60">
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

/* ─── Status Badge ─── */
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
    active: { label: "Active", cls: "bg-green-500/10 text-green-400 border-green-500/20", icon: CheckCircle },
    trial: { label: "Trial", cls: "bg-blue-500/10 text-blue-400 border-blue-500/20", icon: Clock },
    suspended: { label: "Suspended", cls: "bg-red-500/10 text-red-400 border-red-500/20", icon: XCircle },
    cancelled: { label: "Cancelled", cls: "bg-[#2a3a55] text-[#94a3b8] border-[#2a3a55]", icon: XCircle },
    past_due: { label: "Past Due", cls: "bg-amber-500/10 text-amber-400 border-amber-500/20", icon: AlertTriangle },
    pending: { label: "Pending", cls: "bg-purple-500/10 text-purple-400 border-purple-500/20", icon: Clock },
    approved: { label: "Approved", cls: "bg-green-500/10 text-green-400 border-green-500/20", icon: CheckCircle },
    rejected: { label: "Rejected", cls: "bg-red-500/10 text-red-400 border-red-500/20", icon: XCircle },
  };
  const cfg = map[status] ?? { label: status, cls: "bg-[#2a3a55] text-[#94a3b8] border-[#2a3a55]", icon: Activity };
  const Ico = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${cfg.cls}`}>
      <Ico size={10} /> {cfg.label}
    </span>
  );
}

/* ─── Tenant Detail Modal ─── */
function TenantModal({ tenant, plans, onClose, onUpdate }: { tenant: TenantRow; plans: { id: number; name: string; slug: string }[]; onClose: () => void; onUpdate: () => void }) {
  const [tenantStatus, setTenantStatus] = useState(tenant.status);
  const [subStatus, setSubStatus] = useState(tenant.subscriptionStatus ?? "trial");
  const [planId, setPlanId] = useState(tenant.planId ?? 0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await superadminUpdateTenant(tenant.id, {
        status: tenantStatus, subscriptionStatus: subStatus, ...(planId ? { planId } : {}),
      });
      setSaved(true);
      setTimeout(() => { setSaved(false); onUpdate(); }, 900);
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#1a2332] border border-[#2a3a55] rounded-2xl w-full max-w-lg">
        <div className="flex items-center justify-between p-6 border-b border-[#2a3a55]">
          <div>
            <h3 className="text-lg font-bold text-white">{tenant.businessName}</h3>
            <p className="text-[#94a3b8] text-sm">{tenant.email}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-[#475569] hover:text-white hover:bg-[#2a3a55]"><X size={16} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><span className="text-[#475569]">Owner</span><p className="text-white">{tenant.ownerName}</p></div>
            <div><span className="text-[#475569]">Phone</span><p className="text-white">{tenant.phone ?? "—"}</p></div>
            <div><span className="text-[#475569]">Country</span><p className="text-white">{tenant.country ?? "—"}</p></div>
            <div><span className="text-[#475569]">Joined</span><p className="text-white">{new Date(tenant.createdAt).toLocaleDateString()}</p></div>
            <div><span className="text-[#475569]">Plan</span><p className="text-white">{tenant.planName ?? "No plan"}</p></div>
            <div><span className="text-[#475569]">Billing</span><p className="text-white capitalize">{tenant.billingCycle ?? "—"}</p></div>
          </div>
          <hr className="border-[#2a3a55]" />
          <div>
            <label className="block text-sm text-[#94a3b8] mb-1">Account Status</label>
            <select value={tenantStatus} onChange={e => setTenantStatus(e.target.value)}
              className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-3 py-2 text-white focus:border-[#3b82f6] outline-none">
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-[#94a3b8] mb-1">Subscription Status</label>
            <select value={subStatus} onChange={e => setSubStatus(e.target.value)}
              className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-3 py-2 text-white focus:border-[#3b82f6] outline-none">
              <option value="active">Active</option>
              <option value="trial">Trial</option>
              <option value="past_due">Past Due</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-[#94a3b8] mb-1">Plan Override</label>
            <select value={planId} onChange={e => setPlanId(Number(e.target.value))}
              className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-3 py-2 text-white focus:border-[#3b82f6] outline-none">
              <option value={0}>— Keep current —</option>
              {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-3 p-6 border-t border-[#2a3a55]">
          <button onClick={onClose} className="flex-1 border border-[#2a3a55] text-[#94a3b8] hover:text-white py-2.5 rounded-lg transition-colors text-sm font-medium">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 bg-[#3b82f6] hover:bg-blue-500 text-white py-2.5 rounded-lg transition-colors text-sm font-medium disabled:opacity-60">
            {saving ? "Saving…" : saved ? "Saved ✓" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Create Tenant Modal ─── */
function CreateTenantModal({ plans, onClose, onCreated }: { plans: Plan[]; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ businessName: "", ownerName: "", email: "", password: "", phone: "", country: "US", planSlug: "", billingCycle: "monthly" as "monthly" | "annual", subscriptionStatus: "active" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const res = await superadminCreateTenant({
        businessName: form.businessName, ownerName: form.ownerName, email: form.email, password: form.password,
        phone: form.phone || undefined, country: form.country, planSlug: form.planSlug || undefined,
        billingCycle: form.billingCycle, subscriptionStatus: form.subscriptionStatus,
      });
      setSuccess(`Account created for ${res.tenant.email}`);
      setTimeout(() => { onCreated(); onClose(); }, 1500);
    } catch (err: unknown) { setError(String(err)); }
    finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-[#1a2332] border border-[#2a3a55] rounded-2xl w-full max-w-lg my-4">
        <div className="flex items-center justify-between p-6 border-b border-[#2a3a55]">
          <h3 className="text-lg font-bold text-white">Onboard New Business</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-[#475569] hover:text-white hover:bg-[#2a3a55]"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">{error}</div>}
          {success && <div className="bg-green-500/10 border border-green-500/30 rounded-lg px-4 py-3 text-green-400 text-sm">{success}</div>}

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm text-[#94a3b8] mb-1">Business Name *</label>
              <input required value={form.businessName} onChange={e => set("businessName", e.target.value)}
                className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-4 py-2.5 text-white focus:border-[#3b82f6] outline-none"
                placeholder="Café El Sol" />
            </div>
            <div>
              <label className="block text-sm text-[#94a3b8] mb-1">Owner Name *</label>
              <input required value={form.ownerName} onChange={e => set("ownerName", e.target.value)}
                className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-4 py-2.5 text-white focus:border-[#3b82f6] outline-none"
                placeholder="Maria Garcia" />
            </div>
            <div>
              <label className="block text-sm text-[#94a3b8] mb-1">Phone</label>
              <input value={form.phone} onChange={e => set("phone", e.target.value)}
                className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-4 py-2.5 text-white focus:border-[#3b82f6] outline-none"
                placeholder="+1 555 0100" />
            </div>
            <div>
              <label className="block text-sm text-[#94a3b8] mb-1">Email *</label>
              <input required type="email" value={form.email} onChange={e => set("email", e.target.value)}
                className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-4 py-2.5 text-white focus:border-[#3b82f6] outline-none"
                placeholder="owner@business.com" />
            </div>
            <div>
              <label className="block text-sm text-[#94a3b8] mb-1">Password *</label>
              <input required type="password" minLength={6} value={form.password} onChange={e => set("password", e.target.value)}
                className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-4 py-2.5 text-white focus:border-[#3b82f6] outline-none"
                placeholder="Min 6 characters" />
            </div>
            <div>
              <label className="block text-sm text-[#94a3b8] mb-1">Country</label>
              <input value={form.country} onChange={e => set("country", e.target.value)}
                className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-4 py-2.5 text-white focus:border-[#3b82f6] outline-none"
                placeholder="US" />
            </div>
            <div>
              <label className="block text-sm text-[#94a3b8] mb-1">Plan</label>
              <select value={form.planSlug} onChange={e => set("planSlug", e.target.value)}
                className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-3 py-2.5 text-white focus:border-[#3b82f6] outline-none">
                <option value="">— Trial only —</option>
                {plans.map(p => <option key={p.id} value={p.slug}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-[#94a3b8] mb-1">Billing Cycle</label>
              <select value={form.billingCycle} onChange={e => set("billingCycle", e.target.value as "monthly" | "annual")}
                className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-3 py-2.5 text-white focus:border-[#3b82f6] outline-none">
                <option value="monthly">Monthly</option>
                <option value="annual">Annual</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-[#94a3b8] mb-1">Subscription Status</label>
              <select value={form.subscriptionStatus} onChange={e => set("subscriptionStatus", e.target.value)}
                className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-3 py-2.5 text-white focus:border-[#3b82f6] outline-none">
                <option value="active">Active</option>
                <option value="trial">Trial</option>
              </select>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 border border-[#2a3a55] text-[#94a3b8] hover:text-white py-2.5 rounded-lg transition-colors text-sm font-medium">Cancel</button>
            <button type="submit" disabled={loading}
              className="flex-1 bg-[#3b82f6] hover:bg-blue-500 text-white py-2.5 rounded-lg transition-colors text-sm font-medium disabled:opacity-60">
              {loading ? "Creating…" : "Create Account"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Bank Account Form ─── */
function BankAccountForm({ account, onSave, onCancel }: { account?: BankAccount; onSave: (data: Partial<BankAccount>) => Promise<void>; onCancel: () => void }) {
  const [form, setForm] = useState<Partial<BankAccount>>({
    accountHolder: account?.accountHolder ?? "", bankName: account?.bankName ?? "",
    accountNumber: account?.accountNumber ?? "", routingNumber: account?.routingNumber ?? "",
    iban: account?.iban ?? "", swiftCode: account?.swiftCode ?? "",
    currency: account?.currency ?? "JMD", instructions: account?.instructions ?? "",
    isActive: account?.isActive ?? true, sortOrder: account?.sortOrder ?? 0,
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const set = (k: string, v: string | boolean | number) => { setFormError(""); setForm(f => ({ ...f, [k]: v })); };

  return (
    <div className="grid grid-cols-2 gap-4 p-4 bg-[#0f1729] rounded-xl border border-[#2a3a55]">
      <div className="col-span-2">
        <label className="block text-xs text-[#94a3b8] mb-1">Account Holder *</label>
        <input required value={form.accountHolder} onChange={e => set("accountHolder", e.target.value)}
          className="w-full bg-[#1a2332] border border-[#2a3a55] rounded-lg px-3 py-2 text-white focus:border-[#3b82f6] outline-none text-sm"
          placeholder="Nexus Solutions Ltd." />
      </div>
      <div>
        <label className="block text-xs text-[#94a3b8] mb-1">Bank Name *</label>
        <input required value={form.bankName} onChange={e => set("bankName", e.target.value)}
          className="w-full bg-[#1a2332] border border-[#2a3a55] rounded-lg px-3 py-2 text-white focus:border-[#3b82f6] outline-none text-sm"
          placeholder="First National Bank" />
      </div>
      <div>
        <label className="block text-xs text-[#94a3b8] mb-1">Account Number *</label>
        <input required value={form.accountNumber} onChange={e => set("accountNumber", e.target.value)}
          className="w-full bg-[#1a2332] border border-[#2a3a55] rounded-lg px-3 py-2 text-white focus:border-[#3b82f6] outline-none text-sm font-mono"
          placeholder="000 123 456 789" />
      </div>
      <div>
        <label className="block text-xs text-[#94a3b8] mb-1">Routing / Transit #</label>
        <input value={form.routingNumber} onChange={e => set("routingNumber", e.target.value)}
          className="w-full bg-[#1a2332] border border-[#2a3a55] rounded-lg px-3 py-2 text-white focus:border-[#3b82f6] outline-none text-sm font-mono"
          placeholder="021000021" />
      </div>
      <div>
        <label className="block text-xs text-[#94a3b8] mb-1">IBAN</label>
        <input value={form.iban} onChange={e => set("iban", e.target.value)}
          className="w-full bg-[#1a2332] border border-[#2a3a55] rounded-lg px-3 py-2 text-white focus:border-[#3b82f6] outline-none text-sm font-mono"
          placeholder="GB29 NWBK 6016 1331 9268 19" />
      </div>
      <div>
        <label className="block text-xs text-[#94a3b8] mb-1">SWIFT / BIC</label>
        <input value={form.swiftCode} onChange={e => set("swiftCode", e.target.value)}
          className="w-full bg-[#1a2332] border border-[#2a3a55] rounded-lg px-3 py-2 text-white focus:border-[#3b82f6] outline-none text-sm font-mono"
          placeholder="MIDLGB22" />
      </div>
      <div>
        <label className="block text-xs text-[#94a3b8] mb-1">Currency</label>
        <input value={form.currency} onChange={e => set("currency", e.target.value)}
          className="w-full bg-[#1a2332] border border-[#2a3a55] rounded-lg px-3 py-2 text-white focus:border-[#3b82f6] outline-none text-sm"
          placeholder="USD" maxLength={3} />
      </div>
      <div className="col-span-2">
        <label className="block text-xs text-[#94a3b8] mb-1">Special Instructions</label>
        <textarea value={form.instructions} onChange={e => set("instructions", e.target.value)} rows={2}
          className="w-full bg-[#1a2332] border border-[#2a3a55] rounded-lg px-3 py-2 text-white focus:border-[#3b82f6] outline-none text-sm resize-none"
          placeholder="Include your business name as reference on the transfer." />
      </div>
      {formError && (
        <div className="col-span-2 text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          {formError}
        </div>
      )}
      <div className="col-span-2 flex gap-3">
        <button type="button" onClick={onCancel} className="flex-1 border border-[#2a3a55] text-[#94a3b8] hover:text-white py-2 rounded-lg text-sm transition-colors">Cancel</button>
        <button type="button" disabled={saving} onClick={async () => {
          if ((form.accountHolder ?? "").trim().length < 2) { setFormError("Account Holder is required (min 2 characters)."); return; }
          if ((form.bankName ?? "").trim().length < 2) { setFormError("Bank Name is required (min 2 characters)."); return; }
          if ((form.accountNumber ?? "").trim().length < 2) { setFormError("Account Number is required (min 2 characters)."); return; }
          setSaving(true);
          try { await onSave(form); } catch (e) { setFormError(String(e)); } finally { setSaving(false); }
        }} className="flex-1 bg-[#3b82f6] hover:bg-blue-500 text-white py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-60">
          {saving ? "Saving…" : "Save Account"}
        </button>
      </div>
    </div>
  );
}

/* ─── Proof Detail Modal ─── */
function ProofModal({ proof, onClose, onReview }: { proof: TransferProofRow; onClose: () => void; onReview: () => void }) {
  const [reviewNotes, setReviewNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function review(status: "approved" | "rejected") {
    setLoading(true);
    try {
      await superadminReviewTransferProof(proof.id, status, reviewNotes || undefined);
      setDone(true);
      setTimeout(() => { onReview(); onClose(); }, 900);
    } finally { setLoading(false); }
  }

  function downloadProof() {
    if (!proof.proofFileData) return;
    const link = document.createElement("a");
    link.href = `data:${proof.proofFileType === "pdf" ? "application/pdf" : "image/jpeg"};base64,${proof.proofFileData}`;
    link.download = proof.proofFileName ?? "proof";
    link.click();
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#1a2332] border border-[#2a3a55] rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-[#2a3a55]">
          <div>
            <h3 className="text-lg font-bold text-white">Bank Transfer Proof</h3>
            <p className="text-[#94a3b8] text-sm">{proof.businessName}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-[#475569] hover:text-white hover:bg-[#2a3a55]"><X size={16} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-[#475569]">Business</span><p className="text-white">{proof.businessName}</p></div>
            <div><span className="text-[#475569]">Email</span><p className="text-white">{proof.email}</p></div>
            <div><span className="text-[#475569]">Plan</span><p className="text-white">{proof.planName ?? "—"} ({proof.billingCycle})</p></div>
            <div><span className="text-[#475569]">Amount</span><p className="text-white font-semibold">${proof.amount.toFixed(2)}</p></div>
            <div><span className="text-[#475569]">Bank Used</span><p className="text-white">{proof.bankName ?? "—"}</p></div>
            <div><span className="text-[#475569]">Reference</span><p className="text-white font-mono">{proof.referenceNumber ?? "—"}</p></div>
            <div className="col-span-2"><span className="text-[#475569]">Submitted</span><p className="text-white">{new Date(proof.createdAt).toLocaleString()}</p></div>
            {proof.notes && <div className="col-span-2"><span className="text-[#475569]">Notes from client</span><p className="text-white">{proof.notes}</p></div>}
          </div>

          {proof.proofFileData && (
            <div className="bg-[#0f1729] rounded-lg p-4 border border-[#2a3a55]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-[#94a3b8]">Proof of Payment</span>
                <button onClick={downloadProof} className="flex items-center gap-1.5 text-xs text-[#3b82f6] hover:text-blue-400 transition-colors">
                  <Download size={12} /> Download {proof.proofFileName}
                </button>
              </div>
              {proof.proofFileType !== "pdf" && (
                <img src={`data:image/jpeg;base64,${proof.proofFileData}`} alt="proof" className="w-full rounded-lg max-h-48 object-contain" />
              )}
              {proof.proofFileType === "pdf" && (
                <div className="text-center py-4 text-[#94a3b8] text-sm">
                  <FileCheck size={24} className="mx-auto mb-1 text-[#3b82f6]" />
                  PDF document attached — click Download to view
                </div>
              )}
            </div>
          )}

          {proof.status === "pending" && (
            <>
              <div>
                <label className="block text-sm text-[#94a3b8] mb-1">Review Notes (optional)</label>
                <textarea value={reviewNotes} onChange={e => setReviewNotes(e.target.value)} rows={2}
                  className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-3 py-2 text-white focus:border-[#3b82f6] outline-none text-sm resize-none"
                  placeholder="e.g. Payment verified, amount matches…" />
              </div>
              {done && <div className="bg-green-500/10 border border-green-500/30 rounded-lg px-4 py-3 text-green-400 text-sm text-center">Done! Subscription updated.</div>}
              <div className="flex gap-3">
                <button onClick={() => review("rejected")} disabled={loading}
                  className="flex-1 border border-red-500/30 text-red-400 hover:bg-red-500/10 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-60">
                  Reject
                </button>
                <button onClick={() => review("approved")} disabled={loading}
                  className="flex-1 bg-green-600 hover:bg-green-500 text-white py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-60">
                  {loading ? "Processing…" : "Approve & Activate"}
                </button>
              </div>
            </>
          )}

          {proof.status !== "pending" && (
            <div className="flex items-center gap-2">
              <StatusBadge status={proof.status} />
              {proof.reviewNotes && <span className="text-sm text-[#94a3b8]">{proof.reviewNotes}</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Main Dashboard ─── */
function SuperAdminDashboard({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>("overview");
  const [stats, setStats] = useState<Stats | null>(null);
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [filteredTenants, setFilteredTenants] = useState<TenantRow[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [selectedTenant, setSelectedTenant] = useState<TenantRow | null>(null);
  const [showCreateTenant, setShowCreateTenant] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [planMap, setPlanMap] = useState<{ id: number; name: string; slug: string }[]>([]);

  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [editingAccount, setEditingAccount] = useState<BankAccount | null | "new">(null);
  const [bankLoading, setBankLoading] = useState(false);

  const [proofs, setProofs] = useState<TransferProofRow[]>([]);
  const [proofFilter, setProofFilter] = useState("all");
  const [selectedProof, setSelectedProof] = useState<TransferProofRow | null>(null);
  const [proofsLoading, setProofsLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [s, t, p] = await Promise.all([superadminStats(), superadminTenants(), getPlans()]);
      setStats(s);
      setTenants(t);
      setFilteredTenants(t);
      setPlans(p);
      const uniq = Array.from(new Map(p.map(x => [x.id, { id: x.id, name: x.name, slug: x.slug }])).values());
      setPlanMap(uniq);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  const loadBankAccounts = useCallback(async () => {
    setBankLoading(true);
    try { setBankAccounts(await superadminGetBankAccounts()); }
    finally { setBankLoading(false); }
  }, []);

  const loadProofs = useCallback(async () => {
    setProofsLoading(true);
    try { setProofs(await superadminGetTransferProofs()); }
    finally { setProofsLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { if (tab === "settings") loadBankAccounts(); }, [tab, loadBankAccounts]);
  useEffect(() => { if (tab === "payments") loadProofs(); }, [tab, loadProofs]);

  useEffect(() => {
    let list = tenants;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(t => t.businessName.toLowerCase().includes(q) || t.email.toLowerCase().includes(q) || t.ownerName.toLowerCase().includes(q));
    }
    if (statusFilter !== "all") list = list.filter(t => (t.subscriptionStatus ?? "trial") === statusFilter);
    setFilteredTenants(list);
  }, [search, statusFilter, tenants]);

  const filteredProofs = proofFilter === "all" ? proofs : proofs.filter(p => p.status === proofFilter);

  const tabs: { id: Tab; label: string; icon: React.ElementType; badge?: number }[] = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "tenants", label: "Businesses", icon: Building2, badge: stats?.totalTenants },
    { id: "payments", label: "Payments", icon: Banknote, badge: stats?.pendingProofs || undefined },
    { id: "settings", label: "Settings", icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-[#0f1729]">
      {selectedTenant && <TenantModal tenant={selectedTenant} plans={planMap} onClose={() => setSelectedTenant(null)} onUpdate={loadData} />}
      {showCreateTenant && <CreateTenantModal plans={plans} onClose={() => setShowCreateTenant(false)} onCreated={loadData} />}
      {selectedProof && <ProofModal proof={selectedProof} onClose={() => setSelectedProof(null)} onReview={() => { loadProofs(); loadData(); }} />}

      {/* Top bar */}
      <header className="bg-[#1a2332] border-b border-[#2a3a55] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#3b82f6] rounded-lg flex items-center justify-center"><Shield size={16} className="text-white" /></div>
          <div>
            <span className="font-bold text-white">Nexus POS</span>
            <span className="ml-2 text-xs bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded-full">Super Admin</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={loadData} className="w-8 h-8 flex items-center justify-center rounded-lg text-[#475569] hover:text-white hover:bg-[#2a3a55] transition-colors">
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          </button>
          <button onClick={onLogout} className="flex items-center gap-2 text-[#475569] hover:text-red-400 text-sm transition-colors">
            <LogOut size={15} /> Sign Out
          </button>
        </div>
      </header>

      {/* Tab Nav */}
      <div className="bg-[#1a2332] border-b border-[#2a3a55] px-6">
        <div className="flex gap-1">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors relative ${
                tab === t.id ? "border-[#3b82f6] text-white" : "border-transparent text-[#475569] hover:text-[#94a3b8]"
              }`}>
              <t.icon size={15} />
              {t.label}
              {t.badge !== undefined && t.badge > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {t.badge > 9 ? "9+" : t.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6 max-w-7xl mx-auto">

        {/* ── OVERVIEW ── */}
        {tab === "overview" && (
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-white">Dashboard</h1>
              <p className="text-[#94a3b8] text-sm">Platform-wide metrics</p>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              {[
                { label: "Total Tenants", value: String(stats?.totalTenants ?? "—"), icon: Users, color: "bg-[#3b82f6]" },
                { label: "Active", value: String(stats?.activeSubscriptions ?? "—"), sub: `${stats?.trialSubscriptions ?? 0} on trial`, icon: CheckCircle, color: "bg-green-600" },
                { label: "MRR", value: `$${stats?.mrr?.toFixed(0) ?? "—"}`, sub: "Monthly recurring", icon: TrendingUp, color: "bg-purple-600" },
                { label: "Pending Transfers", value: String(stats?.pendingProofs ?? "—"), sub: "Awaiting review", icon: Banknote, color: "bg-amber-600" },
              ].map(c => (
                <div key={c.label} className="bg-[#1a2332] border border-[#2a3a55] rounded-xl p-5">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${c.color}`}><c.icon size={20} className="text-white" /></div>
                  <div className="text-2xl font-bold text-white mb-0.5">{c.value}</div>
                  <div className="text-sm text-[#94a3b8]">{c.label}</div>
                  {c.sub && <div className="text-xs text-[#475569] mt-1">{c.sub}</div>}
                </div>
              ))}
            </div>

            {stats?.planBreakdown && stats.planBreakdown.length > 0 && (
              <div className="bg-[#1a2332] border border-[#2a3a55] rounded-xl p-5 mb-6">
                <h3 className="text-sm font-semibold text-[#94a3b8] mb-3 uppercase tracking-wide">Plan Breakdown</h3>
                <div className="flex gap-6">
                  {stats.planBreakdown.map((p) => (
                    <div key={p.planName} className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-[#3b82f6]" />
                      <span className="text-white font-semibold">{p.count}</span>
                      <span className="text-[#94a3b8] text-sm">{p.planName}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <button onClick={() => setTab("tenants")} className="bg-[#1a2332] border border-[#2a3a55] hover:border-[#3b82f6]/50 rounded-xl p-5 text-left transition-colors group">
                <Building2 size={20} className="text-[#3b82f6] mb-3" />
                <div className="font-semibold text-white group-hover:text-[#3b82f6] transition-colors">Manage Businesses</div>
                <div className="text-sm text-[#475569]">View, edit, and onboard tenants</div>
              </button>
              <button onClick={() => setTab("payments")} className="bg-[#1a2332] border border-[#2a3a55] hover:border-amber-500/50 rounded-xl p-5 text-left transition-colors group">
                <Banknote size={20} className="text-amber-400 mb-3" />
                <div className="font-semibold text-white group-hover:text-amber-400 transition-colors">Review Payments</div>
                <div className="text-sm text-[#475569]">{stats?.pendingProofs ?? 0} transfer proof{stats?.pendingProofs !== 1 ? "s" : ""} pending</div>
              </button>
              <button onClick={() => setTab("settings")} className="bg-[#1a2332] border border-[#2a3a55] hover:border-purple-500/50 rounded-xl p-5 text-left transition-colors group">
                <Settings size={20} className="text-purple-400 mb-3" />
                <div className="font-semibold text-white group-hover:text-purple-400 transition-colors">Bank Accounts</div>
                <div className="text-sm text-[#475569]">Configure payment destinations</div>
              </button>
            </div>
          </>
        )}

        {/* ── TENANTS ── */}
        {tab === "tenants" && (
          <>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-2xl font-bold text-white">Businesses</h1>
                <p className="text-[#94a3b8] text-sm">All registered tenants</p>
              </div>
              <button onClick={() => setShowCreateTenant(true)}
                className="flex items-center gap-2 bg-[#3b82f6] hover:bg-blue-500 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors">
                <Plus size={15} /> Onboard Business
              </button>
            </div>

            <div className="bg-[#1a2332] border border-[#2a3a55] rounded-xl overflow-hidden">
              <div className="p-4 border-b border-[#2a3a55] flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#475569]" />
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tenants…"
                    className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg pl-9 pr-4 py-2 text-white text-sm focus:border-[#3b82f6] outline-none" />
                </div>
                <div className="relative">
                  <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                    className="bg-[#0f1729] border border-[#2a3a55] rounded-lg px-3 py-2 pr-8 text-white text-sm focus:border-[#3b82f6] outline-none appearance-none">
                    <option value="all">All Statuses</option>
                    <option value="active">Active</option>
                    <option value="trial">Trial</option>
                    <option value="past_due">Past Due</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                  <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#475569] pointer-events-none" />
                </div>
              </div>

              {loading ? (
                <div className="p-12 text-center text-[#475569]"><RefreshCw size={24} className="animate-spin mx-auto mb-2" />Loading…</div>
              ) : filteredTenants.length === 0 ? (
                <div className="p-12 text-center text-[#475569]"><Users size={32} className="mx-auto mb-2 opacity-40" />No tenants found</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#2a3a55]">
                        {["Business", "Owner", "Plan", "Subscription", "Account", "Joined", ""].map(h => (
                          <th key={h} className="text-left text-xs text-[#475569] font-medium uppercase tracking-wide px-4 py-3">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTenants.map((t) => (
                        <tr key={t.id} className="border-b border-[#2a3a55]/50 hover:bg-[#2a3a55]/20 transition-colors">
                          <td className="px-4 py-3"><div className="font-medium text-white">{t.businessName}</div><div className="text-xs text-[#475569]">{t.email}</div></td>
                          <td className="px-4 py-3 text-[#94a3b8]">{t.ownerName}</td>
                          <td className="px-4 py-3 text-[#94a3b8]">{t.planName ?? <span className="text-[#475569]">None</span>}</td>
                          <td className="px-4 py-3"><StatusBadge status={t.subscriptionStatus ?? "trial"} /></td>
                          <td className="px-4 py-3"><StatusBadge status={t.status} /></td>
                          <td className="px-4 py-3 text-[#475569]">{new Date(t.createdAt).toLocaleDateString()}</td>
                          <td className="px-4 py-3">
                            <button onClick={() => setSelectedTenant(t)} className="p-1.5 rounded-lg text-[#475569] hover:text-white hover:bg-[#2a3a55] transition-colors">
                              <Eye size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="px-4 py-3 border-t border-[#2a3a55] text-xs text-[#475569]">{filteredTenants.length} of {tenants.length} tenants</div>
            </div>
          </>
        )}

        {/* ── PAYMENTS ── */}
        {tab === "payments" && (
          <>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-2xl font-bold text-white">Bank Transfer Payments</h1>
                <p className="text-[#94a3b8] text-sm">Review and activate offline payment proofs</p>
              </div>
              <div className="flex gap-2">
                {(["all", "pending", "approved", "rejected"] as const).map(f => (
                  <button key={f} onClick={() => setProofFilter(f)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${proofFilter === f ? "bg-[#3b82f6] text-white" : "bg-[#1a2332] text-[#94a3b8] hover:text-white border border-[#2a3a55]"}`}>
                    {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
                    {f === "pending" && stats?.pendingProofs ? <span className="ml-1 bg-red-500 text-white text-[9px] px-1 rounded-full">{stats.pendingProofs}</span> : null}
                  </button>
                ))}
              </div>
            </div>

            {proofsLoading ? (
              <div className="p-12 text-center text-[#475569]"><RefreshCw size={24} className="animate-spin mx-auto mb-2" />Loading…</div>
            ) : filteredProofs.length === 0 ? (
              <div className="bg-[#1a2332] border border-[#2a3a55] rounded-xl p-12 text-center text-[#475569]">
                <Banknote size={32} className="mx-auto mb-2 opacity-40" />
                No {proofFilter !== "all" ? proofFilter : ""} payment proofs
              </div>
            ) : (
              <div className="space-y-3">
                {filteredProofs.map(proof => (
                  <div key={proof.id} className="bg-[#1a2332] border border-[#2a3a55] rounded-xl p-5 flex items-center justify-between gap-4 hover:border-[#3b82f6]/30 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-semibold text-white">{proof.businessName}</span>
                        <StatusBadge status={proof.status} />
                      </div>
                      <div className="text-sm text-[#94a3b8] flex flex-wrap gap-x-4 gap-y-0.5">
                        <span>{proof.email}</span>
                        <span>Plan: <strong className="text-white">{proof.planName ?? "—"}</strong> ({proof.billingCycle})</span>
                        <span>Amount: <strong className="text-white">${proof.amount.toFixed(2)}</strong></span>
                        {proof.referenceNumber && <span>Ref: <span className="font-mono text-white">{proof.referenceNumber}</span></span>}
                        <span className="text-[#475569]">{new Date(proof.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <button onClick={() => setSelectedProof(proof)} className="flex items-center gap-1.5 px-3 py-2 bg-[#2a3a55] hover:bg-[#3b82f6] text-[#94a3b8] hover:text-white rounded-lg text-sm transition-colors shrink-0">
                      <Eye size={14} /> Review <ChevronRight size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── SETTINGS ── */}
        {tab === "settings" && (
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-white">Bank Account Settings</h1>
              <p className="text-[#94a3b8] text-sm">Configure up to 2 bank accounts shown to customers for offline payment</p>
            </div>

            {bankLoading ? (
              <div className="p-8 text-center text-[#475569]"><RefreshCw size={20} className="animate-spin mx-auto mb-2" />Loading…</div>
            ) : (
              <div className="space-y-4">
                {bankAccounts.map(acct => (
                  <div key={acct.id} className="bg-[#1a2332] border border-[#2a3a55] rounded-xl overflow-hidden">
                    {editingAccount === acct ? (
                      <div className="p-4">
                        <BankAccountForm account={acct} onCancel={() => setEditingAccount(null)} onSave={async (data) => {
                          await superadminUpdateBankAccount(acct.id, data);
                          await loadBankAccounts();
                          setEditingAccount(null);
                        }} />
                      </div>
                    ) : (
                      <div className="p-5">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <div className="font-semibold text-white">{acct.bankName}</div>
                            <div className="text-sm text-[#94a3b8]">{acct.accountHolder}</div>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => setEditingAccount(acct)} className="p-1.5 rounded-lg text-[#475569] hover:text-white hover:bg-[#2a3a55] transition-colors"><Pencil size={14} /></button>
                            <button onClick={async () => { if (confirm("Delete this bank account?")) { await superadminDeleteBankAccount(acct.id); await loadBankAccounts(); } }}
                              className="p-1.5 rounded-lg text-[#475569] hover:text-red-400 hover:bg-red-500/10 transition-colors"><Trash2 size={14} /></button>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                          <div className="flex justify-between"><span className="text-[#475569]">Account #</span><span className="text-white font-mono">{acct.accountNumber}</span></div>
                          {acct.routingNumber && <div className="flex justify-between"><span className="text-[#475569]">Routing</span><span className="text-white font-mono">{acct.routingNumber}</span></div>}
                          {acct.iban && <div className="flex justify-between"><span className="text-[#475569]">IBAN</span><span className="text-white font-mono">{acct.iban}</span></div>}
                          {acct.swiftCode && <div className="flex justify-between"><span className="text-[#475569]">SWIFT</span><span className="text-white font-mono">{acct.swiftCode}</span></div>}
                          <div className="flex justify-between"><span className="text-[#475569]">Currency</span><span className="text-white">{acct.currency}</span></div>
                        </div>
                        {acct.instructions && <p className="mt-3 text-xs text-[#94a3b8] border-t border-[#2a3a55] pt-3">{acct.instructions}</p>}
                      </div>
                    )}
                  </div>
                ))}

                {editingAccount === "new" ? (
                  <BankAccountForm onCancel={() => setEditingAccount(null)} onSave={async (data) => {
                    await superadminCreateBankAccount(data as Omit<BankAccount, "id">);
                    await loadBankAccounts();
                    setEditingAccount(null);
                  }} />
                ) : bankAccounts.length < 2 ? (
                  <button onClick={() => setEditingAccount("new")}
                    className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-[#2a3a55] hover:border-[#3b82f6] text-[#475569] hover:text-[#3b82f6] py-6 rounded-xl transition-colors">
                    <Plus size={18} /> Add Bank Account
                  </button>
                ) : (
                  <p className="text-center text-xs text-[#475569] py-2">Maximum of 2 bank accounts reached.</p>
                )}
              </div>
            )}
          </>
        )}

        <p className="text-center text-xs text-[#2a3a55] mt-8">Powered by MicroBooks</p>
      </div>
    </div>
  );
}

/* ─── Root Export ─── */
export function Superadmin() {
  const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem(SUPERADMIN_TOKEN_KEY));

  function handleLogout() {
    localStorage.removeItem(SUPERADMIN_TOKEN_KEY);
    setIsLoggedIn(false);
  }

  if (!isLoggedIn) return <SuperAdminLogin onLogin={() => setIsLoggedIn(true)} />;
  return <SuperAdminDashboard onLogout={handleLogout} />;
}
