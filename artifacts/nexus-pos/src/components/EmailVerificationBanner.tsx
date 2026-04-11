import { useState, useEffect } from "react";
import { Mail, X, RefreshCw, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { saasSendVerification } from "@/lib/saas-api";

const DISMISS_KEY = "nexus_email_verify_dismissed";

function getTodayStr() {
  return new Date().toISOString().slice(0, 10);
}

function wasDismissedToday(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === getTodayStr();
  } catch {
    return false;
  }
}

function dismissForToday() {
  try {
    localStorage.setItem(DISMISS_KEY, getTodayStr());
  } catch {}
}

interface Props {
  email: string;
}

export function EmailVerificationBanner({ email }: Props) {
  const [visible, setVisible] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!wasDismissedToday()) {
      // Small delay so it doesn't flash on first paint
      const t = setTimeout(() => setVisible(true), 800);
      return () => clearTimeout(t);
    }
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    dismissForToday();
    setVisible(false);
  };

  const resend = async () => {
    setSending(true);
    try {
      await saasSendVerification();
      setSent(true);
      toast({ title: "Verification email sent", description: `Check your inbox at ${email}` });
    } catch {
      toast({ title: "Failed to send email", description: "Please try again in a moment.", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
    >
      <div
        className="relative w-full max-w-md rounded-2xl shadow-2xl p-8 flex flex-col items-center text-center gap-5"
        style={{ background: "#0f1729", border: "1px solid rgba(59,130,246,0.25)" }}
      >
        {/* Close / dismiss */}
        <button
          onClick={dismiss}
          className="absolute top-4 right-4 text-slate-500 hover:text-slate-200 transition-colors"
          aria-label="Remind me tomorrow"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Icon */}
        <div className="flex items-center justify-center w-16 h-16 rounded-full"
          style={{ background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.3)" }}>
          <Mail className="w-8 h-8 text-blue-400" />
        </div>

        {/* Heading */}
        <div>
          <h2 className="text-xl font-bold text-white mb-2">Verify Your Email Address</h2>
          <p className="text-slate-400 text-sm leading-relaxed">
            To keep your account secure, please verify your email address. We sent a link to{" "}
            <span className="text-blue-400 font-medium break-all">{email}</span>.
          </p>
        </div>

        {/* Action */}
        {sent ? (
          <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium py-2">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            Email sent — check your inbox and spam folder
          </div>
        ) : (
          <Button
            onClick={resend}
            disabled={sending}
            className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-semibold"
          >
            {sending ? (
              <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Sending…</>
            ) : (
              <><RefreshCw className="w-4 h-4 mr-2" />Resend Verification Email</>
            )}
          </Button>
        )}

        <button
          onClick={dismiss}
          className="text-slate-500 text-xs hover:text-slate-300 transition-colors mt-1"
        >
          Remind me tomorrow
        </button>
      </div>
    </div>
  );
}
