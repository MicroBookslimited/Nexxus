import { BookOpen, Send, MessageCircle, Phone, Mail, LifeBuoy } from "lucide-react";
import { SUPPORT_CONTACT } from "./data/contact";

interface SupportHomeProps {
  onBrowseFaqs: () => void;
  onSubmitTicket: () => void;
}

export function SupportHome({ onBrowseFaqs, onSubmitTicket }: SupportHomeProps) {
  const { whatsappNumber, phoneNumber, email } = SUPPORT_CONTACT;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="rounded-full bg-amber-400/10 p-2.5">
          <LifeBuoy className="h-6 w-6 text-amber-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-100">How can we help?</h1>
          <p className="text-sm text-slate-400">Get instant answers or reach our team.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button
          type="button"
          onClick={onBrowseFaqs}
          className="flex flex-col items-start gap-3 rounded-2xl border border-slate-700 bg-slate-800/60 p-6 text-left transition-all hover:border-blue-500 hover:bg-slate-800 active:scale-[0.98] min-h-[140px]"
        >
          <div className="rounded-xl bg-blue-500/10 p-3">
            <BookOpen className="h-7 w-7 text-blue-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Browse FAQs</h2>
            <p className="text-sm text-slate-400 mt-1">Find instant answers to common questions</p>
          </div>
        </button>

        <button
          type="button"
          onClick={onSubmitTicket}
          className="flex flex-col items-start gap-3 rounded-2xl border border-slate-700 bg-slate-800/60 p-6 text-left transition-all hover:border-amber-400 hover:bg-slate-800 active:scale-[0.98] min-h-[140px]"
        >
          <div className="rounded-xl bg-amber-400/10 p-3">
            <Send className="h-7 w-7 text-amber-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Submit a Ticket</h2>
            <p className="text-sm text-slate-400 mt-1">Can't find your answer? We'll help you</p>
          </div>
        </button>
      </div>

      <div className="mt-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">
          Contact us directly
        </p>
        <div className="space-y-2">
          {whatsappNumber && (
            <a
              href={`https://wa.me/${whatsappNumber}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-800/40 px-4 py-3 transition-colors hover:border-emerald-500"
            >
              <MessageCircle className="h-5 w-5 text-emerald-400" />
              <span className="text-sm font-medium text-slate-200">Chat on WhatsApp</span>
            </a>
          )}
          {phoneNumber && (
            <a
              href={`tel:${phoneNumber}`}
              className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-800/40 px-4 py-3 transition-colors hover:border-sky-500"
            >
              <Phone className="h-5 w-5 text-sky-400" />
              <span className="text-sm font-medium text-slate-200">{phoneNumber}</span>
            </a>
          )}
          <a
            href={`mailto:${email}`}
            className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-800/40 px-4 py-3 transition-colors hover:border-amber-400"
          >
            <Mail className="h-5 w-5 text-amber-400" />
            <span className="text-sm font-medium text-slate-200">{email}</span>
          </a>
        </div>
      </div>
    </div>
  );
}
