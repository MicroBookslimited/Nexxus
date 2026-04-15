import { useState, useEffect } from "react";
import { ShieldAlert, ArrowLeft, X } from "lucide-react";
import { TENANT_TOKEN_KEY, SUPERADMIN_TOKEN_KEY } from "@/lib/saas-api";

const IMPERSONATION_BUSINESS_KEY = "nexus_impersonation_business";
const IMPERSONATION_LOG_ID_KEY = "nexus_impersonation_log_id";

function decodeJwt(token: string): Record<string, unknown> | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    return JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
  } catch { return null; }
}

function isImpersonating(): { active: boolean; business: string; logId: number | null } {
  const token = localStorage.getItem(TENANT_TOKEN_KEY);
  if (!token) return { active: false, business: "", logId: null };
  const payload = decodeJwt(token);
  if (!payload?.impersonation) return { active: false, business: "", logId: null };
  const business = localStorage.getItem(IMPERSONATION_BUSINESS_KEY) ?? "tenant";
  const rawLogId = localStorage.getItem(IMPERSONATION_LOG_ID_KEY);
  const logId = rawLogId ? parseInt(rawLogId) : null;
  return { active: true, business, logId };
}

async function endImpersonation(logId: number | null) {
  if (logId) {
    try {
      await fetch("/api/superadmin/impersonation-end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logId }),
      });
    } catch { /* fire and forget */ }
  }
}

export function ImpersonationBanner() {
  const [state, setState] = useState(() => isImpersonating());

  useEffect(() => {
    setState(isImpersonating());
  }, []);

  if (!state.active) return null;

  const handleBack = async () => {
    await endImpersonation(state.logId);
    localStorage.removeItem(TENANT_TOKEN_KEY);
    localStorage.removeItem(IMPERSONATION_BUSINESS_KEY);
    localStorage.removeItem(IMPERSONATION_LOG_ID_KEY);
    sessionStorage.removeItem("nexus_staff_session");
    const saToken = localStorage.getItem(SUPERADMIN_TOKEN_KEY);
    if (saToken) {
      window.location.href = "/superadmin";
    } else {
      window.location.href = "/superadmin";
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 bg-amber-500 text-black text-sm font-medium z-50 shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <ShieldAlert size={15} className="shrink-0" />
        <span className="truncate">
          Superadmin impersonating: <strong>{state.business}</strong>
        </span>
      </div>
      <button
        onClick={handleBack}
        className="flex items-center gap-1.5 px-2.5 py-1 bg-black/20 hover:bg-black/30 rounded-md text-xs font-semibold transition-colors shrink-0 whitespace-nowrap"
      >
        <ArrowLeft size={12} /> Back to Superadmin
      </button>
    </div>
  );
}

export function storeImpersonationMeta(businessName: string, logId?: number) {
  localStorage.setItem(IMPERSONATION_BUSINESS_KEY, businessName);
  if (logId) localStorage.setItem(IMPERSONATION_LOG_ID_KEY, String(logId));
}
