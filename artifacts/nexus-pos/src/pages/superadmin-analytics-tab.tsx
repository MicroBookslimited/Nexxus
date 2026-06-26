import { useState, useEffect, useCallback } from "react";
import {
  Activity, AlertTriangle, ArrowLeft, BarChart3, Database, RefreshCw,
  Search, TrendingUp, Users, Zap, HardDrive, Clock, ChevronRight,
  Bell, CheckCircle2, XCircle, RotateCcw,
} from "lucide-react";
import {
  superadminAnalyticsOverview,
  superadminAnalyticsTenants,
  superadminAnalyticsTenantDetail,
  superadminAnalyticsRunSnapshots,
  superadminAnalyticsAlerts,
  superadminAnalyticsGenerateAlerts,
  superadminAnalyticsUpdateAlert,
  type AnalyticsOverview,
  type AnalyticsTenantRow,
  type AnalyticsTenantDetail,
  type AnalyticsActivityLabel,
  type AnalyticsRiskLabel,
  type AnalyticsTenantsQuery,
  type AnalyticsAlert,
  type AnalyticsAlertsResult,
  type AlertSeverity,
} from "../lib/saas-api";

const card = "bg-[#1a2332] border border-[#2a3a55] rounded-xl";

function activityColor(label: AnalyticsActivityLabel): string {
  switch (label) {
    case "active": return "text-emerald-400 bg-emerald-500/10 border-emerald-500/30";
    case "moderate": return "text-blue-400 bg-blue-500/10 border-blue-500/30";
    case "low": return "text-amber-400 bg-amber-500/10 border-amber-500/30";
    default: return "text-slate-400 bg-slate-500/10 border-slate-500/30";
  }
}
function riskColor(label: AnalyticsRiskLabel): string {
  switch (label) {
    case "high": return "text-rose-400 bg-rose-500/10 border-rose-500/30";
    case "medium": return "text-amber-400 bg-amber-500/10 border-amber-500/30";
    default: return "text-emerald-400 bg-emerald-500/10 border-emerald-500/30";
  }
}
function severityColor(sev: string): string {
  switch (sev) {
    case "critical": return "text-rose-400 bg-rose-500/10 border-rose-500/30";
    case "high": return "text-orange-400 bg-orange-500/10 border-orange-500/30";
    case "medium": return "text-amber-400 bg-amber-500/10 border-amber-500/30";
    default: return "text-blue-400 bg-blue-500/10 border-blue-500/30";
  }
}
function scoreBarColor(score: number): string {
  if (score >= 60) return "bg-emerald-500";
  if (score >= 30) return "bg-blue-500";
  if (score >= 10) return "bg-amber-500";
  return "bg-slate-500";
}
function fmtNum(n: number): string {
  return n.toLocaleString();
}
function fmtMoney(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
function daysLabel(d: number | null): string {
  if (d == null) return "No activity";
  if (d === 0) return "Today";
  if (d === 1) return "Yesterday";
  return `${d}d ago`;
}

function Kpi({ icon: Icon, label, value, sub, accent }: { icon: React.ElementType; label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className={`${card} p-5`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[#94a3b8] text-sm">{label}</span>
        <Icon className={`w-5 h-5 ${accent ?? "text-[#3b82f6]"}`} />
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
      {sub && <div className="text-xs text-[#64748b] mt-1">{sub}</div>}
    </div>
  );
}

function ScoreBar({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-[#0f1623] rounded-full overflow-hidden min-w-[48px]">
        <div className={`h-full ${scoreBarColor(score)}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs text-[#94a3b8] tabular-nums w-7 text-right">{score}</span>
    </div>
  );
}

function TenantDetailView({ tenantId, onBack }: { tenantId: number; onBack: () => void }) {
  const [detail, setDetail] = useState<AnalyticsTenantDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    superadminAnalyticsTenantDetail(tenantId)
      .then((d) => { if (active) { setDetail(d); setError(null); } })
      .catch((e) => { if (active) setError(e instanceof Error ? e.message : "Failed to load"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [tenantId]);

  if (loading) return <div className="text-[#94a3b8] py-12 text-center">Loading tenant detail…</div>;
  if (error || !detail) return <div className="text-rose-400 py-12 text-center">{error ?? "Not found"}</div>;

  const t = detail.tenant;
  const maxTrend = Math.max(1, ...detail.salesTrend.map((p) => p.count));

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="flex items-center gap-2 text-[#94a3b8] hover:text-white text-sm">
        <ArrowLeft className="w-4 h-4" /> Back to tenant list
      </button>

      <div className={`${card} p-5`}>
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-xl font-bold text-white">{t.businessName}</h3>
            <p className="text-[#94a3b8] text-sm">{t.ownerName} · {t.email}</p>
            <p className="text-[#64748b] text-xs mt-1">
              {t.planName ?? "No plan"} · {t.subscriptionStatus ?? "—"} · Joined {fmtDate(t.createdAt)}
            </p>
          </div>
          <div className="flex gap-2">
            <span className={`px-3 py-1 rounded-full text-xs font-medium border ${activityColor(t.activityLabel)}`}>
              {t.activityLabel} · {t.activityScore}
            </span>
            <span className={`px-3 py-1 rounded-full text-xs font-medium border ${riskColor(t.riskLabel)}`}>
              {t.riskLabel} risk · {t.resourceRiskScore}
            </span>
          </div>
        </div>
      </div>

      {t.recommendations.length > 0 && (
        <div className={`${card} p-5`}>
          <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" /> Recommendations
          </h4>
          <ul className="space-y-2">
            {t.recommendations.map((r, i) => (
              <li key={i} className="text-sm text-[#cbd5e1] flex items-start gap-2">
                <ChevronRight className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" /> {r}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi icon={TrendingUp} label="Total Sales" value={fmtNum(t.salesCount)} sub={fmtMoney(t.salesTotal)} />
        <Kpi icon={Activity} label="Sales (30d)" value={fmtNum(t.salesCount30d)} sub={fmtMoney(t.salesTotal30d)} accent="text-emerald-400" />
        <Kpi icon={Database} label="Est. Rows" value={fmtNum(t.estimatedRowCount)} sub="estimate" accent="text-purple-400" />
        <Kpi icon={HardDrive} label="Est. Storage" value={`${t.estimatedStorageMb} MB`} sub="estimate" accent="text-purple-400" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className={`${card} p-5`}>
          <h4 className="text-white font-semibold mb-4">Resource Counts</h4>
          <div className="space-y-3 text-sm">
            {([
              ["Products", t.productCount, t.maxProducts, t.limitUsage.products],
              ["Staff", t.staffCount, t.maxStaff, t.limitUsage.staff],
              ["Locations", t.locationCount, t.maxLocations, t.limitUsage.locations],
              ["Customers", t.customerCount, null, null],
              ["Inventory Movements", t.inventoryMovementCount, null, null],
            ] as [string, number, number | null, number | null][]).map(([label, used, max, ratio]) => (
              <div key={label}>
                <div className="flex justify-between text-[#cbd5e1]">
                  <span>{label}</span>
                  <span className="tabular-nums">{fmtNum(used)}{max != null ? ` / ${fmtNum(max)}` : ""}</span>
                </div>
                {ratio != null && (
                  <div className="h-1.5 bg-[#0f1623] rounded-full overflow-hidden mt-1">
                    <div className={`h-full ${ratio >= 0.9 ? "bg-rose-500" : ratio >= 0.75 ? "bg-amber-500" : "bg-blue-500"}`}
                      style={{ width: `${Math.min(100, ratio * 100)}%` }} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className={`${card} p-5`}>
          <h4 className="text-white font-semibold mb-4">Feature Adoption</h4>
          <div className="grid grid-cols-2 gap-2">
            {detail.featureAdoption.map((f) => (
              <div key={f.key} className={`px-3 py-2 rounded-lg text-xs border flex items-center justify-between ${f.adopted ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-300" : "border-[#2a3a55] bg-[#0f1623] text-[#64748b]"}`}>
                {f.label}
                <span>{f.adopted ? "✓" : "—"}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={`${card} p-5`}>
        <h4 className="text-white font-semibold mb-4">Sales — last 14 days</h4>
        {detail.salesTrend.length === 0 ? (
          <p className="text-[#64748b] text-sm">No sales in this window.</p>
        ) : (
          <div className="flex items-end gap-1 h-32">
            {detail.salesTrend.map((p) => (
              <div key={p.date} className="flex-1 flex flex-col items-center gap-1 group">
                <div className="w-full bg-[#3b82f6] hover:bg-[#60a5fa] rounded-t transition-colors relative"
                  style={{ height: `${(p.count / maxTrend) * 100}%`, minHeight: "2px" }}>
                  <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] text-[#94a3b8] opacity-0 group-hover:opacity-100 whitespace-nowrap">
                    {p.count} · {fmtMoney(p.total)}
                  </span>
                </div>
                <span className="text-[9px] text-[#64748b] rotate-45 origin-left whitespace-nowrap mt-1">
                  {p.date.slice(5)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={`${card} p-5`}>
        <h4 className="text-white font-semibold mb-4 flex items-center gap-2">
          <Clock className="w-4 h-4 text-[#3b82f6]" /> Recent Activity Events
        </h4>
        {detail.recentEvents.length === 0 ? (
          <p className="text-[#64748b] text-sm">No tracked events yet (events accrue from logins and sales going forward).</p>
        ) : (
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {detail.recentEvents.map((e) => (
              <div key={e.id} className="flex items-center justify-between text-sm py-1.5 px-2 rounded hover:bg-[#0f1623]">
                <span className="text-[#cbd5e1] font-medium">{e.eventType}</span>
                <span className="text-[#64748b] text-xs">{new Date(e.createdAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AlertsCenter({ onSelectTenant }: { onSelectTenant: (tenantId: number) => void }) {
  const [data, setData] = useState<AnalyticsAlertsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"open" | "resolved" | "dismissed" | "all">("open");
  const [severityFilter, setSeverityFilter] = useState<AlertSeverity | "">("");
  const [generating, setGenerating] = useState(false);
  const [genMsg, setGenMsg] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await superadminAnalyticsAlerts({ status: statusFilter, severity: severityFilter });
      setData(res);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load alerts");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, severityFilter]);

  useEffect(() => { void load(); }, [load]);

  const generate = async () => {
    setGenerating(true);
    setGenMsg(null);
    try {
      const r = await superadminAnalyticsGenerateAlerts();
      setGenMsg(`${r.created} new · ${r.refreshed} updated · ${r.resolved} auto-resolved · ${r.openTotal} open.`);
      await load();
    } catch (e) {
      setGenMsg(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  const setStatus = async (a: AnalyticsAlert, status: "open" | "resolved" | "dismissed") => {
    setBusyId(a.id);
    try {
      await superadminAnalyticsUpdateAlert(a.id, { status });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update alert");
    } finally {
      setBusyId(null);
    }
  };

  const summary = data?.summary;
  const statusTabs: { key: "open" | "resolved" | "dismissed" | "all"; label: string; count?: number }[] = [
    { key: "open", label: "Open", count: summary?.open },
    { key: "resolved", label: "Resolved", count: summary?.resolved },
    { key: "dismissed", label: "Dismissed", count: summary?.dismissed },
    { key: "all", label: "All" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {statusTabs.map((t) => (
            <button key={t.key} onClick={() => setStatusFilter(t.key)}
              className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                statusFilter === t.key
                  ? "bg-[#3b82f6]/15 border-[#3b82f6]/50 text-white"
                  : "bg-[#1a2332] border-[#2a3a55] text-[#94a3b8] hover:border-[#3b82f6]/40"
              }`}>
              {t.label}{t.count != null ? ` (${t.count})` : ""}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {genMsg && <span className="text-xs text-[#94a3b8]">{genMsg}</span>}
          <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value as AlertSeverity | "")}
            className="bg-[#0f1623] border border-[#2a3a55] rounded-lg px-3 py-2 text-sm text-[#cbd5e1] focus:outline-none focus:border-[#3b82f6]">
            <option value="">All severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <button onClick={generate} disabled={generating}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#3b82f6] hover:bg-[#2563eb] text-sm text-white disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${generating ? "animate-spin" : ""}`} /> {generating ? "Generating…" : "Generate alerts now"}
          </button>
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {(["critical", "high", "medium", "low"] as AlertSeverity[]).map((sev) => (
            <div key={sev} className={`${card} p-4`}>
              <div className="flex items-center justify-between">
                <span className={`px-2 py-0.5 rounded text-xs border capitalize ${severityColor(sev)}`}>{sev}</span>
                <span className="text-2xl font-bold text-white tabular-nums">{summary.bySeverity[sev]}</span>
              </div>
              <div className="text-xs text-[#64748b] mt-2">open</div>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="text-[#94a3b8] py-12 text-center">Loading alerts…</div>
      ) : error ? (
        <div className="text-rose-400 py-12 text-center">{error}</div>
      ) : !data || data.alerts.length === 0 ? (
        <div className={`${card} p-10 text-center`}>
          <Bell className="w-8 h-8 text-[#64748b] mx-auto mb-3" />
          <p className="text-[#94a3b8]">No {statusFilter !== "all" ? statusFilter : ""} alerts.</p>
          <p className="text-[#64748b] text-xs mt-1">Run “Generate alerts now” to scan all tenants for current issues.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {data.alerts.map((a) => (
            <div key={a.id} className={`${card} p-4 flex items-start gap-3`}>
              <span className={`px-2 py-0.5 rounded text-xs border capitalize shrink-0 mt-0.5 ${severityColor(a.severity)}`}>
                {a.severity}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-white font-semibold">{a.title}</span>
                  <button onClick={() => onSelectTenant(a.tenantId)}
                    className="text-[#3b82f6] hover:underline text-sm truncate">
                    {a.businessName ?? `Tenant #${a.tenantId}`}
                  </button>
                  {a.status !== "open" && (
                    <span className="text-[10px] uppercase tracking-wide text-[#64748b] border border-[#2a3a55] rounded px-1.5 py-0.5">
                      {a.status}
                    </span>
                  )}
                </div>
                <p className="text-sm text-[#cbd5e1] mt-1">{a.message}</p>
                <div className="text-xs text-[#64748b] mt-1.5">
                  Raised {new Date(a.createdAt).toLocaleString()}
                  {a.resolvedAt ? ` · closed ${new Date(a.resolvedAt).toLocaleString()}` : ""}
                  {a.note ? ` · ${a.note}` : ""}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {a.status === "open" ? (
                  <>
                    <button onClick={() => setStatus(a, "resolved")} disabled={busyId === a.id}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Resolve
                    </button>
                    <button onClick={() => setStatus(a, "dismissed")} disabled={busyId === a.id}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs bg-slate-500/10 border border-slate-500/30 text-slate-300 hover:bg-slate-500/20 disabled:opacity-50">
                      <XCircle className="w-3.5 h-3.5" /> Dismiss
                    </button>
                  </>
                ) : (
                  <button onClick={() => setStatus(a, "open")} disabled={busyId === a.id}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs bg-[#1a2332] border border-[#2a3a55] text-[#cbd5e1] hover:border-[#3b82f6]/50 disabled:opacity-50">
                    <RotateCcw className="w-3.5 h-3.5" /> Reopen
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function SuperadminAnalyticsTab() {
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [tenants, setTenants] = useState<AnalyticsTenantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [snapshotMsg, setSnapshotMsg] = useState<string | null>(null);
  const [view, setView] = useState<"dashboard" | "alerts">("dashboard");

  const [search, setSearch] = useState("");
  const [activityFilter, setActivityFilter] = useState<AnalyticsActivityLabel | "">("");
  const [riskFilter, setRiskFilter] = useState<AnalyticsRiskLabel | "">("");
  const [sort, setSort] = useState<NonNullable<AnalyticsTenantsQuery["sort"]>>("activityScore");

  const loadList = useCallback(async () => {
    const query: AnalyticsTenantsQuery = { sort, dir: "desc" };
    if (search.trim()) query.search = search.trim();
    if (activityFilter) query.activity = activityFilter;
    if (riskFilter) query.risk = riskFilter;
    const res = await superadminAnalyticsTenants(query);
    setTenants(res.tenants);
  }, [search, activityFilter, riskFilter, sort]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [ov] = await Promise.all([superadminAnalyticsOverview(), loadList()]);
      setOverview(ov);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, [loadList]);

  useEffect(() => { void loadAll(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  useEffect(() => {
    const t = setTimeout(() => { void loadList().catch(() => {}); }, 300);
    return () => clearTimeout(t);
  }, [loadList]);

  const runSnapshots = async () => {
    setRunning(true);
    setSnapshotMsg(null);
    try {
      const r = await superadminAnalyticsRunSnapshots();
      setSnapshotMsg(`Snapshot saved for ${r.tenants} tenants (${r.snapshotDate}).`);
    } catch (e) {
      setSnapshotMsg(e instanceof Error ? e.message : "Snapshot failed");
    } finally {
      setRunning(false);
    }
  };

  if (selected != null) {
    return <TenantDetailView tenantId={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-[#3b82f6]" /> Analytics &amp; Usage Monitoring
          </h2>
          <p className="text-[#64748b] text-xs mt-1">
            Storage &amp; row figures are estimates for capacity planning, not billed measurements.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {view === "dashboard" && snapshotMsg && <span className="text-xs text-[#94a3b8]">{snapshotMsg}</span>}
          {view === "dashboard" && (
            <>
              <button onClick={runSnapshots} disabled={running}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#1a2332] border border-[#2a3a55] hover:border-[#3b82f6]/50 text-sm text-[#cbd5e1] disabled:opacity-50">
                <Database className={`w-4 h-4 ${running ? "animate-pulse" : ""}`} /> {running ? "Saving…" : "Save Snapshot"}
              </button>
              <button onClick={() => void loadAll()}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#1a2332] border border-[#2a3a55] hover:border-[#3b82f6]/50 text-sm text-[#cbd5e1]">
                <RefreshCw className="w-4 h-4" /> Refresh
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button onClick={() => setView("dashboard")}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm border transition-colors ${
            view === "dashboard"
              ? "bg-[#3b82f6]/15 border-[#3b82f6]/50 text-white"
              : "bg-[#1a2332] border-[#2a3a55] text-[#94a3b8] hover:border-[#3b82f6]/40"
          }`}>
          <BarChart3 className="w-4 h-4" /> Dashboard
        </button>
        <button onClick={() => setView("alerts")}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm border transition-colors ${
            view === "alerts"
              ? "bg-[#3b82f6]/15 border-[#3b82f6]/50 text-white"
              : "bg-[#1a2332] border-[#2a3a55] text-[#94a3b8] hover:border-[#3b82f6]/40"
          }`}>
          <Bell className="w-4 h-4" /> Alerts Center
          {overview && overview.alerts && (overview.alerts.pastDue + overview.alerts.dormant + overview.alerts.trialEnding + overview.alerts.nearLimit) > 0 && (
            <span className="text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-full px-1.5 py-0.5 tabular-nums">
              {overview.alerts.pastDue + overview.alerts.dormant + overview.alerts.trialEnding + overview.alerts.nearLimit}
            </span>
          )}
        </button>
      </div>

      {view === "alerts" ? (
        <AlertsCenter onSelectTenant={(id) => setSelected(id)} />
      ) : loading ? (
        <div className="text-[#94a3b8] py-12 text-center">Loading analytics…</div>
      ) : error ? (
        <div className="text-rose-400 py-12 text-center">{error}</div>
      ) : (
      <>
      {overview && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi icon={Users} label="Total Tenants" value={fmtNum(overview.totals.tenants)}
              sub={`${overview.totals.activeSubscriptions} active · ${overview.totals.trialSubscriptions} trial`} />
            <Kpi icon={Zap} label="Active Today" value={fmtNum(overview.activity.activeToday)}
              sub={`${overview.activity.active7d} in 7d · ${overview.activity.active30d} in 30d`} accent="text-emerald-400" />
            <Kpi icon={Activity} label="Avg Activity Score" value={`${overview.activity.avgActivityScore}`}
              sub={`${overview.activity.dormant} dormant`} accent="text-blue-400" />
            <Kpi icon={Database} label="Est. Total Rows" value={fmtNum(overview.resource.totalEstimatedRows)}
              sub={`~${overview.resource.totalEstimatedStorageMb} MB est.`} accent="text-purple-400" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className={`${card} p-5`}>
              <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" /> Attention Needed
              </h4>
              <div className="space-y-2 text-sm">
                {[
                  ["Dormant (paying/trial)", overview.alerts.dormant, "text-slate-300"],
                  ["Trials ending ≤5d", overview.alerts.trialEnding, "text-amber-300"],
                  ["Past due", overview.alerts.pastDue, "text-rose-300"],
                  ["Near a plan limit", overview.alerts.nearLimit, "text-blue-300"],
                ].map(([label, val, color]) => (
                  <div key={label as string} className="flex justify-between items-center">
                    <span className="text-[#94a3b8]">{label}</span>
                    <span className={`font-semibold tabular-nums ${color}`}>{val as number}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className={`${card} p-5`}>
              <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-purple-400" /> Cost Risk Mix
              </h4>
              <div className="space-y-2 text-sm">
                {([["low", overview.resource.costRisk.low], ["medium", overview.resource.costRisk.medium], ["high", overview.resource.costRisk.high]] as [AnalyticsRiskLabel, number][]).map(([label, val]) => (
                  <div key={label} className="flex justify-between items-center">
                    <span className={`px-2 py-0.5 rounded text-xs border ${riskColor(label)}`}>{label}</span>
                    <span className="font-semibold text-white tabular-nums">{val}</span>
                  </div>
                ))}
                <div className="pt-2 mt-2 border-t border-[#2a3a55] text-xs text-[#64748b]">
                  Avg resource risk score: {overview.resource.avgResourceRiskScore}
                </div>
              </div>
            </div>

            <div className={`${card} p-5`}>
              <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
                <Database className="w-4 h-4 text-purple-400" /> Heaviest Tenants
              </h4>
              <div className="space-y-1.5">
                {overview.resource.topResourceTenants.slice(0, 6).map((t) => (
                  <button key={t.tenantId} onClick={() => setSelected(t.tenantId)}
                    className="w-full flex justify-between items-center text-sm py-1.5 px-2 rounded hover:bg-[#0f1623] text-left">
                    <span className="text-[#cbd5e1] truncate mr-2">{t.businessName}</span>
                    <span className="text-[#64748b] text-xs tabular-nums shrink-0">{fmtNum(t.estimatedRowCount)}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      <div className={`${card} p-5`}>
        <div className="flex items-center gap-3 flex-wrap mb-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-[#64748b] absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search business, owner, email…"
              className="w-full bg-[#0f1623] border border-[#2a3a55] rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder:text-[#64748b] focus:outline-none focus:border-[#3b82f6]" />
          </div>
          <select value={activityFilter} onChange={(e) => setActivityFilter(e.target.value as AnalyticsActivityLabel | "")}
            className="bg-[#0f1623] border border-[#2a3a55] rounded-lg px-3 py-2 text-sm text-[#cbd5e1] focus:outline-none focus:border-[#3b82f6]">
            <option value="">All activity</option>
            <option value="active">Active</option>
            <option value="moderate">Moderate</option>
            <option value="low">Low</option>
            <option value="dormant">Dormant</option>
          </select>
          <select value={riskFilter} onChange={(e) => setRiskFilter(e.target.value as AnalyticsRiskLabel | "")}
            className="bg-[#0f1623] border border-[#2a3a55] rounded-lg px-3 py-2 text-sm text-[#cbd5e1] focus:outline-none focus:border-[#3b82f6]">
            <option value="">All risk</option>
            <option value="high">High risk</option>
            <option value="medium">Medium risk</option>
            <option value="low">Low risk</option>
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value as NonNullable<AnalyticsTenantsQuery["sort"]>)}
            className="bg-[#0f1623] border border-[#2a3a55] rounded-lg px-3 py-2 text-sm text-[#cbd5e1] focus:outline-none focus:border-[#3b82f6]">
            <option value="activityScore">Sort: Activity score</option>
            <option value="resourceRiskScore">Sort: Resource risk</option>
            <option value="salesTotal">Sort: Total sales</option>
            <option value="salesCount30d">Sort: Sales (30d)</option>
            <option value="createdAt">Sort: Newest</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[#64748b] text-xs border-b border-[#2a3a55]">
                <th className="text-left font-medium py-2 px-2">Business</th>
                <th className="text-left font-medium py-2 px-2">Plan</th>
                <th className="text-left font-medium py-2 px-2 w-32">Activity</th>
                <th className="text-left font-medium py-2 px-2">Last seen</th>
                <th className="text-right font-medium py-2 px-2">Sales 30d</th>
                <th className="text-left font-medium py-2 px-2">Risk</th>
                <th className="text-right font-medium py-2 px-2">Est. rows</th>
                <th className="py-2 px-2"></th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t.tenantId} onClick={() => setSelected(t.tenantId)}
                  className="border-b border-[#1e293b] hover:bg-[#0f1623] cursor-pointer">
                  <td className="py-2.5 px-2">
                    <div className="text-white font-medium">{t.businessName}</div>
                    <div className="text-[#64748b] text-xs">{t.email}</div>
                  </td>
                  <td className="py-2.5 px-2 text-[#94a3b8]">
                    <div>{t.planName ?? "—"}</div>
                    <div className="text-xs text-[#64748b]">{t.subscriptionStatus ?? "—"}</div>
                  </td>
                  <td className="py-2.5 px-2"><ScoreBar score={t.activityScore} /></td>
                  <td className="py-2.5 px-2 text-[#94a3b8] text-xs">{daysLabel(t.daysSinceActivity)}</td>
                  <td className="py-2.5 px-2 text-right text-[#cbd5e1] tabular-nums">{fmtNum(t.salesCount30d)}</td>
                  <td className="py-2.5 px-2">
                    <span className={`px-2 py-0.5 rounded text-xs border ${riskColor(t.riskLabel)}`}>{t.riskLabel}</span>
                  </td>
                  <td className="py-2.5 px-2 text-right text-[#94a3b8] tabular-nums">{fmtNum(t.estimatedRowCount)}</td>
                  <td className="py-2.5 px-2 text-right"><ChevronRight className="w-4 h-4 text-[#64748b] inline" /></td>
                </tr>
              ))}
              {tenants.length === 0 && (
                <tr><td colSpan={8} className="text-center text-[#64748b] py-8">No tenants match your filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      </>
      )}
    </div>
  );
}
