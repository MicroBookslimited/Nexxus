import { useState, useEffect, useCallback, useRef } from "react";
import {
  Megaphone, Send, Users, Mail, AlertTriangle, CheckCircle2, XCircle, Clock,
  Eye, Trash2, RefreshCw, Loader2, Sparkles, FileText, MousePointerClick, Webhook, Copy, KeyRound,
} from "lucide-react";
import {
  superadminMarketingStatus, superadminMarketingAudience, superadminMarketingCampaigns,
  superadminMarketingCampaign, superadminMarketingProgress, superadminMarketingTest,
  superadminMarketingSend, superadminMarketingDelete,
  type MarketingAudience, type MarketingCampaign, type MarketingRecipient,
} from "@/lib/saas-api";

const AUDIENCE_OPTIONS: { value: MarketingAudience; label: string; description: string }[] = [
  { value: "all", label: "Everyone", description: "All business owners + admin users" },
  { value: "owners", label: "Business owners only", description: "Primary tenant accounts" },
  { value: "admins", label: "Admin users only", description: "Invited admin team members" },
  { value: "active", label: "Active subscribers", description: "Owners with active subscriptions" },
  { value: "trial", label: "Trial / pending", description: "Owners still in trial or pending" },
  { value: "verified", label: "Email-verified owners", description: "Owners who confirmed their email" },
];

const STARTER_TEMPLATES: { name: string; subject: string; html: string }[] = [
  {
    name: "Product announcement",
    subject: "🚀 New in NEXXUS POS: [Feature]",
    html: `<div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:auto;color:#0f1729">
  <div style="background:#0f1729;color:#fff;padding:24px;border-radius:8px 8px 0 0">
    <h1 style="margin:0;font-size:22px">Something new is here 🎉</h1>
  </div>
  <div style="padding:24px;background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
    <p>Hi there,</p>
    <p>We just shipped <strong>[Feature Name]</strong> — it helps you [benefit].</p>
    <p style="margin:24px 0">
      <a href="https://app.microbookspos.com" style="background:#3b82f6;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block">Try it now</a>
    </p>
    <p style="color:#64748b;font-size:13px">— The NEXXUS POS team</p>
  </div>
</div>`,
  },
  {
    name: "Promotional offer",
    subject: "🎁 Limited time: [Offer]",
    html: `<div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:auto;color:#0f1729">
  <div style="background:linear-gradient(135deg,#3b82f6,#1d4ed8);color:#fff;padding:32px;border-radius:8px 8px 0 0;text-align:center">
    <h1 style="margin:0;font-size:28px">Special Offer Inside</h1>
    <p style="margin:8px 0 0;opacity:.9">For our valued business partners</p>
  </div>
  <div style="padding:24px;background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
    <p>Hello,</p>
    <p>For a limited time, get <strong>[Discount/Offer]</strong> when you [action].</p>
    <p style="margin:24px 0;text-align:center">
      <a href="https://app.microbookspos.com" style="background:#3b82f6;color:#fff;padding:14px 28px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:600">Claim Offer</a>
    </p>
    <p style="color:#64748b;font-size:13px">Valid until [date]. Terms apply.</p>
  </div>
</div>`,
  },
  {
    name: "Newsletter / update",
    subject: "Your monthly NEXXUS POS update",
    html: `<div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:auto;color:#0f1729">
  <div style="background:#0f1729;color:#fff;padding:24px;border-radius:8px 8px 0 0">
    <h1 style="margin:0;font-size:22px">📬 What's new this month</h1>
  </div>
  <div style="padding:24px;background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
    <p>Hi,</p>
    <h3 style="color:#3b82f6">Highlights</h3>
    <ul>
      <li>Feature one</li>
      <li>Feature two</li>
      <li>Feature three</li>
    </ul>
    <p style="color:#64748b;font-size:13px;margin-top:32px">— The NEXXUS POS team</p>
  </div>
</div>`,
  },
];

export function SuperadminMarketingTab() {
  const [status, setStatus] = useState<{ provider: string; configured: boolean; webhookUrl: string; webhookSecretConfigured: boolean } | null>(null);
  const [campaigns, setCampaigns] = useState<MarketingCampaign[]>([]);
  const [loading, setLoading] = useState(false);

  // Composer state
  const [subject, setSubject] = useState("");
  const [htmlBody, setHtmlBody] = useState("");
  const [fromName, setFromName] = useState("NEXXUS POS");
  const [fromAddress, setFromAddress] = useState("noreply@microbookspos.com");
  const [audience, setAudience] = useState<MarketingAudience>("all");
  const [audienceCount, setAudienceCount] = useState<number | null>(null);
  const [audienceSample, setAudienceSample] = useState<{ email: string; name: string | null }[]>([]);
  const [audienceLoading, setAudienceLoading] = useState(false);

  // UI flow state
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [testing, setTesting] = useState(false);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  // Detail / progress
  const [detail, setDetail] = useState<{ campaign: MarketingCampaign; recipients: MarketingRecipient[] } | null>(null);
  const [progress, setProgress] = useState<Record<number, { sent: number; failed: number; pending: number; opened: number; clicked: number; status: string; resumedAt: string | null; resumeCount: number }>>({});
  const pollRef = useRef<number | null>(null);

  const showToast = (kind: "ok" | "err", msg: string) => {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 4500);
  };

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [s, c] = await Promise.all([superadminMarketingStatus(), superadminMarketingCampaigns()]);
      setStatus(s);
      setCampaigns(c);
    } catch (e) {
      showToast("err", e instanceof Error ? e.message : "Failed to load");
    }
    setLoading(false);
  }, []);

  const loadAudience = useCallback(async (aud: MarketingAudience) => {
    setAudienceLoading(true);
    try {
      const r = await superadminMarketingAudience(aud);
      setAudienceCount(r.total);
      setAudienceSample(r.sample);
    } catch (e) {
      setAudienceCount(0);
      setAudienceSample([]);
      showToast("err", e instanceof Error ? e.message : "Failed to count audience");
    }
    setAudienceLoading(false);
  }, []);

  useEffect(() => { void loadAll(); }, [loadAll]);
  useEffect(() => { void loadAudience(audience); }, [audience, loadAudience]);

  // Poll progress for any "sending" campaigns
  useEffect(() => {
    const sendingIds = campaigns.filter(c => c.status === "sending").map(c => c.id);
    if (sendingIds.length === 0) {
      if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = window.setInterval(async () => {
      const updates: typeof progress = {};
      for (const id of sendingIds) {
        try {
          const p = await superadminMarketingProgress(id);
          updates[id] = p;
        } catch { /* ignore */ }
      }
      setProgress(prev => ({ ...prev, ...updates }));
      // If anything finished, refresh the list.
      if (Object.values(updates).some(u => u.status !== "sending")) {
        void loadAll();
      }
    }, 3000);
    return () => { if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; } };
  }, [campaigns, loadAll]);

  const applyTemplate = (t: typeof STARTER_TEMPLATES[number]) => {
    setSubject(t.subject);
    setHtmlBody(t.html);
  };

  const validate = (): string | null => {
    if (!subject.trim()) return "Subject is required";
    if (!htmlBody.trim()) return "Email body is required";
    if (!fromAddress.trim()) return "From address is required";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromAddress)) return "From address must be a valid email";
    return null;
  };

  const handleSendTest = async () => {
    const err = validate();
    if (err) { showToast("err", err); return; }
    if (!testTo.trim()) { showToast("err", "Enter a test recipient email"); return; }
    setTesting(true);
    try {
      await superadminMarketingTest({ to: testTo.trim(), subject, htmlBody, fromName, fromAddress });
      showToast("ok", `Test sent to ${testTo}`);
    } catch (e) {
      showToast("err", e instanceof Error ? e.message : "Test failed");
    }
    setTesting(false);
  };

  const handleSend = async () => {
    setSending(true);
    try {
      const r = await superadminMarketingSend({ subject, htmlBody, fromName, fromAddress, audience });
      showToast("ok", `Queued ${r.queued} recipients. Sending in background.`);
      setConfirmOpen(false);
      setSubject("");
      setHtmlBody("");
      void loadAll();
    } catch (e) {
      showToast("err", e instanceof Error ? e.message : "Send failed");
    }
    setSending(false);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this campaign and all its recipient records?")) return;
    try {
      await superadminMarketingDelete(id);
      void loadAll();
    } catch (e) {
      showToast("err", e instanceof Error ? e.message : "Delete failed");
    }
  };

  const openDetail = async (id: number) => {
    try {
      const d = await superadminMarketingCampaign(id);
      setDetail(d);
    } catch (e) {
      showToast("err", e instanceof Error ? e.message : "Failed to load campaign");
    }
  };

  return (
    <div className="space-y-6">
      {/* Provider status */}
      <div className={`rounded-lg border p-4 flex items-start gap-3 ${
        status?.configured
          ? "bg-emerald-500/10 border-emerald-500/30"
          : "bg-amber-500/10 border-amber-500/30"
      }`}>
        {status?.configured
          ? <CheckCircle2 className="h-5 w-5 text-emerald-400 mt-0.5 shrink-0" />
          : <AlertTriangle className="h-5 w-5 text-amber-400 mt-0.5 shrink-0" />}
        <div className="text-sm">
          <p className={status?.configured ? "text-emerald-300 font-semibold" : "text-amber-300 font-semibold"}>
            Marketing provider: Resend {status?.configured ? "✓ configured" : "— not configured"}
          </p>
          <p className="text-[#94a3b8] mt-0.5 text-xs">
            Marketing emails are sent via <strong>Resend</strong>, separate from the transactional pipeline (ZeptoMail/SMTP) used for receipts and account events. This protects transactional deliverability from promotional volume.
            {!status?.configured && " Add the RESEND_API_KEY environment secret to enable sending."}
          </p>
        </div>
      </div>

      {/* Webhook setup */}
      {status && (
        <div className="rounded-lg border border-[#2a3a55] bg-[#1a2332] p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <Webhook className="h-5 w-5 text-[#3b82f6] mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <h3 className="text-sm font-semibold text-white">Webhook setup</h3>
                <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                  status.webhookSecretConfigured
                    ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                    : "bg-amber-500/10 text-amber-300 border-amber-500/30"
                }`}>
                  <KeyRound className="h-3 w-3" />
                  RESEND_WEBHOOK_SECRET {status.webhookSecretConfigured ? "set" : "not set (signature verification disabled)"}
                </span>
              </div>
              <p className="text-xs text-[#94a3b8] mt-1">
                Open & click counters stay at <strong>0</strong> until you register this URL as a webhook in your Resend dashboard
                (<em>Webhooks → Add Endpoint</em>) and subscribe to <code className="text-[#cbd5e1]">email.opened</code>, <code className="text-[#cbd5e1]">email.clicked</code>, <code className="text-[#cbd5e1]">email.delivered</code>, <code className="text-[#cbd5e1]">email.bounced</code>, and <code className="text-[#cbd5e1]">email.complained</code>.
              </p>
              <div className="mt-3 flex items-stretch gap-2">
                <input
                  readOnly
                  value={status.webhookUrl}
                  onFocus={e => e.currentTarget.select()}
                  className="flex-1 bg-[#0f1729] border border-[#2a3a55] rounded-md px-3 py-2 text-xs text-white font-mono focus:border-[#3b82f6] focus:outline-none"
                />
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(status.webhookUrl);
                      showToast("ok", "Webhook URL copied");
                    } catch {
                      showToast("err", "Could not copy — select and copy manually");
                    }
                  }}
                  className="bg-[#0f1729] border border-[#3b82f6]/40 text-[#3b82f6] hover:bg-[#3b82f6]/10 px-3 py-2 rounded-md text-xs font-medium flex items-center gap-1.5"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copy
                </button>
              </div>
              <p className="text-[10px] text-[#64748b] mt-2">
                For signed events, also add a <code className="text-[#cbd5e1]">RESEND_WEBHOOK_SECRET</code> environment variable matching the signing secret shown in Resend.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* ── Composer ── */}
        <div className="bg-[#1a2332] border border-[#2a3a55] rounded-xl p-4 sm:p-6 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Megaphone className="h-5 w-5 text-[#3b82f6]" />
            <h2 className="text-lg font-bold text-white">Compose Campaign</h2>
          </div>

          {/* Starter templates */}
          <div>
            <label className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wide flex items-center gap-1 mb-2">
              <Sparkles className="h-3 w-3" /> Starter templates
            </label>
            <div className="flex flex-wrap gap-2">
              {STARTER_TEMPLATES.map(t => (
                <button key={t.name} onClick={() => applyTemplate(t)}
                  className="text-xs px-3 py-1.5 rounded-md bg-[#0f1729] border border-[#2a3a55] text-[#cbd5e1] hover:bg-[#3b82f6]/10 hover:border-[#3b82f6]/40 hover:text-white transition-colors">
                  {t.name}
                </button>
              ))}
            </div>
          </div>

          {/* From */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wide block mb-1.5">From name</label>
              <input value={fromName} onChange={e => setFromName(e.target.value)} placeholder="NEXXUS POS"
                className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-md px-3 py-2 text-sm text-white placeholder:text-[#475569] focus:border-[#3b82f6] focus:outline-none" />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wide block mb-1.5">From address</label>
              <input value={fromAddress} onChange={e => setFromAddress(e.target.value)} placeholder="noreply@yourdomain.com"
                className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-md px-3 py-2 text-sm text-white placeholder:text-[#475569] focus:border-[#3b82f6] focus:outline-none" />
            </div>
          </div>

          {/* Subject */}
          <div>
            <label className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wide block mb-1.5">Subject line</label>
            <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="What's your message about?"
              className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-md px-3 py-2 text-sm text-white placeholder:text-[#475569] focus:border-[#3b82f6] focus:outline-none" />
          </div>

          {/* HTML body */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wide">HTML body</label>
              <button onClick={() => setPreviewOpen(true)} disabled={!htmlBody.trim()}
                className="text-xs text-[#3b82f6] hover:underline disabled:opacity-40 disabled:no-underline flex items-center gap-1">
                <Eye className="h-3 w-3" /> Preview
              </button>
            </div>
            <textarea value={htmlBody} onChange={e => setHtmlBody(e.target.value)} rows={12}
              placeholder="<p>Your HTML email content...</p>"
              className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-md px-3 py-2 text-sm text-white placeholder:text-[#475569] focus:border-[#3b82f6] focus:outline-none font-mono" />
            <p className="text-[10px] text-[#64748b] mt-1">{htmlBody.length} characters</p>
          </div>

          {/* Test send */}
          <div className="border-t border-[#2a3a55] pt-4">
            <label className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wide block mb-1.5">Send test email</label>
            <div className="flex gap-2">
              <input value={testTo} onChange={e => setTestTo(e.target.value)} placeholder="your@email.com"
                className="flex-1 bg-[#0f1729] border border-[#2a3a55] rounded-md px-3 py-2 text-sm text-white placeholder:text-[#475569] focus:border-[#3b82f6] focus:outline-none" />
              <button onClick={handleSendTest} disabled={testing || !status?.configured}
                className="bg-[#0f1729] border border-[#3b82f6]/40 text-[#3b82f6] hover:bg-[#3b82f6]/10 px-4 py-2 rounded-md text-sm font-medium flex items-center gap-1.5 disabled:opacity-40">
                {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                Test
              </button>
            </div>
          </div>
        </div>

        {/* ── Audience + Send ── */}
        <div className="bg-[#1a2332] border border-[#2a3a55] rounded-xl p-4 sm:p-6 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Users className="h-5 w-5 text-[#3b82f6]" />
            <h2 className="text-lg font-bold text-white">Audience</h2>
          </div>

          <div className="space-y-2">
            {AUDIENCE_OPTIONS.map(opt => (
              <button key={opt.value} onClick={() => setAudience(opt.value)}
                className={`w-full text-left p-3 rounded-lg border transition-colors ${
                  audience === opt.value
                    ? "bg-[#3b82f6]/10 border-[#3b82f6] text-white"
                    : "bg-[#0f1729] border-[#2a3a55] text-[#cbd5e1] hover:border-[#3b82f6]/40"
                }`}>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm">{opt.label}</span>
                  {audience === opt.value && <CheckCircle2 className="h-4 w-4 text-[#3b82f6]" />}
                </div>
                <p className="text-xs text-[#94a3b8] mt-0.5">{opt.description}</p>
              </button>
            ))}
          </div>

          {/* Audience preview */}
          <div className="bg-[#0f1729] border border-[#2a3a55] rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wide">Recipients</span>
              <span className="text-2xl font-bold text-white">
                {audienceLoading ? <Loader2 className="h-5 w-5 animate-spin inline" /> : (audienceCount ?? 0)}
              </span>
            </div>
            {audienceSample.length > 0 && (
              <div className="space-y-1 mt-2 max-h-32 overflow-y-auto">
                {audienceSample.map((s, i) => (
                  <div key={i} className="text-xs text-[#cbd5e1] flex items-center gap-2">
                    <Mail className="h-3 w-3 text-[#475569] shrink-0" />
                    <span className="truncate">{s.email}</span>
                    {s.name && <span className="text-[#64748b] truncate">— {s.name}</span>}
                  </div>
                ))}
                {(audienceCount ?? 0) > audienceSample.length && (
                  <div className="text-[10px] text-[#64748b] mt-1">+{(audienceCount ?? 0) - audienceSample.length} more…</div>
                )}
              </div>
            )}
          </div>

          {/* Send */}
          <button onClick={() => {
            const err = validate();
            if (err) { showToast("err", err); return; }
            if (!status?.configured) { showToast("err", "Resend is not configured"); return; }
            if ((audienceCount ?? 0) === 0) { showToast("err", "No recipients in selected audience"); return; }
            setConfirmOpen(true);
          }}
            className="w-full bg-gradient-to-r from-[#3b82f6] to-[#1d4ed8] hover:from-[#2563eb] hover:to-[#1e40af] text-white py-3 rounded-lg font-semibold flex items-center justify-center gap-2">
            <Send className="h-4 w-4" />
            Send Campaign
          </button>
        </div>
      </div>

      {/* ── Campaign history ── */}
      <div className="bg-[#1a2332] border border-[#2a3a55] rounded-xl">
        <div className="p-4 sm:p-6 border-b border-[#2a3a55] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-[#3b82f6]" />
            <h2 className="text-lg font-bold text-white">Recent Campaigns</h2>
          </div>
          <button onClick={loadAll} className="text-[#94a3b8] hover:text-white p-1">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
        {campaigns.length === 0 ? (
          <div className="p-8 text-center text-[#64748b] text-sm">No campaigns yet. Compose your first message above.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[#64748b] uppercase tracking-wide border-b border-[#2a3a55]">
                  <th className="px-4 py-3 font-medium">Subject</th>
                  <th className="px-4 py-3 font-medium hidden md:table-cell">Audience</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Progress</th>
                  <th className="px-4 py-3 font-medium hidden lg:table-cell">Opens / Clicks</th>
                  <th className="px-4 py-3 font-medium hidden sm:table-cell">Sent</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map(c => {
                  const live = progress[c.id];
                  const total = c.totalRecipients;
                  const sent = live?.sent ?? c.sentCount;
                  const failed = live?.failed ?? c.failedCount;
                  const pct = total > 0 ? Math.round(((sent + failed) / total) * 100) : 0;
                  const status = live?.status ?? c.status;
                  const resumedAt = live?.resumedAt ?? c.resumedAt;
                  const resumeCount = live?.resumeCount ?? c.resumeCount;
                  const isRecovering = status === "sending" && !!resumedAt;
                  const wasRecovered = status !== "sending" && resumeCount > 0;
                  const openRate = sent > 0 ? Math.round((c.openCount / sent) * 100) : null;
                  const clickRate = sent > 0 ? Math.round((c.clickCount / sent) * 100) : null;
                  return (
                    <tr key={c.id} className="border-b border-[#2a3a55] hover:bg-[#0f1729]/50">
                      <td className="px-4 py-3 text-white max-w-xs truncate">{c.subject}</td>
                      <td className="px-4 py-3 text-[#94a3b8] hidden md:table-cell capitalize">{c.audience}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1 items-start">
                          <StatusPill status={isRecovering ? "recovering" : status} />
                          {wasRecovered && (
                            <span
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border bg-violet-500/15 text-violet-300 border-violet-500/30"
                              title={`Auto-resumed after a server restart${resumedAt ? ` at ${new Date(resumedAt).toLocaleString()}` : ""}${resumeCount > 1 ? ` · ${resumeCount} resumes` : ""}`}
                            >
                              <RefreshCw className="h-3 w-3" />
                              Recovered{resumeCount > 1 ? ` ×${resumeCount}` : ""}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 min-w-[140px]">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-[#0f1729] rounded-full overflow-hidden">
                            <div className={`h-full transition-all ${status === "failed" ? "bg-red-500" : isRecovering ? "bg-violet-500" : "bg-[#3b82f6]"}`} style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs text-[#94a3b8] tabular-nums">{pct}%</span>
                        </div>
                        <div className="text-[10px] text-[#64748b] mt-1">
                          {sent}/{total} sent {failed > 0 && <span className="text-red-400">· {failed} failed</span>}
                          {isRecovering && (
                            <span className="text-violet-400"> · resumed {resumedAt ? new Date(resumedAt).toLocaleTimeString() : ""}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        {openRate !== null || clickRate !== null ? (
                          <div className="text-xs space-y-0.5">
                            <div className="flex items-center gap-1 text-blue-400">
                              <Eye className="h-3 w-3" />
                              <span>{openRate ?? 0}%</span>
                              <span className="text-[#475569]">({c.openCount})</span>
                            </div>
                            <div className="flex items-center gap-1 text-purple-400">
                              <MousePointerClick className="h-3 w-3" />
                              <span>{clickRate ?? 0}%</span>
                              <span className="text-[#475569]">({c.clickCount})</span>
                            </div>
                          </div>
                        ) : (
                          <span className="text-[#475569] text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[#94a3b8] hidden sm:table-cell text-xs">
                        {c.sentAt ? new Date(c.sentAt).toLocaleString() : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <button onClick={() => openDetail(c.id)} title="View details"
                            className="p-1.5 text-[#94a3b8] hover:text-white hover:bg-[#0f1729] rounded">
                            <Eye className="h-4 w-4" />
                          </button>
                          <button onClick={() => handleDelete(c.id)} title="Delete"
                            className="p-1.5 text-[#94a3b8] hover:text-red-400 hover:bg-[#0f1729] rounded">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Preview modal ── */}
      {previewOpen && (
        <Modal title="Email Preview" onClose={() => setPreviewOpen(false)} maxWidth="max-w-3xl">
          <div className="bg-white rounded-md overflow-hidden">
            <div className="p-3 border-b border-gray-200 text-xs text-gray-700 bg-gray-50">
              <div><strong>From:</strong> {fromName} &lt;{fromAddress}&gt;</div>
              <div><strong>Subject:</strong> {subject || "(no subject)"}</div>
            </div>
            <iframe
              title="email-preview"
              srcDoc={htmlBody}
              className="w-full bg-white"
              style={{ height: "60vh", border: "none" }}
            />
          </div>
        </Modal>
      )}

      {/* ── Confirm send modal ── */}
      {confirmOpen && (
        <Modal title="Confirm Send" onClose={() => setConfirmOpen(false)} maxWidth="max-w-md">
          <div className="space-y-4">
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-sm text-amber-300 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                You are about to send an email to <strong>{audienceCount}</strong> {audienceCount === 1 ? "recipient" : "recipients"}. This cannot be undone.
              </div>
            </div>
            <div className="bg-[#0f1729] rounded-md p-3 text-sm space-y-1">
              <div><span className="text-[#64748b]">Subject:</span> <span className="text-white">{subject}</span></div>
              <div><span className="text-[#64748b]">From:</span> <span className="text-white">{fromName} &lt;{fromAddress}&gt;</span></div>
              <div><span className="text-[#64748b]">Audience:</span> <span className="text-white capitalize">{audience}</span></div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmOpen(false)} disabled={sending}
                className="px-4 py-2 rounded-md text-sm text-[#94a3b8] hover:text-white border border-[#2a3a55] hover:bg-[#0f1729]">
                Cancel
              </button>
              <button onClick={handleSend} disabled={sending}
                className="bg-[#3b82f6] hover:bg-[#2563eb] text-white px-4 py-2 rounded-md text-sm font-semibold flex items-center gap-2">
                {sending ? <><Loader2 className="h-4 w-4 animate-spin" />Sending…</> : <><Send className="h-4 w-4" />Confirm & Send</>}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Detail modal ── */}
      {detail && (
        <Modal title={`Campaign #${detail.campaign.id}`} onClose={() => setDetail(null)} maxWidth="max-w-3xl">
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              <Stat label="Total" value={detail.campaign.totalRecipients} />
              <Stat label="Sent" value={detail.campaign.sentCount} color="text-emerald-400" />
              <Stat label="Failed" value={detail.campaign.failedCount} color="text-red-400" />
              <Stat
                label="Open Rate"
                value={detail.campaign.sentCount > 0
                  ? `${Math.round((detail.campaign.openCount / detail.campaign.sentCount) * 100)}%`
                  : "—"}
                sub={`${detail.campaign.openCount} opened`}
                color="text-blue-400"
              />
              <Stat
                label="Click Rate"
                value={detail.campaign.sentCount > 0
                  ? `${Math.round((detail.campaign.clickCount / detail.campaign.sentCount) * 100)}%`
                  : "—"}
                sub={`${detail.campaign.clickCount} clicked`}
                color="text-purple-400"
              />
              <Stat label="Status" value={detail.campaign.status} />
              {detail.campaign.resumeCount > 0 && (
                <Stat
                  label="Recovery"
                  value={detail.campaign.resumeCount === 1 ? "Resumed once" : `Resumed ×${detail.campaign.resumeCount}`}
                  sub={detail.campaign.resumedAt ? `Last: ${new Date(detail.campaign.resumedAt).toLocaleString()}` : undefined}
                  color="text-violet-400"
                />
              )}
            </div>
            <div className="bg-[#0f1729] rounded p-3 text-sm">
              <div><span className="text-[#64748b]">Subject:</span> <span className="text-white">{detail.campaign.subject}</span></div>
              <div><span className="text-[#64748b]">From:</span> <span className="text-white">{detail.campaign.fromName} &lt;{detail.campaign.fromAddress}&gt;</span></div>
              <div><span className="text-[#64748b]">Sent at:</span> <span className="text-white">{detail.campaign.sentAt ? new Date(detail.campaign.sentAt).toLocaleString() : "—"}</span></div>
            </div>
            <div className="max-h-80 overflow-y-auto border border-[#2a3a55] rounded">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-[#1a2332]">
                  <tr className="text-left text-[#64748b] border-b border-[#2a3a55]">
                    <th className="px-3 py-2">Email</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Opens</th>
                    <th className="px-3 py-2">Clicks</th>
                    <th className="px-3 py-2">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.recipients.map(r => (
                    <tr key={r.id} className="border-b border-[#2a3a55]/50">
                      <td className="px-3 py-1.5 text-white">{r.email}</td>
                      <td className="px-3 py-1.5"><StatusPill status={r.status} /></td>
                      <td className="px-3 py-1.5">
                        {r.openCount > 0
                          ? <span className="text-blue-400 flex items-center gap-1"><Eye className="h-3 w-3" />{r.openCount}</span>
                          : <span className="text-[#475569]">—</span>}
                      </td>
                      <td className="px-3 py-1.5">
                        {r.clickCount > 0
                          ? <span className="text-purple-400 flex items-center gap-1"><MousePointerClick className="h-3 w-3" />{r.clickCount}</span>
                          : <span className="text-[#475569]">—</span>}
                      </td>
                      <td className="px-3 py-1.5 text-red-400 truncate max-w-xs">{r.errorMessage ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg shadow-lg text-sm flex items-center gap-2 ${
          toast.kind === "ok" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
        }`}>
          {toast.kind === "ok" ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}

/* ── Helpers ── */
function StatusPill({ status }: { status: string }) {
  const map: Record<string, { color: string; icon: React.ElementType }> = {
    sent: { color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", icon: CheckCircle2 },
    sending: { color: "bg-blue-500/15 text-blue-400 border-blue-500/30", icon: Loader2 },
    recovering: { color: "bg-violet-500/15 text-violet-300 border-violet-500/30", icon: RefreshCw },
    pending: { color: "bg-amber-500/15 text-amber-400 border-amber-500/30", icon: Clock },
    failed: { color: "bg-red-500/15 text-red-400 border-red-500/30", icon: XCircle },
    partial: { color: "bg-orange-500/15 text-orange-400 border-orange-500/30", icon: AlertTriangle },
    draft: { color: "bg-[#0f1729] text-[#94a3b8] border-[#2a3a55]", icon: FileText },
  };
  const m = map[status] ?? map["draft"];
  const Icon = m.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${m.color} capitalize`}>
      <Icon className={`h-3 w-3 ${status === "sending" || status === "recovering" ? "animate-spin" : ""}`} />
      {status}
    </span>
  );
}

function Stat({ label, value, color, sub }: { label: string; value: string | number; color?: string; sub?: string }) {
  return (
    <div className="bg-[#0f1729] rounded-md p-3 border border-[#2a3a55]">
      <div className="text-[10px] text-[#64748b] uppercase tracking-wide">{label}</div>
      <div className={`text-lg font-bold mt-0.5 capitalize ${color ?? "text-white"}`}>{value}</div>
      {sub && <div className="text-[10px] text-[#64748b] mt-0.5">{sub}</div>}
    </div>
  );
}

function Modal({ title, onClose, children, maxWidth = "max-w-md" }: { title: string; onClose: () => void; children: React.ReactNode; maxWidth?: string }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3" onClick={onClose}>
      <div className={`bg-[#1a2332] border border-[#2a3a55] rounded-xl w-full ${maxWidth} max-h-[90vh] overflow-y-auto`} onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-[#2a3a55] flex items-center justify-between sticky top-0 bg-[#1a2332]">
          <h3 className="font-bold text-white">{title}</h3>
          <button onClick={onClose} className="text-[#94a3b8] hover:text-white">
            <XCircle className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
