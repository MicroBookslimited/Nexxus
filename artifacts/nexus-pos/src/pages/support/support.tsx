import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { LifeBuoy } from "lucide-react";
import { PinPad } from "@/components/PinPad";
import { Button } from "@/components/ui/button";
import { useStaff } from "@/contexts/StaffContext";
import { saasMe } from "@/lib/saas-api";
import type { CreateSupportTicketResult } from "@/lib/saas-api";
import { SupportHome } from "./SupportHome";
import { FAQScreen } from "./FAQScreen";
import { GuidedFlow } from "./GuidedFlow";
import { TicketReview } from "./TicketReview";
import { TicketSuccess } from "./TicketSuccess";
import { EMPTY_DRAFT, type TicketDraft, type SupportScreen } from "./types";

const MANAGER_ROLES = ["Manager", "Admin", "Owner"];

export default function Support() {
  const [, setLocation] = useLocation();
  const { staff } = useStaff();
  const [authed, setAuthed] = useState(false);
  const [pinError, setPinError] = useState("");
  const [screen, setScreen] = useState<SupportScreen>("home");
  const [draft, setDraft] = useState<TicketDraft>(EMPTY_DRAFT);
  const [result, setResult] = useState<CreateSupportTicketResult | null>(null);
  // Wizard position lifted here so "Edit" from Review returns to the last step.
  const [flowStep, setFlowStep] = useState(1);
  const [flowResolved, setFlowResolved] = useState(false);

  // Prefill business + email from the tenant record once authenticated.
  useEffect(() => {
    if (!authed) return;
    let cancelled = false;
    saasMe()
      .then((me) => {
        if (cancelled) return;
        setDraft((d) => ({
          ...d,
          businessName: d.businessName || me.tenant.businessName || "",
          contactEmail: d.contactEmail || me.tenant.email || "",
        }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [authed]);

  // Prefill contact name from the active staff member.
  useEffect(() => {
    if (staff?.name) setDraft((d) => ({ ...d, contactName: d.contactName || staff.name }));
  }, [staff?.name]);

  const patchDraft = (patch: Partial<TicketDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const startFresh = () => {
    setDraft((d) => ({
      ...EMPTY_DRAFT,
      businessName: d.businessName,
      contactName: d.contactName,
      contactEmail: d.contactEmail,
    }));
    setResult(null);
    setFlowStep(1);
    setFlowResolved(false);
  };

  if (!authed) {
    return (
      <div className="min-h-full flex items-center justify-center p-6">
        <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-800/60 p-6">
          <div className="flex flex-col items-center text-center mb-5">
            <div className="rounded-full bg-amber-400/10 p-3 mb-3">
              <LifeBuoy className="h-8 w-8 text-amber-400" />
            </div>
            <h1 className="text-xl font-bold text-slate-100">Support Centre</h1>
            <p className="text-sm text-slate-400 mt-1">
              Enter a Manager PIN to access support.
            </p>
          </div>
          <PinPad
            requiredRoles={MANAGER_ROLES}
            title=""
            subtitle=""
            submitLabel="Unlock Support"
            onSuccess={() => {
              setPinError("");
              setAuthed(true);
            }}
            onError={(msg) => setPinError(msg)}
          />
          {pinError && (
            <p className="mt-3 text-center text-sm text-red-400">{pinError}</p>
          )}
          <Button
            variant="ghost"
            className="mt-4 w-full text-slate-400"
            onClick={() => setLocation("/dashboard")}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full">
      <div className="mx-auto w-full max-w-2xl p-4 sm:p-6">
        {screen === "home" && (
          <SupportHome
            onBrowseFaqs={() => setScreen("faq")}
            onSubmitTicket={() => {
              startFresh();
              setScreen("flow");
            }}
          />
        )}

        {screen === "faq" && (
          <FAQScreen
            onBack={() => setScreen("home")}
            onSubmitTicket={() => {
              startFresh();
              setScreen("flow");
            }}
          />
        )}

        {screen === "flow" && (
          <GuidedFlow
            draft={draft}
            patchDraft={patchDraft}
            step={flowStep}
            setStep={setFlowStep}
            resolved={flowResolved}
            setResolved={setFlowResolved}
            onBackToHome={() => setScreen("home")}
            onReview={() => setScreen("review")}
          />
        )}

        {screen === "review" && (
          <TicketReview
            draft={draft}
            onEdit={() => setScreen("flow")}
            onSubmitted={(res) => {
              setResult(res);
              setScreen("success");
            }}
          />
        )}

        {screen === "success" && result && (
          <TicketSuccess
            result={result}
            contactEmail={draft.contactEmail}
            onHome={() => {
              startFresh();
              setScreen("home");
            }}
            onExit={() => setLocation("/dashboard")}
          />
        )}
      </div>
    </div>
  );
}
