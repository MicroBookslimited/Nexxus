import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  Check, CreditCard, Zap, Calendar, AlertTriangle,
  ArrowUpRight, RefreshCw, ChevronDown,
} from "lucide-react";
import {
  TENANT_TOKEN_KEY, saasMe, getPlans, createPayPalOrder, capturePayPalOrder,
  initiatePowerTranz, type Plan, type Tenant, type Subscription,
} from "@/lib/saas-api";
import { loadScript } from "@paypal/paypal-js";

export function SubscriptionPage() {
  const [, navigate] = useLocation();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [currentPlan, setCurrentPlan] = useState<Plan | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"paypal" | "powertranz">("paypal");
  const [card, setCard] = useState({ number: "", expiry: "", cvv: "", name: "" });
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [paypalRendered, setPaypalRendered] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem(TENANT_TOKEN_KEY);
    if (!token) { navigate("/signup"); return; }

    Promise.all([saasMe(), getPlans()])
      .then(([me, p]) => {
        setTenant(me.tenant);
        setSubscription(me.subscription ?? null);
        setCurrentPlan(me.plan ?? null);
        setPlans(p);
        if (me.subscription?.billingCycle) {
          setBillingCycle(me.subscription.billingCycle as "monthly" | "annual");
        }
      })
      .catch(() => navigate("/signup"))
      .finally(() => setLoading(false));
  }, [navigate]);

  useEffect(() => {
    if (!showPayment || paymentMethod !== "paypal" || !selectedPlan || paypalRendered) return;
    const clientId = import.meta.env["VITE_PAYPAL_CLIENT_ID"] as string | undefined;
    if (!clientId) return;
    loadScript({ clientId, currency: "USD" }).then((paypal) => {
      if (!paypal?.Buttons) return;
      const container = document.getElementById("sub-paypal-container");
      if (!container || container.children.length > 0) return;
      paypal.Buttons({
        createOrder: () => createPayPalOrder(selectedPlan.slug, billingCycle).then(r => r.orderId),
        onApprove: async (data) => {
          setIsProcessing(true);
          try {
            await capturePayPalOrder(data.orderID, selectedPlan.slug, billingCycle);
            setSuccess(`Successfully subscribed to ${selectedPlan.name}!`);
            setShowPayment(false);
            const me = await saasMe();
            setTenant(me.tenant); setSubscription(me.subscription); setCurrentPlan(me.plan ?? null);
          } catch (e) { setError(String(e)); }
          finally { setIsProcessing(false); }
        },
        onError: (e) => setError(String(e)),
      }).render("#sub-paypal-container");
      setPaypalRendered(true);
    });
  }, [showPayment, paymentMethod, selectedPlan, billingCycle, paypalRendered]);

  async function handlePowerTranz() {
    if (!selectedPlan) return;
    if (!card.number || !card.expiry || !card.cvv || !card.name) { setError("Please fill in all card details."); return; }
    setError(""); setIsProcessing(true);
    try {
      const res = await initiatePowerTranz({
        planSlug: selectedPlan.slug, billingCycle,
        cardNumber: card.number, cardExpiry: card.expiry,
        cardCvv: card.cvv, cardholderName: card.name,
        returnUrl: window.location.href,
      });
      if (res.approved) {
        setSuccess(`Successfully subscribed to ${selectedPlan.name}!`);
        setShowPayment(false);
        const me = await saasMe();
        setTenant(me.tenant); setSubscription(me.subscription); setCurrentPlan(me.plan ?? null);
      } else {
        setError(`Payment declined (code: ${res.responseCode ?? "unknown"}).`);
      }
    } catch (e) { setError(String(e)); }
    finally { setIsProcessing(false); }
  }

  const statusColor: Record<string, string> = {
    active: "text-green-400",
    trial: "text-blue-400",
    cancelled: "text-[#475569]",
    past_due: "text-amber-400",
  };
  const planColors: Record<string, string> = {
    starter: "border-[#3b82f6]/40 hover:border-[#3b82f6]",
    professional: "border-purple-500/40 hover:border-purple-500",
    enterprise: "border-amber-500/40 hover:border-amber-500",
  };
  const planAccents: Record<string, string> = {
    starter: "bg-[#3b82f6]/10 text-[#3b82f6]",
    professional: "bg-purple-500/10 text-purple-400",
    enterprise: "bg-amber-500/10 text-amber-400",
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f1729] flex items-center justify-center">
        <RefreshCw size={24} className="animate-spin text-[#3b82f6]" />
      </div>
    );
  }

  const trialEnd = subscription?.trialEndsAt ? new Date(subscription.trialEndsAt) : null;
  const periodEnd = subscription?.currentPeriodEnd ? new Date(subscription.currentPeriodEnd) : null;
  const daysLeft = trialEnd ? Math.max(0, Math.ceil((trialEnd.getTime() - Date.now()) / 86400000)) : null;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Subscription</h1>
        <p className="text-[#94a3b8] text-sm">Manage your Nexus POS plan and billing</p>
      </div>

      {success && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg px-4 py-3 text-green-400 text-sm mb-6 flex items-center gap-2">
          <Check size={16} /> {success}
        </div>
      )}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm mb-6">{error}</div>
      )}

      {/* Current Status */}
      <div className="bg-[#1a2332] border border-[#2a3a55] rounded-xl p-6 mb-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-lg font-semibold text-white mb-1">Current Plan</h2>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-2xl font-bold text-white">{currentPlan?.name ?? "No plan"}</span>
              <span className={`text-sm font-medium capitalize ${statusColor[subscription?.status ?? "trial"] ?? "text-[#94a3b8]"}`}>
                • {subscription?.status ?? "trial"}
              </span>
            </div>
          </div>
          {currentPlan && (
            <div className="text-right">
              <div className="text-2xl font-bold text-white">
                ${subscription?.billingCycle === "annual" ? currentPlan.priceAnnual : currentPlan.priceMonthly}
              </div>
              <div className="text-sm text-[#94a3b8]">/{subscription?.billingCycle === "annual" ? "year" : "month"}</div>
            </div>
          )}
        </div>

        {subscription?.status === "trial" && daysLeft !== null && (
          <div className="mt-4 bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 flex items-center gap-2 text-blue-400 text-sm">
            <AlertTriangle size={16} />
            <span>Your free trial ends in <strong>{daysLeft} day{daysLeft !== 1 ? "s" : ""}</strong>. Choose a plan to continue.</span>
          </div>
        )}

        {subscription?.status === "active" && periodEnd && (
          <div className="mt-4 flex items-center gap-2 text-[#94a3b8] text-sm">
            <Calendar size={14} />
            Next billing date: {periodEnd.toLocaleDateString()}
          </div>
        )}

        {currentPlan && (
          <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
            <div className="bg-[#0f1729] rounded-lg p-3 text-center">
              <div className="text-white font-semibold">{currentPlan.maxStaff === 9999 ? "∞" : currentPlan.maxStaff}</div>
              <div className="text-[#475569] text-xs">Staff</div>
            </div>
            <div className="bg-[#0f1729] rounded-lg p-3 text-center">
              <div className="text-white font-semibold">{currentPlan.maxProducts === 9999 ? "∞" : currentPlan.maxProducts}</div>
              <div className="text-[#475569] text-xs">Products</div>
            </div>
            <div className="bg-[#0f1729] rounded-lg p-3 text-center">
              <div className="text-white font-semibold">{currentPlan.maxLocations === 9999 ? "∞" : currentPlan.maxLocations}</div>
              <div className="text-[#475569] text-xs">Locations</div>
            </div>
          </div>
        )}
      </div>

      {/* Plan Selection */}
      {!showPayment && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">
              {subscription?.status === "active" ? "Change Plan" : "Choose a Plan"}
            </h2>
            <div className="flex items-center gap-2 bg-[#0f1729] rounded-lg p-1">
              <button onClick={() => setBillingCycle("monthly")}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${billingCycle === "monthly" ? "bg-[#3b82f6] text-white" : "text-[#94a3b8] hover:text-white"}`}>
                Monthly
              </button>
              <button onClick={() => setBillingCycle("annual")}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${billingCycle === "annual" ? "bg-[#3b82f6] text-white" : "text-[#94a3b8] hover:text-white"}`}>
                Annual <span className="text-green-400 text-xs ml-1">-17%</span>
              </button>
            </div>
          </div>

          <div className="space-y-3 mb-6">
            {plans.map((plan) => {
              const isCurrent = currentPlan?.id === plan.id;
              const isSelected = selectedPlan?.id === plan.id;
              return (
                <button key={plan.id} onClick={() => setSelectedPlan(isSelected ? null : plan)} disabled={isCurrent}
                  className={`w-full text-left border rounded-xl p-5 transition-all ${
                    isCurrent ? "border-[#2a3a55] opacity-60 cursor-not-allowed" :
                    isSelected ? "border-[#3b82f6] bg-[#3b82f6]/10" :
                    (planColors[plan.slug] ?? "border-[#2a3a55] hover:border-[#3b82f6]")
                  }`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${planAccents[plan.slug] ?? "bg-[#3b82f6]/10 text-[#3b82f6]"}`}>
                          {plan.name}
                        </span>
                        {isCurrent && <span className="text-xs bg-green-500/10 text-green-400 px-2 py-0.5 rounded-full">Current Plan</span>}
                        {plan.slug === "professional" && !isCurrent && (
                          <span className="text-xs bg-purple-500/10 text-purple-400 px-2 py-0.5 rounded-full">Most Popular</span>
                        )}
                      </div>
                      <p className="text-[#94a3b8] text-xs mb-2">{plan.description}</p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        {plan.features.slice(0, 4).map((f) => (
                          <span key={f} className="text-xs text-[#64748b] flex items-center gap-1"><Check size={10} className="text-green-500/60" />{f}</span>
                        ))}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-2xl font-bold text-white">
                        ${billingCycle === "annual" ? Math.round(plan.priceAnnual / 12) : plan.priceMonthly}
                      </div>
                      <div className="text-xs text-[#475569]">/month</div>
                      {billingCycle === "annual" && (
                        <div className="text-xs text-green-400">${plan.priceAnnual}/yr</div>
                      )}
                    </div>
                  </div>
                  {isSelected && !isCurrent && (
                    <div className="flex items-center gap-1 mt-3 text-[#3b82f6] text-xs font-medium">
                      <Check size={12} /> Selected
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {selectedPlan && (
            <button onClick={() => { setShowPayment(true); setPaypalRendered(false); setError(""); }}
              className="w-full bg-[#3b82f6] hover:bg-blue-500 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors">
              Subscribe to {selectedPlan.name} — ${billingCycle === "annual" ? selectedPlan.priceAnnual : selectedPlan.priceMonthly}/{billingCycle === "annual" ? "yr" : "mo"}
              <ArrowUpRight size={16} />
            </button>
          )}
        </div>
      )}

      {/* Payment Modal */}
      {showPayment && selectedPlan && (
        <div className="bg-[#1a2332] border border-[#2a3a55] rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Payment</h2>
            <button onClick={() => setShowPayment(false)} className="text-[#475569] hover:text-white text-sm">← Back</button>
          </div>

          <div className="bg-[#0f1729] rounded-lg p-3 mb-6 flex items-center justify-between">
            <span className="text-[#94a3b8] text-sm">{selectedPlan.name} — {billingCycle}</span>
            <span className="text-white font-semibold">${billingCycle === "annual" ? selectedPlan.priceAnnual : selectedPlan.priceMonthly}</span>
          </div>

          <div className="flex gap-2 mb-6">
            {(["paypal", "powertranz"] as const).map((m) => (
              <button key={m} onClick={() => { setPaymentMethod(m); setPaypalRendered(false); }}
                className={`flex-1 border rounded-lg py-2.5 text-sm font-medium transition-all ${paymentMethod === m ? "border-[#3b82f6] bg-[#3b82f6]/10 text-white" : "border-[#2a3a55] text-[#94a3b8] hover:border-[#3b82f6]/50"}`}>
                {m === "paypal" ? (
                  <span><span className="text-blue-400 font-bold">Pay</span><span className="text-blue-200 font-bold">Pal</span></span>
                ) : (
                  <span className="flex items-center justify-center gap-1"><CreditCard size={14} /> Card</span>
                )}
              </button>
            ))}
          </div>

          {paymentMethod === "paypal" && (
            <div>
              {!import.meta.env["VITE_PAYPAL_CLIENT_ID"] ? (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 text-amber-400 text-sm text-center">
                  PayPal is not yet configured.<br/>
                  <span className="text-xs text-[#94a3b8]">Add VITE_PAYPAL_CLIENT_ID to enable PayPal payments.</span>
                </div>
              ) : (
                <div id="sub-paypal-container" className="min-h-[100px] flex items-center justify-center">
                  {!paypalRendered && <div className="text-[#94a3b8] text-sm">Loading PayPal…</div>}
                </div>
              )}
            </div>
          )}

          {paymentMethod === "powertranz" && (
            <div className="space-y-4">
              {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">{error}</div>}
              <div>
                <label className="block text-sm text-[#94a3b8] mb-1">Cardholder Name</label>
                <input value={card.name} onChange={e => setCard(c => ({ ...c, name: e.target.value }))}
                  className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-4 py-2.5 text-white focus:border-[#3b82f6] outline-none" placeholder="John Smith" />
              </div>
              <div>
                <label className="block text-sm text-[#94a3b8] mb-1">Card Number</label>
                <input value={card.number} onChange={e => setCard(c => ({ ...c, number: e.target.value }))}
                  className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-4 py-2.5 text-white focus:border-[#3b82f6] outline-none font-mono"
                  placeholder="4111 1111 1111 1111" maxLength={19} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-[#94a3b8] mb-1">Expiry</label>
                  <input value={card.expiry} onChange={e => setCard(c => ({ ...c, expiry: e.target.value }))}
                    className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-4 py-2.5 text-white focus:border-[#3b82f6] outline-none font-mono" placeholder="MM / YY" maxLength={7} />
                </div>
                <div>
                  <label className="block text-sm text-[#94a3b8] mb-1">CVV</label>
                  <input value={card.cvv} onChange={e => setCard(c => ({ ...c, cvv: e.target.value }))}
                    className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-4 py-2.5 text-white focus:border-[#3b82f6] outline-none font-mono" placeholder="123" maxLength={4} type="password" />
                </div>
              </div>
              <button onClick={handlePowerTranz} disabled={isProcessing}
                className="w-full bg-[#3b82f6] hover:bg-blue-500 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-60">
                {isProcessing ? "Processing…" : <><Zap size={16} /> Pay Now</>}
              </button>
              <p className="text-xs text-center text-[#475569]">Secured by PowerTranz</p>
            </div>
          )}
        </div>
      )}

      <p className="text-center text-xs text-[#2a3a55] mt-8">Powered by MicroBooks</p>
    </div>
  );
}
