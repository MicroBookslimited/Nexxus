import type { Dispatch, SetStateAction } from "react";
import { ArrowLeft, CheckCircle2, Check, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { logSupportSelfResolved } from "@/lib/saas-api";
import { CategoryCard } from "./components/CategoryCard";
import { ProgressBar } from "./components/ProgressBar";
import {
  FLOW_CATEGORIES,
  SUBCATEGORIES,
  smartFaqFor,
  IMPACT_OPTIONS,
  TIMING_OPTIONS,
  DEVICE_CHECK_OPTIONS,
  ADDITIONAL_NOTES_MAX,
} from "./data/flowData";
import type { TicketDraft } from "./types";

const TOTAL_STEPS = 8;

interface GuidedFlowProps {
  draft: TicketDraft;
  patchDraft: (patch: Partial<TicketDraft>) => void;
  step: number;
  setStep: Dispatch<SetStateAction<number>>;
  resolved: boolean;
  setResolved: Dispatch<SetStateAction<boolean>>;
  onBackToHome: () => void;
  onReview: () => void;
}

export function GuidedFlow({
  draft,
  patchDraft,
  step,
  setStep,
  resolved,
  setResolved,
  onBackToHome,
  onReview,
}: GuidedFlowProps) {

  const goBack = () => {
    if (step === 1) onBackToHome();
    else setStep((s) => s - 1);
  };

  const selectCategory = (key: string, label: string) => {
    patchDraft({ categoryKey: key, category: label, subCategory: "" });
    setStep(2);
  };

  const selectSub = (sub: string) => {
    patchDraft({ subCategory: sub });
    setStep(3);
  };

  const markSelfResolved = async () => {
    setResolved(true);
    try {
      await logSupportSelfResolved({
        businessName: draft.businessName,
        category: draft.category,
        subCategory: draft.subCategory,
      });
    } catch {
      // Non-blocking: the resolution screen still shows if logging fails.
    }
  };

  const toggleStep = (label: string) => {
    const has = draft.stepsTaken.includes(label);
    patchDraft({
      stepsTaken: has
        ? draft.stepsTaken.filter((s) => s !== label)
        : [...draft.stepsTaken, label],
    });
  };

  if (resolved) {
    return (
      <div className="flex flex-col items-center text-center py-10">
        <div className="rounded-full bg-emerald-500/10 p-4 mb-4">
          <CheckCircle2 className="h-12 w-12 text-emerald-400" />
        </div>
        <h1 className="text-2xl font-bold text-slate-100">Glad that helped!</h1>
        <p className="mt-2 max-w-sm text-sm text-slate-400">
          We've noted that this answer solved your issue. You can always come back if you need us.
        </p>
        <Button onClick={onBackToHome} className="mt-6 bg-amber-500 hover:bg-amber-600 text-slate-900">
          Back to Support Home
        </Button>
      </div>
    );
  }

  const subOptions = SUBCATEGORIES[draft.categoryKey] ?? [];

  return (
    <div>
      <div className="mb-5 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={goBack} className="text-slate-300">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <ProgressBar current={step} total={TOTAL_STEPS} />
        </div>
      </div>

      {/* STEP 1 — Category */}
      {step === 1 && (
        <div>
          <h1 className="text-xl font-bold text-slate-100">What area is the issue in?</h1>
          <p className="text-sm text-slate-400 mt-1 mb-5">
            Tap to select — we'll guide you from here
          </p>
          <div className="grid grid-cols-2 gap-3">
            {FLOW_CATEGORIES.map((c) => (
              <CategoryCard
                key={c.key}
                icon={c.icon}
                label={c.label}
                accent={c.accent}
                selected={draft.categoryKey === c.key}
                onClick={() => selectCategory(c.key, c.label)}
              />
            ))}
          </div>
        </div>
      )}

      {/* STEP 2 — Sub-category */}
      {step === 2 && (
        <div>
          <h1 className="text-xl font-bold text-slate-100">What specifically is the problem?</h1>
          <p className="text-sm text-slate-400 mt-1 mb-5">{draft.category}</p>
          <div className="space-y-2">
            {subOptions.map((sub) => (
              <OptionRow
                key={sub}
                label={sub}
                selected={draft.subCategory === sub}
                onClick={() => selectSub(sub)}
              />
            ))}
          </div>
        </div>
      )}

      {/* STEP 3 — Smart FAQ check */}
      {step === 3 && (
        <div>
          <h1 className="text-xl font-bold text-slate-100">Have you tried this?</h1>
          <p className="text-sm text-slate-400 mt-1 mb-5">{draft.subCategory}</p>
          <div className="rounded-2xl border border-amber-400/30 bg-amber-400/5 p-5">
            <div className="flex items-start gap-3">
              <Lightbulb className="h-5 w-5 flex-shrink-0 text-amber-400 mt-0.5" />
              <p className="text-sm leading-relaxed text-slate-200">
                {smartFaqFor(draft.subCategory)}
              </p>
            </div>
          </div>
          <div className="mt-5 space-y-3">
            <Button
              onClick={markSelfResolved}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white h-12"
            >
              This fixed it — I'm good ✓
            </Button>
            <Button
              onClick={() => setStep(4)}
              variant="outline"
              className="w-full border-slate-600 text-slate-200 h-12"
            >
              Still not working
            </Button>
          </div>
        </div>
      )}

      {/* STEP 4 — Impact */}
      {step === 4 && (
        <div>
          <h1 className="text-xl font-bold text-slate-100">
            How is this affecting you right now?
          </h1>
          <div className="mt-5 space-y-3">
            {IMPACT_OPTIONS.map((opt) => {
              const selected = draft.impact === opt.label;
              return (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => {
                    patchDraft({ impact: opt.label, priority: opt.priority });
                    setStep(5);
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition-all min-h-[72px] active:scale-[0.99]",
                    selected
                      ? opt.accent
                      : "border-slate-700 bg-slate-800/60 hover:border-slate-500",
                  )}
                >
                  <span className="text-xl">{opt.emoji}</span>
                  <span className="text-sm font-medium text-slate-100">{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* STEP 5 — Timing */}
      {step === 5 && (
        <div>
          <h1 className="text-xl font-bold text-slate-100">When did this start?</h1>
          <div className="mt-5 space-y-2">
            {TIMING_OPTIONS.map((t) => (
              <OptionRow
                key={t}
                label={t}
                selected={draft.startedWhen === t}
                onClick={() => {
                  patchDraft({ startedWhen: t });
                  setStep(6);
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* STEP 6 — Device check */}
      {step === 6 && (
        <div>
          <h1 className="text-xl font-bold text-slate-100">Quick device check</h1>
          <p className="text-sm text-slate-400 mt-1 mb-5">Tap all that apply</p>
          <div className="space-y-2">
            {DEVICE_CHECK_OPTIONS.map((d) => {
              const checked = draft.stepsTaken.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleStep(d)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border p-4 text-left transition-all min-h-[56px]",
                    checked
                      ? "border-amber-400 bg-amber-400/10"
                      : "border-slate-700 bg-slate-800/60 hover:border-slate-500",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border",
                      checked ? "border-amber-400 bg-amber-400" : "border-slate-500",
                    )}
                  >
                    {checked && <Check className="h-3.5 w-3.5 text-slate-900" />}
                  </span>
                  <span className="text-sm font-medium text-slate-100">{d}</span>
                </button>
              );
            })}
          </div>
          <Button
            onClick={() => setStep(7)}
            className="mt-6 w-full bg-amber-500 hover:bg-amber-600 text-slate-900 h-12"
          >
            Continue
          </Button>
        </div>
      )}

      {/* STEP 7 — Additional details */}
      {step === 7 && (
        <div>
          <h1 className="text-xl font-bold text-slate-100">Anything else we should know?</h1>
          <p className="text-sm text-slate-400 mt-1 mb-5">Optional — skip if nothing to add</p>
          <Textarea
            value={draft.additionalNotes}
            maxLength={ADDITIONAL_NOTES_MAX}
            onChange={(e) => patchDraft({ additionalNotes: e.target.value })}
            placeholder="e.g. error message you saw, product name affected, order reference number..."
            className="min-h-[120px] bg-slate-800/60 border-slate-700 text-slate-100"
          />
          <div className="mt-1 text-right text-xs text-slate-500">
            {draft.additionalNotes.length}/{ADDITIONAL_NOTES_MAX}
          </div>
          <div className="mt-5 flex gap-3">
            <Button
              variant="outline"
              onClick={() => {
                patchDraft({ additionalNotes: "" });
                setStep(8);
              }}
              className="flex-1 border-slate-600 text-slate-200 h-12"
            >
              Skip
            </Button>
            <Button
              onClick={() => setStep(8)}
              className="flex-1 bg-amber-500 hover:bg-amber-600 text-slate-900 h-12"
            >
              Continue
            </Button>
          </div>
        </div>
      )}

      {/* STEP 8 — Contact confirmation */}
      {step === 8 && (
        <div>
          <h1 className="text-xl font-bold text-slate-100">Who should we contact?</h1>
          <p className="text-sm text-slate-400 mt-1 mb-5">
            Pre-filled from your account — edit if needed
          </p>
          <div className="space-y-4">
            <div>
              <Label className="text-slate-300">Business Name</Label>
              <Input
                value={draft.businessName}
                onChange={(e) => patchDraft({ businessName: e.target.value })}
                className="mt-1 bg-slate-800/60 border-slate-700 text-slate-100"
              />
            </div>
            <div>
              <Label className="text-slate-300">Contact Name</Label>
              <Input
                value={draft.contactName}
                onChange={(e) => patchDraft({ contactName: e.target.value })}
                className="mt-1 bg-slate-800/60 border-slate-700 text-slate-100"
              />
            </div>
            <div>
              <Label className="text-slate-300">Phone number</Label>
              <Input
                value={draft.contactPhone}
                onChange={(e) => patchDraft({ contactPhone: e.target.value })}
                placeholder="Optional"
                className="mt-1 bg-slate-800/60 border-slate-700 text-slate-100"
              />
            </div>
            <div>
              <Label className="text-slate-300">Email address</Label>
              <Input
                type="email"
                value={draft.contactEmail}
                onChange={(e) => patchDraft({ contactEmail: e.target.value })}
                className="mt-1 bg-slate-800/60 border-slate-700 text-slate-100"
              />
            </div>
          </div>
          <Button
            onClick={onReview}
            disabled={!draft.businessName.trim() || !draft.contactEmail.trim()}
            className="mt-6 w-full bg-amber-500 hover:bg-amber-600 text-slate-900 h-12 disabled:opacity-50"
          >
            Review Ticket →
          </Button>
        </div>
      )}
    </div>
  );
}

function OptionRow({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center rounded-xl border p-4 text-left transition-all min-h-[56px] active:scale-[0.99]",
        selected
          ? "border-amber-400 bg-amber-400/10"
          : "border-slate-700 bg-slate-800/60 hover:border-slate-500",
      )}
    >
      <span className="text-sm font-medium text-slate-100">{label}</span>
    </button>
  );
}
