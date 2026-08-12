import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import {
  Check, CreditCard, Zap, Calendar, AlertTriangle,
  ArrowUpRight, RefreshCw, Upload, Banknote, X, FileCheck, Clock, Shield,
  Users, Package, MapPin, FileText, Download, Send, Receipt,
} from "lucide-react";
import {
  TENANT_TOKEN_KEY, saasMe, getPlans, createPayPalOrder, capturePayPalOrder,
  initiatePowerTranz, getPowerTranz3dsStatus, getBankAccounts, submitBankTransferProof, getMyBankTransferProofs,
  activateFreeSubscription, redeemCoupon, getBillingInvoices, openBillingPdf, resendBillingInvoice,
  getAddons, initiateAddonPowerTranz, cancelAddon,
  type Plan, type Tenant, type Subscription, type BankAccount, type BankTransferProofRow, type NextScheduledPayment,
  type BillingInvoiceRow, type AddonInfo, type TenantAddonRow,
} from "@/lib/saas-api";
import { loadScript } from "@paypal/paypal-js";

type PayMethod = "paypal" | "powertranz" | "bank_transfer";

export function SubscriptionPage() {
  const [, navigate] = useLocation();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [currentPlan, setCurrentPlan] = useState<Plan | null>(null);
  const [nextScheduledPayment, setNextScheduledPayment] = useState<NextScheduledPayment | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PayMethod>("paypal");
  const [card, setCard] = useState({ number: "", expiry: "", cvv: "", name: "" });
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [paypalRendered, setPaypalRendered] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [couponError, setCouponError] = useState("");
  const [redeemingCoupon, setRedeemingCoupon] = useState(false);

  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [myProofs, setMyProofs] = useState<BankTransferProofRow[]>([]);
  const [invoices, setInvoices] = useState<BillingInvoiceRow[]>([]);
  const [pdfBusy, setPdfBusy] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<number | null>(null);
  const [selectedBank, setSelectedBank] = useState<number | null>(null);
  const [transferRef, setTransferRef] = useState("");
  const [transferNotes, setTransferNotes] = useState("");
  const [proofFile, setProofFile] = useState<{ name: string; type: string; data: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [threeDsData, setThreeDsData] = useState<{ spiToken: string; redirectData: string } | null>(null);
  const threeDsContainerRef = useRef<HTMLDivElement>(null);

  // ── Add-ons (e.g. Work Orders $5/mo) ──
  const [addons, setAddons] = useState<AddonInfo[]>([]);
  const [myAddons, setMyAddons] = useState<TenantAddonRow[]>([]);
  const [buyingAddon, setBuyingAddon] = useState<string | null>(null); // slug whose card form is open
  const [addonCycle, setAddonCycle] = useState<"monthly" | "annual">("monthly");
  const [addonCard, setAddonCard] = useState({ number: "", expiry: "", cvv: "", name: "" });
  const [cancellingAddon, setCancellingAddon] = useState<string | null>(null);

  const reloadAddons = useCallback(async () => {
    try {
      const r = await getAddons();
      setAddons(r.addons);
      setMyAddons(r.mine);
    } catch { /* section simply stays empty */ }
  }, []);

  async function reload() {
    const me = await saasMe();
    setTenant(me.tenant);
    setSubscription(me.subscription ?? null);
    setCurrentPlan(me.plan ?? null);
    setNextScheduledPayment(me.nextScheduledPayment ?? null);
  }

  async function handleOpenPdf(id: number, kind: "invoice" | "receipt") {
    setPdfBusy(`${id}:${kind}`);
    try {
      await openBillingPdf(id, kind);
    } catch {
      setError(`Could not open the ${kind}. Please try again.`);
    } finally {
      setPdfBusy(null);
    }
  }

  async function handleResend(id: number) {
    setResendingId(id);
    setError(""); setSuccess("");
    try {
      const res = await resendBillingInvoice(id);
      setSuccess(`Invoice and receipt re-sent to ${res.email}.`);
      setInvoices(await getBillingInvoices().catch(() => invoices));
    } catch {
      setError("Could not re-send the email. Please try again.");
    } finally {
      setResendingId(null);
    }
  }

  useEffect(() => {
    const token = localStorage.getItem(TENANT_TOKEN_KEY);
    if (!token) { navigate("/signup"); return; }

    void reloadAddons();
    Promise.all([saasMe(), getPlans(), getBankAccounts(), getMyBankTransferProofs(), getBillingInvoices().catch(() => [])])
      .then(([me, p, ba, proofs, inv]) => {
        setTenant(me.tenant);
        setSubscription(me.subscription ?? null);
        setCurrentPlan(me.plan ?? null);
        setNextScheduledPayment(me.nextScheduledPayment ?? null);
        setPlans(p);
        setBankAccounts(ba);
        setMyProofs(proofs);
        setInvoices(inv);
        if (me.subscription?.billingCycle) setBillingCycle(me.subscription.billingCycle as "monthly" | "annual");
        if (ba.length > 0 && ba[0]) setSelectedBank(ba[0].id);
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
            await reload();
          } catch (e) { setError(String(e)); }
          finally { setIsProcessing(false); }
        },
        onError: (e) => setError(String(e)),
      }).render("#sub-paypal-container");
      setPaypalRendered(true);
    });
  }, [showPayment, paymentMethod, selectedPlan, billingCycle, paypalRendered]);

  function formatCardNumber(raw: string) {
    const digits = raw.replace(/\D/g, "").slice(0, 16);
    return digits.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
  }

  function formatExpiry(raw: string) {
    const digits = raw.replace(/\D/g, "").slice(0, 4);
    if (digits.length >= 3) return `${digits.slice(0, 2)} / ${digits.slice(2)}`;
    return digits;
  }

  const DECLINE_CODES: Record<string, string> = {
    "05": "Card declined — please contact your bank.",
    "14": "Invalid card number.",
    "51": "Insufficient funds.",
    "54": "Card expired.",
    "57": "Transaction not permitted.",
    "61": "Exceeds withdrawal limit.",
    "65": "Exceeds activity limit.",
    "75": "PIN tries exceeded.",
    "82": "Invalid CVV.",
    "91": "Issuer unavailable — try again.",
    "96": "System error — try again.",
  };

  const handle3dsMessage = useCallback(async (event: MessageEvent) => {
    if (event.data?.type !== "POWERTRANZ_3DS") return;
    const { status, message, planName, rrn } = event.data;
    setThreeDsData(null);
    setIsProcessing(false);
    if (status === "approved") {
      const rrnSuffix = rrn ? ` · RRN: ${rrn}` : "";
      setSuccess(`Payment approved — ${planName ?? selectedPlan?.name ?? "plan"} is now active!${rrnSuffix}`);
      setShowPayment(false);
      setBuyingAddon(null);
      setAddonCard({ number: "", expiry: "", cvv: "", name: "" });
      await reload();
      await reloadAddons();
    } else {
      setError(message || "Payment declined. Please try another card.");
    }
  }, [selectedPlan, reload, reloadAddons]);

  useEffect(() => {
    window.addEventListener("message", handle3dsMessage);
    return () => window.removeEventListener("message", handle3dsMessage);
  }, [handle3dsMessage]);

  useEffect(() => {
    if (!threeDsData || !threeDsContainerRef.current) return;
    const container = threeDsContainerRef.current;
    container.innerHTML = "";
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "width:100%;height:100%;border:none;background:#fff;";
    iframe.setAttribute("sandbox", "allow-scripts allow-forms allow-same-origin allow-top-navigation allow-popups");
    container.appendChild(iframe);
    // Use contentDocument.write instead of srcdoc so the auto-submit script runs in a proper origin context
    const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(threeDsData.redirectData);
      doc.close();
    }

    // Fallback poll in case postMessage is blocked
    const pollTimer = setInterval(async () => {
      try {
        const s = await getPowerTranz3dsStatus(threeDsData.spiToken);
        if (s.status === "approved") {
          clearInterval(pollTimer);
          window.dispatchEvent(new MessageEvent("message", { data: { type: "POWERTRANZ_3DS", status: "approved", planName: s.planName, rrn: s.rrn } }));
        } else if (s.status === "declined") {
          clearInterval(pollTimer);
          window.dispatchEvent(new MessageEvent("message", { data: { type: "POWERTRANZ_3DS", status: "declined", message: s.message || "Payment declined." } }));
        }
      } catch { /* ignore poll errors */ }
    }, 3000);
    return () => clearInterval(pollTimer);
  }, [threeDsData]);

  async function handleActivateFree() {
    if (!selectedPlan) return;
    setError(""); setIsProcessing(true);
    try {
      const res = await activateFreeSubscription(selectedPlan.slug, billingCycle);
      setSuccess(`Successfully activated ${res.plan.name}!`);
      setSelectedPlan(null);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to activate plan.");
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleRedeemCoupon() {
    const code = couponCode.trim();
    if (!code) { setCouponError("Please enter a code."); return; }
    setCouponError(""); setError(""); setRedeemingCoupon(true);
    try {
      const res = await redeemCoupon(code);
      setSuccess(`Code accepted — ${res.plan.name} is now active!`);
      setCouponCode("");
      setSelectedPlan(null);
      await reload();
    } catch (e) {
      setCouponError(e instanceof Error ? e.message : "Could not redeem that code.");
    } finally {
      setRedeemingCoupon(false);
    }
  }

  async function handlePowerTranz() {
    if (!selectedPlan) return;
    const rawNumber = card.number.replace(/\s/g, "");
    if (!rawNumber || rawNumber.length < 13) { setError("Please enter a valid card number."); return; }
    if (!card.expiry || !/^\d{2}\s*\/\s*\d{2}$/.test(card.expiry)) { setError("Please enter expiry in MM / YY format."); return; }
    if (!card.cvv || card.cvv.length < 3) { setError("Please enter your CVV."); return; }
    if (!card.name.trim()) { setError("Please enter the cardholder name."); return; }
    setError(""); setIsProcessing(true);
    let needs3ds = false;
    try {
      const res = await initiatePowerTranz({
        planSlug: selectedPlan.slug, billingCycle,
        cardNumber: card.number, cardExpiry: card.expiry,
        cardCvv: card.cvv, cardholderName: card.name,
        returnUrl: window.location.href,
      });

      if (res.step === "3ds" && res.spiToken && res.redirectData) {
        needs3ds = true;
        setThreeDsData({ spiToken: res.spiToken, redirectData: res.redirectData });
        return;
      }

      if (res.step === "approved") {
        const ref = res.rrn ? ` · RRN: ${res.rrn}` : res.transactionId ? ` · Ref: ${res.transactionId}` : "";
        setSuccess(`Successfully subscribed to ${selectedPlan.name}!${ref}`);
        setShowPayment(false);
        setCard({ number: "", expiry: "", cvv: "", name: "" });
        await reload();
        return;
      }

      const code = res.responseCode ?? "unknown";
      const gatewayMsg = res.responseMessage ? ` — ${res.responseMessage}` : "";
      const msg = DECLINE_CODES[code] ?? `Payment declined (code: ${code}${gatewayMsg}).`;
      setError(msg);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.startsWith("PowerTranz") ? msg : `Payment failed: ${msg}`);
    } finally {
      if (!needs3ds) setIsProcessing(false);
    }
  }

  async function handleAddonPowerTranz(addon: AddonInfo) {
    const rawNumber = addonCard.number.replace(/\s/g, "");
    if (!rawNumber || rawNumber.length < 13) { setError("Please enter a valid card number."); return; }
    if (!addonCard.expiry || !/^\d{2}\s*\/\s*\d{2}$/.test(addonCard.expiry)) { setError("Please enter expiry in MM / YY format."); return; }
    if (!addonCard.cvv || addonCard.cvv.length < 3) { setError("Please enter your CVV."); return; }
    if (!addonCard.name.trim()) { setError("Please enter the cardholder name."); return; }
    setError(""); setSuccess(""); setIsProcessing(true);
    let needs3ds = false;
    try {
      const res = await initiateAddonPowerTranz({
        addonSlug: addon.slug, billingCycle: addonCycle,
        cardNumber: addonCard.number, cardExpiry: addonCard.expiry,
        cardCvv: addonCard.cvv, cardholderName: addonCard.name,
        returnUrl: window.location.href,
      });

      if (res.step === "3ds" && res.spiToken && res.redirectData) {
        needs3ds = true;
        setThreeDsData({ spiToken: res.spiToken, redirectData: res.redirectData });
        return;
      }

      if (res.step === "approved") {
        const ref = res.rrn ? ` · RRN: ${res.rrn}` : res.transactionId ? ` · Ref: ${res.transactionId}` : "";
        setSuccess(`${addon.name} is now active!${ref}`);
        setBuyingAddon(null);
        setAddonCard({ number: "", expiry: "", cvv: "", name: "" });
        await reloadAddons();
        return;
      }

      const code = res.responseCode ?? "unknown";
      const gatewayMsg = res.responseMessage ? ` — ${res.responseMessage}` : "";
      setError(DECLINE_CODES[code] ?? `Payment declined (code: ${code}${gatewayMsg}).`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.startsWith("PowerTranz") ? msg : `Payment failed: ${msg}`);
    } finally {
      if (!needs3ds) setIsProcessing(false);
    }
  }

  async function handleCancelAddon(addon: AddonInfo) {
    if (!confirm(`Cancel ${addon.name}? You keep access until the end of the period you've paid for.`)) return;
    setCancellingAddon(addon.slug);
    setError(""); setSuccess("");
    try {
      const res = await cancelAddon(addon.slug);
      setSuccess(`${addon.name} cancelled — access continues until ${new Date(res.activeUntil).toLocaleDateString()}.`);
      await reloadAddons();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not cancel the add-on.");
    } finally {
      setCancellingAddon(null);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { setError("File must be under 8 MB."); return; }
    const allowedTypes = ["application/pdf", "image/jpeg", "image/jpg"];
    if (!allowedTypes.includes(file.type)) { setError("Only PDF and JPG files are allowed."); return; }
    setError("");
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1] ?? "";
      setProofFile({ name: file.name, type: file.type.includes("pdf") ? "pdf" : "jpg", data: base64 });
    };
    reader.readAsDataURL(file);
  }

  async function handleBankTransferSubmit() {
    if (!selectedPlan || !selectedBank) { setError("Please select a plan and bank account."); return; }
    if (!proofFile) { setError("Please upload proof of payment."); return; }
    setError(""); setIsProcessing(true);
    try {
      await submitBankTransferProof({
        planSlug: selectedPlan.slug,
        billingCycle,
        bankAccountId: selectedBank,
        referenceNumber: transferRef || undefined,
        notes: transferNotes || undefined,
        proofFileName: proofFile.name,
        proofFileType: proofFile.type,
        proofFileData: proofFile.data,
      });
      setSuccess("Payment proof submitted! Our team will review it and activate your subscription shortly.");
      setShowPayment(false);
      const proofs = await getMyBankTransferProofs();
      setMyProofs(proofs);
    } catch (e) { setError(String(e)); }
    finally { setIsProcessing(false); }
  }

  const statusColor: Record<string, string> = { active: "text-green-400", trial: "text-blue-400", cancelled: "text-[#475569]", past_due: "text-amber-400" };
  const planColors: Record<string, string> = { starter: "border-[#3b82f6]/40 hover:border-[#3b82f6]", professional: "border-purple-500/40 hover:border-purple-500", enterprise: "border-amber-500/40 hover:border-amber-500" };
  const planAccents: Record<string, string> = { starter: "bg-[#3b82f6]/10 text-[#3b82f6]", professional: "bg-purple-500/10 text-purple-400", enterprise: "bg-amber-500/10 text-amber-400" };

  if (loading) return <div className="min-h-screen bg-[#0f1729] flex items-center justify-center"><RefreshCw size={24} className="animate-spin text-[#3b82f6]" /></div>;

  const trialEnd = subscription?.trialEndsAt ? new Date(subscription.trialEndsAt) : null;
  const periodEnd = subscription?.currentPeriodEnd ? new Date(subscription.currentPeriodEnd) : null;
  const daysLeft = trialEnd ? Math.max(0, Math.ceil((trialEnd.getTime() - Date.now()) / 86400000)) : null;
  const pendingProof = myProofs.find(p => p.status === "pending");

  return (
    <div className="p-6 max-w-4xl mx-auto">

      {/* 3DS Authentication Modal */}
      {threeDsData && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-[#1a2332] border border-[#2a3a55] rounded-xl overflow-hidden w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#2a3a55]">
              <div className="flex items-center gap-2 text-white font-semibold">
                <Shield size={18} className="text-[#3b82f6]" />
                Secure 3D Authentication
              </div>
              <button
                onClick={() => { setThreeDsData(null); setIsProcessing(false); setError("Authentication cancelled. Please try again."); }}
                className="text-[#94a3b8] hover:text-white transition-colors"
              ><X size={18} /></button>
            </div>
            <p className="text-[#94a3b8] text-xs px-5 py-2 bg-[#0f1729]">Your bank may ask you to verify this payment. Complete the steps below to proceed.</p>
            <div ref={threeDsContainerRef} className="w-full" style={{ height: "480px" }} />
          </div>
        </div>
      )}

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Subscription</h1>
        <p className="text-[#94a3b8] text-sm">Manage your NEXXUS POS plan and billing</p>
      </div>

      {success && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg px-4 py-3 text-green-400 text-sm mb-6 flex items-center gap-2">
          <Check size={16} /> {success}
        </div>
      )}
      {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm mb-6">{error}</div>}

      {/* Pending bank transfer notice */}
      {pendingProof && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3 text-amber-400 text-sm mb-6 flex items-center gap-2">
          <Clock size={16} />
          <span>Your bank transfer for <strong>{pendingProof.planName}</strong> is pending review. You'll be notified once activated.</span>
        </div>
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
              <div className="text-2xl font-bold text-white">${subscription?.billingCycle === "annual" ? currentPlan.priceAnnual : currentPlan.priceMonthly}</div>
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
          nextScheduledPayment ? (
            <div className="mt-4 bg-green-500/10 border border-green-500/20 rounded-lg p-3 flex items-start gap-2 text-green-400 text-sm">
              <Check size={16} className="shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">Renewal paid</span>
                {" — "}your next period runs{" "}
                <span className="text-white font-medium">
                  {new Date(nextScheduledPayment.scheduledStartDate).toLocaleDateString()}
                </span>
                {" to "}
                <span className="text-white font-medium">
                  {new Date(nextScheduledPayment.scheduledEndDate).toLocaleDateString()}
                </span>
                {nextScheduledPayment.planName && nextScheduledPayment.planName !== currentPlan?.name && (
                  <span className="text-green-400/70"> ({nextScheduledPayment.planName})</span>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-4 flex items-center gap-2 text-[#94a3b8] text-sm">
              <Calendar size={14} />
              Next billing date: {periodEnd.toLocaleDateString()}
            </div>
          )
        )}

        {currentPlan && (
          <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
            {[
              { label: "Staff", value: currentPlan.maxStaff === 9999 ? "∞" : String(currentPlan.maxStaff) },
              { label: "Products", value: currentPlan.maxProducts === 9999 ? "∞" : String(currentPlan.maxProducts) },
              { label: "Locations", value: currentPlan.maxLocations === 9999 ? "∞" : String(currentPlan.maxLocations) },
            ].map(c => (
              <div key={c.label} className="bg-[#0f1729] rounded-lg p-3 text-center">
                <div className="text-white font-semibold">{c.value}</div>
                <div className="text-[#475569] text-xs">{c.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add-ons */}
      {addons.length > 0 && (
        <div className="bg-[#1a2332] border border-[#2a3a55] rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold text-white mb-1">Add-ons</h2>
          <p className="text-[#94a3b8] text-sm mb-4">Optional modules billed on top of your plan.</p>
          <div className="space-y-4">
            {addons.map((addon) => {
              const mine = myAddons.find((m) => m.addonSlug === addon.slug);
              const isActive = mine?.status === "active";
              const isCancelled = mine?.status === "cancelled" && new Date(mine.currentPeriodEnd) > new Date();
              const canBuy = !isActive && !isCancelled;
              const buying = buyingAddon === addon.slug;
              return (
                <div key={addon.slug} className="bg-[#0f1729] border border-[#2a3a55] rounded-lg p-4">
                  <div className="flex items-start justify-between flex-wrap gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-white font-semibold">{addon.name}</span>
                        {isActive && <span className="text-xs font-medium text-green-400 bg-green-500/10 border border-green-500/20 rounded-full px-2 py-0.5">Active until {new Date(mine!.currentPeriodEnd).toLocaleDateString()}</span>}
                        {isCancelled && <span className="text-xs font-medium text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-2 py-0.5">Cancelled — access until {new Date(mine!.currentPeriodEnd).toLocaleDateString()}</span>}
                        {mine?.status === "expired" && <span className="text-xs font-medium text-[#94a3b8] bg-[#475569]/20 border border-[#475569]/40 rounded-full px-2 py-0.5">Expired</span>}
                      </div>
                      <p className="text-[#94a3b8] text-sm mt-1">{addon.description}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-bold text-white">${addon.priceMonthly}<span className="text-sm text-[#94a3b8] font-normal">/mo</span></div>
                      <div className="text-xs text-[#94a3b8]">or ${addon.priceAnnual}/yr</div>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2 flex-wrap">
                    {canBuy && !buying && (
                      <button
                        onClick={() => { setBuyingAddon(addon.slug); setError(""); setSuccess(""); }}
                        className="px-4 py-2 bg-[#3b82f6] hover:bg-[#2563eb] text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
                      >
                        <CreditCard size={15} /> {mine ? "Renew" : "Purchase"} — ${addonCycle === "annual" ? addon.priceAnnual : addon.priceMonthly}/{addonCycle === "annual" ? "yr" : "mo"}
                      </button>
                    )}
                    {isActive && (
                      <button
                        onClick={() => handleCancelAddon(addon)}
                        disabled={cancellingAddon === addon.slug}
                        className="px-4 py-2 border border-[#2a3a55] hover:border-red-500/50 text-[#94a3b8] hover:text-red-400 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                      >
                        {cancellingAddon === addon.slug ? "Cancelling…" : "Cancel add-on"}
                      </button>
                    )}
                  </div>

                  {buying && (
                    <div className="mt-4 border-t border-[#2a3a55] pt-4 space-y-3">
                      <div className="flex items-center gap-2 bg-[#1a2332] rounded-lg p-1 w-fit">
                        <button onClick={() => setAddonCycle("monthly")}
                          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${addonCycle === "monthly" ? "bg-[#3b82f6] text-white" : "text-[#94a3b8] hover:text-white"}`}>
                          Monthly ${addon.priceMonthly}
                        </button>
                        <button onClick={() => setAddonCycle("annual")}
                          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${addonCycle === "annual" ? "bg-[#3b82f6] text-white" : "text-[#94a3b8] hover:text-white"}`}>
                          Annual ${addon.priceAnnual}
                        </button>
                      </div>
                      <input
                        placeholder="Cardholder name"
                        value={addonCard.name}
                        onChange={(e) => setAddonCard({ ...addonCard, name: e.target.value })}
                        className="w-full bg-[#1a2332] border border-[#2a3a55] rounded-lg px-3 py-2 text-white text-sm placeholder-[#475569] focus:border-[#3b82f6] outline-none"
                      />
                      <input
                        placeholder="Card number"
                        inputMode="numeric"
                        value={addonCard.number}
                        onChange={(e) => {
                          const digits = e.target.value.replace(/\D/g, "").slice(0, 19);
                          setAddonCard({ ...addonCard, number: digits.replace(/(\d{4})(?=\d)/g, "$1 ") });
                        }}
                        className="w-full bg-[#1a2332] border border-[#2a3a55] rounded-lg px-3 py-2 text-white text-sm placeholder-[#475569] focus:border-[#3b82f6] outline-none"
                      />
                      <div className="grid grid-cols-2 gap-3">
                        <input
                          placeholder="MM / YY"
                          inputMode="numeric"
                          value={addonCard.expiry}
                          onChange={(e) => {
                            const digits = e.target.value.replace(/\D/g, "").slice(0, 4);
                            setAddonCard({ ...addonCard, expiry: digits.length > 2 ? `${digits.slice(0, 2)} / ${digits.slice(2)}` : digits });
                          }}
                          className="w-full bg-[#1a2332] border border-[#2a3a55] rounded-lg px-3 py-2 text-white text-sm placeholder-[#475569] focus:border-[#3b82f6] outline-none"
                        />
                        <input
                          placeholder="CVV"
                          inputMode="numeric"
                          type="password"
                          value={addonCard.cvv}
                          onChange={(e) => setAddonCard({ ...addonCard, cvv: e.target.value.replace(/\D/g, "").slice(0, 4) })}
                          className="w-full bg-[#1a2332] border border-[#2a3a55] rounded-lg px-3 py-2 text-white text-sm placeholder-[#475569] focus:border-[#3b82f6] outline-none"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleAddonPowerTranz(addon)}
                          disabled={isProcessing}
                          className="px-4 py-2 bg-[#3b82f6] hover:bg-[#2563eb] text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                        >
                          {isProcessing ? <RefreshCw size={15} className="animate-spin" /> : <Shield size={15} />}
                          Pay ${addonCycle === "annual" ? addon.priceAnnual : addon.priceMonthly} USD
                        </button>
                        <button
                          onClick={() => { setBuyingAddon(null); setAddonCard({ number: "", expiry: "", cvv: "", name: "" }); }}
                          className="px-4 py-2 border border-[#2a3a55] text-[#94a3b8] hover:text-white text-sm font-medium rounded-lg transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                      <p className="text-[#475569] text-xs">Charged in USD via secure 3D authentication. The module unlocks immediately after payment.</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Plan Selection */}
      {!showPayment && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">{subscription?.status === "active" ? "Change Plan" : "Choose a Plan"}</h2>
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

          <div className="space-y-4 mb-6">
            {plans.map((plan) => {
              const isCurrent = currentPlan?.id === plan.id;
              const isSelected = selectedPlan?.id === plan.id;
              const displayPrice = billingCycle === "annual" ? Math.round(plan.priceAnnual / 12) : plan.priceMonthly;
              const isFreePrice = (billingCycle === "annual" ? plan.priceAnnual : plan.priceMonthly) === 0;
              const accentClass = planAccents[plan.slug] ?? "bg-[#3b82f6]/10 text-[#3b82f6]";
              const borderClass = isCurrent
                ? "border-green-500/40 bg-green-500/5 cursor-default"
                : isSelected
                  ? "border-[#3b82f6] bg-[#3b82f6]/10 cursor-pointer"
                  : (planColors[plan.slug] ?? "border-[#2a3a55] hover:border-[#3b82f6]") + " cursor-pointer";

              return (
                <div key={plan.id}
                  onClick={() => { if (!isCurrent) setSelectedPlan(isSelected ? null : plan); }}
                  role="button" tabIndex={isCurrent ? -1 : 0}
                  onKeyDown={e => { if (!isCurrent && (e.key === "Enter" || e.key === " ")) setSelectedPlan(isSelected ? null : plan); }}
                  className={`border rounded-xl transition-all ${borderClass}`}
                >
                  {/* ── Card Header ── */}
                  <div className="p-5 pb-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        {/* Badges */}
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${accentClass}`}>{plan.name}</span>
                          {isCurrent && <span className="text-xs bg-green-500/15 text-green-400 border border-green-500/30 px-2 py-0.5 rounded-full flex items-center gap-1"><Check size={9} /> Current Plan</span>}
                          {plan.isPromotional && <span className="text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full">Promo</span>}
                          {plan.slug === "professional" && !isCurrent && <span className="text-xs bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2 py-0.5 rounded-full">Most Popular</span>}
                          {isSelected && !isCurrent && <span className="text-xs bg-[#3b82f6]/15 text-[#3b82f6] border border-[#3b82f6]/30 px-2 py-0.5 rounded-full flex items-center gap-1"><Check size={9} /> Selected</span>}
                        </div>
                        <p className="text-[#94a3b8] text-sm leading-relaxed">{plan.description}</p>
                      </div>

                      {/* Price */}
                      <div className="text-right flex-shrink-0">
                        {isFreePrice ? (
                          <>
                            <div className="text-3xl font-bold text-green-400">$0</div>
                            <div className="text-xs text-[#475569]">/month</div>
                          </>
                        ) : (
                          <>
                            <div className="text-3xl font-bold text-white">${displayPrice}</div>
                            <div className="text-xs text-[#475569]">/month</div>
                            {billingCycle === "annual" && (
                              <div className="text-xs text-green-400 mt-0.5">${plan.priceAnnual}/yr</div>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {/* Limits row */}
                    <div className="flex flex-wrap gap-2 mt-4">
                      {[
                        { icon: Users, label: plan.maxStaff === 9999 ? "Unlimited Staff" : `${plan.maxStaff} Staff` },
                        { icon: Package, label: plan.maxProducts === 9999 ? "Unlimited Products" : `${plan.maxProducts} Products` },
                        { icon: MapPin, label: plan.maxLocations === 9999 ? "Unlimited Locations" : `${plan.maxLocations} Location${plan.maxLocations === 1 ? "" : "s"}` },
                        ...(plan.maxInvoices !== 9999 ? [{ icon: FileText, label: `${plan.maxInvoices} Invoices/mo` }] : []),
                      ].map(({ icon: Icon, label }) => (
                        <span key={label} className="inline-flex items-center gap-1.5 text-xs bg-[#0f1729] border border-[#2a3a55] rounded-full px-3 py-1 text-[#94a3b8]">
                          <Icon size={11} className="text-[#475569]" /> {label}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* ── Divider ── */}
                  <div className="border-t border-[#2a3a55] mx-5" />

                  {/* ── Feature checklist ── */}
                  <div className="p-5 pt-4">
                    <p className="text-xs font-semibold text-[#475569] uppercase tracking-wide mb-3">What's included</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                      {plan.features.map((f) => (
                        <div key={f} className="flex items-start gap-2 text-sm text-[#94a3b8]">
                          <Check size={14} className="text-green-400 shrink-0 mt-0.5" />
                          <span>{f}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {selectedPlan && (() => {
            const planPrice = billingCycle === "annual" ? selectedPlan.priceAnnual : selectedPlan.priceMonthly;
            const isFree = planPrice === 0;
            const isOnPaidPlan = !!subscription?.provider && subscription?.provider !== "free";
            return isFree ? (
              isOnPaidPlan ? (
                // Paid tenants cannot self-downgrade to a free plan — a superadmin
                // must do it so billing records are handled deliberately.
                <div className="w-full bg-[#1a2332] border border-amber-500/40 rounded-xl p-4 flex items-start gap-3">
                  <AlertTriangle size={18} className="text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-300">
                    Your account is on a paid plan. To downgrade to the free plan, please contact support —
                    a plan change cannot be self-applied while an active paid subscription is in place.
                  </p>
                </div>
              ) : (
                <button onClick={handleActivateFree} disabled={isProcessing}
                  className="w-full bg-[#3b82f6] hover:bg-blue-500 disabled:opacity-60 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors">
                  {isProcessing ? <RefreshCw size={16} className="animate-spin" /> : <Zap size={16} />}
                  Activate {selectedPlan.name} — Free
                </button>
              )
            ) : (
              <button onClick={() => { setShowPayment(true); setPaypalRendered(false); setError(""); setProofFile(null); setTransferRef(""); setTransferNotes(""); }}
                className="w-full bg-[#3b82f6] hover:bg-blue-500 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors">
                Subscribe to {selectedPlan.name} — ${billingCycle === "annual" ? selectedPlan.priceAnnual : selectedPlan.priceMonthly}/{billingCycle === "annual" ? "yr" : "mo"}
                <ArrowUpRight size={16} />
              </button>
            );
          })()}

          {/* Redeem a code (unlocks a promotional plan) */}
          <div className="mt-6 bg-[#1a2332] border border-[#2a3a55] rounded-xl p-5">
            <div className="flex items-center gap-2 mb-1">
              <Zap size={15} className="text-amber-400" />
              <h3 className="text-sm font-semibold text-white">Have a code?</h3>
            </div>
            <p className="text-xs text-[#94a3b8] mb-3">
              Enter a promotional code to unlock a special plan.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={couponCode}
                onChange={e => { setCouponCode(e.target.value.toUpperCase()); setCouponError(""); }}
                onKeyDown={e => { if (e.key === "Enter") handleRedeemCoupon(); }}
                placeholder="Enter code"
                autoCapitalize="characters"
                className="flex-1 bg-[#0f1729] border border-[#2a3a55] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#475569] uppercase tracking-wide focus:outline-none focus:border-[#3b82f6]"
              />
              <button
                onClick={handleRedeemCoupon}
                disabled={redeemingCoupon || !couponCode.trim()}
                className="bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-[#0f1729] font-semibold px-5 py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
              >
                {redeemingCoupon ? <RefreshCw size={15} className="animate-spin" /> : <Check size={15} />}
                Redeem
              </button>
            </div>
            {couponError && (
              <p className="text-xs text-red-400 mt-2 flex items-center gap-1.5">
                <AlertTriangle size={12} /> {couponError}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Payment Panel */}
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

          {/* Payment Method Tabs */}
          <div className="flex gap-2 mb-6 flex-wrap">
            {([
              { id: "paypal" as PayMethod, label: "PayPal" },
              { id: "powertranz" as PayMethod, label: "Card" },
              { id: "bank_transfer" as PayMethod, label: "Bank Transfer" },
            ]).map((m) => (
              <button key={m.id} onClick={() => { setPaymentMethod(m.id); setPaypalRendered(false); setError(""); }}
                className={`flex-1 min-w-[100px] border rounded-lg py-2.5 text-sm font-medium transition-all ${paymentMethod === m.id ? "border-[#3b82f6] bg-[#3b82f6]/10 text-white" : "border-[#2a3a55] text-[#94a3b8] hover:border-[#3b82f6]/50"}`}>
                {m.id === "paypal" ? <span><span className="text-blue-400 font-bold">Pay</span><span className="text-blue-200 font-bold">Pal</span></span> :
                 m.id === "powertranz" ? <span className="flex items-center justify-center gap-1"><CreditCard size={14} /> Card</span> :
                 <span className="flex items-center justify-center gap-1"><Banknote size={14} /> Bank Transfer</span>}
              </button>
            ))}
          </div>

          {/* PayPal */}
          {paymentMethod === "paypal" && (
            <div>
              {!import.meta.env["VITE_PAYPAL_CLIENT_ID"] ? (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 text-amber-400 text-sm text-center">
                  PayPal is not yet configured.<br />
                  <span className="text-xs text-[#94a3b8]">Add VITE_PAYPAL_CLIENT_ID to enable PayPal payments.</span>
                </div>
              ) : (
                <div id="sub-paypal-container" className="min-h-[100px] flex items-center justify-center">
                  {!paypalRendered && <div className="text-[#94a3b8] text-sm">Loading PayPal…</div>}
                </div>
              )}
            </div>
          )}

          {/* Card */}
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
                <input value={card.number}
                  onChange={e => setCard(c => ({ ...c, number: formatCardNumber(e.target.value) }))}
                  className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-4 py-2.5 text-white focus:border-[#3b82f6] outline-none font-mono tracking-widest"
                  placeholder="4111 1111 1111 1111" maxLength={19} inputMode="numeric" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-[#94a3b8] mb-1">Expiry (MM / YY)</label>
                  <input value={card.expiry}
                    onChange={e => setCard(c => ({ ...c, expiry: formatExpiry(e.target.value) }))}
                    className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-4 py-2.5 text-white focus:border-[#3b82f6] outline-none font-mono" placeholder="12 / 31" maxLength={7} inputMode="numeric" />
                </div>
                <div>
                  <label className="block text-sm text-[#94a3b8] mb-1">CVV</label>
                  <input value={card.cvv}
                    onChange={e => setCard(c => ({ ...c, cvv: e.target.value.replace(/\D/g, "").slice(0, 4) }))}
                    className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-4 py-2.5 text-white focus:border-[#3b82f6] outline-none font-mono" placeholder="123" maxLength={4} type="password" inputMode="numeric" />
                </div>
              </div>
              <button onClick={handlePowerTranz} disabled={isProcessing}
                className="w-full bg-[#3b82f6] hover:bg-blue-500 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-60">
                {isProcessing ? <><RefreshCw size={16} className="animate-spin" /> Processing…</> : <><Zap size={16} /> Pay Now</>}
              </button>
              <p className="text-xs text-center text-[#475569]">Secured by PowerTranz · 3D Secure enabled</p>
            </div>
          )}

          {/* Bank Transfer */}
          {paymentMethod === "bank_transfer" && (
            <div className="space-y-5">
              {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">{error}</div>}

              {bankAccounts.length === 0 ? (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 text-amber-400 text-sm text-center">
                  Bank transfer is not yet configured.<br />
                  <span className="text-xs text-[#94a3b8]">Please contact support for payment instructions.</span>
                </div>
              ) : (
                <>
                  <div>
                    <h3 className="text-sm font-semibold text-[#94a3b8] mb-3 uppercase tracking-wide">Bank Account Details</h3>
                    <div className="space-y-3">
                      {bankAccounts.map(acct => (
                        <button key={acct.id} onClick={() => setSelectedBank(acct.id)}
                          className={`w-full text-left border rounded-xl p-4 transition-all ${selectedBank === acct.id ? "border-[#3b82f6] bg-[#3b82f6]/10" : "border-[#2a3a55] hover:border-[#3b82f6]/50"}`}>
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-semibold text-white">{acct.bankName}</span>
                            <span className="text-xs text-[#94a3b8] border border-[#2a3a55] px-2 py-0.5 rounded-full">{acct.currency}</span>
                          </div>
                          <div className="text-sm text-[#94a3b8] space-y-0.5">
                            <div className="flex justify-between"><span>Account Holder</span><span className="text-white">{acct.accountHolder}</span></div>
                            <div className="flex justify-between"><span>Account Number</span><span className="text-white font-mono">{acct.accountNumber}</span></div>
                            {acct.routingNumber && <div className="flex justify-between"><span>Routing</span><span className="text-white font-mono">{acct.routingNumber}</span></div>}
                            {acct.iban && <div className="flex justify-between"><span>IBAN</span><span className="text-white font-mono">{acct.iban}</span></div>}
                            {acct.swiftCode && <div className="flex justify-between"><span>SWIFT</span><span className="text-white font-mono">{acct.swiftCode}</span></div>}
                          </div>
                          {acct.instructions && <p className="mt-2 text-xs text-amber-400/80 border-t border-[#2a3a55] pt-2">{acct.instructions}</p>}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm text-[#94a3b8] mb-1">Transaction / Reference Number</label>
                    <input value={transferRef} onChange={e => setTransferRef(e.target.value)}
                      className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-4 py-2.5 text-white focus:border-[#3b82f6] outline-none font-mono"
                      placeholder="e.g. TXN-20240401-001" />
                  </div>

                  <div>
                    <label className="block text-sm text-[#94a3b8] mb-1">Notes (optional)</label>
                    <textarea value={transferNotes} onChange={e => setTransferNotes(e.target.value)} rows={2}
                      className="w-full bg-[#0f1729] border border-[#2a3a55] rounded-lg px-4 py-2.5 text-white focus:border-[#3b82f6] outline-none resize-none text-sm"
                      placeholder="Any additional information about the transfer…" />
                  </div>

                  <div>
                    <label className="block text-sm text-[#94a3b8] mb-2">Proof of Payment *</label>
                    <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg" className="hidden" onChange={handleFileChange} />
                    {proofFile ? (
                      <div className="flex items-center justify-between bg-[#0f1729] border border-[#3b82f6]/40 rounded-lg px-4 py-3">
                        <div className="flex items-center gap-2 text-sm">
                          <FileCheck size={16} className="text-green-400" />
                          <span className="text-white">{proofFile.name}</span>
                        </div>
                        <button onClick={() => { setProofFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                          className="text-[#475569] hover:text-red-400 transition-colors"><X size={14} /></button>
                      </div>
                    ) : (
                      <button onClick={() => fileInputRef.current?.click()}
                        className="w-full flex flex-col items-center justify-center gap-2 border-2 border-dashed border-[#2a3a55] hover:border-[#3b82f6] text-[#475569] hover:text-[#94a3b8] py-8 rounded-xl transition-colors">
                        <Upload size={24} />
                        <span className="text-sm font-medium">Upload proof of payment</span>
                        <span className="text-xs">PDF or JPG, max 8 MB</span>
                      </button>
                    )}
                  </div>

                  <button onClick={handleBankTransferSubmit} disabled={isProcessing || !proofFile}
                    className="w-full bg-[#3b82f6] hover:bg-blue-500 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-60">
                    {isProcessing ? "Submitting…" : <><Banknote size={16} /> Submit Payment Proof</>}
                  </button>
                  <p className="text-xs text-center text-[#475569]">Your subscription will be activated within 24 hours after verification.</p>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Past proofs */}
      {myProofs.length > 0 && !showPayment && (
        <div className="mt-6">
          <h2 className="text-base font-semibold text-white mb-3">Bank Transfer History</h2>
          <div className="space-y-2">
            {myProofs.map(p => (
              <div key={p.id} className="bg-[#1a2332] border border-[#2a3a55] rounded-lg px-4 py-3 flex items-center justify-between text-sm">
                <div>
                  <span className="text-white font-medium">{p.planName}</span>
                  <span className="text-[#475569] ml-2">({p.billingCycle})</span>
                  <span className="text-[#94a3b8] ml-3">${p.amount.toFixed(2)}</span>
                  {p.referenceNumber && <span className="text-[#475569] ml-3 font-mono text-xs">{p.referenceNumber}</span>}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[#475569] text-xs">{new Date(p.createdAt).toLocaleDateString()}</span>
                  {p.status === "pending" && <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs px-2 py-0.5 rounded-full flex items-center gap-1"><Clock size={9} /> Pending</span>}
                  {p.status === "approved" && <span className="bg-green-500/10 text-green-400 border border-green-500/20 text-xs px-2 py-0.5 rounded-full flex items-center gap-1"><Check size={9} /> Approved</span>}
                  {p.status === "rejected" && <span className="bg-red-500/10 text-red-400 border border-red-500/20 text-xs px-2 py-0.5 rounded-full flex items-center gap-1"><X size={9} /> Rejected{p.reviewNotes ? ` — ${p.reviewNotes}` : ""}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Billing history (invoices & receipts) */}
      {invoices.length > 0 && !showPayment && (
        <div className="mt-6">
          <h2 className="text-base font-semibold text-white mb-3 flex items-center gap-2">
            <Receipt size={16} className="text-[#3b82f6]" /> Billing History
          </h2>
          <div className="space-y-2">
            {invoices.map(inv => (
              <div key={inv.id} className="bg-[#1a2332] border border-[#2a3a55] rounded-lg px-4 py-3 flex items-center justify-between gap-3 flex-wrap text-sm">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white font-medium">{inv.planName}</span>
                    <span className="text-[#475569] capitalize">({inv.billingCycle})</span>
                    <span className="text-[#94a3b8]">{inv.currency} {inv.amount.toFixed(2)}</span>
                  </div>
                  <div className="text-[#475569] text-xs mt-0.5 flex items-center gap-2 flex-wrap">
                    <span className="font-mono">{inv.invoiceNumber}</span>
                    <span>· {new Date(inv.paidAt).toLocaleDateString()}</span>
                    {inv.paymentMethodLabel && <span>· {inv.paymentMethodLabel}</span>}
                    {inv.emailStatus === "sent" && <span className="text-green-500/80">· Emailed</span>}
                    {inv.emailStatus === "failed" && <span className="text-red-400/80">· Email failed</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleOpenPdf(inv.id, "invoice")}
                    disabled={pdfBusy === `${inv.id}:invoice`}
                    className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border border-[#2a3a55] text-[#94a3b8] hover:text-white hover:border-[#3b82f6] transition-colors disabled:opacity-50"
                  ><FileText size={12} /> Invoice</button>
                  <button
                    onClick={() => handleOpenPdf(inv.id, "receipt")}
                    disabled={pdfBusy === `${inv.id}:receipt`}
                    className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border border-[#2a3a55] text-[#94a3b8] hover:text-white hover:border-[#3b82f6] transition-colors disabled:opacity-50"
                  ><Download size={12} /> Receipt</button>
                  <button
                    onClick={() => handleResend(inv.id)}
                    disabled={resendingId === inv.id}
                    className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border border-[#2a3a55] text-[#94a3b8] hover:text-white hover:border-[#3b82f6] transition-colors disabled:opacity-50"
                  >{resendingId === inv.id ? <RefreshCw size={12} className="animate-spin" /> : <Send size={12} />} Re-send</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-center text-xs text-[#2a3a55] mt-8">Powered by MicroBooks</p>
    </div>
  );
}
