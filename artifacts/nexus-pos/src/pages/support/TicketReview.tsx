import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { submitSupportTicket } from "@/lib/saas-api";
import type { CreateSupportTicketResult } from "@/lib/saas-api";
import { PRIORITY_META } from "./data/flowData";
import type { TicketDraft } from "./types";

interface TicketReviewProps {
  draft: TicketDraft;
  onEdit: () => void;
  onSubmitted: (result: CreateSupportTicketResult) => void;
}

export function TicketReview({ draft, onEdit, onSubmitted }: TicketReviewProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const meta = PRIORITY_META[draft.priority];

  const submit = async () => {
    setSubmitting(true);
    setError("");
    try {
      const result = await submitSupportTicket({
        businessName: draft.businessName,
        contactName: draft.contactName || undefined,
        contactPhone: draft.contactPhone || undefined,
        contactEmail: draft.contactEmail || undefined,
        category: draft.category,
        subCategory: draft.subCategory,
        impact: draft.impact || undefined,
        priority: draft.priority,
        startedWhen: draft.startedWhen || undefined,
        stepsTaken: draft.stepsTaken,
        additionalNotes: draft.additionalNotes || undefined,
      });
      onSubmitted(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onEdit} className="text-slate-300">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold text-slate-100">Review Your Ticket</h1>
      </div>

      <div className="rounded-2xl border border-slate-700 bg-slate-800/40 p-5">
        <Row label="Business" value={draft.businessName} />
        <Row
          label="Contact"
          value={[draft.contactName, draft.contactPhone, draft.contactEmail]
            .filter(Boolean)
            .join("  |  ")}
        />
        <Row label="Category" value={draft.category} />
        <Row label="Issue" value={draft.subCategory} />
        <Row label="Impact" value={draft.impact || "—"} />
        <Row label="Started" value={draft.startedWhen || "—"} />
        <Row
          label="Steps taken"
          value={draft.stepsTaken.length ? draft.stepsTaken.join(", ") : "None"}
        />
        <Row label="Notes" value={draft.additionalNotes || "None"} />
        <div className="flex items-center justify-between py-2">
          <span className="text-sm text-slate-400">Priority</span>
          <span
            className="rounded-full px-3 py-1 text-xs font-bold text-white"
            style={{ backgroundColor: meta.color }}
          >
            {meta.label}
          </span>
        </div>
      </div>

      <p className="mt-3 text-center text-xs text-slate-500">
        A ticket reference will be generated when you submit.
      </p>

      {error && (
        <p className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      )}

      <div className="mt-6 flex gap-3">
        <Button
          variant="outline"
          onClick={onEdit}
          disabled={submitting}
          className="flex-1 border-slate-600 text-slate-200 h-12"
        >
          ← Edit
        </Button>
        <Button
          onClick={submit}
          disabled={submitting}
          className="flex-1 bg-amber-500 hover:bg-amber-600 text-slate-900 h-12"
        >
          {submitting ? "Submitting…" : "Submit Ticket →"}
        </Button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-700/60 py-2 last:border-0">
      <span className="text-sm text-slate-400 flex-shrink-0">{label}</span>
      <span className="text-sm font-medium text-slate-100 text-right">{value}</span>
    </div>
  );
}
