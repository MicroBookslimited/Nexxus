import { useState, useEffect, useRef, useCallback } from "react";
import { CUSTOMER_DISPLAY_CHANNEL, type CustomerDisplayMessage, type CartDisplayItem } from "@/lib/customer-display-channel";
import logoUrl from "@assets/CE921A75-1E79-4B12-9F18-6809B5113B30_1775830070572.png";

/* ─── Currency formatter ─── */
function fmt(val: number, currency = "JMD") {
  try {
    return new Intl.NumberFormat("en-JM", { style: "currency", currency, maximumFractionDigits: 2 }).format(val);
  } catch {
    return `${currency} ${val.toFixed(2)}`;
  }
}

/* ─── Orientation hook ─── */
function useOrientation() {
  const [isLandscape, setIsLandscape] = useState(
    () => window.matchMedia("(orientation: landscape)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia("(orientation: landscape)");
    const handler = (e: MediaQueryListEvent) => setIsLandscape(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isLandscape;
}

/* ─── Screen Wake Lock ─── */
function useWakeLock() {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const acquire = async () => {
      if (!("wakeLock" in navigator)) return;
      try { lock = await navigator.wakeLock.request("screen"); } catch { /* ignore */ }
    };
    acquire();
    const onVisible = () => { if (document.visibilityState === "visible") acquire(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      lock?.release().catch(() => {});
    };
  }, []);
}

/* ─── Views ─── */
type View =
  | { kind: "idle" }
  | {
      kind: "cart";
      items: CartDisplayItem[];
      subtotal: number;
      cartDiscountValue: number;
      loyaltyDiscountValue: number;
      tax: number;
      total: number;
      currency: string;
    }
  | {
      kind: "complete";
      orderNumber: string;
      paymentMethod: string;
      total: number;
      cashTendered?: number;
      currency: string;
    };

/* ─── Idle view ─── */
function IdleView({ businessName, isLandscape }: { businessName: string; isLandscape: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 animate-fade-in px-6">
      <div className="flex flex-col items-center gap-4">
        <div className="animate-pulse-slow">
          <img
            src={logoUrl}
            alt="NEXXUS POS"
            className={isLandscape ? "h-16 w-auto" : "h-12 w-auto"}
          />
        </div>
        <div className="text-center">
          <h1
            className={isLandscape ? "text-5xl font-black tracking-tight" : "text-3xl font-black tracking-tight"}
            style={{ color: "#3b82f6" }}
          >
            {businessName || "NEXXUS POS"}
          </h1>
          <p className={`text-slate-400 mt-2 font-medium tracking-wider uppercase ${isLandscape ? "text-xl" : "text-sm"}`}>
            Welcome — Your order will appear here
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 mt-2">
        <div className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
        <div className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" style={{ animationDelay: "0.3s" }} />
        <div className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" style={{ animationDelay: "0.6s" }} />
      </div>

      <p className="absolute bottom-4 text-xs text-slate-600 tracking-widest uppercase">
        Powered by MicroBooks
      </p>
    </div>
  );
}

/* ─── Cart view — LANDSCAPE ─── */
function CartViewLandscape({
  items, subtotal, cartDiscountValue, loyaltyDiscountValue, tax, total, currency, businessName,
}: {
  items: CartDisplayItem[];
  subtotal: number; cartDiscountValue: number; loyaltyDiscountValue: number;
  tax: number; total: number; currency: string; businessName: string;
}) {
  const totalDiscount = cartDiscountValue + loyaltyDiscountValue;
  return (
    <div className="flex flex-col h-full animate-fade-in">
      <div className="shrink-0 px-6 py-4 border-b flex items-center justify-between"
           style={{ borderColor: "rgba(59,130,246,0.2)", background: "rgba(15,23,41,0.8)" }}>
        <div className="flex items-center gap-3">
          <img src={logoUrl} alt="NEXXUS POS" className="h-7 w-auto opacity-90" />
          {businessName && <span className="text-slate-400 text-sm font-medium">{businessName}</span>}
        </div>
        <span className="text-blue-400 text-sm font-semibold tracking-wider uppercase">Order Summary</span>
      </div>

      <div className="flex flex-1 min-h-0">
        <div className="flex-1 overflow-y-auto no-scrollbar px-6 py-4">
          <div className="space-y-1">
            {items.map((item, idx) => {
              const lineTotal = item.effectivePrice * item.quantity - item.itemDiscount;
              return (
                <div key={idx}
                  className="flex items-center justify-between py-2.5 border-b animate-slide-in"
                  style={{ borderColor: "rgba(255,255,255,0.05)", animationDelay: `${idx * 0.05}s` }}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 font-bold text-sm"
                         style={{ background: "rgba(59,130,246,0.15)", color: "#3b82f6" }}>
                      {item.quantity}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-white truncate">{item.productName}</p>
                      <p className="text-xs text-slate-400">
                        {fmt(item.effectivePrice, currency)} each
                        {item.itemDiscount > 0 && (
                          <span className="ml-2 text-green-400">− {fmt(item.itemDiscount, currency)} off</span>
                        )}
                      </p>
                    </div>
                  </div>
                  <span className="font-bold text-base text-white ml-4 shrink-0">{fmt(lineTotal, currency)}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="w-60 shrink-0 flex flex-col justify-end p-6 border-l"
             style={{ borderColor: "rgba(59,130,246,0.15)", background: "rgba(15,23,41,0.6)" }}>
          <div className="space-y-2.5">
            <div className="flex justify-between text-slate-300 text-sm">
              <span>Subtotal</span>
              <span>{fmt(subtotal, currency)}</span>
            </div>
            {totalDiscount > 0 && (
              <div className="flex justify-between text-green-400 text-sm font-medium">
                <span>Discount</span>
                <span>− {fmt(totalDiscount, currency)}</span>
              </div>
            )}
            <div className="flex justify-between text-slate-300 text-sm">
              <span>Tax</span>
              <span>{fmt(tax, currency)}</span>
            </div>
            <div className="flex justify-between items-center pt-3 mt-1 border-t"
                 style={{ borderColor: "rgba(59,130,246,0.3)" }}>
              <span className="text-white font-bold text-lg">Total</span>
              <span className="font-black text-2xl" style={{ color: "#3b82f6" }}>
                {fmt(total, currency)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Cart view — PORTRAIT ─── */
function CartViewPortrait({
  items, subtotal, cartDiscountValue, loyaltyDiscountValue, tax, total, currency, businessName,
}: {
  items: CartDisplayItem[];
  subtotal: number; cartDiscountValue: number; loyaltyDiscountValue: number;
  tax: number; total: number; currency: string; businessName: string;
}) {
  const totalDiscount = cartDiscountValue + loyaltyDiscountValue;
  return (
    <div className="flex flex-col h-full animate-fade-in">
      <div className="shrink-0 px-4 py-3 border-b flex items-center justify-between"
           style={{ borderColor: "rgba(59,130,246,0.2)", background: "rgba(15,23,41,0.9)" }}>
        <div className="flex items-center gap-2">
          <img src={logoUrl} alt="NEXXUS POS" className="h-6 w-auto opacity-90" />
          {businessName && <span className="text-slate-400 text-xs font-medium">{businessName}</span>}
        </div>
        <span className="text-blue-400 text-xs font-semibold tracking-wider uppercase">Order Summary</span>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar px-4 py-3 min-h-0">
        <div className="space-y-0">
          {items.map((item, idx) => {
            const lineTotal = item.effectivePrice * item.quantity - item.itemDiscount;
            return (
              <div key={idx}
                className="flex items-center justify-between py-3 border-b animate-slide-in"
                style={{ borderColor: "rgba(255,255,255,0.06)", animationDelay: `${idx * 0.05}s` }}
              >
                <div className="flex items-center gap-2.5 flex-1 min-w-0">
                  <div className="h-7 w-7 rounded-md flex items-center justify-center shrink-0 font-bold text-xs"
                       style={{ background: "rgba(59,130,246,0.15)", color: "#3b82f6" }}>
                    {item.quantity}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-white text-sm truncate">{item.productName}</p>
                    {item.itemDiscount > 0 && (
                      <p className="text-xs text-green-400">− {fmt(item.itemDiscount, currency)} off</p>
                    )}
                  </div>
                </div>
                <span className="font-bold text-sm text-white ml-3 shrink-0">{fmt(lineTotal, currency)}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="shrink-0 border-t px-4 pt-3 pb-4"
           style={{ borderColor: "rgba(59,130,246,0.25)", background: "rgba(15,23,41,0.95)" }}>
        <div className="flex justify-between text-xs text-slate-400 mb-1">
          <span>Subtotal: {fmt(subtotal, currency)}</span>
          {totalDiscount > 0 && (
            <span className="text-green-400">Discount: −{fmt(totalDiscount, currency)}</span>
          )}
          <span>Tax: {fmt(tax, currency)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-white font-bold text-base">Total</span>
          <span className="font-black text-3xl" style={{ color: "#3b82f6" }}>
            {fmt(total, currency)}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ─── Thank-you view ─── */
function ThankYouView({
  orderNumber, paymentMethod, total, cashTendered, currency, onDone, isLandscape,
}: {
  orderNumber: string; paymentMethod: string; total: number;
  cashTendered?: number; currency: string; onDone: () => void; isLandscape: boolean;
}) {
  const change = cashTendered != null && cashTendered > 0 ? cashTendered - total : 0;
  const [countdown, setCountdown] = useState(6);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { clearInterval(timer); onDone(); return 0; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [onDone]);

  return (
    <div className="flex flex-col items-center justify-center h-full gap-5 animate-scale-in text-center px-6">
      <div
        className={`rounded-full flex items-center justify-center ${isLandscape ? "h-24 w-24" : "h-16 w-16"}`}
        style={{ background: "rgba(34,197,94,0.15)", border: "2px solid rgba(34,197,94,0.4)" }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
             className={isLandscape ? "h-12 w-12" : "h-8 w-8"}
             style={{ color: "#22c55e" }}>
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>

      <div>
        <h1 className={`font-black tracking-tight text-white ${isLandscape ? "text-6xl" : "text-4xl"}`}>
          Thank You!
        </h1>
        <p className={`text-slate-400 mt-1 font-medium ${isLandscape ? "text-2xl" : "text-lg"}`}>
          for your purchase
        </p>
      </div>

      <div
        className="rounded-2xl p-5 space-y-3 text-left w-full max-w-xs"
        style={{ background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.2)" }}
      >
        <div className="flex justify-between text-slate-400 text-sm">
          <span>Order #</span>
          <span className="text-white font-semibold">{orderNumber}</span>
        </div>
        <div className="flex justify-between text-slate-400 text-sm">
          <span>Payment</span>
          <span className="text-white font-semibold capitalize">{paymentMethod}</span>
        </div>
        <div className="flex justify-between items-center pt-3 border-t"
             style={{ borderColor: "rgba(59,130,246,0.2)" }}>
          <span className="text-white font-bold text-base">Total Paid</span>
          <span className={`font-black ${isLandscape ? "text-2xl" : "text-xl"}`} style={{ color: "#3b82f6" }}>
            {fmt(total, currency)}
          </span>
        </div>
        {change > 0.005 && (
          <div className="flex justify-between items-center">
            <span className="text-green-400 font-semibold text-base">Change Due</span>
            <span className={`font-black text-green-400 ${isLandscape ? "text-2xl" : "text-xl"}`}>
              {fmt(change, currency)}
            </span>
          </div>
        )}
      </div>

      <p className="text-slate-600 text-xs mt-1">
        Returning to welcome screen in {countdown}s
      </p>

      <p className="absolute bottom-4 text-xs text-slate-600 tracking-widest uppercase">
        Powered by MicroBooks
      </p>
    </div>
  );
}

/* ─── How-to overlay ─── */
function HowToOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: "rgba(0,0,0,0.8)" }}
      onClick={onClose}
    >
      <div
        className="rounded-2xl p-6 max-w-sm w-full"
        style={{ background: "#0f1a2e", border: "1px solid rgba(59,130,246,0.3)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-white mb-4">How to use Customer Display</h2>
        <ol className="space-y-3 text-slate-300 text-sm">
          <li className="flex gap-3">
            <span className="shrink-0 h-6 w-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">1</span>
            Open this page on a second screen or tablet facing your customer.
          </li>
          <li className="flex gap-3">
            <span className="shrink-0 h-6 w-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">2</span>
            In the POS, tap the <strong className="text-white">Monitor</strong> icon in the header to open this display from the cashier's device.
          </li>
          <li className="flex gap-3">
            <span className="shrink-0 h-6 w-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">3</span>
            Both tabs must be open <strong className="text-white">in the same browser</strong> on the same device for live cart updates to work.
          </li>
          <li className="flex gap-3">
            <span className="shrink-0 h-6 w-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">4</span>
            Tap anywhere on this screen to go <strong className="text-white">fullscreen</strong> for the best customer-facing experience.
          </li>
        </ol>
        <button
          onClick={onClose}
          className="mt-5 w-full py-2.5 rounded-lg font-semibold text-sm transition-colors"
          style={{ background: "rgba(59,130,246,0.2)", color: "#3b82f6", border: "1px solid rgba(59,130,246,0.3)" }}
        >
          Got it
        </button>
      </div>
    </div>
  );
}

/* ─── Customer Display CSS ─── */
const cdCss = `
  @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
  @keyframes slide-in { from { opacity: 0; transform: translateX(-8px); } to { opacity: 1; transform: translateX(0); } }
  @keyframes scale-in { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
  .animate-fade-in { animation: fade-in 0.4s ease; }
  .animate-slide-in { animation: slide-in 0.3s ease both; }
  .animate-scale-in { animation: scale-in 0.4s ease; }
  .animate-pulse-slow { animation: pulse 3s ease-in-out infinite; }
  .no-scrollbar::-webkit-scrollbar { display: none; }
  .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
`;

/* ─── Main Component ─── */
export default function CustomerDisplay() {
  const [view, setView] = useState<View>({ kind: "idle" });
  const [businessName, setBusinessName] = useState("");
  const [howToOpen, setHowToOpen] = useState(false);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const isLandscape = useOrientation();

  useWakeLock();

  const goIdle = useCallback(() => setView({ kind: "idle" }), []);

  const handleScreenTap = useCallback(async () => {
    if (howToOpen) return;
    if (!document.fullscreenElement) {
      try { await document.documentElement.requestFullscreen(); } catch { /* ignore */ }
    }
  }, [howToOpen]);

  useEffect(() => {
    const ch = new BroadcastChannel(CUSTOMER_DISPLAY_CHANNEL);
    channelRef.current = ch;
    ch.onmessage = (event: MessageEvent<CustomerDisplayMessage>) => {
      const msg = event.data;
      if (msg.businessName) setBusinessName(msg.businessName);
      if (msg.type === "idle") setView({ kind: "idle" });
      else if (msg.type === "cart") setView({ kind: "cart", ...msg });
      else if (msg.type === "complete") setView({ kind: "complete", ...msg });
    };
    return () => { ch.close(); channelRef.current = null; };
  }, []);

  return (
    <div
      className="relative h-screen w-full overflow-hidden"
      style={{ background: "#0f1729" }}
      onClick={handleScreenTap}
    >
      <style>{cdCss}</style>
      {view.kind === "idle" && <IdleView businessName={businessName} isLandscape={isLandscape} />}

      {view.kind === "cart" && (
        isLandscape
          ? <CartViewLandscape {...view} businessName={businessName} />
          : <CartViewPortrait {...view} businessName={businessName} />
      )}

      {view.kind === "complete" && (
        <ThankYouView {...view} onDone={goIdle} isLandscape={isLandscape} />
      )}

      <button
        onClick={(e) => { e.stopPropagation(); setHowToOpen(true); }}
        className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors z-10"
        style={{ background: "rgba(255,255,255,0.05)", color: "#64748b", border: "1px solid rgba(255,255,255,0.08)" }}
        title="How to use this display"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        How to use
      </button>

      {howToOpen && <HowToOverlay onClose={() => setHowToOpen(false)} />}
    </div>
  );
}
