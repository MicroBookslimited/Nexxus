import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Delete } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PinPadProps {
  onSuccess: (staff: { id: number; name: string; role: string; permissions?: string[] }) => void;
  onError?: (msg: string) => void;
  requiredRoles?: string[];
  title?: string;
  subtitle?: string;
  submitLabel?: string;
  pinLength?: number;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];

export function PinPad({
  onSuccess,
  onError,
  requiredRoles,
  title = "Enter PIN",
  subtitle,
  submitLabel,
  pinLength = 4,
}: PinPadProps) {
  const [digits, setDigits] = useState<string[]>([]);
  const [shake, setShake] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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

  const triggerError = (msg: string) => {
    setErrorMsg(msg);
    setShake(true);
    setDigits([]);
    if (onError) onError(msg);
    setTimeout(() => setShake(false), 500);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= "0" && e.key <= "9") handleKey(e.key);
      if (e.key === "Backspace") handleKey("del");
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [digits, loading]);

  return (
    <div className="flex flex-col items-center gap-6 select-none">
      {title && <h2 className="text-xl font-bold text-center">{title}</h2>}
      {subtitle && <p className="text-sm text-muted-foreground text-center -mt-3">{subtitle}</p>}

      {/* Dot indicators */}
      <motion.div
        className="flex gap-3"
        animate={shake ? { x: [0, -8, 8, -6, 6, 0] } : {}}
        transition={{ duration: 0.4 }}
      >
        {Array.from({ length: pinLength }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "w-4 h-4 rounded-full border-2 transition-all duration-150",
              i < digits.length
                ? "bg-primary border-primary scale-110"
                : "border-muted-foreground/40 bg-transparent",
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
            className="text-xs text-destructive font-medium text-center -mt-3"
          >
            {errorMsg}
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
              variant="outline"
              className={cn(
                "w-16 h-16 text-xl font-bold rounded-2xl border border-border/70",
                "hover:bg-primary/10 hover:border-primary/50 active:scale-95 transition-transform",
                key === "del" && "text-muted-foreground",
                loading && "opacity-50 pointer-events-none",
              )}
              onClick={() => handleKey(key)}
            >
              {key === "del" ? <Delete className="h-5 w-5" /> : key}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
