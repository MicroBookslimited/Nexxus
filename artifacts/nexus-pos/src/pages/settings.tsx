import { useState, useEffect } from "react";
import { useGetSettings, useUpdateSettings, getGetSettingsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  Settings, Mail, Building2, Receipt, CheckCircle2, AlertCircle, DollarSign, Bell, Send,
  ShieldCheck, Plus, Trash2, ChevronDown, ChevronRight, Edit2, Check, X, QrCode, Copy, Download, ExternalLink,
  Boxes,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getRoles, createRole, updateRole, deleteRole, type RoleRow, type PermissionDef, TENANT_TOKEN_KEY } from "@/lib/saas-api";
import { QRCodeSVG } from "qrcode.react";


export function AdminSettings() {
  const { data: settings, isLoading } = useGetSettings();
  const updateSettings = useUpdateSettings();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [emailProvider, setEmailProvider] = useState<"system" | "smtp">("system");
  const [fromName, setFromName] = useState("NEXXUS POS");
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [smtpFrom, setSmtpFrom] = useState("");
  const [smtpFromName, setSmtpFromName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [businessAddress, setBusinessAddress] = useState("");
  const [businessLogoUrl, setBusinessLogoUrl] = useState("");
  const [logoUploading, setLogoUploading] = useState(false);
  const [businessPhone, setBusinessPhone] = useState("");
  const [taxRate, setTaxRate] = useState("");
  const [taxMode, setTaxMode] = useState<"exclusive" | "inclusive">("exclusive");
  const [receiptFooter, setReceiptFooter] = useState("");
  const [receiptSize, setReceiptSize] = useState<"58mm" | "80mm">("80mm");
  const [receiptTemplate, setReceiptTemplate] = useState<"classic" | "modern" | "minimal" | "bold">("classic");
  const [baseCurrency, setBaseCurrency] = useState("JMD");
  const [secondaryCurrency, setSecondaryCurrency] = useState("");
  const [currencyRate, setCurrencyRate] = useState("");
  const [digestEnabled, setDigestEnabled] = useState(false);
  const [digestEmail, setDigestEmail] = useState("");
  const [digestHour, setDigestHour] = useState("7");
  const [lowStockThreshold, setLowStockThreshold] = useState("5");
  const [allowOverselling, setAllowOverselling] = useState(false);
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
    const raw = settings.email_provider ?? "system";
    setEmailProvider(raw === "smtp" ? "smtp" : "system");
    setFromName(settings.from_name ?? "NEXXUS POS");
    setSmtpHost(settings.smtp_host ?? "");
    setSmtpPort(settings.smtp_port ?? "587");
    setSmtpSecure(settings.smtp_secure === "true");
    setSmtpUser(settings.smtp_user ?? "");
    setSmtpPass(settings.smtp_pass ?? "");
    setSmtpFrom(settings.smtp_from ?? "");
    setSmtpFromName(settings.smtp_from_name ?? "");
    setBusinessName(settings.business_name ?? "NEXXUS POS");
    setBusinessAddress(settings.business_address ?? "");
    setBusinessLogoUrl(settings.business_logo_url ?? "");
    setBusinessPhone(settings.business_phone ?? "");
    setTaxRate(settings.tax_rate ?? "15");
    setTaxMode((settings.tax_mode as "exclusive" | "inclusive") ?? "exclusive");
    setReceiptFooter(settings.receipt_footer ?? "Thank you for your business!");
    setReceiptSize((settings.receipt_size as "58mm" | "80mm") ?? "80mm");
    setReceiptTemplate((settings.receipt_template as "classic" | "modern" | "minimal" | "bold") ?? "classic");
    setBaseCurrency(settings.base_currency ?? "JMD");
    setSecondaryCurrency(settings.secondary_currency ?? "");
    setCurrencyRate(settings.currency_rate ?? "");
    setDigestEnabled(settings.daily_digest_enabled === "true");
    setDigestEmail(settings.daily_digest_email ?? "");
    setDigestHour(settings.daily_digest_hour ?? "7");
    setLowStockThreshold(settings.low_stock_threshold ?? "5");
    setAllowOverselling(settings.allow_overselling === "true");
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
          from_name: fromName.trim() || "NEXXUS POS",
          smtp_host: smtpHost.trim(),
          smtp_port: smtpPort.trim() || "587",
          smtp_secure: smtpSecure ? "true" : "false",
          smtp_user: smtpUser.trim(),
          smtp_pass: smtpPass,
          smtp_from: smtpFrom.trim(),
          smtp_from_name: smtpFromName.trim(),
          business_name: businessName,
          business_address: businessAddress,
          business_phone: businessPhone,
          business_logo_url: businessLogoUrl,
          tax_rate: taxRate,
          tax_mode: taxMode,
          receipt_footer: receiptFooter,
          receipt_size: receiptSize,
          receipt_template: receiptTemplate,
          base_currency: baseCurrency.toUpperCase().trim() || "JMD",
          secondary_currency: secondaryCurrency.toUpperCase().trim(),
          currency_rate: currencyRate,
          daily_digest_enabled: digestEnabled ? "true" : "false",
          daily_digest_email: digestEmail.trim(),
          daily_digest_hour: digestHour,
          low_stock_threshold: lowStockThreshold,
          allow_overselling: allowOverselling ? "true" : "false",
        },
      },
      {
        onSuccess: (updatedSettings) => {
          toast({ title: "Settings saved", description: "Your changes have been applied." });
          setDirty(false);
          // Immediately push the server's response into the query cache so every
          // page using useGetSettings (POS, dashboard, etc.) sees the new values
          // without waiting for a background refetch.
          queryClient.setQueryData(getGetSettingsQueryKey(), updatedSettings);
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Loading settings…
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-5 sm:py-8 space-y-6 sm:space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2">
            <Settings className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            Admin Settings
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Configure your POS system preferences</p>
        </div>
        <Button
          onClick={handleSave}
          disabled={!dirty || updateSettings.isPending}
          className="min-w-[100px] self-start sm:self-auto"
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

          {/* Business Logo */}
          <div className="space-y-2">
            <Label>Business Logo</Label>
            <p className="text-xs text-muted-foreground">Shown on receipts and the PIN entry screen. Max 1 MB. PNG, JPG, SVG.</p>
            <div className="flex items-start gap-4 flex-wrap">
              {/* Preview */}
              <div className="h-24 w-40 rounded-lg border border-border bg-secondary/30 flex items-center justify-center overflow-hidden shrink-0">
                {businessLogoUrl ? (
                  <img src={businessLogoUrl} alt="Business logo" className="max-h-full max-w-full object-contain p-2" />
                ) : (
                  <span className="text-xs text-muted-foreground">No logo</span>
                )}
              </div>
              <div className="flex flex-col gap-2 flex-1 min-w-40">
                <label
                  htmlFor="logo-upload"
                  className={cn(
                    "inline-flex items-center gap-2 cursor-pointer rounded-md border border-border px-3 py-2 text-sm font-medium transition-colors",
                    "hover:bg-secondary/60 bg-secondary/30 w-fit",
                    logoUploading && "opacity-50 pointer-events-none"
                  )}
                >
                  <Download className="h-4 w-4" />
                  {logoUploading ? "Processing…" : "Upload Logo"}
                </label>
                <input
                  id="logo-upload"
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/gif,image/webp"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 1_500_000) {
                      toast({ title: "Image too large", description: "Please use an image under 1.5 MB.", variant: "destructive" });
                      return;
                    }
                    setLogoUploading(true);
                    const reader = new FileReader();
                    reader.onload = () => {
                      setBusinessLogoUrl(reader.result as string);
                      markDirty();
                      setLogoUploading(false);
                    };
                    reader.onerror = () => {
                      toast({ title: "Failed to read image", variant: "destructive" });
                      setLogoUploading(false);
                    };
                    reader.readAsDataURL(file);
                  }}
                />
                {businessLogoUrl && (
                  <button
                    type="button"
                    onClick={() => { setBusinessLogoUrl(""); markDirty(); }}
                    className="inline-flex items-center gap-1.5 text-xs text-destructive hover:text-destructive/80 transition-colors w-fit"
                  >
                    <Trash2 className="h-3 w-3" />
                    Remove Logo
                  </button>
                )}
              </div>
            </div>
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
          <CardDescription>Customize size, layout, and content of your printed receipts</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">

          {/* Tax Rate */}
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

          {/* Tax Mode */}
          <div className="space-y-2">
            <Label>Tax Mode</Label>
            <div className="flex gap-3">
              {([
                { value: "exclusive", label: "Tax Exclusive", desc: "Tax added on top of item price" },
                { value: "inclusive", label: "Tax Inclusive", desc: "Tax already included in item price" },
              ] as const).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { setTaxMode(opt.value); markDirty(); }}
                  className={cn(
                    "flex-1 rounded-lg border p-3 text-left transition-all",
                    taxMode === opt.value
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border hover:border-muted-foreground/50",
                  )}
                >
                  <p className="text-sm font-medium">{opt.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Receipt Paper Size */}
          <div className="space-y-2">
            <Label>Receipt Paper Size</Label>
            <div className="flex gap-3">
              {([
                { value: "58mm", label: "58 mm", desc: "Narrow thermal" },
                { value: "80mm", label: "80 mm", desc: "Standard thermal" },
              ] as const).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { setReceiptSize(opt.value); markDirty(); }}
                  className={cn(
                    "flex-1 rounded-lg border p-3 text-left transition-all",
                    receiptSize === opt.value
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border hover:border-muted-foreground/50 bg-card"
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    {/* Paper icon */}
                    <div className={cn(
                      "flex-shrink-0 border-2 rounded-sm bg-white flex items-center justify-center",
                      opt.value === "58mm" ? "w-6 h-8" : "w-8 h-8",
                      receiptSize === opt.value ? "border-primary" : "border-border"
                    )}>
                      <div className="space-y-0.5 w-full px-0.5">
                        <div className="h-px bg-muted-foreground/30 rounded" />
                        <div className="h-px bg-muted-foreground/30 rounded" />
                        <div className="h-px bg-muted-foreground/20 rounded w-3/4" />
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{opt.label}</p>
                      <p className="text-[11px] text-muted-foreground">{opt.desc}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Receipt Template */}
          <div className="space-y-2">
            <Label>Receipt Template</Label>
            <p className="text-xs text-muted-foreground -mt-1">The last 3 digits of the order number are always printed large at the bottom of the receipt — easy for staff to call out orders.</p>
            <div className="grid grid-cols-2 gap-3">
              {([
                {
                  id: "classic",
                  name: "Classic",
                  desc: "Centered header, dashed dividers",
                  preview: (
                    <div className="font-mono text-[7px] leading-tight text-center py-1 space-y-px">
                      <div className="font-black text-[8px]">BUSINESS NAME</div>
                      <div className="text-muted-foreground">Order #: 1042 · Sale</div>
                      <div className="border-t border-dashed border-muted-foreground/40 my-0.5" />
                      <div className="flex justify-between"><span>1× Item</span><span>$6.00</span></div>
                      <div className="border-t border-dashed border-muted-foreground/40 my-0.5" />
                      <div className="flex justify-between text-muted-foreground"><span>Total:</span><span>$6.00</span></div>
                      <div className="border-t border-dashed border-muted-foreground/40 my-0.5" />
                      <div className="text-muted-foreground text-[6px]">Thank you!</div>
                      <div className="text-muted-foreground text-[5px]">Powered by NEXXUS POS</div>
                      <div className="border-t border-dashed border-muted-foreground/40 my-0.5" />
                      <div className="font-black text-[16px] leading-none tracking-widest">042</div>
                    </div>
                  ),
                },
                {
                  id: "modern",
                  name: "Modern",
                  desc: "Bold underlined header, inverted number",
                  preview: (
                    <div className="font-mono text-[7px] leading-tight text-center py-1 space-y-px">
                      <div className="font-black text-[8px] tracking-wider border-b-2 border-foreground pb-0.5">BUSINESS NAME</div>
                      <div className="text-muted-foreground">Order #: 1042</div>
                      <div className="border-t-2 border-foreground my-0.5" />
                      <div className="flex justify-between"><span>1× Item</span><span>$6.00</span></div>
                      <div className="border-t-2 border-foreground my-0.5" />
                      <div className="flex justify-between text-muted-foreground"><span>Total:</span><span>$6.00</span></div>
                      <div className="border-t-2 border-foreground my-0.5" />
                      <div className="text-muted-foreground text-[6px]">Thank you!</div>
                      <div className="text-muted-foreground text-[5px]">Powered by NEXXUS POS</div>
                      <div className="border-t-2 border-foreground my-0.5" />
                      <div className="bg-foreground text-background font-black text-[16px] leading-none tracking-widest py-1">042</div>
                    </div>
                  ),
                },
                {
                  id: "minimal",
                  name: "Minimal",
                  desc: "Left-aligned, hairline dividers",
                  preview: (
                    <div className="font-mono text-[7px] leading-tight py-1 space-y-px">
                      <div className="font-bold text-[8px]">Business Name</div>
                      <div className="text-muted-foreground">Order #: 1042</div>
                      <div className="border-t border-muted-foreground/30 my-0.5" />
                      <div className="flex justify-between"><span>1× Item</span><span>$6.00</span></div>
                      <div className="border-t border-muted-foreground/30 my-0.5" />
                      <div className="flex justify-between text-muted-foreground"><span>Total:</span><span>$6.00</span></div>
                      <div className="border-t border-muted-foreground/30 my-0.5" />
                      <div className="text-muted-foreground text-[6px]">Thank you!</div>
                      <div className="text-muted-foreground text-[5px]">Powered by NEXXUS POS</div>
                      <div className="border-t border-muted-foreground/40 my-0.5" />
                      <div className="font-black text-[16px] leading-none tracking-wider">042</div>
                    </div>
                  ),
                },
                {
                  id: "bold",
                  name: "Bold",
                  desc: "All-caps, extra-large number — great for busy counters",
                  preview: (
                    <div className="font-mono text-[7px] leading-tight text-center py-1 space-y-px">
                      <div className="font-black text-[9px] tracking-widest">BUSINESS NAME</div>
                      <div className="text-muted-foreground text-[6px]">ORDER #: 1042 · SALE</div>
                      <div className="border-t border-dashed border-muted-foreground/40 my-0.5" />
                      <div className="flex justify-between"><span>1× Item</span><span>$6.00</span></div>
                      <div className="border-t border-dashed border-muted-foreground/40 my-0.5" />
                      <div className="flex justify-between text-muted-foreground"><span>Total:</span><span>$6.00</span></div>
                      <div className="border-t border-dashed border-muted-foreground/40 my-0.5" />
                      <div className="text-muted-foreground text-[6px]">Thank you!</div>
                      <div className="text-muted-foreground text-[5px]">Powered by NEXXUS POS</div>
                      <div className="border-t border-dashed border-muted-foreground/40 my-0.5" />
                      <div className="text-[5px] tracking-widest text-muted-foreground">YOUR ORDER</div>
                      <div className="font-black text-[18px] leading-none tracking-widest">042</div>
                    </div>
                  ),
                },
              ]).map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => { setReceiptTemplate(tpl.id as typeof receiptTemplate); markDirty(); }}
                  className={cn(
                    "rounded-lg border p-3 text-left transition-all",
                    receiptTemplate === tpl.id
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border hover:border-muted-foreground/50 bg-card"
                  )}
                >
                  {/* Mini receipt preview */}
                  <div className={cn(
                    "rounded border mb-2 bg-white text-foreground px-2",
                    receiptTemplate === tpl.id ? "border-primary/40" : "border-border"
                  )}>
                    {tpl.preview}
                  </div>
                  <p className="text-xs font-semibold">{tpl.name}</p>
                  <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{tpl.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Receipt Footer */}
          <div className="space-y-1.5">
            <Label htmlFor="receipt-footer">Receipt Footer Message</Label>
            <Input
              id="receipt-footer"
              value={receiptFooter}
              onChange={(e) => { setReceiptFooter(e.target.value); markDirty(); }}
              placeholder="Thank you for your business!"
            />
            <p className="text-xs text-muted-foreground">Appears at the bottom of every printed receipt</p>
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
            Email Settings
          </CardTitle>
          <CardDescription>
            Choose how receipts, end-of-day reports, and notifications are sent
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* System email option */}
          <button
            type="button"
            onClick={() => { setEmailProvider("system"); markDirty(); }}
            className={cn(
              "w-full text-left rounded-lg border p-4 transition-all",
              emailProvider === "system"
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : "border-border hover:border-muted-foreground/50 bg-card"
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-sm">NEXXUS POS System Email</span>
                  {emailProvider === "system" && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary text-primary-foreground uppercase tracking-wide">
                      Active
                    </span>
                  )}
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/15 text-green-500 font-semibold uppercase tracking-wide">
                    Recommended
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Emails sent via NEXXUS POS infrastructure from <code className="bg-muted px-1 rounded">noreply@microbookspos.com</code>. No configuration required.
                </p>
              </div>
              <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
            </div>
          </button>

          {/* Custom SMTP option */}
          <button
            type="button"
            onClick={() => { setEmailProvider("smtp"); markDirty(); }}
            className={cn(
              "w-full text-left rounded-lg border p-4 transition-all",
              emailProvider === "smtp"
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : "border-border hover:border-muted-foreground/50 bg-card"
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-sm">Custom SMTP</span>
                  {emailProvider === "smtp" && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary text-primary-foreground uppercase tracking-wide">
                      Active
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Use your own email server (Gmail, SendGrid, Mailgun, etc.) for complete branding control.
                </p>
              </div>
              {smtpHost ? (
                <span className="flex items-center gap-1 text-xs text-green-500 font-medium shrink-0">
                  <CheckCircle2 className="h-3.5 w-3.5" />Configured
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs text-muted-foreground font-medium shrink-0">
                  <AlertCircle className="h-3.5 w-3.5" />Not set
                </span>
              )}
            </div>
          </button>

          {/* Display name (shown for both modes) */}
          <div className="space-y-1.5 pt-1">
            <Label htmlFor="from-name">Display Name</Label>
            <Input
              id="from-name"
              value={fromName}
              onChange={(e) => { setFromName(e.target.value); markDirty(); }}
              placeholder="NEXXUS POS"
            />
            <p className="text-xs text-muted-foreground">The sender name your customers see in their inbox</p>
          </div>

          {/* SMTP fields — only shown when smtp is selected */}
          {emailProvider === "smtp" && (
            <div className="space-y-3 rounded-lg border border-border p-4 bg-muted/20 mt-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">SMTP Configuration</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="smtp-host">SMTP Host</Label>
                  <Input id="smtp-host" value={smtpHost} onChange={(e) => { setSmtpHost(e.target.value); markDirty(); }} placeholder="smtp.gmail.com" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="smtp-port">Port</Label>
                  <Input id="smtp-port" value={smtpPort} onChange={(e) => { setSmtpPort(e.target.value); markDirty(); }} placeholder="587" />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  role="switch"
                  aria-checked={smtpSecure}
                  onClick={() => { setSmtpSecure(!smtpSecure); markDirty(); }}
                  className={cn("relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors", smtpSecure ? "bg-primary" : "bg-muted")}
                >
                  <span className={cn("pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform", smtpSecure ? "translate-x-4" : "translate-x-0")} />
                </button>
                <span className="text-sm">Use SSL/TLS (port 465)</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="smtp-user">Username / Email</Label>
                  <Input id="smtp-user" value={smtpUser} onChange={(e) => { setSmtpUser(e.target.value); markDirty(); }} placeholder="you@yourdomain.com" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="smtp-pass">Password / App Password</Label>
                  <Input id="smtp-pass" type="password" value={smtpPass} onChange={(e) => { setSmtpPass(e.target.value); markDirty(); }} placeholder="••••••••" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="smtp-from">From Email Address</Label>
                  <Input id="smtp-from" type="email" value={smtpFrom} onChange={(e) => { setSmtpFrom(e.target.value); markDirty(); }} placeholder="hello@yourdomain.com" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="smtp-from-name">From Name (override)</Label>
                  <Input id="smtp-from-name" value={smtpFromName} onChange={(e) => { setSmtpFromName(e.target.value); markDirty(); }} placeholder={fromName || "NEXXUS POS"} />
                </div>
              </div>
              {!smtpHost && (
                <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 text-xs text-amber-600 dark:text-amber-400">
                  <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>Enter your SMTP host above to enable custom email sending. Emails will fall through to the system provider until SMTP is configured.</span>
                </div>
              )}
            </div>
          )}
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

      {/* Inventory */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Boxes className="h-4 w-4 text-primary" />
            Inventory
          </CardTitle>
          <CardDescription>
            Control how your POS handles stock levels and out-of-stock products
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-border p-4">
            <div>
              <p className="text-sm font-medium">Allow Overselling</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                When enabled, stock is allowed to go negative and out-of-stock items remain selectable on the POS
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={allowOverselling}
              onClick={() => { setAllowOverselling(!allowOverselling); markDirty(); }}
              className={cn(
                "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                allowOverselling ? "bg-primary" : "bg-muted-foreground/30"
              )}
            >
              <span className={cn(
                "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg transform transition-transform",
                allowOverselling ? "translate-x-5" : "translate-x-0"
              )} />
            </button>
          </div>
          {allowOverselling && (
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-700 dark:text-amber-400 space-y-1">
              <p className="font-medium">Overselling is active</p>
              <ul className="space-y-0.5 ml-2">
                <li>• Products can be sold even when stock reaches zero</li>
                <li>• Stock counts will go negative — review regularly to reorder in time</li>
                <li>• Out-of-stock items will still show an "Out of stock" badge but remain tappable</li>
              </ul>
            </div>
          )}
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
