/**
 * Public customer-facing portal — no login required.
 * URL: /wo/:id/:token
 * The token is an HMAC-SHA256 fragment generated server-side per work order.
 */
import { useParams } from "wouter";
import { usePublicWorkOrder } from "@workspace/api-client-react";
import { Wrench, Clock, CheckCircle2, Package, Pause, Ban, AlertTriangle } from "lucide-react";

const STATUS_LABEL: Record<string, string> = {
  received: "Received",
  in_progress: "In Progress",
  awaiting_parts: "Awaiting Parts",
  on_hold: "On Hold",
  ready: "Ready for Pickup",
  collected: "Collected",
  cancelled: "Cancelled",
};

const STATUS_STYLES: Record<string, { bg: string; text: string; icon: React.ElementType }> = {
  received:       { bg: "bg-sky-500/15",     text: "text-sky-600",     icon: Clock },
  in_progress:    { bg: "bg-amber-500/15",   text: "text-amber-600",   icon: Wrench },
  awaiting_parts: { bg: "bg-orange-500/15",  text: "text-orange-600",  icon: Package },
  on_hold:        { bg: "bg-slate-500/15",   text: "text-slate-500",   icon: Pause },
  ready:          { bg: "bg-emerald-500/15", text: "text-emerald-600", icon: CheckCircle2 },
  collected:      { bg: "bg-violet-500/15",  text: "text-violet-600",  icon: CheckCircle2 },
  cancelled:      { bg: "bg-rose-500/15",    text: "text-rose-600",    icon: Ban },
};

function fmtDate(d: string | null | undefined) {
  if (!d) return null;
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return null;
  return dt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function fmtDateTime(d: string | null | undefined) {
  if (!d) return null;
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return null;
  return dt.toLocaleString("en-US", {
    year: "numeric", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}

export default function WorkOrderPortalPage() {
  const params = useParams<{ id: string; token: string }>();
  const id = params.id ? parseInt(params.id, 10) : null;
  const token = params.token ?? null;

  const { data: wo, isLoading, error } = usePublicWorkOrder(id, token);

  if (!id || !token) {
    return <PortalError title="Invalid link" message="This work order link is missing required information." />;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <div className="h-8 w-8 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
          <p className="text-sm">Loading work order…</p>
        </div>
      </div>
    );
  }

  if (error || !wo) {
    const msg = error instanceof Error ? error.message : "Work order not found";
    const isInvalid = msg.toLowerCase().includes("invalid") || msg.toLowerCase().includes("expired");
    return (
      <PortalError
        title={isInvalid ? "Invalid link" : "Not found"}
        message={isInvalid ? "This link is invalid or has expired. Please contact the shop for assistance." : "This work order could not be found."}
      />
    );
  }

  const style = STATUS_STYLES[wo.status] ?? STATUS_STYLES["received"];
  const StatusIcon = style.icon;
  const assetLine = [wo.brand, wo.model].filter(Boolean).join(" ");

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header bar */}
      <div className="bg-white border-b border-slate-200 px-4 py-4">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
            <Wrench className="h-4 w-4 text-amber-600" />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Repair Status</p>
            <p className="font-bold text-slate-900 font-mono">{wo.workOrderNumber}</p>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {/* Status card */}
        <div className={`rounded-2xl p-5 ${style.bg} border border-current/10`}>
          <div className="flex items-center gap-3">
            <div className={`h-11 w-11 rounded-xl ${style.bg} flex items-center justify-center`}>
              <StatusIcon className={`h-6 w-6 ${style.text}`} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Current Status</p>
              <p className={`text-xl font-bold ${style.text}`}>{STATUS_LABEL[wo.status] ?? wo.status}</p>
            </div>
          </div>
          {wo.status === "ready" && (
            <div className="mt-3 rounded-xl bg-white/60 px-4 py-2.5 text-sm text-emerald-700 font-medium">
              🎉 Your item is ready for pickup. Please bring this confirmation.
            </div>
          )}
          {wo.promisedDate && wo.status !== "collected" && wo.status !== "cancelled" && (
            <p className="mt-3 text-sm text-slate-600">
              <span className="font-medium">Estimated ready:</span> {fmtDate(wo.promisedDate)}
            </p>
          )}
        </div>

        {/* Item details */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Item Details</p>
          </div>
          <div className="px-5 py-4 space-y-2.5 text-sm">
            <InfoRow label="Item" value={wo.itemDescription} />
            {assetLine && <InfoRow label="Brand / Model" value={assetLine} />}
            {wo.serialNumber && <InfoRow label="Serial" value={wo.serialNumber} />}
            <InfoRow label="Issue reported" value={wo.problemDescription} multiline />
          </div>
        </div>

        {/* Technician updates */}
        {wo.notes.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Updates from Technician</p>
            </div>
            <div className="divide-y divide-slate-100">
              {wo.notes.map((n, i) => (
                <div key={i} className="px-5 py-3.5">
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{n.content}</p>
                  <p className="text-xs text-slate-400 mt-1.5">{fmtDateTime(n.createdAt)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Financial summary */}
        {(wo.total > 0 || wo.depositPaid > 0) && (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Cost Summary</p>
            </div>
            <div className="px-5 py-4 space-y-2.5 text-sm">
              {wo.total > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Total estimate</span>
                  <span className="font-bold text-slate-900">{fmtCurr(wo.total)}</span>
                </div>
              )}
              {wo.depositPaid > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Deposit paid</span>
                  <span className="font-medium text-emerald-600">{fmtCurr(wo.depositPaid)}</span>
                </div>
              )}
              {wo.total > 0 && wo.depositPaid > 0 && wo.total - wo.depositPaid > 0 && (
                <div className="flex justify-between pt-2 border-t border-slate-100">
                  <span className="font-semibold text-slate-700">Balance due on pickup</span>
                  <span className="font-bold text-amber-600">{fmtCurr(wo.total - wo.depositPaid)}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Timeline */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Timeline</p>
          </div>
          <div className="px-5 py-4 space-y-2 text-sm">
            <InfoRow label="Received" value={fmtDate(wo.createdAt) ?? "—"} />
            <InfoRow label="Last updated" value={fmtDate(wo.updatedAt) ?? "—"} />
          </div>
        </div>

        <p className="text-center text-xs text-slate-400 pb-4">
          Powered by NEXXUS POS · {wo.workOrderNumber}
        </p>
      </div>
    </div>
  );
}

function InfoRow({ label, value, multiline }: { label: string; value: string | null | undefined; multiline?: boolean }) {
  if (!value) return null;
  return (
    <div className={multiline ? "space-y-0.5" : "flex justify-between gap-4"}>
      <span className="text-slate-500 font-medium shrink-0">{label}</span>
      <span className={`text-slate-800 ${multiline ? "whitespace-pre-wrap" : "text-right"}`}>{value}</span>
    </div>
  );
}

function PortalError({ title, message }: { title: string; message: string }) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-sm w-full bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-3">
        <div className="h-12 w-12 rounded-2xl bg-rose-100 flex items-center justify-center mx-auto">
          <AlertTriangle className="h-6 w-6 text-rose-500" />
        </div>
        <h1 className="text-lg font-bold text-slate-900">{title}</h1>
        <p className="text-sm text-slate-500">{message}</p>
      </div>
    </div>
  );
}

function fmtCurr(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}
