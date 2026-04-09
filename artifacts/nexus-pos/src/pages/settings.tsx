import { useState, useEffect } from "react";
import { useGetSettings, useUpdateSettings } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  Settings, Mail, Building2, Receipt, CheckCircle2, AlertCircle, DollarSign, Bell, Send,
  ShieldCheck, Plus, Trash2, ChevronDown, ChevronRight, Edit2, Check, X, QrCode, Copy, Download, ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getRoles, createRole, updateRole, deleteRole, type RoleRow, type PermissionDef, TENANT_TOKEN_KEY } from "@/lib/saas-api";
import { QRCodeSVG } from "qrcode.react";

function ProviderCard({
  id,
  title,
  description,
  configured,
  selected,
  onSelect,
}: {
  id: string;
  title: string;
  description: string;
  configured: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full text-left rounded-lg border p-4 transition-all",
        selected
          ? "border-primary bg-primary/5 ring-1 ring-primary"
          : "border-border hover:border-muted-foreground/50 bg-card"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-sm">{title}</span>
            {selected && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary text-primary-foreground uppercase tracking-wide">
                Active
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {configured ? (
            <span className="flex items-center gap-1 text-xs text-green-500 font-medium">
              <CheckCircle2 className="h-3.5 w-3.5" />API key set
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-amber-500 font-medium">
              <AlertCircle className="h-3.5 w-3.5" />Not configured
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

export function AdminSettings() {
  const { data: settings, isLoading } = useGetSettings();
  const updateSettings = useUpdateSettings();
  const { toast } = useToast();

  const [emailProvider, setEmailProvider] = useState<"resend" | "zeptomail">("resend");
  const [fromEmail, setFromEmail] = useState("onboarding@resend.dev");
  const [fromName, setFromName] = useState("NEXXUS POS");
  const [businessName, setBusinessName] = useState("");
  const [businessAddress, setBusinessAddress] = useState("");
  const [businessPhone, setBusinessPhone] = useState("");
  const [taxRate, setTaxRate] = useState("");
  const [receiptFooter, setReceiptFooter] = useState("");
  const [baseCurrency, setBaseCurrency] = useState("JMD");
  const [secondaryCurrency, setSecondaryCurrency] = useState("");
  const [currencyRate, setCurrencyRate] = useState("");
  const [digestEnabled, setDigestEnabled] = useState(false);
  const [digestEmail, setDigestEmail] = useState("");
  const [digestHour, setDigestHour] = useState("7");
  const [lowStockThreshold, setLowStockThreshold] = useState("5");
  const [sendingTest, setSendingTest] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [tenantSlug, setTenantSlug] = useState<string>("");

  useEffect(() => {
    const token = localStorage.getItem(TENANT_TOKEN_KEY);
    if (!token) return;
    fetch("/api/saas/me", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.tenant?.slug) setTenantSlug(data.tenant.slug); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!settings) return;
    setEmailProvider((settings.email_provider as "resend" | "zeptomail") ?? "resend");
    setFromEmail(settings.from_email ?? "onboarding@resend.dev");
    setFromName(settings.from_name ?? "NEXXUS POS");
    setBusinessName(settings.business_name ?? "NEXXUS POS");
    setBusinessAddress(settings.business_address ?? "");
    setBusinessPhone(settings.business_phone ?? "");
    setTaxRate(settings.tax_rate ?? "15");
    setReceiptFooter(settings.receipt_footer ?? "Thank you for your business!");
    setBaseCurrency(settings.base_currency ?? "JMD");
    setSecondaryCurrency(settings.secondary_currency ?? "");
    setCurrencyRate(settings.currency_rate ?? "");
    setDigestEnabled(settings.daily_digest_enabled === "true");
    setDigestEmail(settings.daily_digest_email ?? "");
    setDigestHour(settings.daily_digest_hour ?? "7");
    setLowStockThreshold(settings.low_stock_threshold ?? "5");
    setDirty(false);
  }, [settings]);

  function markDirty() {
    setDirty(true);
  }

  async function handleSave() {
    updateSettings.mutate(
      {
        data: {
          email_provider: emailProvider,
          from_email: fromEmail.trim(),
          from_name: fromName.trim() || "NEXXUS POS",
          business_name: businessName,
          business_address: businessAddress,
          business_phone: businessPhone,
          tax_rate: taxRate,
          receipt_footer: receiptFooter,
          base_currency: baseCurrency.toUpperCase().trim() || "JMD",
          secondary_currency: secondaryCurrency.toUpperCase().trim(),
          currency_rate: currencyRate,
          daily_digest_enabled: digestEnabled ? "true" : "false",
          daily_digest_email: digestEmail.trim(),
          daily_digest_hour: digestHour,
          low_stock_threshold: lowStockThreshold,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Settings saved", description: "Your changes have been applied." });
          setDirty(false);
        },
        onError: () => toast({ title: "Save failed", description: "Could not save settings.", variant: "destructive" }),
      }
    );
  }

  async function handleSendTestDigest() {
    setSendingTest(true);
    try {
      const res = await fetch("/api/email/daily-digest", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      toast({ title: "Test digest sent!", description: `Email delivered to ${digestEmail}` });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to send digest";
      toast({ title: "Send failed", description: msg, variant: "destructive" });
    } finally {
      setSendingTest(false);
    }
  }

  const resendConfigured = !!import.meta.env.VITE_RESEND_CONFIGURED || true;
  const zeptomailConfigured = false;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Loading settings…
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Settings className="h-6 w-6 text-primary" />
            Admin Settings
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Configure your POS system preferences</p>
        </div>
        <Button
          onClick={handleSave}
          disabled={!dirty || updateSettings.isPending}
          className="min-w-[100px]"
        >
          {updateSettings.isPending ? "Saving…" : "Save Changes"}
        </Button>
      </div>

      {/* Business Info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            Business Information
          </CardTitle>
          <CardDescription>Appears on printed and emailed receipts</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="biz-name">Business Name</Label>
              <Input
                id="biz-name"
                value={businessName}
                onChange={(e) => { setBusinessName(e.target.value); markDirty(); }}
                placeholder="NEXXUS POS"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="biz-phone">Phone Number</Label>
              <Input
                id="biz-phone"
                value={businessPhone}
                onChange={(e) => { setBusinessPhone(e.target.value); markDirty(); }}
                placeholder="+1 (555) 000-0000"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="biz-address">Address</Label>
            <Input
              id="biz-address"
              value={businessAddress}
              onChange={(e) => { setBusinessAddress(e.target.value); markDirty(); }}
              placeholder="123 Main Street, City, State 00000"
            />
          </div>
        </CardContent>
      </Card>

      {/* Receipt Settings */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Receipt className="h-4 w-4 text-primary" />
            Receipt Settings
          </CardTitle>
          <CardDescription>Customize how receipts look</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="tax-rate">Default Tax Rate</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="tax-rate"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={taxRate}
                  onChange={(e) => { setTaxRate(e.target.value); markDirty(); }}
                  className="w-28"
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="receipt-footer">Receipt Footer Message</Label>
            <Input
              id="receipt-footer"
              value={receiptFooter}
              onChange={(e) => { setReceiptFooter(e.target.value); markDirty(); }}
              placeholder="Thank you for your business!"
            />
          </div>
        </CardContent>
      </Card>

      {/* Currency Settings */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-primary" />
            Currency Settings
          </CardTitle>
          <CardDescription>Set your base currency and an optional secondary display currency</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="base-currency">Base Currency</Label>
              <Input
                id="base-currency"
                value={baseCurrency}
                onChange={(e) => { setBaseCurrency(e.target.value.toUpperCase().slice(0, 3)); markDirty(); }}
                placeholder="JMD"
                maxLength={3}
                className="font-mono uppercase"
              />
              <p className="text-xs text-muted-foreground">Default: JMD (Jamaican Dollar)</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="secondary-currency">Secondary Currency <span className="text-muted-foreground">(optional)</span></Label>
              <Input
                id="secondary-currency"
                value={secondaryCurrency}
                onChange={(e) => { setSecondaryCurrency(e.target.value.toUpperCase().slice(0, 3)); markDirty(); }}
                placeholder="USD"
                maxLength={3}
                className="font-mono uppercase"
              />
              <p className="text-xs text-muted-foreground">Shown as a converted total on receipts</p>
            </div>
          </div>
          {secondaryCurrency && (
            <div className="space-y-1.5">
              <Label htmlFor="currency-rate">Exchange Rate</Label>
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground shrink-0">1 {baseCurrency || "JMD"} =</span>
                <Input
                  id="currency-rate"
                  type="number"
                  min="0"
                  step="0.0001"
                  value={currencyRate}
                  onChange={(e) => { setCurrencyRate(e.target.value); markDirty(); }}
                  placeholder="0.0065"
                  className="w-36 font-mono"
                />
                <span className="text-sm text-muted-foreground shrink-0">{secondaryCurrency}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                e.g., if 1 JMD = 0.0065 USD, enter 0.0065. Auto-conversion will show on POS checkout and receipts.
              </p>
            </div>
          )}
          {!secondaryCurrency && (
            <div className="rounded-lg bg-muted/30 border border-border p-3 text-xs text-muted-foreground">
              Add a secondary currency above to show auto-converted totals on checkout screens and printed receipts.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Email Provider */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" />
            Email Provider
          </CardTitle>
          <CardDescription>
            Choose which service sends your receipts and end-of-day reports
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ProviderCard
            id="resend"
            title="Resend"
            description="Modern email API. Fast delivery, excellent deliverability. Great for transactional emails."
            configured={resendConfigured}
            selected={emailProvider === "resend"}
            onSelect={() => { setEmailProvider("resend"); markDirty(); }}
          />
          <ProviderCard
            id="zeptomail"
            title="ZeptoMail"
            description="Transactional email service by Zoho. Reliable for high-volume business email sending."
            configured={zeptomailConfigured}
            selected={emailProvider === "zeptomail"}
            onSelect={() => { setEmailProvider("zeptomail"); markDirty(); }}
          />

          <div className="rounded-lg bg-muted/40 border border-border p-3 text-xs text-muted-foreground space-y-1 mt-2">
            <p className="font-medium text-foreground">API Key Status</p>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
              <span><strong>Resend:</strong> API key is configured and ready</span>
            </div>
            <div className="flex items-center gap-2">
              <AlertCircle className="h-3 w-3 text-amber-500 shrink-0" />
              <span><strong>ZeptoMail:</strong> Set <code className="bg-muted px-1 rounded">ZEPTOMAIL_TOKEN</code> in Secrets to enable</span>
            </div>
          </div>

          {/* Sender address */}
          <div className="space-y-3 pt-1">
            <div>
              <p className="text-sm font-medium mb-0.5">Sender Details</p>
              <p className="text-xs text-muted-foreground">
                The name and address your customers see when they receive emails.
                Use <code className="bg-muted px-1 rounded text-[11px]">onboarding@resend.dev</code> for testing,
                or set a verified domain address for production.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="from-name">From Name</Label>
                <Input
                  id="from-name"
                  value={fromName}
                  onChange={(e) => { setFromName(e.target.value); markDirty(); }}
                  placeholder="NEXXUS POS"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="from-email">From Email</Label>
                <Input
                  id="from-email"
                  type="email"
                  value={fromEmail}
                  onChange={(e) => { setFromEmail(e.target.value); markDirty(); }}
                  placeholder="onboarding@resend.dev"
                />
              </div>
            </div>
            {fromEmail && !fromEmail.endsWith("@resend.dev") && (
              <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 text-xs text-amber-600 dark:text-amber-400">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>
                  Custom domains must be verified in your Resend dashboard before emails will deliver.
                  If emails aren't sending, switch to <strong>onboarding@resend.dev</strong> for testing.
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Daily Digest */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            Daily Email Digest
          </CardTitle>
          <CardDescription>
            Automatically receive a morning summary with yesterday's sales, your top-selling products, and any stock alerts
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Enable / Disable toggle */}
          <div className="flex items-center justify-between rounded-lg border border-border p-4">
            <div>
              <p className="text-sm font-medium">Enable daily digest</p>
              <p className="text-xs text-muted-foreground mt-0.5">Sends an email every morning at your chosen time</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={digestEnabled}
              onClick={() => { setDigestEnabled(!digestEnabled); markDirty(); }}
              className={cn(
                "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                digestEnabled ? "bg-primary" : "bg-muted-foreground/30"
              )}
            >
              <span className={cn(
                "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg transform transition-transform",
                digestEnabled ? "translate-x-5" : "translate-x-0"
              )} />
            </button>
          </div>

          {digestEnabled && (
            <div className="space-y-4 rounded-lg border border-border/60 bg-muted/20 p-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="digest-email">Recipient Email</Label>
                  <Input
                    id="digest-email"
                    type="email"
                    value={digestEmail}
                    onChange={(e) => { setDigestEmail(e.target.value); markDirty(); }}
                    placeholder="owner@example.com"
                  />
                  <p className="text-xs text-muted-foreground">Where the digest will be sent</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="digest-hour">Delivery Time</Label>
                  <select
                    id="digest-hour"
                    value={digestHour}
                    onChange={(e) => { setDigestHour(e.target.value); markDirty(); }}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    {Array.from({ length: 24 }, (_, h) => {
                      const label = h === 0 ? "12:00 AM" : h < 12 ? `${h}:00 AM` : h === 12 ? "12:00 PM" : `${h - 12}:00 PM`;
                      return <option key={h} value={String(h)}>{label}</option>;
                    })}
                  </select>
                  <p className="text-xs text-muted-foreground">Server local time</p>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="low-stock-threshold">Low Stock Alert Threshold</Label>
                <div className="flex items-center gap-3">
                  <Input
                    id="low-stock-threshold"
                    type="number"
                    min="1"
                    max="100"
                    value={lowStockThreshold}
                    onChange={(e) => { setLowStockThreshold(e.target.value); markDirty(); }}
                    className="w-24"
                  />
                  <span className="text-sm text-muted-foreground">units or fewer = flagged as low stock</span>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleSendTestDigest}
                  disabled={sendingTest || !digestEmail}
                  className="gap-2"
                >
                  <Send className="h-3.5 w-3.5" />
                  {sendingTest ? "Sending…" : "Send Test Email Now"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  {digestEmail ? `Sends immediately to ${digestEmail}` : "Enter a recipient email first"}
                </p>
              </div>
            </div>
          )}

          <div className="rounded-lg bg-muted/30 border border-border p-3 text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">What's included in the digest</p>
            <ul className="space-y-0.5 ml-2">
              <li>• Yesterday's revenue, order count, average order value, and tax collected</li>
              <li>• Top 10 best-selling products from the last 7 days</li>
              <li>• Items that are out of stock or running low</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* QR Code / Online Menu */}
      {tenantSlug && <QRCodeSection slug={tenantSlug} />}

      <div className="flex justify-end pt-2">
        <Button
          onClick={handleSave}
          disabled={!dirty || updateSettings.isPending}
          className="min-w-[120px]"
        >
          {updateSettings.isPending ? "Saving…" : "Save Changes"}
        </Button>
      </div>

      <RolesSettings />
    </div>
  );
}

/* ─── QR Code Section ─── */
function QRCodeSection({ slug }: { slug: string }) {
  const { toast } = useToast();
  const base = window.location.origin;
  const menuBase = `${base}/menu/?slug=${slug}`;
  const menuUrl = menuBase;
  const kioskUrl = `${menuBase}&mode=kiosk`;
  const onlineUrl = `${menuBase}&mode=online`;
  const [active, setActive] = useState<"menu" | "kiosk" | "online">("menu");
  const qrUrl = active === "menu" ? menuUrl : active === "kiosk" ? kioskUrl : onlineUrl;

  const copy = (url: string) => {
    navigator.clipboard.writeText(url).then(() => toast({ title: "Copied!", description: "Link copied to clipboard." }));
  };

  const download = () => {
    const svg = document.getElementById("qr-svg-export");
    if (!svg) return;
    const blob = new Blob([svg.outerHTML], { type: "image/svg+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `qr-${active}-${slug}.svg`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const links = [
    { key: "menu" as const, label: "Menu", url: menuUrl, desc: "Customer-facing browseable menu" },
    { key: "kiosk" as const, label: "Kiosk", url: kioskUrl, desc: "Self-service kiosk mode" },
    { key: "online" as const, label: "Online Order", url: onlineUrl, desc: "Online ordering for pickup/delivery" },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <QrCode className="h-4 w-4 text-primary" />
          QR Code &amp; Online Menu
        </CardTitle>
        <CardDescription>Share your menu or set up a kiosk / online ordering page</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col sm:flex-row gap-6">
          <div className="flex flex-col items-center gap-3">
            <div className="p-3 bg-white rounded-xl border border-border shadow-sm">
              <QRCodeSVG id="qr-svg-export" value={qrUrl} size={160} level="M" />
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={download} className="gap-1.5">
                <Download className="h-3.5 w-3.5" /> Download SVG
              </Button>
            </div>
          </div>

          <div className="flex-1 space-y-3">
            <p className="text-sm font-medium text-muted-foreground mb-1">Choose URL type:</p>
            {links.map(link => (
              <div
                key={link.key}
                className={cn(
                  "rounded-lg border p-3 cursor-pointer transition-all",
                  active === link.key
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-border hover:border-muted-foreground/50 bg-card"
                )}
                onClick={() => setActive(link.key)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{link.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{link.desc}</p>
                    <p className="text-xs font-mono text-muted-foreground mt-1 break-all">{link.url}</p>
                  </div>
                  <div className="flex gap-1.5 shrink-0 mt-0.5">
                    <button
                      onClick={e => { e.stopPropagation(); copy(link.url); }}
                      className="p-1.5 rounded border border-border hover:border-primary hover:bg-primary/5 transition-colors"
                      title="Copy link"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="p-1.5 rounded border border-border hover:border-primary hover:bg-primary/5 transition-colors"
                      title="Open in new tab"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Roles & Permissions ─── */
const ROLE_COLORS = ["#3b82f6","#ef4444","#a855f7","#f59e0b","#10b981","#f97316","#06b6d4","#ec4899","#64748b"];

function PermissionMatrix({
  permissions,
  selected,
  onChange,
}: {
  permissions: PermissionDef[];
  selected: string[];
  onChange: (keys: string[]) => void;
}) {
  const categories = Array.from(new Set(permissions.map(p => p.category)));

  const toggle = (key: string) => {
    onChange(selected.includes(key) ? selected.filter(k => k !== key) : [...selected, key]);
  };

  const toggleCategory = (cat: string) => {
    const catKeys = permissions.filter(p => p.category === cat).map(p => p.key);
    const allOn = catKeys.every(k => selected.includes(k));
    if (allOn) onChange(selected.filter(k => !catKeys.includes(k)));
    else onChange([...new Set([...selected, ...catKeys])]);
  };

  return (
    <div className="space-y-3">
      {categories.map(cat => {
        const catPerms = permissions.filter(p => p.category === cat);
        const allOn = catPerms.every(p => selected.includes(p.key));
        const someOn = catPerms.some(p => selected.includes(p.key));
        return (
          <div key={cat} className="rounded-lg border border-border/60 overflow-hidden">
            <button
              type="button"
              onClick={() => toggleCategory(cat)}
              className="w-full flex items-center justify-between px-3 py-2 bg-muted/30 hover:bg-muted/50 transition-colors"
            >
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{cat}</span>
              <div className={cn(
                "h-4 w-4 rounded border flex items-center justify-center text-white transition-colors",
                allOn ? "bg-primary border-primary" : someOn ? "bg-primary/50 border-primary/50" : "border-border bg-transparent"
              )}>
                {(allOn || someOn) && <Check className="h-2.5 w-2.5" />}
              </div>
            </button>
            <div className="grid grid-cols-2 gap-0 divide-y divide-border/30">
              {catPerms.map(p => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => toggle(p.key)}
                  className="flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/20 transition-colors"
                >
                  <div className={cn(
                    "h-4 w-4 rounded border flex items-center justify-center text-white shrink-0 transition-colors",
                    selected.includes(p.key) ? "bg-primary border-primary" : "border-border"
                  )}>
                    {selected.includes(p.key) && <Check className="h-2.5 w-2.5" />}
                  </div>
                  <span className="text-xs text-foreground">{p.label}</span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RoleCard({
  role,
  permissions,
  onUpdated,
  onDeleted,
}: {
  role: RoleRow;
  permissions: PermissionDef[];
  onUpdated: (r: RoleRow) => void;
  onDeleted: (id: number) => void;
}) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(role.name);
  const [editColor, setEditColor] = useState(role.color);
  const [editPerms, setEditPerms] = useState<string[]>(role.permissions);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await updateRole(role.id, { name: editName, color: editColor, permissions: editPerms });
      onUpdated(updated);
      setEditing(false);
      toast({ title: "Role updated" });
    } catch (e: unknown) {
      toast({ title: "Failed to update role", description: e instanceof Error ? e.message : "Error", variant: "destructive" });
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete role "${role.name}"? Staff assigned to this role will need to be updated.`)) return;
    try {
      await deleteRole(role.id);
      onDeleted(role.id);
      toast({ title: "Role deleted" });
    } catch (e: unknown) {
      toast({ title: "Cannot delete role", description: e instanceof Error ? e.message : "Error", variant: "destructive" });
    }
  };

  const grantedCount = role.permissions.length;
  const totalCount = permissions.length;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: role.color }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">{role.name}</span>
            {role.isSystem && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary uppercase tracking-wide">System</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{grantedCount} of {totalCount} permissions</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => { setEditing(!editing); setExpanded(true); setEditName(role.name); setEditColor(role.color); setEditPerms(role.permissions); }}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Edit role"
          >
            <Edit2 className="h-3.5 w-3.5" />
          </button>
          {!role.isSystem && (
            <button
              onClick={handleDelete}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              title="Delete role"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border px-4 py-4">
          {editing ? (
            <>
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 space-y-1.5">
                  <Label>Role Name</Label>
                  <Input value={editName} onChange={e => setEditName(e.target.value)} className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label>Color</Label>
                  <div className="flex gap-1.5 flex-wrap">
                    {ROLE_COLORS.map(c => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setEditColor(c)}
                        className="w-6 h-6 rounded-full transition-transform hover:scale-110"
                        style={{ backgroundColor: c, outline: editColor === c ? `2px solid white` : "none", outlineOffset: "2px" }}
                      />
                    ))}
                  </div>
                </div>
              </div>
              <PermissionMatrix permissions={permissions} selected={editPerms} onChange={setEditPerms} />
              <div className="flex gap-2 mt-4">
                <Button size="sm" variant="outline" onClick={() => setEditing(false)} className="gap-1.5">
                  <X className="h-3.5 w-3.5" /> Cancel
                </Button>
                <Button size="sm" onClick={handleSave} disabled={saving || !editName.trim()} className="gap-1.5">
                  <Check className="h-3.5 w-3.5" /> {saving ? "Saving…" : "Save Changes"}
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {permissions.map(p => (
                <span
                  key={p.key}
                  className={cn(
                    "text-xs px-2 py-0.5 rounded-full border",
                    role.permissions.includes(p.key)
                      ? "bg-primary/10 text-primary border-primary/20"
                      : "text-muted-foreground/40 border-border/30"
                  )}
                >
                  {p.label}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CreateRoleForm({ permissions, onCreated, onCancel }: { permissions: PermissionDef[]; onCreated: (r: RoleRow) => void; onCancel: () => void }) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [color, setColor] = useState(ROLE_COLORS[0]!);
  const [selectedPerms, setSelectedPerms] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const role = await createRole({ name: name.trim(), color, permissions: selectedPerms });
      onCreated(role);
      toast({ title: "Role created", description: `"${role.name}" has been added.` });
    } catch (e: unknown) {
      toast({ title: "Failed to create role", description: e instanceof Error ? e.message : "Error", variant: "destructive" });
    } finally { setSaving(false); }
  };

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-4">
      <h4 className="font-semibold text-sm">New Custom Role</h4>
      <div className="flex items-center gap-3">
        <div className="flex-1 space-y-1.5">
          <Label>Role Name</Label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g., Supervisor" className="h-8 text-sm" />
        </div>
        <div className="space-y-1.5">
          <Label>Color</Label>
          <div className="flex gap-1.5 flex-wrap">
            {ROLE_COLORS.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className="w-6 h-6 rounded-full transition-transform hover:scale-110"
                style={{ backgroundColor: c, outline: color === c ? `2px solid white` : "none", outlineOffset: "2px" }}
              />
            ))}
          </div>
        </div>
      </div>
      <div>
        <Label className="mb-2 block">Permissions</Label>
        <PermissionMatrix permissions={permissions} selected={selectedPerms} onChange={setSelectedPerms} />
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={onCancel} className="gap-1.5"><X className="h-3.5 w-3.5" /> Cancel</Button>
        <Button size="sm" onClick={handleCreate} disabled={saving || !name.trim()} className="gap-1.5">
          <Check className="h-3.5 w-3.5" /> {saving ? "Creating…" : "Create Role"}
        </Button>
      </div>
    </div>
  );
}

function RolesSettings() {
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [permissions, setPermissions] = useState<PermissionDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    getRoles().then(data => {
      setRoles(data.roles);
      setPermissions(data.permissions);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-start gap-3">
            <ShieldCheck className="h-5 w-5 text-primary mt-0.5" />
            <div>
              <CardTitle>Staff Roles & Permissions</CardTitle>
              <CardDescription>Define what each role can access. System roles can be edited but not deleted.</CardDescription>
            </div>
          </div>
          {!showCreate && (
            <Button size="sm" variant="outline" onClick={() => setShowCreate(true)} className="gap-1.5 shrink-0">
              <Plus className="h-3.5 w-3.5" /> Add Role
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-6">Loading roles…</p>
        ) : (
          <>
            {roles.map(role => (
              <RoleCard
                key={role.id}
                role={role}
                permissions={permissions}
                onUpdated={updated => setRoles(prev => prev.map(r => r.id === updated.id ? updated : r))}
                onDeleted={id => setRoles(prev => prev.filter(r => r.id !== id))}
              />
            ))}
            {showCreate && (
              <CreateRoleForm
                permissions={permissions}
                onCreated={role => { setRoles(prev => [...prev, role]); setShowCreate(false); }}
                onCancel={() => setShowCreate(false)}
              />
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
