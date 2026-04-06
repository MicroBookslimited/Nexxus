import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import {
  Users, TrendingUp, CreditCard, Activity, Search, ChevronDown,
  RefreshCw, LogOut, Zap, Shield, CheckCircle, XCircle, Clock,
  Eye, X, AlertTriangle,
} from "lucide-react";
import {
  SUPERADMIN_TOKEN_KEY, superadminLogin, superadminStats, superadminTenants, superadminUpdateTenant,
  type TenantRow,
} from "@/lib/saas-api";

type Stats = {
  totalTenants: number;
  activeSubscriptions: number;
  trialSubscriptions: number;
  mrr: number;
  arr: number;
  planBreakdown: { planName: string; count: number }[];
};

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
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0f1729] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-[#3b82f6] rounded-lg flex items-center justify-center">
              <Shield size={16} className="text-white" />
            </div>
            <span className="text-xl font-bold text-white">Nexus POS</span>
          </div>
          <p className="text-[#94a3b8] text-sm">Super Admin Panel</p>
        </div>
        <div className="bg-[#1a2332] border border-[#2a3a55] rounded-2xl p-8">
          <h2 className="text-xl font-bold text-white mb-6">Admin Sign In</h2>
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm mb-4">{error}</div>
          )}
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

/* ─── Stat Card ─── */
function StatCard({ label, value, sub, icon: Icon, color }: { label: string; value: string; sub?: string; icon: React.ElementType; color: string }) {
  return (
    <div className="bg-[#1a2332] border border-[#2a3a55] rounded-xl p-5">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
          <Icon size={20} className="text-white" />
        </div>
      </div>
      <div className="text-2xl font-bold text-white mb-0.5">{value}</div>
      <div className="text-sm text-[#94a3b8]">{label}</div>
      {sub && <div className="text-xs text-[#475569] mt-1">{sub}</div>}
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
function TenantModal({ tenant, plans, onClose, onUpdate }: {
  tenant: TenantRow;
  plans: { id: number; name: string }[];
  onClose: () => void;
  onUpdate: () => void;
}) {
  const [tenantStatus, setTenantStatus] = useState(tenant.status);
  const [subStatus, setSubStatus] = useState(tenant.subscriptionStatus ?? "trial");
  const [planId, setPlanId] = useState(tenant.planId ?? 0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await superadminUpdateTenant(tenant.id, {
        status: tenantStatus,
        subscriptionStatus: subStatus,
        ...(planId ? { planId } : {}),
      });
      setSaved(true);
      setTimeout(() => { setSaved(false); onUpdate(); }, 1000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#1a2332] border border-[#2a3a55] rounded-2xl w-full max-w-lg">
        <div className="flex items-center justify-between p-6 border-b border-[#2a3a55]">
          <div>
            <h3 className="text-lg font-bold text-white">{tenant.businessName}</h3>
            <p className="text-[#94a3b8] text-sm">{tenant.email}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-[#475569] hover:text-white hover:bg-[#2a3a55]">
            <X size={16} />
          </button>
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

/* ─── Main Dashboard ─── */
function SuperAdminDashboard({ onLogout }: { onLogout: () => void }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [filteredTenants, setFilteredTenants] = useState<TenantRow[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [selectedTenant, setSelectedTenant] = useState<TenantRow | null>(null);
  const [plans, setPlans] = useState<{ id: number; name: string }[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [s, t] = await Promise.all([superadminStats(), superadminTenants()]);
      setStats(s);
      setTenants(t);
      setFilteredTenants(t);
      const uniquePlans = Array.from(new Map(t.filter(x => x.planId && x.planName).map(x => [x.planId, { id: x.planId!, name: x.planName! }])).values());
      setPlans(uniquePlans);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    let list = tenants;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(t => t.businessName.toLowerCase().includes(q) || t.email.toLowerCase().includes(q) || t.ownerName.toLowerCase().includes(q));
    }
    if (statusFilter !== "all") {
      list = list.filter(t => (t.subscriptionStatus ?? "trial") === statusFilter);
    }
    setFilteredTenants(list);
  }, [search, statusFilter, tenants]);

  return (
    <div className="min-h-screen bg-[#0f1729]">
      {selectedTenant && (
        <TenantModal tenant={selectedTenant} plans={plans} onClose={() => setSelectedTenant(null)} onUpdate={loadData} />
      )}

      {/* Top bar */}
      <header className="bg-[#1a2332] border-b border-[#2a3a55] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#3b82f6] rounded-lg flex items-center justify-center">
            <Shield size={16} className="text-white" />
          </div>
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

      <div className="p-6 max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-[#94a3b8] text-sm">Manage all Nexus POS tenants and subscriptions</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard label="Total Tenants" value={String(stats?.totalTenants ?? "—")} icon={Users} color="bg-[#3b82f6]" />
          <StatCard label="Active" value={String(stats?.activeSubscriptions ?? "—")} sub={`${stats?.trialSubscriptions ?? 0} on trial`} icon={CheckCircle} color="bg-green-600" />
          <StatCard label="MRR" value={`$${stats?.mrr?.toFixed(0) ?? "—"}`} sub="Monthly recurring" icon={TrendingUp} color="bg-purple-600" />
          <StatCard label="ARR" value={`$${stats?.arr?.toFixed(0) ?? "—"}`} sub="Annual recurring" icon={CreditCard} color="bg-amber-600" />
        </div>

        {/* Plan breakdown */}
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

        {/* Tenant table */}
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
            <div className="p-12 text-center text-[#475569]">
              <RefreshCw size={24} className="animate-spin mx-auto mb-2" />
              Loading tenants…
            </div>
          ) : filteredTenants.length === 0 ? (
            <div className="p-12 text-center text-[#475569]">
              <Users size={32} className="mx-auto mb-2 opacity-40" />
              No tenants found
            </div>
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
                      <td className="px-4 py-3">
                        <div className="font-medium text-white">{t.businessName}</div>
                        <div className="text-xs text-[#475569]">{t.email}</div>
                      </td>
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

          <div className="px-4 py-3 border-t border-[#2a3a55] text-xs text-[#475569]">
            {filteredTenants.length} of {tenants.length} tenants
          </div>
        </div>

        <p className="text-center text-xs text-[#2a3a55] mt-8">Powered by MicroBooks</p>
      </div>
    </div>
  );
}

/* ─── Root Superadmin Export ─── */
export function Superadmin() {
  const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem(SUPERADMIN_TOKEN_KEY));

  function handleLogout() {
    localStorage.removeItem(SUPERADMIN_TOKEN_KEY);
    setIsLoggedIn(false);
  }

  if (!isLoggedIn) {
    return <SuperAdminLogin onLogin={() => setIsLoggedIn(true)} />;
  }

  return <SuperAdminDashboard onLogout={handleLogout} />;
}
