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
function IdleView({ businessName }: { businessName: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-8 animate-fade-in">
      <div className="flex flex-col items-center gap-6">
        <div className="animate-pulse-slow">
          <img src={logoUrl} alt="NEXXUS POS" className="h-20 w-auto" />
        </div>
        <div className="text-center">
          <h1 className="text-5xl font-black tracking-tight" style={{ color: "#3b82f6" }}>
            {businessName || "NEXXUS POS"}
          </h1>
          <p className="text-xl text-slate-400 mt-3 font-medium tracking-widest uppercase">
            Welcome — Your order will appear here
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 mt-4">
        <div className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
        <div className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" style={{ animationDelay: "0.3s" }} />
        <div className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" style={{ animationDelay: "0.6s" }} />
      </div>

      <p className="absolute bottom-6 text-xs text-slate-600 tracking-widest uppercase">
        Powered by MicroBooks
      </p>
    </div>
  );
}

/* ─── Cart view ─── */
function CartView({
  items, subtotal, cartDiscountValue, loyaltyDiscountValue, tax, total, currency,
  businessName,
}: {
  items: CartDisplayItem[];
  subtotal: number;
  cartDiscountValue: number;
  loyaltyDiscountValue: number;
  tax: number;
  total: number;
  currency: string;
  businessName: string;
}) {
  const totalDiscount = cartDiscountValue + loyaltyDiscountValue;

  return (
    <div className="flex flex-col h-full animate-fade-in">
      {/* Header */}
      <div className="shrink-0 px-8 py-5 border-b flex items-center justify-between"
           style={{ borderColor: "rgba(59,130,246,0.2)", background: "rgba(15,23,41,0.8)" }}>
        <div className="flex items-center gap-3">
          <img src={logoUrl} alt="NEXXUS POS" className="h-8 w-auto opacity-90" />
          {businessName && (
            <span className="text-slate-400 text-sm font-medium">{businessName}</span>
          )}
        </div>
        <span className="text-blue-400 text-sm font-semibold tracking-wider uppercase">Order Summary</span>
      </div>

      {/* Content area */}
      <div className="flex flex-1 min-h-0">
        {/* Items list */}
        <div className="flex-1 overflow-y-auto no-scrollbar px-8 py-6">
          <div className="space-y-2">
            {items.map((item, idx) => {
              const lineTotal = item.effectivePrice * item.quantity - item.itemDiscount;
              return (
                <div
                  key={idx}
                  className="flex items-center justify-between py-3 border-b animate-slide-in"
                  style={{ borderColor: "rgba(255,255,255,0.05)", animationDelay: `${idx * 0.05}s` }}
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div
                      className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0 font-bold text-sm"
                      style={{ background: "rgba(59,130,246,0.15)", color: "#3b82f6" }}
                    >
                      {item.quantity}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-white truncate text-base">{item.productName}</p>
                      <p className="text-sm text-slate-400">
                        {fmt(item.effectivePrice, currency)} each
                        {item.itemDiscount > 0 && (
                          <span className="ml-2 text-green-400">
                            − {fmt(item.itemDiscount, currency)} off
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <span className="font-bold text-lg text-white ml-4 shrink-0">{fmt(lineTotal, currency)}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Totals panel */}
        <div
          className="w-72 shrink-0 flex flex-col justify-end p-8 border-l"
          style={{ borderColor: "rgba(59,130,246,0.15)", background: "rgba(15,23,41,0.6)" }}
        >
          <div className="space-y-3">
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

            <div
              className="flex justify-between items-center pt-4 mt-2 border-t"
              style={{ borderColor: "rgba(59,130,246,0.3)" }}
            >
              <span className="text-white font-bold text-xl">Total</span>
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

/* ─── Thank-you view ─── */
function ThankYouView({
  orderNumber, paymentMethod, total, cashTendered, currency, onDone,
}: {
  orderNumber: string;
  paymentMethod: string;
  total: number;
  cashTendered?: number;
  currency: string;
  onDone: () => void;
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
    <div className="flex flex-col items-center justify-center h-full gap-8 animate-scale-in text-center">
      {/* Checkmark */}
      <div
        className="h-28 w-28 rounded-full flex items-center justify-center"
        style={{ background: "rgba(34,197,94,0.15)", border: "2px solid rgba(34,197,94,0.4)" }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
             className="h-14 w-14" style={{ color: "#22c55e" }}>
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>

      <div>
        <h1 className="text-6xl font-black tracking-tight text-white">Thank You!</h1>
        <p className="text-2xl text-slate-400 mt-3 font-medium">for your purchase</p>
      </div>

      <div
        className="rounded-2xl p-8 space-y-4 text-left w-80"
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
        <div
          className="flex justify-between items-center pt-3 border-t"
          style={{ borderColor: "rgba(59,130,246,0.2)" }}
        >
          <span className="text-white font-bold text-lg">Total Paid</span>
          <span className="font-black text-2xl" style={{ color: "#3b82f6" }}>
            {fmt(total, currency)}
          </span>
        </div>
        {change > 0.005 && (
          <div className="flex justify-between items-center">
            <span className="text-green-400 font-semibold text-lg">Change Due</span>
            <span className="font-black text-2xl text-green-400">{fmt(change, currency)}</span>
          </div>
        )}
      </div>

      <p className="text-slate-600 text-sm mt-4">
        Returning to welcome screen in {countdown}s
      </p>

      <p className="absolute bottom-6 text-xs text-slate-600 tracking-widest uppercase">
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
        className="rounded-2xl p-8 max-w-md w-full"
        style={{ background: "#0f1a2e", border: "1px solid rgba(59,130,246,0.3)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-white mb-4">How to use Customer Display</h2>
        <ol className="space-y-3 text-slate-300 text-sm">
          <li className="flex gap-3">
            <span className="shrink-0 h-6 w-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">1</span>
            Open this page on a second screen or tablet facing your customer.
          </li>
          <li className="flex gap-3">
            <span className="shrink-0 h-6 w-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">2</span>
            In the POS, click the <strong className="text-white">Monitor</strong> icon in the header to open this display from the cashier's device.
          </li>
          <li className="flex gap-3">
            <span className="shrink-0 h-6 w-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">3</span>
            Both tabs must be open <strong className="text-white">in the same browser</strong> on the same device for live cart updates to work.
          </li>
        </ol>
        <button
          onClick={onClose}
          className="mt-6 w-full py-2.5 rounded-lg font-semibold text-sm transition-colors"
          style={{ background: "rgba(59,130,246,0.2)", color: "#3b82f6", border: "1px solid rgba(59,130,246,0.3)" }}
        >
          Got it
        </button>
      </div>
    </div>
  );
}

/* ─── Main App ─── */
export default function App() {
  const [view, setView] = useState<View>({ kind: "idle" });
  const [businessName, setBusinessName] = useState("");
  const [howToOpen, setHowToOpen] = useState(false);
  const channelRef = useRef<BroadcastChannel | null>(null);

  const goIdle = useCallback(() => setView({ kind: "idle" }), []);

  useEffect(() => {
    const ch = new BroadcastChannel(CUSTOMER_DISPLAY_CHANNEL);
    channelRef.current = ch;

    ch.onmessage = (event: MessageEvent<CustomerDisplayMessage>) => {
      const msg = event.data;
      if (msg.type === "idle") {
        setView({ kind: "idle" });
      } else if (msg.type === "cart") {
        setView({ kind: "cart", ...msg });
      } else if (msg.type === "complete") {
        setView({ kind: "complete", ...msg });
      }
    };

    return () => { ch.close(); channelRef.current = null; };
  }, []);

  useEffect(() => {
    const base = import.meta.env.BASE_URL || "/customer-display/";
    const apiBase = base.startsWith("/") ? "" : "/";
    fetch(`${apiBase}/api/settings`, {
      headers: { "Content-Type": "application/json" },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.business_name) setBusinessName(data.business_name);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="relative h-screen w-full overflow-hidden" style={{ background: "#0f1729" }}>
      {view.kind === "idle" && <IdleView businessName={businessName} />}
      {view.kind === "cart" && (
        <CartView {...view} businessName={businessName} />
      )}
      {view.kind === "complete" && (
        <ThankYouView {...view} onDone={goIdle} />
      )}

      {/* How-to button */}
      <button
        onClick={() => setHowToOpen(true)}
        className="absolute top-4 right-4 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
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
