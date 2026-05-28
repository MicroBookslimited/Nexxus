import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Delete, ShieldCheck, Check, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PinPadProps {
  onSuccess: (staff: { id: number; name: string; role: string; permissions?: string[] }) => void;
  onError?: (msg: string) => void;
  requiredRoles?: string[];
  title?: string;
  subtitle?: string;
  submitLabel?: string;
  /** Maximum PIN digits the user may enter (default 8). */
  pinLength?: number;
  /** Minimum PIN digits before submit is allowed (default 4). */
  minPinLength?: number;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isImpersonationSession(): boolean {
  const token = localStorage.getItem("nexus_tenant_token");
  if (!token) return false;
  const payload = decodeJwtPayload(token);
  return payload?.impersonation === true;
}

export function PinPad({
  onSuccess,
  onError,
  requiredRoles,
  title = "Enter PIN",
  subtitle,
  submitLabel,
  pinLength = 8,
  minPinLength = 4,
}: PinPadProps) {
  const [digits, setDigits] = useState<string[]>([]);
  const [shake, setShake] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isImpersonating] = useState(() => isImpersonationSession());
  const [swiping, setSwiping] = useState(false);

  // Magstripe / RFID HID buffer. When the keyboard-wedge reader starts
  // typing a card swipe (Track 1 begins with `%`, Track 2 with `;`) we
  // collect every subsequent keystroke until Enter or the end-sentinel
  // `?` and then post the raw track data to /api/staff/authenticate-card.
  const swipeBuffer = useRef("");
  const swipeStartedAt = useRef(0);

  const handleKey = (key: string) => {
    if (loading) return;
    if (key === "del") {
      setDigits((d) => d.slice(0, -1));
      setErrorMsg(null);
      return;
    }
    if (key === "") return;
    if (digits.length >= pinLength) return;
    const next = [...digits, key];
    setDigits(next);
    setErrorMsg(null);
    // Auto-submit only when the user fills the maximum length; otherwise
    // they must tap the Enter button (lets 5-, 6-, 7-digit PINs be entered).
    if (next.length === pinLength) {
      submitPin(next.join(""));
    }
  };

  const submitPin = async (pin: string) => {
    setLoading(true);
    try {
      const body: { pin: string; requiredRoles?: string[] } = { pin };
      if (requiredRoles && requiredRoles.length > 0) body.requiredRoles = requiredRoles;

      const token = localStorage.getItem("nexus_tenant_token");
      const res = await fetch("/api/staff/authenticate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const staff = await res.json();
        onSuccess(staff);
        setDigits([]);
      } else {
        const data = await res.json().catch(() => ({}));
        const msg =
          res.status === 403
            ? "Manager or Admin PIN required"
            : data.error ?? "Invalid PIN";
        triggerError(msg);
      }
    } catch {
      triggerError("Connection error — try again");
    } finally {
      setLoading(false);
    }
  };

  const submitCard = async (cardData: string) => {
    setLoading(true);
    setSwiping(true);
    setErrorMsg(null);
    try {
      const body: { cardData: string; requiredRoles?: string[] } = { cardData };
      if (requiredRoles && requiredRoles.length > 0) body.requiredRoles = requiredRoles;

      const token = localStorage.getItem("nexus_tenant_token");
      const res = await fetch("/api/staff/authenticate-card", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const staff = await res.json();
        onSuccess(staff);
        setDigits([]);
      } else {
        const data = await res.json().catch(() => ({}));
        const msg =
          res.status === 403
            ? "Card holder lacks required role"
            : data.error ?? "Card not recognized";
        triggerError(msg);
      }
    } catch {
      triggerError("Connection error — try again");
    } finally {
      setLoading(false);
      setSwiping(false);
    }
  };

  const handleSuperadminBypass = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const token = localStorage.getItem("nexus_tenant_token");
      const res = await fetch("/api/staff/impersonation-bypass", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (res.ok) {
        const staff = await res.json();
        onSuccess(staff);
        setDigits([]);
      } else {
        const data = await res.json().catch(() => ({}));
        triggerError(data.error ?? "Bypass failed");
      }
    } catch {
      triggerError("Connection error — try again");
    } finally {
      setLoading(false);
    }
  };

  const triggerError = (msg: string) => {
    setErrorMsg(msg);
    setShake(true);
    setDigits([]);
    if (onError) onError(msg);
    setTimeout(() => setShake(false), 500);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (loading) return;

      // Never hijack keys destined for a text input — otherwise a sibling
      // <input> (e.g. the Label field in CardCaptureDialog) loses keystrokes.
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isEditable =
        tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable;
      if (isEditable) return;

      const now = Date.now();
      const inSwipe = swipeBuffer.current.length > 0 && (now - swipeStartedAt.current) < 3000;

      // Begin a swipe when a Track 1/2 sentinel arrives.
      if (e.key === "%" || e.key === ";") {
        swipeBuffer.current = e.key;
        swipeStartedAt.current = now;
        setSwiping(true);
        return;
      }

      if (inSwipe) {
        // Card swipe in progress — capture every char until Enter or `?`.
        if (e.key === "Enter" || e.key === "?") {
          const data = swipeBuffer.current + (e.key === "?" ? "?" : "");
          swipeBuffer.current = "";
          submitCard(data);
          return;
        }
        if (e.key.length === 1) {
          swipeBuffer.current += e.key;
          return;
        }
        return;
      }

      // Normal PIN entry
      if (e.key >= "0" && e.key <= "9") { handleKey(e.key); return; }
      if (e.key === "Backspace") { handleKey("del"); return; }
      if (e.key === "Enter" && digits.length >= minPinLength) {
        submitPin(digits.join(""));
      }
    };

    // Reset stale swipe buffer if input pauses
    const interval = setInterval(() => {
      if (swipeBuffer.current.length > 0 && Date.now() - swipeStartedAt.current > 3000) {
        swipeBuffer.current = "";
        setSwiping(false);
      }
    }, 1000);

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      clearInterval(interval);
    };
  }, [digits, loading, minPinLength]);

  const canSubmit = digits.length >= minPinLength && !loading;

  return (
    <div className="flex flex-col items-center gap-5 select-none">
      {title && <h2 className="text-xl font-bold text-center">{title}</h2>}
      {subtitle && <p className="text-sm text-muted-foreground text-center -mt-3">{subtitle}</p>}

      {/* Dot indicators */}
      <motion.div
        className="flex gap-2"
        animate={shake ? { x: [0, -8, 8, -6, 6, 0] } : {}}
        transition={{ duration: 0.4 }}
      >
        {Array.from({ length: pinLength }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "w-3 h-3 rounded-full border-2 transition-all duration-150",
              i < digits.length
                ? "bg-primary border-primary scale-110"
                : i < minPinLength
                  ? "border-muted-foreground/60 bg-transparent"
                  : "border-muted-foreground/20 bg-transparent",
            )}
          />
        ))}
      </motion.div>

      {/* Error message */}
      <AnimatePresence>
        {errorMsg && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-xs text-destructive font-medium text-center -mt-2"
          >
            {errorMsg}
          </motion.p>
        )}
      </AnimatePresence>

      {/* Swipe indicator */}
      <AnimatePresence>
        {swiping && !errorMsg && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-xs text-primary font-medium text-center -mt-2 flex items-center gap-1.5"
          >
            <CreditCard size={12} className="animate-pulse" />
            Reading card…
          </motion.p>
        )}
      </AnimatePresence>

      {/* Numpad grid */}
      <div className="grid grid-cols-3 gap-3">
        {KEYS.map((key, idx) => {
          if (key === "") return <div key={idx} />;
          return (
            <Button
              key={idx}
              className={cn(
                "w-16 h-16 text-xl font-bold rounded-2xl border shadow-sm active:scale-95 transition-all",
                key === "del"
                  ? "bg-slate-600 hover:bg-slate-500 border-slate-500 text-white"
                  : "bg-white hover:bg-slate-100 border-slate-300 text-slate-800",
                loading && "opacity-50 pointer-events-none",
              )}
              onClick={() => handleKey(key)}
            >
              {key === "del" ? <Delete className="h-5 w-5" /> : key}
            </Button>
          );
        })}
      </div>

      {/* Enter / Submit — enabled once minPinLength digits are entered */}
      <Button
        onClick={() => submitPin(digits.join(""))}
        disabled={!canSubmit}
        className={cn(
          "w-52 h-12 rounded-2xl text-base font-semibold gap-2",
          "bg-primary text-primary-foreground hover:bg-primary/90",
          !canSubmit && "opacity-50 pointer-events-none",
        )}
      >
        <Check className="h-5 w-5" />
        {submitLabel ?? "Enter"}
      </Button>

      {/* Swipe-card hint */}
      <p className="text-[10px] text-muted-foreground/60 text-center -mt-2 flex items-center gap-1.5">
        <CreditCard size={11} />
        Or swipe override card
      </p>

      {/* Superadmin bypass — only visible during impersonation */}
      {isImpersonating && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-[13rem]"
        >
          <button
            disabled={loading}
            onClick={handleSuperadminBypass}
            className={cn(
              "w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors",
              "bg-amber-500/10 border border-amber-500/40 text-amber-400 hover:bg-amber-500/20 hover:border-amber-500/70",
              loading && "opacity-50 pointer-events-none",
            )}
          >
            <ShieldCheck size={15} />
            Superadmin Override
          </button>
          <p className="text-center text-[10px] text-muted-foreground/60 mt-1.5">
            Logs in as highest-privilege staff
          </p>
        </motion.div>
      )}
    </div>
  );
}
