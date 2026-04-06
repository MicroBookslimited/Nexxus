import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Check, ChevronRight, Building2, User, CreditCard, Zap, ArrowRight, Eye, EyeOff } from "lucide-react";
import { TENANT_TOKEN_KEY, saasRegister, saasUpdateOnboarding, getPlans, createPayPalOrder, capturePayPalOrder, initiatePowerTranz, type Plan } from "@/lib/saas-api";
import { loadScript } from "@paypal/paypal-js";

const STEPS = ["Account", "Business", "Plan", "Payment", "Launch"] as const;

const COUNTRIES = [
  "United States", "United Kingdom", "Canada", "Australia", "Jamaica", "Trinidad and Tobago",
  "Barbados", "Guyana", "Bahamas", "Belize", "St. Lucia", "Antigua and Barbuda",
  "Dominican Republic", "Other",
];

export function Onboarding() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPw, setShowPw] = useState(false);

  const [form, setForm] = useState({
    businessName: "", ownerName: "", email: "", password: "",
    phone: "", address: "", country: "United States",
  });

  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");
  const [paymentMethod, setPaymentMethod] = useState<"paypal" | "powertranz">("paypal");
  const [card, setCard] = useState({ number: "", expiry: "", cvv: "", name: "" });
  const [paypalReady, setPaypalReady] = useState(false);
  const [paypalRendered, setPaypalRendered] = useState(false);

  const token = localStorage.getItem(TENANT_TOKEN_KEY);

  useEffect(() => {
    if (token) {
      navigate("/dashboard");
    }
  }, [token, navigate]);

  useEffect(() => {
    if (step === 3) {
      getPlans().then(setPlans).catch(console.error);
    }
  }, [step]);

  useEffect(() => {
    if (step === 4 && paymentMethod === "paypal" && selectedPlan && !paypalRendered) {
      const clientId = import.meta.env["VITE_PAYPAL_CLIENT_ID"] as string | undefined;
      if (!clientId) {
        setPaypalReady(false);
        return;
      }
      loadScript({ clientId, currency: "USD" }).then((paypal) => {
        if (!paypal?.Buttons) return;
        setPaypalReady(true);
        const container = document.getElementById("paypal-button-container");
        if (!container || container.children.length > 0) return;
        paypal.Buttons({
          createOrder: async () => {
            const res = await createPayPalOrder(selectedPlan.slug, billingCycle);
            return res.orderId;
          },
          onApprove: async (data) => {
            setIsLoading(true);
            try {
              await capturePayPalOrder(data.orderID, selectedPlan.slug, billingCycle);
              setStep(5);
            } catch (e) {
              setError(String(e));
            } finally {
              setIsLoading(false);
            }
          },
          onError: (err) => {
            setError("PayPal error: " + String(err));
          },
        }).render("#paypal-button-container");
        setPaypalRendered(true);
      });
    }
  }, [step, paymentMethod, selectedPlan, billingCycle, paypalRendered]);

  const updateForm = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function handleStep1() {
    if (!form.businessName || !form.ownerName || !form.email || !form.password) {
      setError("Please fill in all fields."); return;
    }
    if (form.password.length < 8) { setError("Password must be at least 8 characters."); return; }
    setError(""); setIsLoading(true);
    try {
      const res = await saasRegister({
        businessName: form.businessName,
        ownerName: form.ownerName,
        email: form.email,
        password: form.password,
        country: form.country,
      });
      localStorage.setItem(TENANT_TOKEN_KEY, res.token);
      setStep(2);
    } catch (e) {
      setError(String(e));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleStep2() {
    setError(""); setIsLoading(true);
    try {
      await saasUpdateOnboarding(3, { phone: form.phone, address: form.address, country: form.country });
      setStep(3);
    } catch (e) {
      setError(String(e));
    } finally {
      setIsLoading(false);
    }
  }

  function handleStep3() {
    if (!selectedPlan) { setError("Please select a plan."); return; }
    setError("");
    setPaypalRendered(false);
    setStep(4);
  }

  async function handlePowerTranz() {
    if (!selectedPlan) return;
    if (!card.number || !card.expiry || !card.cvv || !card.name) {
      setError("Please fill in all card details."); return;
    }
    setError(""); setIsLoading(true);
    try {
      const res = await initiatePowerTranz({
        planSlug: selectedPlan.slug,
        billingCycle,
        cardNumber: card.number,
        cardExpiry: card.expiry,
        cardCvv: card.cvv,
        cardholderName: card.name,
        returnUrl: window.location.origin,
      });
      if (res.approved) {
        setStep(5);
      } else {
        setError(`Payment declined (code: ${res.responseCode ?? "unknown"}). Please try again.`);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setIsLoading(false);
    }
  }

  const planColors: Record<string, string> = {
    starter: "border-[#3b82f6]/30 hover:border-[#3b82f6]",
    professional: "border-purple-500/30 hover:border-purple-500",
    enterprise: "border-amber-500/30 hover:border-amber-500",
  };
  const planAccents: Record<string, string> = {
    starter: "bg-[#3b82f6]/10 text-[#3b82f6]",
    professional: "bg-purple-500/10 text-purple-400",
    enterprise: "bg-amber-500/10 text-amber-400",
  };

  return (
    <div className="min-h-screen bg-[#0f1729] flex flex-col items-center justify-start pt-8 px-4">
      <div className="w-full max-w-2xl">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-[#3b82f6] rounded-lg flex items-center justify-center">
              <Zap size={18} className="text-white" />
            </div>
            <span className="text-xl font-bold text-white">Nexus POS</span>
          </div>
          <p className="text-[#94a3b8] text-sm">Your Business, Connected.</p>
        </div>

        {/* Stepper */}
        <div className="flex items-center justify-center mb-8 gap-0">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center">
              <div className={`flex flex-col items-center gap-1`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all ${
                  i + 1 < step ? "bg-green-500 text-white" :
                  i + 1 === step ? "bg-[#3b82f6] text-white" :
                  "bg-[#1e2a45] text-[#475569]"
                }`}>
                  {i + 1 < step ? <Check size={14} /> : i + 1}
                </div>
                <span className={`text-xs hidden sm:block ${i + 1 === step ? "text-white" : "text-[#475569]"}`}>{s}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`w-10 sm:w-16 h-0.5 mx-1 mb-5 transition-all ${i + 1 < step ? "bg-green-500" : "bg-[#1e2a45]"}`} />
              )}
            </div>
          ))}
        </div>

        {/* Card */}
        <div className="bg-[#1a2332] border border-[#2a3a55] rounded-2xl p-8">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm mb-6">{error}</div>
          )}

          {/* Step 1: Account */}
          {step === 1 && (
            <div>
              <h2 className="text-2xl font-bold text-white mb-1">Create your account</h2>
              <p className="text-[#94a3b8] text-sm mb-6">Start your 14-day free trial — no credit card required.</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-[#94a3b8] mb-1">Business Name</label>
                  <input value={form.businessName} onChange={e => updateForm("businessName", e.target.value)}
                    className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-4 py-2.5 text-white focus:border-[#3b82f6] outline-none"
                    placeholder="Acme Store" />
                </div>
                <div>
                  <label className="block text-sm text-[#94a3b8] mb-1">Your Name</label>
                  <input value={form.ownerName} onChange={e => updateForm("ownerName", e.target.value)}
                    className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-4 py-2.5 text-white focus:border-[#3b82f6] outline-none"
                    placeholder="John Smith" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm text-[#94a3b8] mb-1">Email Address</label>
                  <input type="email" value={form.email} onChange={e => updateForm("email", e.target.value)}
                    className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-4 py-2.5 text-white focus:border-[#3b82f6] outline-none"
                    placeholder="you@company.com" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm text-[#94a3b8] mb-1">Password</label>
                  <div className="relative">
                    <input type={showPw ? "text" : "password"} value={form.password} onChange={e => updateForm("password", e.target.value)}
                      className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-4 py-2.5 pr-10 text-white focus:border-[#3b82f6] outline-none"
                      placeholder="Min. 8 characters" />
                    <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#475569] hover:text-white">
                      {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
              </div>
              <button onClick={handleStep1} disabled={isLoading}
                className="mt-6 w-full bg-[#3b82f6] hover:bg-blue-500 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-60">
                {isLoading ? "Creating account…" : <>Create Account <ArrowRight size={16} /></>}
              </button>
              <p className="text-center text-sm text-[#475569] mt-4">
                Already have an account?{" "}
                <button onClick={() => navigate("/saas-login")} className="text-[#3b82f6] hover:text-blue-400">Sign in</button>
              </p>
            </div>
          )}

          {/* Step 2: Business Details */}
          {step === 2 && (
            <div>
              <h2 className="text-2xl font-bold text-white mb-1">Business details</h2>
              <p className="text-[#94a3b8] text-sm mb-6">Help us personalise your Nexus POS experience.</p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-[#94a3b8] mb-1">Phone Number</label>
                  <input value={form.phone} onChange={e => updateForm("phone", e.target.value)}
                    className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-4 py-2.5 text-white focus:border-[#3b82f6] outline-none"
                    placeholder="+1 555 000 0000" />
                </div>
                <div>
                  <label className="block text-sm text-[#94a3b8] mb-1">Business Address</label>
                  <input value={form.address} onChange={e => updateForm("address", e.target.value)}
                    className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-4 py-2.5 text-white focus:border-[#3b82f6] outline-none"
                    placeholder="123 Main St, City" />
                </div>
                <div>
                  <label className="block text-sm text-[#94a3b8] mb-1">Country</label>
                  <select value={form.country} onChange={e => updateForm("country", e.target.value)}
                    className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-4 py-2.5 text-white focus:border-[#3b82f6] outline-none">
                    {COUNTRIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setStep(1)} className="flex-1 border border-[#2a3a55] text-[#94a3b8] hover:text-white font-semibold py-3 rounded-lg transition-colors">Back</button>
                <button onClick={handleStep2} disabled={isLoading}
                  className="flex-[2] bg-[#3b82f6] hover:bg-blue-500 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-60">
                  {isLoading ? "Saving…" : <>Continue <ChevronRight size={16} /></>}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Plan Selection */}
          {step === 3 && (
            <div>
              <h2 className="text-2xl font-bold text-white mb-1">Choose your plan</h2>
              <p className="text-[#94a3b8] text-sm mb-4">Start free for 14 days, then pay as you grow.</p>

              <div className="flex items-center justify-center gap-3 mb-6 bg-[#0f1729] rounded-lg p-1 w-fit mx-auto">
                <button onClick={() => setBillingCycle("monthly")}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${billingCycle === "monthly" ? "bg-[#3b82f6] text-white" : "text-[#94a3b8] hover:text-white"}`}>
                  Monthly
                </button>
                <button onClick={() => setBillingCycle("annual")}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${billingCycle === "annual" ? "bg-[#3b82f6] text-white" : "text-[#94a3b8] hover:text-white"}`}>
                  Annual <span className="text-xs text-green-400 ml-1">Save 17%</span>
                </button>
              </div>

              <div className="space-y-3">
                {plans.map((plan) => (
                  <button key={plan.id} onClick={() => setSelectedPlan(plan)}
                    className={`w-full text-left border rounded-xl p-4 transition-all ${
                      selectedPlan?.id === plan.id
                        ? "border-[#3b82f6] bg-[#3b82f6]/10"
                        : planColors[plan.slug] ?? "border-[#2a3a55] hover:border-[#3b82f6]"
                    }`}>
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${planAccents[plan.slug] ?? "bg-[#3b82f6]/10 text-[#3b82f6]"}`}>
                            {plan.name}
                          </span>
                          {plan.slug === "professional" && (
                            <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded-full">Most Popular</span>
                          )}
                        </div>
                        <p className="text-[#94a3b8] text-xs">{plan.description}</p>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {plan.features.slice(0, 3).map((f) => (
                            <span key={f} className="text-xs text-[#64748b]">• {f}</span>
                          ))}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-4">
                        <div className="text-2xl font-bold text-white">
                          ${billingCycle === "annual" ? Math.round(plan.priceAnnual / 12) : plan.priceMonthly}
                        </div>
                        <div className="text-xs text-[#475569]">/month</div>
                        {billingCycle === "annual" && (
                          <div className="text-xs text-green-400">billed ${plan.priceAnnual}/yr</div>
                        )}
                      </div>
                    </div>
                    {selectedPlan?.id === plan.id && (
                      <div className="flex items-center gap-1 mt-2 text-[#3b82f6] text-xs font-medium">
                        <Check size={12} /> Selected
                      </div>
                    )}
                  </button>
                ))}
              </div>

              <div className="flex gap-3 mt-6">
                <button onClick={() => setStep(2)} className="flex-1 border border-[#2a3a55] text-[#94a3b8] hover:text-white font-semibold py-3 rounded-lg transition-colors">Back</button>
                <button onClick={handleStep3}
                  className="flex-[2] bg-[#3b82f6] hover:bg-blue-500 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors">
                  Continue <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Payment */}
          {step === 4 && (
            <div>
              <h2 className="text-2xl font-bold text-white mb-1">Payment</h2>
              <p className="text-[#94a3b8] text-sm mb-2">
                {selectedPlan?.name} — ${billingCycle === "annual" ? selectedPlan?.priceAnnual : selectedPlan?.priceMonthly}/{billingCycle === "annual" ? "year" : "month"}
              </p>
              <p className="text-xs text-green-400 mb-6">Your 14-day free trial is already active. You will be charged after it ends.</p>

              {/* Payment method tabs */}
              <div className="flex gap-2 mb-6">
                <button onClick={() => { setPaymentMethod("paypal"); setPaypalRendered(false); }}
                  className={`flex-1 border rounded-lg py-3 text-sm font-medium transition-all ${paymentMethod === "paypal" ? "border-[#3b82f6] bg-[#3b82f6]/10 text-white" : "border-[#2a3a55] text-[#94a3b8] hover:border-[#3b82f6]/50"}`}>
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-blue-400 font-bold">Pay</span><span className="text-blue-200 font-bold">Pal</span>
                  </div>
                </button>
                <button onClick={() => setPaymentMethod("powertranz")}
                  className={`flex-1 border rounded-lg py-3 text-sm font-medium transition-all ${paymentMethod === "powertranz" ? "border-[#3b82f6] bg-[#3b82f6]/10 text-white" : "border-[#2a3a55] text-[#94a3b8] hover:border-[#3b82f6]/50"}`}>
                  <div className="flex items-center justify-center gap-2">
                    <CreditCard size={16} /> Card
                  </div>
                </button>
              </div>

              {paymentMethod === "paypal" && (
                <div>
                  {!import.meta.env["VITE_PAYPAL_CLIENT_ID"] ? (
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 text-amber-400 text-sm text-center">
                      PayPal is not yet configured.<br/>
                      <span className="text-xs text-[#94a3b8]">Add VITE_PAYPAL_CLIENT_ID to enable PayPal payments.</span>
                    </div>
                  ) : (
                    <div id="paypal-button-container" className="min-h-[100px] flex items-center justify-center">
                      {!paypalReady && <div className="text-[#94a3b8] text-sm">Loading PayPal…</div>}
                    </div>
                  )}
                </div>
              )}

              {paymentMethod === "powertranz" && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-[#94a3b8] mb-1">Cardholder Name</label>
                    <input value={card.name} onChange={e => setCard(c => ({ ...c, name: e.target.value }))}
                      className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-4 py-2.5 text-white focus:border-[#3b82f6] outline-none"
                      placeholder="John Smith" />
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
                        className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-4 py-2.5 text-white focus:border-[#3b82f6] outline-none font-mono"
                        placeholder="MM / YY" maxLength={7} />
                    </div>
                    <div>
                      <label className="block text-sm text-[#94a3b8] mb-1">CVV</label>
                      <input value={card.cvv} onChange={e => setCard(c => ({ ...c, cvv: e.target.value }))}
                        className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-4 py-2.5 text-white focus:border-[#3b82f6] outline-none font-mono"
                        placeholder="123" maxLength={4} type="password" />
                    </div>
                  </div>
                  <button onClick={handlePowerTranz} disabled={isLoading}
                    className="w-full bg-[#3b82f6] hover:bg-blue-500 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-60 mt-2">
                    {isLoading ? "Processing…" : "Pay Now"}
                  </button>
                  <p className="text-xs text-center text-[#475569]">Secured by PowerTranz</p>
                </div>
              )}

              <button onClick={() => setStep(3)} className="w-full mt-4 text-[#475569] hover:text-[#94a3b8] text-sm text-center transition-colors">
                ← Back to plans
              </button>
            </div>
          )}

          {/* Step 5: Success */}
          {step === 5 && (
            <div className="text-center py-4">
              <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check size={32} className="text-green-400" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">You're all set!</h2>
              <p className="text-[#94a3b8] mb-2">Welcome to Nexus POS, <strong className="text-white">{form.businessName || "your business"}</strong>.</p>
              <p className="text-sm text-[#475569] mb-8">Your 14-day trial is active. Explore all features and start selling in minutes.</p>
              <button onClick={() => navigate("/dashboard")}
                className="bg-[#3b82f6] hover:bg-blue-500 text-white font-semibold py-3 px-8 rounded-lg flex items-center justify-center gap-2 mx-auto transition-colors">
                Go to Dashboard <ArrowRight size={16} />
              </button>
              <p className="text-xs text-[#475569] mt-6">Powered by MicroBooks</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
