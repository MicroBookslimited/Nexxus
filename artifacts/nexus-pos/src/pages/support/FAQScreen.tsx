import { useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  Monitor,
  Package,
  Users,
  BarChart2,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FAQ_CATEGORIES } from "./data/faqData";

const ICONS: Record<string, LucideIcon> = {
  monitor: Monitor,
  package: Package,
  users: Users,
  chart: BarChart2,
};

interface FAQScreenProps {
  onBack: () => void;
  onSubmitTicket: () => void;
}

export function FAQScreen({ onBack, onSubmitTicket }: FAQScreenProps) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={onBack} className="text-slate-300">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold text-slate-100">Frequently Asked Questions</h1>
      </div>

      <div className="space-y-6">
        {FAQ_CATEGORIES.map((cat) => {
          const Icon = ICONS[cat.icon] ?? Monitor;
          return (
            <div key={cat.key}>
              <div className="flex items-center gap-2 mb-2">
                <Icon className={cn("h-5 w-5", cat.color)} />
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
                  {cat.title}
                </h2>
              </div>
              <div className="space-y-2">
                {cat.items.map((item) => {
                  const id = `${cat.key}:${item.q}`;
                  const isOpen = open === id;
                  return (
                    <div
                      key={id}
                      className="rounded-xl border border-slate-700 bg-slate-800/40 overflow-hidden"
                    >
                      <button
                        type="button"
                        onClick={() => setOpen(isOpen ? null : id)}
                        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                      >
                        <span className="text-sm font-medium text-slate-100">{item.q}</span>
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 flex-shrink-0 text-slate-400 transition-transform",
                            isOpen && "rotate-180",
                          )}
                        />
                      </button>
                      {isOpen && (
                        <div className="px-4 pb-4 text-sm leading-relaxed text-slate-300">
                          {item.a}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-8 rounded-2xl border border-amber-400/30 bg-amber-400/5 p-5 text-center">
        <p className="text-sm font-medium text-slate-200 mb-3">Didn't find your answer?</p>
        <Button onClick={onSubmitTicket} className="bg-amber-500 hover:bg-amber-600 text-slate-900">
          Submit a Support Ticket →
        </Button>
      </div>
    </div>
  );
}
