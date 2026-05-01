import { useState, useEffect } from "react";
import { ShieldAlert, ArrowLeft, Wrench } from "lucide-react";
import { TENANT_TOKEN_KEY, SUPERADMIN_TOKEN_KEY, TECHNICIAN_TOKEN_KEY } from "@/lib/saas-api";

const IMPERSONATION_BUSINESS_KEY = "nexus_impersonation_business";
const IMPERSONATION_LOG_ID_KEY = "nexus_impersonation_log_id";

function decodeJwt(token: string): Record<string, unknown> | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    return JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
  } catch { return null; }
}

interface BannerState {
  active: boolean;
  business: string;
  logId: number | null;
  actorType: "superadmin" | "technician";
  actorName: string;
}

function isImpersonating(): BannerState {
  const empty: BannerState = { active: false, business: "", logId: null, actorType: "superadmin", actorName: "" };
  const token = localStorage.getItem(TENANT_TOKEN_KEY);
  if (!token) return empty;
  const payload = decodeJwt(token);
  if (!payload?.["impersonation"]) return empty;
  const business = localStorage.getItem(IMPERSONATION_BUSINESS_KEY) ?? "tenant";
  const rawLogId = localStorage.getItem(IMPERSONATION_LOG_ID_KEY);
  const logId = rawLogId ? parseInt(rawLogId) : null;
  const actorType = payload["actorType"] === "technician" ? "technician" : "superadmin";
  const actorName = typeof payload["actorName"] === "string" ? (payload["actorName"] as string) : "";
  return { active: true, business, logId, actorType, actorName };
}

async function endImpersonation(logId: number | null, actorType: "superadmin" | "technician") {
  if (!logId) return;
  try {
    if (actorType === "technician") {
      const techToken = localStorage.getItem(TECHNICIAN_TOKEN_KEY);
      await fetch("/api/technician/impersonation-end", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(techToken ? { Authorization: `Bearer ${techToken}` } : {}) },
        body: JSON.stringify({ logId }),
      });
    } else {
      await fetch("/api/superadmin/impersonation-end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logId }),
      });
    }
  } catch { /* fire and forget */ }
}

export function ImpersonationBanner() {
  const [state, setState] = useState(() => isImpersonating());

  useEffect(() => {
    setState(isImpersonating());
  }, []);

  if (!state.active) return null;

  const handleBack = async () => {
    await endImpersonation(state.logId, state.actorType);
    localStorage.removeItem(TENANT_TOKEN_KEY);
    localStorage.removeItem(IMPERSONATION_BUSINESS_KEY);
    localStorage.removeItem(IMPERSONATION_LOG_ID_KEY);
    sessionStorage.removeItem("nexus_staff_session");
    if (state.actorType === "technician") {
      window.location.href = "/technician";
      return;
    }
    const saToken = localStorage.getItem(SUPERADMIN_TOKEN_KEY);
    if (saToken) {
      window.location.href = "/superadmin";
    } else {
      window.location.href = "/superadmin";
    }
  };

  const isTech = state.actorType === "technician";

  return (
    <div className={`flex items-center justify-between gap-3 px-3 py-2 text-sm font-medium z-50 shrink-0 ${isTech ? "bg-blue-500 text-white" : "bg-amber-500 text-black"}`}>
      <div className="flex items-center gap-2 min-w-0">
        {isTech ? <Wrench size={15} className="shrink-0" /> : <ShieldAlert size={15} className="shrink-0" />}
        <span className="truncate">
          {isTech ? (
            <>Technician {state.actorName ? <strong>{state.actorName}</strong> : null} accessing: <strong>{state.business}</strong></>
          ) : (
            <>Superadmin impersonating: <strong>{state.business}</strong></>
          )}
        </span>
      </div>
      <button
        onClick={handleBack}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-colors shrink-0 whitespace-nowrap ${isTech ? "bg-white/20 hover:bg-white/30" : "bg-black/20 hover:bg-black/30"}`}
      >
        <ArrowLeft size={12} /> {isTech ? "Back to Portal" : "Back to Superadmin"}
      </button>
    </div>
  );
}

export function storeImpersonationMeta(businessName: string, logId?: number) {
  localStorage.setItem(IMPERSONATION_BUSINESS_KEY, businessName);
  if (logId) localStorage.setItem(IMPERSONATION_LOG_ID_KEY, String(logId));
}
