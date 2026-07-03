import { useState, useEffect, useCallback, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { TENANT_TOKEN_KEY } from "@/lib/saas-api";
import { loadScript } from "@paypal/paypal-js";
import { Wallet, CreditCard, Loader2, CheckCircle2, Zap } from "lucide-react";

const JMD = (v: number) => new Intl.NumberFormat("en-JM", { style: "currency", currency: "JMD", minimumFractionDigits: 2 }).format(v);
const USD = (v: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);

function authHeader() {
  return { Authorization: `Bearer ${localStorage.getItem(TENANT_TOKEN_KEY) ?? ""}` };
}

async function api<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(path, { ...opts, headers: { ...authHeader(), "Content-Type": "application/json", ...(opts.headers ?? {}) } });
  const body = await res.json() as T & { error?: string };
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  return body;
}

function formatCardNumber(v: string) {
  return v.replace(/\D/g, "").slice(0, 19).replace(/(\d{4})(?=\d)/g, "$1 ").trim();
}
function formatExpiry(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 4);
  return d.length <= 2 ? d : `${d.slice(0, 2)} / ${d.slice(2)}`;
}

const DECLINE_CODES: Record<string, string> = {
  "05": "Card declined by issuer.",
  "51": "Insufficient funds.",
  "54": "Card expired.",
  "57": "Transaction not permitted on this card.",
  "62": "Restricted card.",
  "75": "PIN tries exceeded.",
  "82": "Invalid CVV.",
  "91": "Issuer unavailable — try again.",
  "96": "System error — try again.",
};

type Method = "powertranz" | "paypal";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onFunded: (balance: number) => void;
}

export function FundWalletDialog({ open, onOpenChange, onFunded }: Props) {
  const [method, setMethod] = useState<Method>("powertranz");
  const [amount, setAmount] = useState("");
  const [rate, setRate] = useState(158);
  const [minJmd, setMinJmd] = useState(100);
  const [maxJmd, setMaxJmd] = useState(5_000_000);
  const [card, setCard] = useState({ number: "", expiry: "", cvv: "", name: "" });
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [paypalRendered, setPaypalRendered] = useState(false);
  const [threeDsData, setThreeDsData] = useState<{ spiToken: string; redirectData: string } | null>(null);
  const threeDsContainerRef = useRef<HTMLDivElement>(null);

  const jmd = parseFloat(amount) || 0;
  const usd = rate > 0 ? Math.round((jmd / rate) * 100) / 100 : 0;
  const amountValid = jmd >= minJmd && jmd <= maxJmd;

  // Reset on open + fetch FX rate
  useEffect(() => {
    if (!open) return;
    setError(""); setSuccess(""); setThreeDsData(null); setProcessing(false);
    setPaypalRendered(false); setCard({ number: "", expiry: "", cvv: "", name: "" });
    api<{ jmdPerUsd: number; minJmd: number; maxJmd: number }>("/api/billing/topup-wallet/fx")
      .then(r => { setRate(r.jmdPerUsd); setMinJmd(r.minJmd); setMaxJmd(r.maxJmd); })
      .catch(() => { /* keep defaults */ });
  }, [open]);

  const finishSuccess = useCallback((jmdCredited: number, balance: number, ref?: string) => {
    setSuccess(`Wallet funded with ${JMD(jmdCredited)}!${ref ? ` · ${ref}` : ""}`);
    onFunded(balance);
  }, [onFunded]);

  // PowerTranz 3DS postMessage listener
  const handle3dsMessage = useCallback(async (event: MessageEvent) => {
    if (event.data?.type !== "POWERTRANZ_3DS") return;
    const { status, message, rrn, fundJmd } = event.data;
    setThreeDsData(null);
    setProcessing(false);
    if (status === "approved") {
      const credited = typeof fundJmd === "number" ? fundJmd : jmd;
      // Balance not returned via 3DS; signal parent to reload authoritative wallet.
      setSuccess(`Wallet funded with ${JMD(credited)}!${rrn ? ` · RRN: ${rrn}` : ""}`);
      onFunded(-1);
    } else {
      setError(message || "Payment declined. Please try another card.");
    }
  }, [jmd, onFunded]);

  useEffect(() => {
    window.addEventListener("message", handle3dsMessage);
    return () => window.removeEventListener("message", handle3dsMessage);
  }, [handle3dsMessage]);

  // Render 3DS iframe + fallback poll
  useEffect(() => {
    if (!threeDsData || !threeDsContainerRef.current) return;
    const container = threeDsContainerRef.current;
    container.innerHTML = "";
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "width:100%;height:100%;border:none;background:#fff;";
    iframe.setAttribute("sandbox", "allow-scripts allow-forms allow-same-origin allow-top-navigation allow-popups");
    container.appendChild(iframe);
    const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
    if (doc) { doc.open(); doc.write(threeDsData.redirectData); doc.close(); }

    const pollTimer = setInterval(async () => {
      try {
        const s = await api<{ status: string; rrn?: string; message?: string; fundJmd?: number }>(
          `/api/billing/powertranz/3ds-status?spiToken=${encodeURIComponent(threeDsData.spiToken)}`);
        if (s.status === "approved") {
          clearInterval(pollTimer);
          window.dispatchEvent(new MessageEvent("message", { data: { type: "POWERTRANZ_3DS", status: "approved", rrn: s.rrn, fundJmd: s.fundJmd } }));
        } else if (s.status === "declined") {
          clearInterval(pollTimer);
          window.dispatchEvent(new MessageEvent("message", { data: { type: "POWERTRANZ_3DS", status: "declined", message: s.message || "Payment declined." } }));
        }
      } catch { /* ignore */ }
    }, 3000);
    return () => clearInterval(pollTimer);
  }, [threeDsData]);

  // PayPal buttons
  useEffect(() => {
    if (!open || method !== "paypal" || paypalRendered || success) return;
    if (!amountValid) return;
    const clientId = import.meta.env["VITE_PAYPAL_CLIENT_ID"] as string | undefined;
    if (!clientId) return;
    let cancelled = false;
    loadScript({ clientId, currency: "USD" }).then((paypal) => {
      if (cancelled || !paypal?.Buttons) return;
      const container = document.getElementById("topup-paypal-container");
      if (!container) return;
      container.innerHTML = "";
      paypal.Buttons({
        createOrder: async () => {
          const r = await api<{ orderId: string }>("/api/billing/topup-wallet/paypal/create-order", {
            method: "POST", body: JSON.stringify({ jmdAmount: Math.round(jmd) }),
          });
          return r.orderId;
        },
        onApprove: async (data) => {
          try {
            const r = await api<{ status: string; jmdCredited?: number; balance?: number }>(
              "/api/billing/topup-wallet/paypal/capture-order", {
                method: "POST", body: JSON.stringify({ orderId: data.orderID }),
              });
            if (r.status === "COMPLETED" && typeof r.balance === "number") {
              finishSuccess(r.jmdCredited ?? 0, r.balance, "PayPal");
            } else {
              setError("Payment was not completed. Please try again.");
            }
          } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to capture payment.");
          }
        },
        onError: () => setError("PayPal encountered an error. Please try again."),
      }).render("#topup-paypal-container").then(() => { if (!cancelled) setPaypalRendered(true); }).catch(() => {});
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [open, method, paypalRendered, amountValid, jmd, success, finishSuccess]);

  // Re-render PayPal buttons when the amount changes (order amount is baked into createOrder closure)
  useEffect(() => { setPaypalRendered(false); }, [amount, method]);

  async function handlePowerTranz() {
    const rawNumber = card.number.replace(/\s/g, "");
    if (!amountValid) { setError(`Enter an amount between ${JMD(minJmd)} and ${JMD(maxJmd)}.`); return; }
    if (!rawNumber || rawNumber.length < 13) { setError("Please enter a valid card number."); return; }
    if (!card.expiry || !/^\d{2}\s*\/\s*\d{2}$/.test(card.expiry)) { setError("Please enter expiry in MM / YY format."); return; }
    if (!card.cvv || card.cvv.length < 3) { setError("Please enter your CVV."); return; }
    if (!card.name.trim()) { setError("Please enter the cardholder name."); return; }
    setError(""); setProcessing(true);
    let needs3ds = false;
    try {
      const res = await api<{
        step: string; spiToken?: string; redirectData?: string;
        transactionId?: string; rrn?: string; jmdCredited?: number; balance?: number;
        responseCode?: string; responseMessage?: string;
      }>("/api/billing/topup-wallet/powertranz/initiate", {
        method: "POST",
        body: JSON.stringify({
          jmdAmount: Math.round(jmd),
          cardNumber: card.number, cardExpiry: card.expiry,
          cardCvv: card.cvv, cardholderName: card.name,
          returnUrl: window.location.href,
        }),
      });

      if (res.step === "3ds" && res.spiToken && res.redirectData) {
        needs3ds = true;
        setThreeDsData({ spiToken: res.spiToken, redirectData: res.redirectData });
        return;
      }
      if (res.step === "approved" && typeof res.balance === "number") {
        finishSuccess(res.jmdCredited ?? Math.round(jmd), res.balance, res.rrn ? `RRN: ${res.rrn}` : undefined);
        return;
      }
      const code = res.responseCode ?? "unknown";
      const gatewayMsg = res.responseMessage ? ` — ${res.responseMessage}` : "";
      setError(DECLINE_CODES[code] ?? `Payment declined (code: ${code}${gatewayMsg}).`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.startsWith("PowerTranz") ? msg : `Payment failed: ${msg}`);
    } finally {
      if (!needs3ds) setProcessing(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />Fund Wallet
          </DialogTitle>
        </DialogHeader>

        {success ? (
          <div className="py-6 text-center space-y-3">
            <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" />
            <p className="font-semibold">{success}</p>
            <Button className="w-full" onClick={() => onOpenChange(false)}>Done</Button>
          </div>
        ) : threeDsData ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Complete the verification from your bank to finish payment.</p>
            <div ref={threeDsContainerRef} className="w-full h-[420px] rounded-lg overflow-hidden border border-border" />
          </div>
        ) : (
          <div className="space-y-4">
            {error && <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">{error}</div>}

            <div className="space-y-2">
              <Label>Amount to add (JMD)</Label>
              <Input type="number" inputMode="decimal" placeholder="e.g. 10000" value={amount}
                onChange={e => setAmount(e.target.value)} />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Min {JMD(minJmd)}</span>
                {jmd > 0 && <span>You'll be charged <span className="text-foreground font-medium">≈ {USD(usd)}</span> (rate J${rate}/US$1)</span>}
              </div>
            </div>

            {/* Method tabs */}
            <div className="grid grid-cols-2 gap-2">
              {([
                { id: "powertranz" as Method, label: "Card", icon: <CreditCard size={14} /> },
                { id: "paypal" as Method, label: "PayPal", icon: null },
              ]).map(m => (
                <button key={m.id} onClick={() => { setMethod(m.id); setError(""); }}
                  className={cn("border rounded-lg py-2 text-sm font-medium flex items-center justify-center gap-1 transition-colors",
                    method === m.id ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/50")}>
                  {m.id === "paypal" ? <span><span className="text-blue-500 font-bold">Pay</span><span className="text-blue-300 font-bold">Pal</span></span> : <>{m.icon} {m.label}</>}
                </button>
              ))}
            </div>

            {method === "powertranz" && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Cardholder Name</Label>
                  <Input value={card.name} onChange={e => setCard(c => ({ ...c, name: e.target.value }))} placeholder="John Smith" />
                </div>
                <div className="space-y-1.5">
                  <Label>Card Number</Label>
                  <Input value={card.number} onChange={e => setCard(c => ({ ...c, number: formatCardNumber(e.target.value) }))}
                    className="font-mono tracking-widest" placeholder="4111 1111 1111 1111" maxLength={19} inputMode="numeric" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Expiry (MM / YY)</Label>
                    <Input value={card.expiry} onChange={e => setCard(c => ({ ...c, expiry: formatExpiry(e.target.value) }))}
                      className="font-mono" placeholder="12 / 31" maxLength={7} inputMode="numeric" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>CVV</Label>
                    <Input value={card.cvv} onChange={e => setCard(c => ({ ...c, cvv: e.target.value.replace(/\D/g, "").slice(0, 4) }))}
                      className="font-mono" placeholder="123" maxLength={4} type="password" inputMode="numeric" />
                  </div>
                </div>
                <Button onClick={handlePowerTranz} disabled={processing || !amountValid} className="w-full gap-2">
                  {processing ? <><Loader2 size={16} className="animate-spin" /> Processing…</> : <><Zap size={16} /> Pay {jmd > 0 ? USD(usd) : ""}</>}
                </Button>
                <p className="text-xs text-center text-muted-foreground">Secured by PowerTranz · 3D Secure enabled</p>
              </div>
            )}

            {method === "paypal" && (
              <div>
                {!import.meta.env["VITE_PAYPAL_CLIENT_ID"] ? (
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 text-amber-500 text-sm text-center">
                    PayPal is not yet configured.
                  </div>
                ) : !amountValid ? (
                  <div className="text-sm text-muted-foreground text-center py-4">Enter a valid amount to load PayPal.</div>
                ) : (
                  <div id="topup-paypal-container" className="min-h-[100px] flex items-center justify-center">
                    {!paypalRendered && <div className="text-muted-foreground text-sm">Loading PayPal…</div>}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
