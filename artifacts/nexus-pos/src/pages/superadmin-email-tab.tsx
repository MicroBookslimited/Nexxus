import { useState, useEffect, useRef } from "react";
import {
  Mail, Plus, Pencil, Trash2, ToggleLeft, ToggleRight, Send, Eye,
  ChevronDown, X, CheckCircle, XCircle, Clock, RefreshCw, Zap, FileText,
  Copy, AlertTriangle, Database, Wifi,
} from "lucide-react";
import {
  superadminGetEmailTemplates, superadminCreateEmailTemplate,
  superadminUpdateEmailTemplate, superadminDeleteEmailTemplate,
  superadminToggleEmailTemplate, superadminTestEmailTemplate,
  superadminGetEmailDefaultTemplate, superadminGetEmailLogs,
  superadminSeedEmailTemplates, superadminSendConnectionTest,
  type EmailTemplate, type EmailLog, type EventKey,
} from "@/lib/saas-api";

/* ─── Constants ─── */
const EVENT_KEYS: { key: EventKey; label: string; color: string; vars: { key: string; desc: string }[] }[] = [
  {
    key: "user_signup",
    label: "User Signup",
    color: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    vars: [
      { key: "user_name", desc: "Owner's full name" },
      { key: "business_name", desc: "Business name" },
      { key: "email", desc: "Email address" },
      { key: "verification_link", desc: "Email verification URL" },
    ],
  },
  {
    key: "payment_success",
    label: "Payment Success",
    color: "bg-green-500/10 text-green-400 border-green-500/20",
    vars: [
      { key: "user_name", desc: "Owner's full name" },
      { key: "business_name", desc: "Business name" },
      { key: "amount", desc: "Payment amount (e.g. JMD 5,000)" },
      { key: "plan_name", desc: "Subscription plan name" },
      { key: "billing_cycle", desc: "monthly or annual" },
      { key: "next_billing_date", desc: "Next billing date" },
    ],
  },
  {
    key: "payment_failed",
    label: "Payment Failed",
    color: "bg-red-500/10 text-red-400 border-red-500/20",
    vars: [
      { key: "user_name", desc: "Owner's full name" },
      { key: "business_name", desc: "Business name" },
      { key: "amount", desc: "Payment amount" },
      { key: "plan_name", desc: "Plan name" },
      { key: "reason", desc: "Failure reason" },
    ],
  },
  {
    key: "trial_expiring",
    label: "Trial Expiring",
    color: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    vars: [
      { key: "user_name", desc: "Owner's full name" },
      { key: "business_name", desc: "Business name" },
      { key: "days_remaining", desc: "Days until trial ends" },
      { key: "trial_end_date", desc: "Trial expiry date" },
      { key: "upgrade_link", desc: "URL to upgrade plan" },
    ],
  },
  {
    key: "password_reset",
    label: "Password Reset",
    color: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    vars: [
      { key: "user_name", desc: "Owner's full name" },
      { key: "business_name", desc: "Business name" },
      { key: "reset_link", desc: "Password reset URL" },
      { key: "expires_in", desc: "Reset link expiry (e.g. 1 hour)" },
    ],
  },
];

function getEventMeta(key: string) {
  return EVENT_KEYS.find(e => e.key === key);
}

function EventBadge({ eventKey }: { eventKey: string }) {
  const meta = getEventMeta(eventKey);
  if (!meta) return <span className="text-xs px-2 py-0.5 rounded-full border bg-[#2a3a55] text-[#94a3b8] border-[#2a3a55]">{eventKey}</span>;
  return <span className={`text-xs px-2 py-0.5 rounded-full border ${meta.color}`}>{meta.label}</span>;
}

/* ─── Test Email Modal ─── */
function TestEmailModal({
  template,
  onClose,
}: {
  template: EmailTemplate;
  onClose: () => void;
}) {
  const meta = getEventMeta(template.eventKey);
  const [to, setTo] = useState("");
  const [vars, setVars] = useState<Record<string, string>>(
    Object.fromEntries((meta?.vars ?? []).map(v => [v.key, `{{${v.key}}}`]))
  );
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  async function handleSend() {
    if (!to) return;
    setSending(true);
    setResult(null);
    try {
      await superadminTestEmailTemplate(template.id, to, vars);
      setResult({ ok: true, msg: "Test email sent successfully!" });
    } catch (err: unknown) {
      setResult({ ok: false, msg: err instanceof Error ? err.message : String(err) });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#1a2332] border border-[#2a3a55] rounded-2xl w-full max-w-lg">
        <div className="flex items-center justify-between p-5 border-b border-[#2a3a55]">
          <div>
            <h3 className="font-bold text-white">Send Test Email</h3>
            <p className="text-xs text-[#94a3b8] mt-0.5">{template.name}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-[#475569] hover:text-white hover:bg-[#2a3a55]">
            <X size={16} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm text-[#94a3b8] mb-1">Recipient Email</label>
            <input
              type="email" value={to} onChange={e => setTo(e.target.value)}
              placeholder="test@example.com"
              className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-3 py-2 text-white text-sm focus:border-[#3b82f6] outline-none"
            />
          </div>
          <div>
            <label className="block text-sm text-[#94a3b8] mb-2">Variable Overrides</label>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {(meta?.vars ?? []).map(v => (
                <div key={v.key} className="flex items-center gap-2">
                  <span className="text-xs text-[#3b82f6] font-mono w-36 shrink-0">{`{{${v.key}}}`}</span>
                  <input
                    type="text" value={vars[v.key] ?? ""} placeholder={v.desc}
                    onChange={e => setVars(prev => ({ ...prev, [v.key]: e.target.value }))}
                    className="flex-1 bg-[#0f1729] border border-[#2a3a55] rounded px-2 py-1 text-white text-xs focus:border-[#3b82f6] outline-none"
                  />
                </div>
              ))}
            </div>
          </div>
          {result && (
            <div className={`flex items-start gap-2 p-3 rounded-lg text-sm ${result.ok ? "bg-green-500/10 border border-green-500/20 text-green-400" : "bg-red-500/10 border border-red-500/20 text-red-400"}`}>
              {result.ok ? <CheckCircle size={15} className="shrink-0 mt-0.5" /> : <XCircle size={15} className="shrink-0 mt-0.5" />}
              {result.msg}
            </div>
          )}
        </div>
        <div className="flex gap-3 p-5 border-t border-[#2a3a55]">
          <button onClick={onClose} className="flex-1 border border-[#2a3a55] text-[#94a3b8] hover:text-white py-2 rounded-lg text-sm transition-colors">
            Close
          </button>
          <button onClick={handleSend} disabled={!to || sending}
            className="flex-1 bg-[#3b82f6] hover:bg-blue-500 text-white py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            <Send size={14} />
            {sending ? "Sending…" : "Send Test"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Standalone Connection Test Modal ─── */
function ConnectionTestModal({ onClose }: { onClose: () => void }) {
  const [to, setTo] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string; ip?: string } | null>(null);

  async function handleSend() {
    if (!to) return;
    setSending(true);
    setResult(null);
    try {
      const res = await superadminSendConnectionTest(to);
      setResult({ ok: true, msg: `Delivered! Message ID: ${res.messageId ?? "n/a"}`, ip: res.outboundIp });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const body = (err as { body?: Record<string, unknown> })?.body;
      const ip = typeof body?.["outboundIp"] === "string" ? body["outboundIp"] : undefined;
      setResult({ ok: false, msg, ip });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#1a2332] border border-[#2a3a55] rounded-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-[#2a3a55]">
          <div>
            <h3 className="font-bold text-white flex items-center gap-2"><Wifi size={15} className="text-[#3b82f6]" /> Send Test Email</h3>
            <p className="text-xs text-[#94a3b8] mt-0.5">Verify ZeptoMail is delivering correctly</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-[#475569] hover:text-white hover:bg-[#2a3a55]">
            <X size={16} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm text-[#94a3b8] mb-1">Recipient Email</label>
            <input
              type="email" value={to} onChange={e => setTo(e.target.value)}
              placeholder="your@email.com"
              className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-3 py-2 text-white text-sm focus:border-[#3b82f6] outline-none"
            />
          </div>
          {result && (
            <div className={`p-3 rounded-lg text-sm ${result.ok ? "bg-green-500/10 border border-green-500/20 text-green-400" : "bg-red-500/10 border border-red-500/20 text-red-400"}`}>
              <div className="flex items-start gap-2">
                {result.ok ? <CheckCircle size={15} className="shrink-0 mt-0.5" /> : <XCircle size={15} className="shrink-0 mt-0.5" />}
                <span className="break-all">{result.msg}</span>
              </div>
              {result.ip && (
                <div className="mt-2 pt-2 border-t border-current/20 text-xs opacity-80">
                  Server outbound IP: <strong className="font-mono">{result.ip}</strong>
                  {!result.ok && <span className="block mt-0.5 text-yellow-400">Ensure this IP is whitelisted in ZeptoMail → Mail Agent settings.</span>}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex gap-3 p-5 border-t border-[#2a3a55]">
          <button onClick={onClose} className="flex-1 border border-[#2a3a55] text-[#94a3b8] hover:text-white py-2 rounded-lg text-sm transition-colors">
            Close
          </button>
          <button onClick={handleSend} disabled={!to || sending}
            className="flex-1 bg-[#3b82f6] hover:bg-blue-500 text-white py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            <Send size={14} />
            {sending ? "Sending…" : "Send Test"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── HTML Preview ─── */
function HtmlPreview({ html }: { html: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const doc = iframeRef.current?.contentDocument;
    if (doc) { doc.open(); doc.write(html); doc.close(); }
  }, [html]);
  return (
    <iframe
      ref={iframeRef}
      title="Email Preview"
      className="w-full border-0 rounded-lg"
      style={{ height: "500px", background: "#fff" }}
      sandbox="allow-same-origin"
    />
  );
}

/* ─── Template Form ─── */
const EMPTY_FORM = {
  name: "", eventKey: "user_signup" as EventKey,
  subject: "", htmlBody: "", textBody: "", isEnabled: true,
};

function TemplateEditor({
  initial,
  onSave,
  onCancel,
  saving,
  error,
}: {
  initial: typeof EMPTY_FORM;
  onSave: (data: typeof EMPTY_FORM) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
  error: string;
}) {
  const [form, setForm] = useState(initial);
  const [editorTab, setEditorTab] = useState<"html" | "text" | "preview">("html");
  const [loadingDefault, setLoadingDefault] = useState(false);

  const set = (k: string, v: string | boolean) => setForm(f => ({ ...f, [k]: v }));
  const meta = getEventMeta(form.eventKey);

  async function loadDefault() {
    setLoadingDefault(true);
    try {
      const def = await superadminGetEmailDefaultTemplate(form.eventKey);
      setForm(f => ({ ...f, name: def.name, subject: def.subject, htmlBody: def.htmlBody, textBody: def.textBody }));
    } catch { /* ignore */ }
    finally { setLoadingDefault(false); }
  }

  function insertVar(varKey: string) {
    const tag = `{{${varKey}}}`;
    if (editorTab === "html") set("htmlBody", form.htmlBody + tag);
    else if (editorTab === "text") set("textBody", form.textBody + tag);
    else set("subject", form.subject + tag);
  }

  return (
    <div className="space-y-4">
      {/* Row 1: name + event key */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-[#94a3b8] mb-1">Template Name</label>
          <input value={form.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Welcome Email"
            className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-3 py-2 text-white text-sm focus:border-[#3b82f6] outline-none" />
        </div>
        <div>
          <label className="block text-xs text-[#94a3b8] mb-1">Event Trigger</label>
          <select value={form.eventKey} onChange={e => set("eventKey", e.target.value)}
            className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-3 py-2 text-white text-sm focus:border-[#3b82f6] outline-none">
            {EVENT_KEYS.map(e => <option key={e.key} value={e.key}>{e.label}</option>)}
          </select>
        </div>
      </div>

      {/* Subject */}
      <div>
        <label className="block text-xs text-[#94a3b8] mb-1">Subject Line</label>
        <input value={form.subject} onChange={e => set("subject", e.target.value)} placeholder="e.g. Welcome to NEXXUS POS, {{user_name}}!"
          className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-3 py-2 text-white text-sm focus:border-[#3b82f6] outline-none" />
      </div>

      {/* Variable chips */}
      <div className="bg-[#0f1729] rounded-lg p-3 border border-[#2a3a55]">
        <p className="text-xs text-[#475569] mb-2 flex items-center gap-1"><Zap size={11} /> Available variables — click to insert into active field:</p>
        <div className="flex flex-wrap gap-1.5">
          {(meta?.vars ?? []).map(v => (
            <button key={v.key} onClick={() => insertVar(v.key)} title={v.desc}
              className="text-xs font-mono bg-[#1a2332] hover:bg-[#2a3a55] border border-[#2a3a55] text-[#3b82f6] px-2 py-0.5 rounded transition-colors">
              {`{{${v.key}}}`}
            </button>
          ))}
        </div>
      </div>

      {/* Load default button */}
      <button onClick={loadDefault} disabled={loadingDefault}
        className="text-xs flex items-center gap-1.5 text-[#475569] hover:text-[#3b82f6] transition-colors disabled:opacity-50">
        <Copy size={11} />
        {loadingDefault ? "Loading default…" : "Load default template for this event"}
      </button>

      {/* Editor tabs */}
      <div>
        <div className="flex border-b border-[#2a3a55] mb-3">
          {(["html", "text", "preview"] as const).map(t => (
            <button key={t} onClick={() => setEditorTab(t)}
              className={`px-4 py-2 text-xs font-medium capitalize border-b-2 transition-colors ${editorTab === t ? "border-[#3b82f6] text-white" : "border-transparent text-[#475569] hover:text-[#94a3b8]"}`}>
              {t === "html" ? "HTML Body" : t === "text" ? "Plain Text" : "Preview"}
            </button>
          ))}
        </div>

        {editorTab === "html" && (
          <textarea value={form.htmlBody} onChange={e => set("htmlBody", e.target.value)} rows={14}
            placeholder="Paste your HTML email template here…"
            className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-3 py-2 text-white text-xs font-mono focus:border-[#3b82f6] outline-none resize-y" />
        )}
        {editorTab === "text" && (
          <textarea value={form.textBody} onChange={e => set("textBody", e.target.value)} rows={10}
            placeholder="Plain text fallback for email clients that don't support HTML…"
            className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-3 py-2 text-white text-sm focus:border-[#3b82f6] outline-none resize-y" />
        )}
        {editorTab === "preview" && (
          form.htmlBody ? <HtmlPreview html={form.htmlBody} /> :
          <div className="flex flex-col items-center justify-center h-40 text-[#475569] text-sm border border-dashed border-[#2a3a55] rounded-lg">
            <Eye size={24} className="mb-2 opacity-40" />
            Add HTML body content to see a preview
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-red-400 text-sm">
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button onClick={onCancel} className="flex-1 border border-[#2a3a55] text-[#94a3b8] hover:text-white py-2.5 rounded-lg text-sm transition-colors">
          Cancel
        </button>
        <button onClick={() => onSave(form)} disabled={saving || !form.name || !form.subject || !form.htmlBody}
          className="flex-1 bg-[#3b82f6] hover:bg-blue-500 text-white py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50">
          {saving ? "Saving…" : "Save Template"}
        </button>
      </div>
    </div>
  );
}

/* ─── Email Logs View ─── */
function EmailLogsView({ onBack }: { onBack: () => void }) {
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    try { setLogs(await superadminGetEmailLogs(200)); } catch { /* ignore */ }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  function statusBadge(status: string) {
    if (status === "sent") return <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border bg-green-500/10 text-green-400 border-green-500/20"><CheckCircle size={10} />Sent</span>;
    if (status === "failed") return <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border bg-red-500/10 text-red-400 border-red-500/20"><XCircle size={10} />Failed</span>;
    return <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border bg-amber-500/10 text-amber-400 border-amber-500/20"><Clock size={10} />Pending</span>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-[#475569] hover:text-white text-sm transition-colors">← Templates</button>
          <h2 className="text-lg font-bold text-white">Email Logs</h2>
          <span className="text-xs text-[#475569]">{logs.length} records</span>
        </div>
        <button onClick={load} className="w-8 h-8 flex items-center justify-center rounded-lg text-[#475569] hover:text-white hover:bg-[#2a3a55] transition-colors">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {loading ? (
        <div className="text-center py-16 text-[#475569]"><RefreshCw size={24} className="animate-spin mx-auto mb-2" />Loading logs…</div>
      ) : logs.length === 0 ? (
        <div className="text-center py-16 text-[#475569]">
          <Mail size={32} className="mx-auto mb-2 opacity-40" />
          No emails sent yet
        </div>
      ) : (
        <div className="space-y-1.5">
          {logs.map(log => (
            <div key={log.id} className="bg-[#1a2332] border border-[#2a3a55] rounded-xl overflow-hidden">
              <button onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[#2a3a55]/30 transition-colors">
                <div className="shrink-0">{statusBadge(log.status)}</div>
                <EventBadge eventKey={log.eventKey} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{log.subject}</p>
                  <p className="text-xs text-[#475569]">{log.toEmail}</p>
                </div>
                <p className="text-xs text-[#475569] shrink-0">
                  {new Date(log.sentAt).toLocaleString("en-JM", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "numeric", minute: "2-digit", hour12: true })}
                </p>
                <ChevronDown size={14} className={`text-[#475569] transition-transform ${expandedId === log.id ? "rotate-180" : ""}`} />
              </button>
              {expandedId === log.id && (
                <div className="px-4 pb-4 pt-1 border-t border-[#2a3a55] space-y-2 text-xs">
                  {log.messageId && <p className="text-[#475569]">Message ID: <span className="text-[#94a3b8] font-mono">{log.messageId}</span></p>}
                  {log.errorMessage && <p className="text-red-400">Error: {log.errorMessage}</p>}
                  {log.variables && (() => {
                    try {
                      const v = JSON.parse(log.variables) as Record<string, string>;
                      return (
                        <div>
                          <p className="text-[#475569] mb-1">Variables:</p>
                          <div className="bg-[#0f1729] rounded p-2 font-mono text-[#94a3b8] space-y-0.5">
                            {Object.entries(v).map(([k, val]) => <p key={k}><span className="text-[#3b82f6]">{k}</span>: {val}</p>)}
                          </div>
                        </div>
                      );
                    } catch { return null; }
                  })()}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Main Email Tab ─── */
export function EmailTab() {
  const [view, setView] = useState<"list" | "new" | "edit" | "logs">("list");
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editTarget, setEditTarget] = useState<EmailTemplate | null>(null);
  const [testTarget, setTestTarget] = useState<EmailTemplate | null>(null);
  const [previewTarget, setPreviewTarget] = useState<EmailTemplate | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [showConnectionTest, setShowConnectionTest] = useState(false);

  async function load() {
    setLoading(true);
    try { setTemplates(await superadminGetEmailTemplates()); } catch { /* ignore */ }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function handleCreate(form: typeof EMPTY_FORM) {
    setSaving(true); setSaveError("");
    try {
      await superadminCreateEmailTemplate(form);
      await load();
      setView("list");
    } catch (e) { setSaveError(String(e)); }
    finally { setSaving(false); }
  }

  async function handleUpdate(form: typeof EMPTY_FORM) {
    if (!editTarget) return;
    setSaving(true); setSaveError("");
    try {
      await superadminUpdateEmailTemplate(editTarget.id, form);
      await load();
      setView("list");
      setEditTarget(null);
    } catch (e) { setSaveError(String(e)); }
    finally { setSaving(false); }
  }

  async function handleToggle(id: number) {
    setSavingId(id);
    try { await superadminToggleEmailTemplate(id); await load(); } catch { /* ignore */ }
    finally { setSavingId(null); }
  }

  async function handleDelete(id: number) {
    try { await superadminDeleteEmailTemplate(id); await load(); } catch { /* ignore */ }
    finally { setDeleteConfirm(null); }
  }

  async function handleSeed(replace = false) {
    setSeeding(true);
    setSeedResult(null);
    try {
      const res = await superadminSeedEmailTemplates(replace);
      const inserted = res.results.filter(r => r.action === "inserted").length;
      const replaced = res.results.filter(r => r.action === "replaced").length;
      const skipped = res.results.filter(r => r.action === "skipped").length;
      const parts = [];
      if (inserted > 0) parts.push(`${inserted} added`);
      if (replaced > 0) parts.push(`${replaced} reset`);
      if (skipped > 0) parts.push(`${skipped} already existed`);
      setSeedResult({ ok: true, msg: parts.join(", ") || "Done" });
      await load();
    } catch (err) {
      setSeedResult({ ok: false, msg: String(err) });
    } finally {
      setSeeding(false);
    }
  }

  /* ─── Logs view ─── */
  if (view === "logs") return <EmailLogsView onBack={() => setView("list")} />;

  /* ─── New / Edit form ─── */
  if (view === "new" || view === "edit") {
    const initialForm = editTarget
      ? { name: editTarget.name, eventKey: editTarget.eventKey, subject: editTarget.subject, htmlBody: editTarget.htmlBody, textBody: editTarget.textBody, isEnabled: editTarget.isEnabled }
      : EMPTY_FORM;
    return (
      <div>
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => { setView("list"); setEditTarget(null); setSaveError(""); }}
            className="text-[#475569] hover:text-white text-sm transition-colors">← Templates</button>
          <h2 className="text-lg font-bold text-white">{view === "new" ? "New Template" : `Edit: ${editTarget?.name}`}</h2>
        </div>
        <TemplateEditor
          initial={initialForm}
          onSave={view === "new" ? handleCreate : handleUpdate}
          onCancel={() => { setView("list"); setEditTarget(null); setSaveError(""); }}
          saving={saving}
          error={saveError}
        />
      </div>
    );
  }

  /* ─── Template list ─── */
  const byEvent = EVENT_KEYS.map(e => ({
    ...e,
    templates: templates.filter(t => t.eventKey === e.key),
  }));

  return (
    <div>
      {testTarget && <TestEmailModal template={testTarget} onClose={() => setTestTarget(null)} />}
      {showConnectionTest && <ConnectionTestModal onClose={() => setShowConnectionTest(false)} />}
      {previewTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a2332] border border-[#2a3a55] rounded-2xl w-full max-w-2xl">
            <div className="flex items-center justify-between p-5 border-b border-[#2a3a55]">
              <div>
                <h3 className="font-bold text-white">{previewTarget.name}</h3>
                <p className="text-xs text-[#94a3b8] mt-0.5">{previewTarget.subject}</p>
              </div>
              <button onClick={() => setPreviewTarget(null)} className="w-8 h-8 flex items-center justify-center rounded-lg text-[#475569] hover:text-white hover:bg-[#2a3a55]"><X size={16} /></button>
            </div>
            <div className="p-5"><HtmlPreview html={previewTarget.htmlBody} /></div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-4 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Email Automation</h1>
          <p className="text-[#94a3b8] text-sm">{templates.length} template{templates.length !== 1 ? "s" : ""} configured across {EVENT_KEYS.length} event types</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button onClick={() => setView("logs")}
            className="flex items-center gap-2 border border-[#2a3a55] text-[#94a3b8] hover:text-white hover:border-[#3b82f6]/50 px-3 py-2 rounded-lg text-sm transition-colors">
            <FileText size={14} /> Logs
          </button>
          <button onClick={() => setShowConnectionTest(true)}
            className="flex items-center gap-2 border border-[#2a3a55] text-[#94a3b8] hover:text-[#3b82f6] hover:border-[#3b82f6]/50 px-3 py-2 rounded-lg text-sm transition-colors">
            <Wifi size={14} /> Send Test
          </button>
          <button onClick={() => void handleSeed(false)} disabled={seeding}
            className="flex items-center gap-2 border border-[#2a3a55] text-[#94a3b8] hover:text-amber-400 hover:border-amber-500/30 px-3 py-2 rounded-lg text-sm transition-colors disabled:opacity-50">
            {seeding ? <RefreshCw size={14} className="animate-spin" /> : <Database size={14} />}
            {seeding ? "Seeding…" : "Seed Defaults"}
          </button>
          <button onClick={load} className="w-9 h-9 flex items-center justify-center rounded-lg text-[#475569] hover:text-white hover:bg-[#2a3a55] transition-colors">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
          <button onClick={() => { setEditTarget(null); setSaveError(""); setView("new"); }}
            className="flex items-center gap-2 bg-[#3b82f6] hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors">
            <Plus size={15} /> New Template
          </button>
        </div>
      </div>

      {/* Seed result feedback */}
      {seedResult && (
        <div className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm mb-4 ${seedResult.ok ? "bg-green-500/10 border border-green-500/20 text-green-400" : "bg-red-500/10 border border-red-500/20 text-red-400"}`}>
          {seedResult.ok ? <CheckCircle size={14} /> : <XCircle size={14} />}
          <span>{seedResult.ok ? `Templates seeded: ${seedResult.msg}` : seedResult.msg}</span>
          {seedResult.ok && templates.length === EVENT_KEYS.length && (
            <button onClick={() => void handleSeed(true)} disabled={seeding}
              className="ml-auto text-xs text-amber-400 hover:text-amber-300 underline transition-colors disabled:opacity-50">
              Reset all to defaults
            </button>
          )}
          <button onClick={() => setSeedResult(null)} className="ml-auto text-current opacity-60 hover:opacity-100">
            <X size={12} />
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-[#475569]"><RefreshCw size={24} className="animate-spin mx-auto mb-2" />Loading templates…</div>
      ) : (
        <div className="space-y-6">
          {byEvent.map(group => (
            <div key={group.key}>
              <div className="flex items-center gap-3 mb-3">
                <EventBadge eventKey={group.key} />
                <span className="text-xs text-[#475569]">{group.vars.map(v => `{{${v.key}}}`).join(", ")}</span>
              </div>

              {group.templates.length === 0 ? (
                <div className="border-2 border-dashed border-[#2a3a55] rounded-xl p-5 flex items-center gap-4">
                  <Mail size={20} className="text-[#2a3a55] shrink-0" />
                  <div className="flex-1">
                    <p className="text-[#475569] text-sm">No template for <strong>{group.label}</strong> events</p>
                    <p className="text-[#2a3a55] text-xs mt-0.5">Emails won't be sent for this event until a template is configured.</p>
                  </div>
                  <button
                    onClick={() => {
                      setEditTarget(null);
                      setSaveError("");
                      setView("new");
                    }}
                    className="text-xs flex items-center gap-1 text-[#3b82f6] hover:text-blue-400 transition-colors shrink-0">
                    <Plus size={12} /> Add template
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {group.templates.map(tpl => (
                    <div key={tpl.id} className="bg-[#1a2332] border border-[#2a3a55] rounded-xl px-4 py-3 flex items-center gap-3">
                      {/* Toggle */}
                      <button onClick={() => handleToggle(tpl.id)} disabled={savingId === tpl.id}
                        className={`shrink-0 transition-colors ${tpl.isEnabled ? "text-[#3b82f6]" : "text-[#2a3a55]"}`}
                        title={tpl.isEnabled ? "Disable template" : "Enable template"}>
                        {savingId === tpl.id
                          ? <RefreshCw size={18} className="animate-spin" />
                          : tpl.isEnabled ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                      </button>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-white truncate">{tpl.name}</p>
                          {!tpl.isEnabled && <span className="text-xs text-[#475569] border border-[#2a3a55] px-1.5 py-0.5 rounded">disabled</span>}
                        </div>
                        <p className="text-xs text-[#475569] truncate">{tpl.subject}</p>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => setPreviewTarget(tpl)} title="Preview"
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-[#475569] hover:text-white hover:bg-[#2a3a55] transition-colors">
                          <Eye size={14} />
                        </button>
                        <button onClick={() => setTestTarget(tpl)} title="Send test"
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-[#475569] hover:text-[#3b82f6] hover:bg-[#2a3a55] transition-colors">
                          <Send size={14} />
                        </button>
                        <button onClick={() => { setEditTarget(tpl); setSaveError(""); setView("edit"); }} title="Edit"
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-[#475569] hover:text-white hover:bg-[#2a3a55] transition-colors">
                          <Pencil size={14} />
                        </button>
                        {deleteConfirm === tpl.id ? (
                          <div className="flex items-center gap-1">
                            <button onClick={() => handleDelete(tpl.id)}
                              className="text-xs bg-red-500 hover:bg-red-600 text-white px-2 py-0.5 rounded transition-colors">
                              Confirm
                            </button>
                            <button onClick={() => setDeleteConfirm(null)}
                              className="text-xs border border-[#2a3a55] text-[#94a3b8] px-2 py-0.5 rounded transition-colors">
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => setDeleteConfirm(tpl.id)} title="Delete"
                            className="w-7 h-7 flex items-center justify-center rounded-lg text-[#475569] hover:text-red-400 hover:bg-[#2a3a55] transition-colors">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Info panel */}
      <div className="mt-8 bg-[#1a2332] border border-[#2a3a55] rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><Zap size={14} className="text-[#3b82f6]" /> How It Works</h3>
        <div className="grid grid-cols-2 gap-4 text-xs text-[#94a3b8]">
          <div>
            <p className="font-medium text-[#475569] mb-1">Event Triggers</p>
            <ul className="space-y-1">
              <li>• <span className="text-[#3b82f6]">user_signup</span> — fires when a new tenant registers</li>
              <li>• <span className="text-[#3b82f6]">payment_success</span> — fires after a successful payment</li>
              <li>• <span className="text-[#3b82f6]">payment_failed</span> — fires when a payment fails</li>
              <li>• <span className="text-[#3b82f6]">trial_expiring</span> — fired manually or by a scheduled job</li>
              <li>• <span className="text-[#3b82f6]">password_reset</span> — fires when a tenant requests a reset</li>
            </ul>
          </div>
          <div>
            <p className="font-medium text-[#475569] mb-1">Dynamic Variables</p>
            <p>Use <span className="font-mono text-[#3b82f6]">{`{{variable_name}}`}</span> syntax in subject, HTML body, and plain text. Variables are replaced at send time with actual values.</p>
            <p className="mt-2">Only one active template per event type is used. Disable extras to prevent duplicate sends.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
