import { useEffect, useState, useCallback } from "react";
import {
  Wrench, Search, RefreshCw, CheckCircle, XCircle, KeyRound, Trash2,
  UserPlus, X, Building2, Pause, Play, Users,
} from "lucide-react";
import {
  superadminListTechnicians,
  superadminGetTechnician,
  superadminPatchTechnician,
  superadminDeleteTechnician,
  superadminResetTechnicianPassword,
  superadminAssignTechnician,
  superadminUnassignTechnician,
  superadminSearchTenantsLite,
  type TechnicianRow,
  type TechnicianDetail,
  type TenantLite,
} from "@/lib/saas-api";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    approved: "bg-green-500/15 text-green-400 border-green-500/30",
    suspended: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
    rejected: "bg-red-500/15 text-red-400 border-red-500/30",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border ${map[status] ?? map["pending"]}`}>
      {status}
    </span>
  );
}

function ResetPwModal({ tech, onClose }: { tech: TechnicianRow; onClose: () => void }) {
  const [pw, setPw] = useState("");
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setErr(""); setLoading(true);
    try {
      await superadminResetTechnicianPassword(tech.id, pw);
      setDone(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-[#1a2332] border border-[#2a3a55] rounded-xl p-5 w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-white text-sm">Reset password — {tech.name}</h3>
          <button onClick={onClose} className="text-[#94a3b8] hover:text-white"><X size={16} /></button>
        </div>
        {done ? (
          <>
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 text-green-400 text-sm mb-3">
              Password updated.
            </div>
            <button onClick={onClose} className="w-full bg-[#3b82f6] text-white rounded-lg py-2 text-sm font-semibold">Close</button>
          </>
        ) : (
          <>
            <label className="block text-xs text-[#94a3b8] mb-1">New password (min 8 chars)</label>
            <input type="password" value={pw} onChange={e => setPw(e.target.value)} minLength={8}
              className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-3 py-2 text-white text-sm mb-3" />
            {err && <div className="text-xs text-red-400 mb-2">{err}</div>}
            <button disabled={loading || pw.length < 8} onClick={submit}
              className="w-full bg-[#3b82f6] text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-50">
              {loading ? "Saving…" : "Set password"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function AssignmentsModal({ techId, onClose }: { techId: number; onClose: () => void }) {
  const [detail, setDetail] = useState<TechnicianDetail | null>(null);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<TenantLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const reload = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const d = await superadminGetTechnician(techId);
      setDetail(d);
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); }
    finally { setLoading(false); }
  }, [techId]);

  useEffect(() => { void reload(); }, [reload]);

  useEffect(() => {
    let cancelled = false;
    const id = setTimeout(() => {
      superadminSearchTenantsLite(search.trim() || undefined)
        .then(r => { if (!cancelled) setResults(r); })
        .catch(() => {});
    }, 250);
    return () => { cancelled = true; clearTimeout(id); };
  }, [search]);

  const assignedIds = new Set((detail?.assignments ?? []).map(a => a.tenantId));

  async function add(tenantId: number) {
    setBusy(true); setErr("");
    try { await superadminAssignTechnician(techId, tenantId); await reload(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  }
  async function remove(tenantId: number) {
    setBusy(true); setErr("");
    try { await superadminUnassignTechnician(techId, tenantId); await reload(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-[#1a2332] border border-[#2a3a55] rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#2a3a55]">
          <div>
            <h3 className="font-semibold text-white text-sm">Manage assignments</h3>
            {detail && <p className="text-xs text-[#94a3b8]">{detail.name} • {detail.email}</p>}
          </div>
          <button onClick={onClose} className="text-[#94a3b8] hover:text-white"><X size={16} /></button>
        </div>

        {err && <div className="mx-5 mt-3 text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-2">{err}</div>}

        <div className="grid md:grid-cols-2 gap-0 flex-1 overflow-hidden">
          {/* Assigned */}
          <div className="border-r border-[#2a3a55] p-4 overflow-y-auto">
            <h4 className="text-xs uppercase tracking-wide text-[#475569] mb-2">Currently assigned ({detail?.assignments.length ?? 0})</h4>
            {loading ? (
              <p className="text-sm text-[#94a3b8]">Loading…</p>
            ) : detail && detail.assignments.length === 0 ? (
              <p className="text-sm text-[#94a3b8]">No assignments yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {detail?.assignments.map(a => (
                  <li key={a.id} className="flex items-center justify-between bg-[#0f1729] border border-[#2a3a55] rounded-lg px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm text-white truncate">{a.businessName}</p>
                      <p className="text-xs text-[#94a3b8] truncate">{a.email}</p>
                    </div>
                    <button onClick={() => remove(a.tenantId)} disabled={busy}
                      className="text-red-400 hover:text-red-300 disabled:opacity-50 p-1.5">
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Add */}
          <div className="p-4 overflow-y-auto">
            <h4 className="text-xs uppercase tracking-wide text-[#475569] mb-2">Add a customer</h4>
            <div className="relative mb-3">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#475569]" />
              <input
                placeholder="Search businesses…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg pl-8 pr-3 py-2 text-white text-sm"
              />
            </div>
            <ul className="space-y-1.5">
              {results.filter(r => !assignedIds.has(r.id)).map(r => (
                <li key={r.id} className="flex items-center justify-between bg-[#0f1729] border border-[#2a3a55] rounded-lg px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm text-white truncate">{r.businessName}</p>
                    <p className="text-xs text-[#94a3b8] truncate">{r.email}</p>
                  </div>
                  <button onClick={() => add(r.id)} disabled={busy}
                    className="text-[#3b82f6] hover:text-blue-400 disabled:opacity-50 p-1.5">
                    <UserPlus size={14} />
                  </button>
                </li>
              ))}
              {results.length === 0 && <li className="text-sm text-[#475569]">No matches.</li>}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TechniciansTab() {
  const [list, setList] = useState<TechnicianRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [resetTarget, setResetTarget] = useState<TechnicianRow | null>(null);
  const [assignTarget, setAssignTarget] = useState<TechnicianRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await superadminListTechnicians();
      setList(r);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function setStatus(t: TechnicianRow, status: TechnicianRow["status"]) {
    await superadminPatchTechnician(t.id, { status });
    await load();
  }
  async function destroy(t: TechnicianRow) {
    if (!confirm(`Delete technician "${t.name}"? Their assignments will be removed.`)) return;
    await superadminDeleteTechnician(t.id);
    await load();
  }

  const filtered = list.filter(t => {
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!t.name.toLowerCase().includes(q) && !t.email.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const pending = list.filter(t => t.status === "pending");

  return (
    <>
      {resetTarget && <ResetPwModal tech={resetTarget} onClose={() => setResetTarget(null)} />}
      {assignTarget && <AssignmentsModal techId={assignTarget.id} onClose={() => { setAssignTarget(null); void load(); }} />}

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
            <Wrench size={20} /> Technicians
          </h1>
          <p className="text-[#94a3b8] text-sm">Manage installer accounts and customer assignments</p>
        </div>
        <button onClick={load} className="text-[#94a3b8] hover:text-white p-2">
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Pending approvals */}
      {pending.length > 0 && (
        <div className="bg-amber-500/5 border border-amber-500/30 rounded-xl p-4 mb-6">
          <h2 className="text-sm font-semibold text-amber-400 mb-3">
            Pending approval ({pending.length})
          </h2>
          <div className="space-y-2">
            {pending.map(t => (
              <div key={t.id} className="flex items-center justify-between bg-[#1a2332] border border-[#2a3a55] rounded-lg px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm text-white truncate">{t.name}</p>
                  <p className="text-xs text-[#94a3b8] truncate">{t.email}{t.phone ? ` • ${t.phone}` : ""}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => setStatus(t, "approved")}
                    className="bg-green-600 hover:bg-green-500 text-white text-xs font-semibold rounded-lg px-3 py-1.5 flex items-center gap-1.5">
                    <CheckCircle size={12} /> Approve
                  </button>
                  <button onClick={() => setStatus(t, "rejected")}
                    className="bg-red-600/80 hover:bg-red-500 text-white text-xs font-semibold rounded-lg px-3 py-1.5 flex items-center gap-1.5">
                    <XCircle size={12} /> Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#475569]" />
          <input
            placeholder="Search name or email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-[#1a2332] border border-[#2a3a55] rounded-lg pl-8 pr-3 py-2 text-white text-sm"
          />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="bg-[#1a2332] border border-[#2a3a55] rounded-lg px-3 py-2 text-white text-sm">
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="suspended">Suspended</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {/* List */}
      <div className="bg-[#1a2332] border border-[#2a3a55] rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-[#94a3b8] text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-[#94a3b8] text-sm">No technicians.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#0f1729] border-b border-[#2a3a55] text-xs uppercase text-[#475569]">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Technician</th>
                  <th className="text-left px-4 py-2 font-medium">Status</th>
                  <th className="text-left px-4 py-2 font-medium hidden sm:table-cell">Customers</th>
                  <th className="text-left px-4 py-2 font-medium hidden md:table-cell">Last login</th>
                  <th className="text-right px-4 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => (
                  <tr key={t.id} className="border-b border-[#2a3a55]/50 hover:bg-[#0f1729]/50">
                    <td className="px-4 py-2.5">
                      <div className="text-sm text-white">{t.name}</div>
                      <div className="text-xs text-[#94a3b8]">{t.email}</div>
                    </td>
                    <td className="px-4 py-2.5"><StatusBadge status={t.status} /></td>
                    <td className="px-4 py-2.5 hidden sm:table-cell">
                      <span className="text-sm text-white inline-flex items-center gap-1">
                        <Users size={12} className="text-[#94a3b8]" /> {t.assignmentCount}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 hidden md:table-cell text-xs text-[#94a3b8]">
                      {t.lastLoginAt ? new Date(t.lastLoginAt).toLocaleString() : "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1 justify-end">
                        <button title="Manage assignments" onClick={() => setAssignTarget(t)}
                          className="p-1.5 text-[#94a3b8] hover:text-white hover:bg-[#2a3a55] rounded-lg" disabled={t.status !== "approved"}>
                          <Building2 size={14} />
                        </button>
                        {t.status === "approved" ? (
                          <button title="Suspend" onClick={() => setStatus(t, "suspended")}
                            className="p-1.5 text-[#94a3b8] hover:text-amber-400 hover:bg-[#2a3a55] rounded-lg">
                            <Pause size={14} />
                          </button>
                        ) : (
                          <button title="Approve / reactivate" onClick={() => setStatus(t, "approved")}
                            className="p-1.5 text-[#94a3b8] hover:text-green-400 hover:bg-[#2a3a55] rounded-lg">
                            <Play size={14} />
                          </button>
                        )}
                        <button title="Reset password" onClick={() => setResetTarget(t)}
                          className="p-1.5 text-[#94a3b8] hover:text-white hover:bg-[#2a3a55] rounded-lg">
                          <KeyRound size={14} />
                        </button>
                        <button title="Delete" onClick={() => destroy(t)}
                          className="p-1.5 text-[#94a3b8] hover:text-red-400 hover:bg-[#2a3a55] rounded-lg">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
