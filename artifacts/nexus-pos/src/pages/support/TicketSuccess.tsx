import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CreateSupportTicketResult } from "@/lib/saas-api";
import { PRIORITY_META } from "./data/flowData";

interface TicketSuccessProps {
  result: CreateSupportTicketResult;
  contactEmail: string;
  onHome: () => void;
  onExit: () => void;
}

export function TicketSuccess({ result, contactEmail, onHome, onExit }: TicketSuccessProps) {
  const meta = PRIORITY_META[result.priority];

  return (
    <div className="flex flex-col items-center text-center py-8">
      <div className="rounded-full bg-emerald-500/10 p-5 mb-5 animate-in zoom-in duration-300">
        <CheckCircle2 className="h-16 w-16 text-emerald-400" />
      </div>
      <h1 className="text-2xl font-bold text-slate-100">Ticket Submitted!</h1>
      <p className="mt-2 text-sm text-slate-400">MicroBooks will respond within:</p>
      <p className="mt-1 text-lg font-semibold" style={{ color: meta.color }}>
        {result.responseTarget || meta.response}
      </p>

      <div className="mt-6 rounded-2xl border border-slate-700 bg-slate-800/40 px-6 py-4">
        <p className="text-xs uppercase tracking-wide text-slate-500">Your ticket reference</p>
        <p className="mt-1 text-xl font-bold tracking-wider text-amber-400">{result.ticketRef}</p>
      </div>

      <p className="mt-4 max-w-sm text-sm text-slate-400">
        Our support team has been notified. Save your reference above — we'll follow up
        {contactEmail ? (
          <>
            {" "}
            at <span className="text-slate-200">{contactEmail}</span>
          </>
        ) : null}
        .
      </p>

      <div className="mt-8 flex w-full max-w-sm gap-3">
        <Button
          variant="outline"
          onClick={onHome}
          className="flex-1 border-slate-600 text-slate-200 h-12"
        >
          Back to Support Home
        </Button>
        <Button
          onClick={onExit}
          className="flex-1 bg-amber-500 hover:bg-amber-600 text-slate-900 h-12"
        >
          Back to POS
        </Button>
      </div>
    </div>
  );
}
