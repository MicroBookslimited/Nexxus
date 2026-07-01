import { useState, useEffect, useCallback } from "react";
import {
  RefreshCw, Search, X, ChevronDown, ChevronUp, Mail,
  Phone, User, Tag, AlertTriangle, Clock, CheckCircle,
  MessageSquare, Save, Settings2, LifeBuoy,
} from "lucide-react";
import {
  superadminGetSupportTickets,
  superadminUpdateSupportTicket,
  superadminGetSupportSettings,
  superadminUpdateSupportSettings,
  type SupportTicketRow,
} from "@/lib/saas-api";

const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: "bg-red-500/20 text-red-400 border-red-500/30",
  HIGH: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  NORMAL: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  LOW: "bg-slate-500/20 text-slate-400 border-slate-500/30",
};
const STATUS_COLORS: Record<string, string> = {
  open: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  resolved: "bg-green-500/20 text-green-400 border-green-500/30",
  closed: "bg-slate-500/20 text-slate-400 border-slate-500/30",
};

function fmtDate(s: string) {
  return new Date(s).toLocaleString("en-JM", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}

function PriorityBadge({ p }: { p: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${PRIORITY_COLORS[p] ?? "bg-slate-500/20 text-slate-400"}`}>
      {p}
    </span>
  );
}

function StatusBadge({ s }: { s: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${STATUS_COLORS[s] ?? "bg-slate-500/20 text-slate-400"}`}>
      {s}
    </span>
  );
}

function TicketDetail({
  ticket,
  onClose,
  onUpdated,
}: {
  ticket: SupportTicketRow;
  onClose: () => void;
  onUpdated: (t: SupportTicketRow) => void;
}) {
  const [status, setStatus] = useState(ticket.status);
  const [notes, setNotes] = useState(ticket.adminNotes ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await superadminUpdateSupportTicket(ticket.id, { status, adminNotes: notes });
      onUpdated(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  const steps = Array.isArray(ticket.stepsTaken) ? ticket.stepsTaken : [];
  const changed = status !== ticket.status || notes !== (ticket.adminNotes ?? "");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-[#1a2332] border border-[#2a3a55] rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2a3a55] sticky top-0 bg-[#1a2332] z-10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-amber-500/10 rounded-lg flex items-center justify-center">
              <LifeBuoy size={18} className="text-amber-400" />
            </div>
            <div>
              <div className="font-bold text-white font-mono">{ticket.ticketRef}</div>
              <div className="text-xs text-[#94a3b8]">{ticket.businessName}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <PriorityBadge p={ticket.priority} />
            <button onClick={onClose} className="p-1.5 rounded-lg text-[#475569] hover:text-white hover:bg-[#2a3a55] transition-colors ml-1">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Contact info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {ticket.contactName && (
              <div className="flex items-center gap-2 text-sm text-[#94a3b8]">
                <User size={14} className="shrink-0" />
                <span>{ticket.contactName}</span>
              </div>
            )}
            {ticket.contactEmail && (
              <div className="flex items-center gap-2 text-sm text-[#94a3b8]">
                <Mail size={14} className="shrink-0" />
                <a href={`mailto:${ticket.contactEmail}`} className="text-[#3b82f6] hover:underline">{ticket.contactEmail}</a>
              </div>
            )}
            {ticket.contactPhone && (
              <div className="flex items-center gap-2 text-sm text-[#94a3b8]">
                <Phone size={14} className="shrink-0" />
                <span>{ticket.contactPhone}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-sm text-[#94a3b8]">
              <Clock size={14} className="shrink-0" />
              <span>{fmtDate(ticket.createdAt)}</span>
            </div>
          </div>

          {/* Issue details */}
          <div className="bg-[#0f1729] rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#475569]">
              <Tag size={12} /> Issue Details
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div><span className="text-[#475569]">Category: </span><span className="text-[#94a3b8]">{ticket.category}</span></div>
              <div><span className="text-[#475569]">Sub-category: </span><span className="text-[#94a3b8]">{ticket.subCategory}</span></div>
              {ticket.impact && <div className="col-span-2"><span className="text-[#475569]">Impact: </span><span className="text-[#94a3b8]">{ticket.impact}</span></div>}
              {ticket.startedWhen && <div className="col-span-2"><span className="text-[#475569]">Started: </span><span className="text-[#94a3b8]">{ticket.startedWhen}</span></div>}
            </div>
            {steps.length > 0 && (
              <div>
                <div className="text-xs text-[#475569] mb-1">Steps taken:</div>
                <ul className="list-disc list-inside space-y-0.5">
                  {steps.map((step, i) => (
                    <li key={i} className="text-sm text-[#94a3b8]">{step}</li>
                  ))}
                </ul>
              </div>
            )}
            {ticket.additionalNotes && (
              <div>
                <div className="text-xs text-[#475569] mb-1">Additional notes:</div>
                <p className="text-sm text-[#94a3b8] whitespace-pre-wrap">{ticket.additionalNotes}</p>
              </div>
            )}
          </div>

          {/* Admin response area */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#475569]">
              <MessageSquare size={12} /> Admin Response
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-[#475569] mb-1">Status</label>
                <select
                  value={status}
                  onChange={e => setStatus(e.target.value)}
                  className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#3b82f6]"
                >
                  <option value="open">Open</option>
                  <option value="in_progress">In Progress</option>
                  <option value="resolved">Resolved</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs text-[#475569] mb-1">Internal notes / response</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={4}
                maxLength={4000}
                placeholder="Add notes about this ticket or what was done to resolve it…"
                className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-3 py-2 text-sm text-white placeholder-[#475569] focus:outline-none focus:border-[#3b82f6] resize-none"
              />
              <div className="text-right text-xs text-[#475569] mt-0.5">{notes.length}/4000</div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleSave}
                disabled={saving || !changed}
                className="flex items-center gap-2 px-4 py-2 bg-[#3b82f6] hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
              >
                {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                {saving ? "Saving…" : "Save"}
              </button>
              {saved && (
                <span className="flex items-center gap-1 text-green-400 text-sm">
                  <CheckCircle size={14} /> Saved
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SuperadminSupportTab() {
  const [tickets, setTickets] = useState<SupportTicketRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<SupportTicketRow | null>(null);

  const [inboxEmail, setInboxEmail] = useState("");
  const [inboxInput, setInboxInput] = useState("");
  const [inboxSaving, setInboxSaving] = useState(false);
  const [inboxSaved, setInboxSaved] = useState(false);
  const [inboxError, setInboxError] = useState("");
  const [showSettings, setShowSettings] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await superadminGetSupportTickets({
        status: statusFilter !== "all" ? statusFilter : undefined,
        priority: priorityFilter !== "all" ? priorityFilter : undefined,
        q: search.trim() || undefined,
      });
      setTickets(rows);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, priorityFilter, search]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    superadminGetSupportSettings().then(s => {
      setInboxEmail(s.supportInboxEmail);
      setInboxInput(s.supportInboxEmail);
    }).catch(() => {});
  }, []);

  async function saveInbox() {
    setInboxError(""); setInboxSaving(true);
    try {
      const res = await superadminUpdateSupportSettings({ supportInboxEmail: inboxInput.trim() });
      setInboxEmail(res.supportInboxEmail);
      setInboxInput(res.supportInboxEmail);
      setInboxSaved(true);
      setTimeout(() => setInboxSaved(false), 2500);
    } catch {
      setInboxError("Failed to save. Check the email and try again.");
    } finally {
      setInboxSaving(false);
    }
  }

  function handleUpdated(updated: SupportTicketRow) {
    setTickets(prev => prev.map(t => t.id === updated.id ? updated : t));
    setSelected(updated);
  }

  const openCount = tickets.filter(t => t.status === "open").length;
  const resolvedCount = tickets.filter(t => t.status === "resolved").length;

  const STATUS_TABS = [
    { id: "all", label: `All (${tickets.length})` },
    { id: "open", label: `Open (${openCount})` },
    { id: "resolved", label: `Resolved (${resolvedCount})` },
  ];

  return (
    <div>
      {selected && (
        <TicketDetail
          ticket={selected}
          onClose={() => setSelected(null)}
          onUpdated={handleUpdated}
        />
      )}

      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Support Tickets</h1>
          <p className="text-[#94a3b8] text-sm">All tenant-submitted support requests</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSettings(v => !v)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[#475569] hover:text-white hover:bg-[#2a3a55] transition-colors text-sm"
          >
            <Settings2 size={15} /> Settings
          </button>
          <button
            onClick={load}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[#475569] hover:text-white hover:bg-[#2a3a55] transition-colors"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div className="mb-6 bg-[#1a2332] border border-[#2a3a55] rounded-xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 bg-[#3b82f6]/10 rounded-lg flex items-center justify-center">
              <Mail size={16} className="text-[#3b82f6]" />
            </div>
            <div>
              <div className="font-semibold text-white text-sm">Support Inbox Email</div>
              <div className="text-xs text-[#94a3b8]">Ticket notification emails are sent to this address</div>
            </div>
          </div>
          {inboxError && (
            <div className="mb-3 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2 text-red-400 text-sm">{inboxError}</div>
          )}
          <div className="flex gap-3">
            <input
              type="email"
              value={inboxInput}
              onChange={e => setInboxInput(e.target.value)}
              placeholder="support@example.com"
              className="flex-1 bg-[#0f1729] border border-[#2a3a55] rounded-lg px-3 py-2 text-sm text-white placeholder-[#475569] focus:outline-none focus:border-[#3b82f6]"
            />
            <button
              onClick={saveInbox}
              disabled={inboxSaving || inboxInput.trim() === inboxEmail}
              className="flex items-center gap-2 px-4 py-2 bg-[#3b82f6] hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
            >
              {inboxSaving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
              {inboxSaving ? "Saving…" : "Save"}
            </button>
            {inboxSaved && (
              <span className="flex items-center gap-1 text-green-400 text-sm self-center">
                <CheckCircle size={14} /> Saved
              </span>
            )}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-[#1a2332] border border-[#2a3a55] rounded-xl mb-4 overflow-hidden">
        {/* Status tabs */}
        <div className="flex border-b border-[#2a3a55] px-4">
          {STATUS_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                statusFilter === tab.id
                  ? "border-[#3b82f6] text-white"
                  : "border-transparent text-[#475569] hover:text-[#94a3b8]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search + priority filter */}
        <div className="flex flex-col sm:flex-row gap-3 p-4">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#475569]" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by ticket ref, business, or category…"
              className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-[#475569] focus:outline-none focus:border-[#3b82f6]"
            />
          </div>
          <select
            value={priorityFilter}
            onChange={e => setPriorityFilter(e.target.value)}
            className="bg-[#0f1729] border border-[#2a3a55] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#3b82f6]"
          >
            <option value="all">All priorities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="NORMAL">Normal</option>
            <option value="LOW">Low</option>
          </select>
        </div>
      </div>

      {/* Ticket list */}
      {loading ? (
        <div className="py-16 text-center text-[#475569]">
          <RefreshCw size={22} className="animate-spin mx-auto mb-2" /> Loading tickets…
        </div>
      ) : tickets.length === 0 ? (
        <div className="py-16 text-center text-[#475569]">
          <LifeBuoy size={32} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">No tickets found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tickets.map(ticket => (
            <TicketRow
              key={ticket.id}
              ticket={ticket}
              onSelect={() => setSelected(ticket)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TicketRow({ ticket, onSelect }: { ticket: SupportTicketRow; onSelect: () => void }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-[#1a2332] border border-[#2a3a55] rounded-xl overflow-hidden hover:border-[#3b82f6]/30 transition-colors">
      {/* Summary row */}
      <div
        className="flex items-center gap-3 px-4 py-3.5 cursor-pointer select-none"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="min-w-0 flex-1 grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-[#3b82f6] font-semibold shrink-0">{ticket.ticketRef}</span>
            <span className="text-sm text-white truncate">{ticket.businessName}</span>
          </div>
          <div className="text-sm text-[#94a3b8] truncate">
            {ticket.category} / {ticket.subCategory}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <PriorityBadge p={ticket.priority} />
            <StatusBadge s={ticket.status} />
            <span className="text-xs text-[#475569] ml-auto hidden sm:block">{fmtDate(ticket.createdAt)}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={e => { e.stopPropagation(); onSelect(); }}
            className="px-3 py-1.5 bg-[#3b82f6]/10 hover:bg-[#3b82f6]/20 text-[#3b82f6] rounded-lg text-xs font-medium transition-colors"
          >
            Respond
          </button>
          {expanded ? <ChevronUp size={15} className="text-[#475569]" /> : <ChevronDown size={15} className="text-[#475569]" />}
        </div>
      </div>

      {/* Expanded preview */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-[#2a3a55] pt-3 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div className="space-y-2">
            {ticket.contactName && (
              <div className="flex items-center gap-2 text-[#94a3b8]">
                <User size={13} className="shrink-0 text-[#475569]" /> {ticket.contactName}
              </div>
            )}
            {ticket.contactEmail && (
              <div className="flex items-center gap-2 text-[#94a3b8]">
                <Mail size={13} className="shrink-0 text-[#475569]" />
                <a href={`mailto:${ticket.contactEmail}`} className="text-[#3b82f6] hover:underline" onClick={e => e.stopPropagation()}>{ticket.contactEmail}</a>
              </div>
            )}
            {ticket.contactPhone && (
              <div className="flex items-center gap-2 text-[#94a3b8]">
                <Phone size={13} className="shrink-0 text-[#475569]" /> {ticket.contactPhone}
              </div>
            )}
          </div>
          <div className="space-y-2">
            {ticket.impact && (
              <div className="flex items-center gap-2 text-[#94a3b8]">
                <AlertTriangle size={13} className="shrink-0 text-[#475569]" /> {ticket.impact}
              </div>
            )}
            {ticket.adminNotes && (
              <div className="bg-[#0f1729] rounded-lg px-3 py-2 text-[#94a3b8]">
                <div className="text-xs text-[#475569] mb-0.5">Admin notes</div>
                <p className="whitespace-pre-wrap text-sm">{ticket.adminNotes}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
