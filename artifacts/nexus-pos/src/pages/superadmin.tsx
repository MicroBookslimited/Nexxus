import { useState, useEffect, useCallback, useRef } from "react";
import {
  Users, TrendingUp, CreditCard, Activity, Search, ChevronDown,
  RefreshCw, LogOut, Zap, Shield, CheckCircle, XCircle, Clock,
  Eye, X, AlertTriangle, Plus, Building2, Banknote, FileCheck,
  LayoutDashboard, Settings, Pencil, Trash2, Download, ChevronRight,
  LogIn, KeyRound, Check, Package, ToggleLeft, ToggleRight, Mail,
  Cpu, Globe,
} from "lucide-react";
import { EmailTab } from "./superadmin-email-tab";
import {
  SUPERADMIN_TOKEN_KEY, TENANT_TOKEN_KEY,
  superadminLogin, superadminStats, superadminTenants,
  superadminUpdateTenant, superadminCreateTenant, superadminGetBankAccounts,
  superadminCreateBankAccount, superadminUpdateBankAccount, superadminDeleteBankAccount,
  superadminGetTransferProofs, superadminReviewTransferProof,
  superadminGetUsers, superadminImpersonate, superadminResetPassword,
  superadminGetPlans, superadminCreatePlan, superadminUpdatePlan, superadminDeletePlan,
  superadminGetGatewaySettings, superadminUpdateGatewaySettings,
  type TenantRow, type BankAccount, type TransferProofRow, type Plan, type UserRow, type GatewaySettings,
} from "@/lib/saas-api";

type Stats = {
  totalTenants: number; activeSubscriptions: number; trialSubscriptions: number;
  pendingProofs: number; mrr: number; arr: number;
  planBreakdown: { planName: string; count: number }[];
};

type Tab = "overview" | "users" | "tenants" | "payments" | "plans" | "email" | "gateway" | "settings";

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
            <span className="text-xl font-bold text-white">NEXXUS POS</span>
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
  const [saveError, setSaveError] = useState("");

  async function handleSave() {
    setSaving(true);
    setSaveError("");
    try {
      await superadminUpdateTenant(tenant.id, {
        status: tenantStatus, subscriptionStatus: subStatus, ...(planId ? { planId } : {}),
      });
      setSaved(true);
      setTimeout(() => { setSaved(false); onUpdate(); }, 900);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save changes");
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
        {saveError && (
          <div className="mx-6 mb-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{saveError}</div>
        )}
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
          placeholder="NEXXUS Solutions Ltd." />
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

/* ─── Reset Password Modal ─── */
function ResetPasswordModal({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  async function handleReset() {
    if (newPassword.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (newPassword !== confirm) { setError("Passwords do not match."); return; }
    setLoading(true); setError("");
    try {
      await superadminResetPassword(user.id, newPassword);
      setSuccess(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to reset password");
    } finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#1a2332] border border-[#2a3a55] rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-[#2a3a55]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-amber-500/20 rounded-lg flex items-center justify-center"><KeyRound size={16} className="text-amber-400" /></div>
            <div>
              <div className="font-semibold text-white">Reset Password</div>
              <div className="text-xs text-[#475569]">{user.email}</div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-[#475569] hover:text-white hover:bg-[#2a3a55] transition-colors"><X size={16} /></button>
        </div>

        <div className="p-5">
          {success ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-3"><Check size={24} className="text-green-400" /></div>
              <div className="font-semibold text-white mb-1">Password Reset!</div>
              <div className="text-sm text-[#94a3b8]">The password for <strong>{user.ownerName}</strong> has been updated.</div>
              <button onClick={onClose} className="mt-4 px-4 py-2 bg-[#3b82f6] hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors">Done</button>
            </div>
          ) : (
            <>
              <p className="text-sm text-[#94a3b8] mb-4">Set a new password for <strong className="text-white">{user.ownerName}</strong> ({user.businessName}).</p>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-[#94a3b8] mb-1.5 font-medium">New Password</label>
                  <input type="password" value={newPassword} onChange={e => { setNewPassword(e.target.value); setError(""); }}
                    placeholder="Min. 6 characters"
                    className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-3 py-2.5 text-white text-sm focus:border-[#3b82f6] outline-none" />
                </div>
                <div>
                  <label className="block text-xs text-[#94a3b8] mb-1.5 font-medium">Confirm Password</label>
                  <input type="password" value={confirm} onChange={e => { setConfirm(e.target.value); setError(""); }}
                    placeholder="Repeat password"
                    className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-3 py-2.5 text-white text-sm focus:border-[#3b82f6] outline-none"
                    onKeyDown={e => e.key === "Enter" && handleReset()} />
                </div>
                {error && <p className="text-sm text-red-400 flex items-center gap-1.5"><AlertTriangle size={13} />{error}</p>}
              </div>
              <div className="flex gap-3 mt-5">
                <button onClick={onClose} className="flex-1 border border-[#2a3a55] text-[#94a3b8] hover:text-white py-2.5 rounded-lg text-sm font-medium transition-colors">Cancel</button>
                <button onClick={handleReset} disabled={loading || !newPassword}
                  className="flex-1 bg-amber-500 hover:bg-amber-400 text-white py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-60">
                  {loading ? "Resetting…" : "Reset Password"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Plan Form Modal ─── */
const ALL_MODULES = [
  { key: "pos", label: "POS Terminal" },
  { key: "reports", label: "Reports & Analytics" },
  { key: "inventory", label: "Inventory" },
  { key: "customers", label: "Customers" },
  { key: "staff", label: "Staff Management" },
  { key: "cash", label: "Cash Management" },
  { key: "tables", label: "Table Management" },
  { key: "kitchen", label: "Kitchen Display" },
  { key: "loyalty", label: "Loyalty Points" },
];

type PlanFormData = {
  name: string; slug: string; description: string;
  priceMonthly: number; priceAnnual: number;
  maxStaff: number; maxProducts: number; maxLocations: number; maxInvoices: number;
  modules: string[]; features: string[]; isActive: boolean;
};

function PlanFormModal({
  plan, onClose, onSave,
}: {
  plan: Plan | null;
  onClose: () => void;
  onSave: (data: PlanFormData) => Promise<void>;
}) {
  const isNew = !plan;
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [form, setForm] = useState<PlanFormData>({
    name: plan?.name ?? "",
    slug: plan?.slug ?? "",
    description: plan?.description ?? "",
    priceMonthly: plan?.priceMonthly ?? 0,
    priceAnnual: plan?.priceAnnual ?? 0,
    maxStaff: plan?.maxStaff ?? 5,
    maxProducts: plan?.maxProducts ?? 100,
    maxLocations: plan?.maxLocations ?? 1,
    maxInvoices: plan?.maxInvoices ?? 500,
    modules: plan?.modules ?? ALL_MODULES.map(m => m.key),
    features: plan?.features ?? [],
    isActive: plan?.isActive ?? true,
  });
  const [newFeature, setNewFeature] = useState("");

  function setF<K extends keyof PlanFormData>(key: K, val: PlanFormData[K]) {
    setForm(prev => ({ ...prev, [key]: val }));
  }

  function toggleModule(key: string) {
    setForm(prev => ({
      ...prev,
      modules: prev.modules.includes(key) ? prev.modules.filter(m => m !== key) : [...prev.modules, key],
    }));
  }

  function autoSlug(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setErr("");
    try { await onSave(form); }
    catch (ex) { setErr((ex as Error).message); setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-[#1a2332] border border-[#2a3a55] rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-[#2a3a55]">
          <h2 className="text-lg font-bold text-white">{isNew ? "Create Plan" : `Edit: ${plan.name}`}</h2>
          <button onClick={onClose} className="text-[#475569] hover:text-white"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {err && <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg px-4 py-2">{err}</div>}

          {/* Name & Slug */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[#94a3b8] mb-1 font-medium">Plan Name</label>
              <input value={form.name} onChange={e => { setF("name", e.target.value); if (isNew) setF("slug", autoSlug(e.target.value)); }}
                className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#3b82f6]"
                placeholder="e.g. Professional" required />
            </div>
            <div>
              <label className="block text-xs text-[#94a3b8] mb-1 font-medium">Slug (unique ID)</label>
              <input value={form.slug} onChange={e => setF("slug", e.target.value)}
                className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-[#3b82f6]"
                placeholder="professional" required />
            </div>
          </div>

          <div>
            <label className="block text-xs text-[#94a3b8] mb-1 font-medium">Description</label>
            <input value={form.description} onChange={e => setF("description", e.target.value)}
              className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#3b82f6]"
              placeholder="Short description shown to customers" />
          </div>

          {/* Pricing */}
          <div>
            <div className="text-xs text-[#94a3b8] mb-2 font-medium uppercase tracking-wide">Pricing</div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-[#475569] mb-1">Monthly Price (USD)</label>
                <input type="number" min="0" step="0.01" value={form.priceMonthly} onChange={e => setF("priceMonthly", parseFloat(e.target.value) || 0)}
                  className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#3b82f6]" />
              </div>
              <div>
                <label className="block text-xs text-[#475569] mb-1">Annual Price (USD)</label>
                <input type="number" min="0" step="0.01" value={form.priceAnnual} onChange={e => setF("priceAnnual", parseFloat(e.target.value) || 0)}
                  className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#3b82f6]" />
              </div>
            </div>
          </div>

          {/* Limits */}
          <div>
            <div className="text-xs text-[#94a3b8] mb-2 font-medium uppercase tracking-wide">Limits (9999 = unlimited)</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {([ ["maxStaff","Max Staff"], ["maxProducts","Max Products"], ["maxLocations","Max Locations"], ["maxInvoices","Max Invoices/mo"] ] as [keyof PlanFormData, string][]).map(([k, label]) => (
                <div key={k}>
                  <label className="block text-xs text-[#475569] mb-1">{label}</label>
                  <input type="number" min="0" value={form[k] as number} onChange={e => setF(k, parseInt(e.target.value) || 0)}
                    className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#3b82f6]" />
                </div>
              ))}
            </div>
          </div>

          {/* Modules */}
          <div>
            <div className="text-xs text-[#94a3b8] mb-2 font-medium uppercase tracking-wide">Enabled Modules</div>
            <div className="grid grid-cols-3 gap-2">
              {ALL_MODULES.map(m => {
                const on = form.modules.includes(m.key);
                return (
                  <button key={m.key} type="button" onClick={() => toggleModule(m.key)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-colors ${on ? "border-[#3b82f6] bg-[#3b82f6]/10 text-[#3b82f6]" : "border-[#2a3a55] text-[#475569] hover:border-[#3b82f6]/50"}`}>
                    {on ? <ToggleRight size={15} /> : <ToggleLeft size={15} />}
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Features (bullet points) */}
          <div>
            <div className="text-xs text-[#94a3b8] mb-2 font-medium uppercase tracking-wide">Feature Bullets (shown on pricing page)</div>
            <div className="space-y-2 mb-2">
              {form.features.map((f, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input value={f} onChange={e => setF("features", form.features.map((x, j) => j === i ? e.target.value : x))}
                    className="flex-1 bg-[#0f1729] border border-[#2a3a55] rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-[#3b82f6]" />
                  <button type="button" onClick={() => setF("features", form.features.filter((_, j) => j !== i))}
                    className="text-[#475569] hover:text-red-400 p-1"><X size={14} /></button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={newFeature} onChange={e => setNewFeature(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); if (newFeature.trim()) { setF("features", [...form.features, newFeature.trim()]); setNewFeature(""); } } }}
                className="flex-1 bg-[#0f1729] border border-[#2a3a55] rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-[#3b82f6]"
                placeholder="Add feature (press Enter)" />
              <button type="button" onClick={() => { if (newFeature.trim()) { setF("features", [...form.features, newFeature.trim()]); setNewFeature(""); } }}
                className="px-3 py-1.5 bg-[#2a3a55] hover:bg-[#3a4a65] text-white rounded-lg text-sm"><Plus size={14} /></button>
            </div>
          </div>

          {/* Active toggle */}
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setF("isActive", !form.isActive)}
              className={`relative w-10 h-5 rounded-full transition-colors ${form.isActive ? "bg-[#3b82f6]" : "bg-[#2a3a55]"}`}>
              <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${form.isActive ? "translate-x-5" : "translate-x-0.5"}`} />
            </button>
            <span className="text-sm text-[#94a3b8]">Plan is {form.isActive ? "active" : "inactive"}</span>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 border border-[#2a3a55] text-[#94a3b8] rounded-lg text-sm hover:border-[#3b82f6] hover:text-white transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 px-4 py-2 bg-[#3b82f6] hover:bg-[#2563eb] text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-60">
              {saving ? "Saving…" : isNew ? "Create Plan" : "Save Changes"}
            </button>
          </div>
        </form>
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

  const [users, setUsers] = useState<UserRow[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [usersLoading, setUsersLoading] = useState(false);
  const [resetTarget, setResetTarget] = useState<UserRow | null>(null);
  const [impersonating, setImpersonating] = useState<number | null>(null);

  const [editingPlan, setEditingPlan] = useState<Plan | null | "new">(null);
  const [plansLoading, setPlansLoading] = useState(false);

  const [gatewaySettings, setGatewaySettings] = useState<GatewaySettings | null>(null);
  const [gatewayLoading, setGatewayLoading] = useState(false);
  const [gatewayForm, setGatewayForm] = useState({ spid: "", sppassword: "", env: "staging", enabled: "true" });
  const [gatewaySaving, setGatewaySaving] = useState(false);
  const [gatewaySaved, setGatewaySaved] = useState(false);
  const [gatewayError, setGatewayError] = useState("");

  function isAuthError(e: unknown): boolean {
    return (e instanceof Error) && (
      e.message.includes("Invalid superadmin token") ||
      e.message.includes("Unauthorized") ||
      e.message.includes("401")
    );
  }

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [s, t, p] = await Promise.all([superadminStats(), superadminTenants(), superadminGetPlans()]);
      setStats(s);
      setTenants(t);
      setFilteredTenants(t);
      setPlans(p);
      const uniq = Array.from(new Map(p.filter(x => x.isActive).map(x => [x.id, { id: x.id, name: x.name, slug: x.slug }])).values());
      setPlanMap(uniq);
    } catch (e) {
      if (isAuthError(e)) { onLogout(); return; }
      console.error(e);
    }
    finally { setLoading(false); }
  }, [onLogout]);

  const loadBankAccounts = useCallback(async () => {
    setBankLoading(true);
    try { setBankAccounts(await superadminGetBankAccounts()); }
    catch (e) { if (isAuthError(e)) onLogout(); }
    finally { setBankLoading(false); }
  }, [onLogout]);

  const loadProofs = useCallback(async () => {
    setProofsLoading(true);
    try { setProofs(await superadminGetTransferProofs()); }
    catch (e) { if (isAuthError(e)) onLogout(); }
    finally { setProofsLoading(false); }
  }, [onLogout]);

  const loadUsers = useCallback(async (q?: string) => {
    setUsersLoading(true);
    try { setUsers(await superadminGetUsers(q)); }
    catch (e) {
      if (isAuthError(e)) { onLogout(); return; }
      console.error(e);
    }
    finally { setUsersLoading(false); }
  }, [onLogout]);

  const loadPlans = useCallback(async () => {
    setPlansLoading(true);
    try {
      const p = await superadminGetPlans();
      setPlans(p);
      const uniq = Array.from(new Map(p.filter(x => x.isActive).map(x => [x.id, { id: x.id, name: x.name, slug: x.slug }])).values());
      setPlanMap(uniq);
    } catch (e) { if (isAuthError(e)) onLogout(); }
    finally { setPlansLoading(false); }
  }, [onLogout]);

  const loadGateway = useCallback(async () => {
    setGatewayLoading(true);
    try {
      const gs = await superadminGetGatewaySettings();
      setGatewaySettings(gs);
      setGatewayForm({
        spid: gs.powertranz_spid ?? "",
        sppassword: "",
        env: gs.powertranz_env || "staging",
        enabled: gs.powertranz_enabled || "true",
      });
    } catch (e) { if (isAuthError(e)) onLogout(); }
    finally { setGatewayLoading(false); }
  }, [onLogout]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { if (tab === "settings") loadBankAccounts(); }, [tab, loadBankAccounts]);
  useEffect(() => { if (tab === "payments") loadProofs(); }, [tab, loadProofs]);
  useEffect(() => { if (tab === "users") loadUsers(); }, [tab, loadUsers]);
  useEffect(() => { if (tab === "plans") loadPlans(); }, [tab, loadPlans]);
  useEffect(() => { if (tab === "gateway") loadGateway(); }, [tab, loadGateway]);

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
    { id: "users", label: "Users", icon: Users, badge: stats?.totalTenants },
    { id: "tenants", label: "Businesses", icon: Building2 },
    { id: "payments", label: "Payments", icon: Banknote, badge: stats?.pendingProofs || undefined },
    { id: "plans", label: "Plans", icon: Package },
    { id: "email", label: "Email", icon: Mail },
    { id: "gateway", label: "Gateway", icon: CreditCard },
    { id: "settings", label: "Settings", icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-[#0f1729]">
      {selectedTenant && <TenantModal tenant={selectedTenant} plans={planMap} onClose={() => setSelectedTenant(null)} onUpdate={loadData} />}
      {showCreateTenant && <CreateTenantModal plans={plans} onClose={() => setShowCreateTenant(false)} onCreated={loadData} />}
      {selectedProof && <ProofModal proof={selectedProof} onClose={() => setSelectedProof(null)} onReview={() => { loadProofs(); loadData(); }} />}
      {resetTarget && <ResetPasswordModal user={resetTarget} onClose={() => setResetTarget(null)} />}

      {/* Top bar */}
      <header className="bg-[#1a2332] border-b border-[#2a3a55] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#3b82f6] rounded-lg flex items-center justify-center"><Shield size={16} className="text-white" /></div>
          <div>
            <span className="font-bold text-white">NEXXUS POS</span>
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

        {/* ── USERS ── */}
        {tab === "users" && (
          <>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-2xl font-bold text-white">Users</h1>
                <p className="text-[#94a3b8] text-sm">All registered tenant accounts — login as or reset passwords</p>
              </div>
              <button onClick={() => loadUsers(userSearch)} className="flex items-center gap-2 text-sm text-[#475569] hover:text-white border border-[#2a3a55] px-3 py-2 rounded-lg transition-colors">
                <RefreshCw size={14} className={usersLoading ? "animate-spin" : ""} /> Refresh
              </button>
            </div>

            <div className="bg-[#1a2332] border border-[#2a3a55] rounded-xl overflow-hidden">
              <div className="p-4 border-b border-[#2a3a55]">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#475569]" />
                  <input
                    value={userSearch}
                    onChange={e => { setUserSearch(e.target.value); loadUsers(e.target.value); }}
                    placeholder="Search by name, email, or business…"
                    className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg pl-9 pr-4 py-2 text-white text-sm focus:border-[#3b82f6] outline-none" />
                </div>
              </div>

              {usersLoading ? (
                <div className="p-12 text-center text-[#475569]"><RefreshCw size={24} className="animate-spin mx-auto mb-2" />Loading users…</div>
              ) : users.length === 0 ? (
                <div className="p-12 text-center text-[#475569]"><Users size={32} className="mx-auto mb-2 opacity-40" />No users found</div>
              ) : (
                <div className="divide-y divide-[#2a3a55]/50">
                  {users.map(u => (
                    <div key={u.id} className="flex items-center gap-4 px-5 py-4 hover:bg-[#2a3a55]/20 transition-colors">
                      {/* Avatar */}
                      <div className="w-9 h-9 rounded-full bg-[#3b82f6]/20 flex items-center justify-center shrink-0">
                        <span className="text-[#3b82f6] text-sm font-bold">{u.ownerName.charAt(0).toUpperCase()}</span>
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-white text-sm">{u.ownerName}</span>
                          <span className="text-[#475569] text-xs">·</span>
                          <span className="text-[#94a3b8] text-xs">{u.businessName}</span>
                          <StatusBadge status={u.subscriptionStatus ?? "trial"} />
                        </div>
                        <div className="text-xs text-[#475569] mt-0.5 flex items-center gap-3">
                          <span>{u.email}</span>
                          {u.phone && <span>{u.phone}</span>}
                          {u.planName && <span>Plan: <span className="text-[#94a3b8]">{u.planName}</span></span>}
                          <span>Joined {new Date(u.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          disabled={impersonating === u.id}
                          onClick={async () => {
                            setImpersonating(u.id);
                            try {
                              const { token } = await superadminImpersonate(u.id);
                              localStorage.setItem(TENANT_TOKEN_KEY, token);
                              window.location.href = "/app/dashboard";
                            } catch (e: unknown) {
                              alert(e instanceof Error ? e.message : "Failed to impersonate");
                              setImpersonating(null);
                            }
                          }}
                          title="Login as this user"
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#3b82f6]/10 border border-[#3b82f6]/30 hover:bg-[#3b82f6] text-[#3b82f6] hover:text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-60">
                          {impersonating === u.id ? <RefreshCw size={12} className="animate-spin" /> : <LogIn size={12} />}
                          Login As
                        </button>
                        <button
                          onClick={() => setResetTarget(u)}
                          title="Reset password"
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500 text-amber-400 hover:text-white rounded-lg text-xs font-medium transition-colors">
                          <KeyRound size={12} /> Reset Password
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="px-5 py-3 border-t border-[#2a3a55] text-xs text-[#475569]">{users.length} user{users.length !== 1 ? "s" : ""}</div>
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

        {/* ── PLANS ── */}
        {tab === "plans" && (
          <>
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-white">Subscription Plans</h1>
                <p className="text-[#94a3b8] text-sm">Create and manage plans available to tenants</p>
              </div>
              <button onClick={() => setEditingPlan("new")}
                className="flex items-center gap-2 bg-[#3b82f6] hover:bg-[#2563eb] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                <Plus size={16} /> New Plan
              </button>
            </div>

            {editingPlan && (
              <PlanFormModal
                plan={editingPlan === "new" ? null : editingPlan}
                onClose={() => setEditingPlan(null)}
                onSave={async (data) => {
                  if (editingPlan === "new") await superadminCreatePlan(data);
                  else await superadminUpdatePlan(editingPlan.id, data);
                  await loadPlans();
                  setEditingPlan(null);
                }}
              />
            )}

            {plansLoading ? (
              <div className="p-8 text-center text-[#475569]"><RefreshCw size={20} className="animate-spin mx-auto mb-2" />Loading…</div>
            ) : (
              <div className="space-y-4">
                {plans.map(plan => (
                  <div key={plan.id} className={`bg-[#1a2332] border rounded-xl overflow-hidden transition-opacity ${plan.isActive ? "border-[#2a3a55]" : "border-[#1a2332] opacity-60"}`}>
                    <div className="p-5">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-[#3b82f6]/10 rounded-lg flex items-center justify-center">
                            <Package size={18} className="text-[#3b82f6]" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white text-lg">{plan.name}</span>
                              <span className="text-xs font-mono bg-[#0f1729] text-[#94a3b8] px-2 py-0.5 rounded">{plan.slug}</span>
                              {!plan.isActive && <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full">Inactive</span>}
                            </div>
                            <p className="text-sm text-[#94a3b8]">{plan.description}</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => setEditingPlan(plan)}
                            className="p-1.5 rounded-lg text-[#475569] hover:text-white hover:bg-[#2a3a55] transition-colors"><Pencil size={14} /></button>
                          {plan.isActive ? (
                            <button onClick={async () => { if (confirm(`Deactivate plan "${plan.name}"? Existing tenants won't be affected.`)) { await superadminDeletePlan(plan.id); await loadPlans(); } }}
                              className="p-1.5 rounded-lg text-[#475569] hover:text-red-400 hover:bg-red-500/10 transition-colors"><Trash2 size={14} /></button>
                          ) : (
                            <button onClick={async () => { await superadminUpdatePlan(plan.id, { isActive: true }); await loadPlans(); }}
                              className="p-1.5 rounded-lg text-[#475569] hover:text-green-400 hover:bg-green-500/10 transition-colors" title="Reactivate"><CheckCircle size={14} /></button>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                        <div className="bg-[#0f1729] rounded-lg p-3 text-center">
                          <div className="text-lg font-bold text-white">${plan.priceMonthly}<span className="text-xs text-[#475569] font-normal">/mo</span></div>
                          <div className="text-xs text-[#475569]">${plan.priceAnnual}/yr</div>
                        </div>
                        <div className="bg-[#0f1729] rounded-lg p-3 text-center">
                          <div className="text-lg font-bold text-white">{plan.maxStaff >= 9999 ? "∞" : plan.maxStaff}</div>
                          <div className="text-xs text-[#475569]">Staff</div>
                        </div>
                        <div className="bg-[#0f1729] rounded-lg p-3 text-center">
                          <div className="text-lg font-bold text-white">{plan.maxProducts >= 9999 ? "∞" : plan.maxProducts}</div>
                          <div className="text-xs text-[#475569]">Products</div>
                        </div>
                        <div className="bg-[#0f1729] rounded-lg p-3 text-center">
                          <div className="text-lg font-bold text-white">{plan.maxLocations >= 9999 ? "∞" : plan.maxLocations}</div>
                          <div className="text-xs text-[#475569]">Locations</div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <div className="text-xs text-[#475569] mb-1.5 font-medium uppercase tracking-wide">Modules</div>
                          <div className="flex flex-wrap gap-1">
                            {plan.modules.map(m => (
                              <span key={m} className="text-xs bg-[#3b82f6]/10 text-[#3b82f6] px-2 py-0.5 rounded-full capitalize">{m}</span>
                            ))}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-[#475569] mb-1.5 font-medium uppercase tracking-wide">Limits</div>
                          <div className="text-xs text-[#94a3b8] space-y-0.5">
                            <div>Invoices: {plan.maxInvoices >= 9999 ? "Unlimited" : plan.maxInvoices.toLocaleString()}/mo</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {plans.length === 0 && (
                  <div className="text-center py-12 text-[#475569]">
                    <Package size={32} className="mx-auto mb-3 opacity-40" />
                    <p>No plans yet. Create one to get started.</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ── EMAIL ── */}
        {tab === "email" && <EmailTab />}

        {/* ── GATEWAY ── */}
        {tab === "gateway" && (
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-white">Payment Gateway</h1>
              <p className="text-[#94a3b8] text-sm">Configure PowerTranz card payment processing for subscriptions</p>
            </div>

            {gatewayLoading ? (
              <div className="p-8 text-center text-[#475569]"><RefreshCw size={20} className="animate-spin mx-auto mb-2" />Loading…</div>
            ) : (
              <div className="space-y-6">
                {/* Status banner */}
                {gatewaySettings && (
                  <div className={`rounded-xl p-4 flex items-center gap-3 border ${
                    gatewaySettings.powertranz_spid && gatewaySettings.powertranz_sppassword_set === "true"
                      ? "bg-green-500/10 border-green-500/30"
                      : "bg-amber-500/10 border-amber-500/30"
                  }`}>
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      gatewaySettings.powertranz_spid && gatewaySettings.powertranz_sppassword_set === "true" ? "bg-green-500/20" : "bg-amber-500/20"
                    }`}>
                      {gatewaySettings.powertranz_spid && gatewaySettings.powertranz_sppassword_set === "true"
                        ? <CheckCircle size={16} className="text-green-400" />
                        : <AlertTriangle size={16} className="text-amber-400" />}
                    </div>
                    <div>
                      <div className={`font-semibold text-sm ${gatewaySettings.powertranz_spid && gatewaySettings.powertranz_sppassword_set === "true" ? "text-green-400" : "text-amber-400"}`}>
                        {gatewaySettings.powertranz_spid && gatewaySettings.powertranz_sppassword_set === "true"
                          ? "PowerTranz configured and active"
                          : "PowerTranz credentials not yet configured"}
                      </div>
                      <div className="text-xs text-[#94a3b8] mt-0.5">
                        {gatewaySettings.powertranz_spid && gatewaySettings.powertranz_sppassword_set === "true"
                          ? `SP ID: ${gatewaySettings.powertranz_spid} · Environment: ${gatewaySettings.powertranz_env || "staging"} · ${gatewaySettings.powertranz_enabled === "true" ? "Enabled" : "Disabled"}`
                          : "Enter your PowerTranz SP ID and SP Password below to enable card payments."}
                      </div>
                    </div>
                  </div>
                )}

                {/* PowerTranz Config Card */}
                <div className="bg-[#1a2332] border border-[#2a3a55] rounded-xl overflow-hidden">
                  <div className="flex items-center gap-3 px-6 py-4 border-b border-[#2a3a55]">
                    <div className="w-9 h-9 bg-[#3b82f6]/10 rounded-lg flex items-center justify-center">
                      <Cpu size={18} className="text-[#3b82f6]" />
                    </div>
                    <div>
                      <div className="font-semibold text-white">PowerTranz Gateway</div>
                      <div className="text-xs text-[#94a3b8]">Caribbean-focused card processing — obtain credentials from PowerTranz portal</div>
                    </div>
                  </div>

                  <div className="p-6 space-y-5">
                    {gatewayError && (
                      <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">{gatewayError}</div>
                    )}
                    {gatewaySaved && (
                      <div className="bg-green-500/10 border border-green-500/30 rounded-lg px-4 py-3 text-green-400 text-sm flex items-center gap-2">
                        <Check size={14} /> Gateway settings saved successfully.
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div>
                        <label className="block text-sm text-[#94a3b8] mb-1.5">SP ID</label>
                        <input
                          value={gatewayForm.spid}
                          onChange={e => setGatewayForm(f => ({ ...f, spid: e.target.value }))}
                          className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-4 py-2.5 text-white focus:border-[#3b82f6] outline-none font-mono text-sm"
                          placeholder="Your PowerTranz SP ID"
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-[#94a3b8] mb-1.5 flex items-center gap-1">
                          SP Password
                          {gatewaySettings?.powertranz_sppassword_set === "true" && (
                            <span className="text-xs text-green-400 font-normal ml-1">(currently set — leave blank to keep)</span>
                          )}
                        </label>
                        <input
                          type="password"
                          value={gatewayForm.sppassword}
                          onChange={e => setGatewayForm(f => ({ ...f, sppassword: e.target.value }))}
                          className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-4 py-2.5 text-white focus:border-[#3b82f6] outline-none font-mono text-sm"
                          placeholder={gatewaySettings?.powertranz_sppassword_set === "true" ? "••••••••  (unchanged)" : "Your PowerTranz SP Password"}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div>
                        <label className="block text-sm text-[#94a3b8] mb-1.5 flex items-center gap-1"><Globe size={13} /> Environment</label>
                        <div className="flex gap-2">
                          {(["staging", "production"] as const).map(env => (
                            <button key={env} onClick={() => setGatewayForm(f => ({ ...f, env }))}
                              className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all ${
                                gatewayForm.env === env
                                  ? env === "production" ? "border-green-500 bg-green-500/10 text-green-400" : "border-amber-500 bg-amber-500/10 text-amber-400"
                                  : "border-[#2a3a55] text-[#94a3b8] hover:border-[#3b82f6]/50"
                              }`}>
                              {env === "production" ? "Production" : "Staging / Test"}
                            </button>
                          ))}
                        </div>
                        <p className="text-xs text-[#475569] mt-1.5">
                          {gatewayForm.env === "production" ? "gateway.powertranz.com — live charges" : "staging.powertranz.com — test cards only"}
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm text-[#94a3b8] mb-1.5 flex items-center gap-1"><CreditCard size={13} /> Card Payments</label>
                        <button onClick={() => setGatewayForm(f => ({ ...f, enabled: f.enabled === "true" ? "false" : "true" }))}
                          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border transition-all text-sm font-medium ${
                            gatewayForm.enabled === "true" ? "border-green-500/50 bg-green-500/10 text-green-400" : "border-[#2a3a55] text-[#94a3b8]"
                          }`}>
                          {gatewayForm.enabled === "true" ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                          {gatewayForm.enabled === "true" ? "Enabled" : "Disabled"}
                        </button>
                        <p className="text-xs text-[#475569] mt-1.5">Toggle to temporarily disable card checkout without removing credentials</p>
                      </div>
                    </div>

                    <div className="pt-2 flex justify-end">
                      <button
                        onClick={async () => {
                          setGatewayError(""); setGatewaySaved(false); setGatewaySaving(true);
                          try {
                            const payload: Record<string, string> = {
                              powertranz_spid: gatewayForm.spid,
                              powertranz_env: gatewayForm.env,
                              powertranz_enabled: gatewayForm.enabled,
                            };
                            if (gatewayForm.sppassword) payload["powertranz_sppassword"] = gatewayForm.sppassword;
                            await superadminUpdateGatewaySettings(payload);
                            setGatewaySaved(true);
                            await loadGateway();
                            setTimeout(() => setGatewaySaved(false), 3000);
                          } catch (e) {
                            setGatewayError(e instanceof Error ? e.message : "Failed to save gateway settings");
                          } finally { setGatewaySaving(false); }
                        }}
                        disabled={gatewaySaving}
                        className="bg-[#3b82f6] hover:bg-blue-500 text-white font-semibold px-8 py-2.5 rounded-lg transition-colors disabled:opacity-60 flex items-center gap-2">
                        {gatewaySaving ? <><RefreshCw size={14} className="animate-spin" /> Saving…</> : <><Check size={14} /> Save Gateway Settings</>}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Info card */}
                <div className="bg-[#1a2332] border border-[#2a3a55] rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><KeyRound size={14} className="text-[#3b82f6]" /> Where to get your credentials</h3>
                  <ol className="space-y-2 text-sm text-[#94a3b8] list-decimal list-inside">
                    <li>Log into your <span className="text-white font-medium">PowerTranz Merchant Portal</span></li>
                    <li>Navigate to <span className="text-white font-medium">Settings → API Credentials</span></li>
                    <li>Copy your <span className="text-white font-medium">SP ID</span> and <span className="text-white font-medium">SP Password</span></li>
                    <li>Use <span className="text-amber-400 font-medium">Staging</span> for testing, then switch to <span className="text-green-400 font-medium">Production</span> when ready to go live</li>
                  </ol>
                  <p className="text-xs text-[#475569] mt-3">PowerTranz supports Visa, Mastercard, and major Caribbean card networks.</p>
                </div>
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
