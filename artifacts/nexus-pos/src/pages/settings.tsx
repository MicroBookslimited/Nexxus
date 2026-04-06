import { useState, useEffect } from "react";
import { useGetSettings, useUpdateSettings } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  Settings, Mail, Building2, Receipt, CheckCircle2, AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

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
  const [businessName, setBusinessName] = useState("");
  const [businessAddress, setBusinessAddress] = useState("");
  const [businessPhone, setBusinessPhone] = useState("");
  const [taxRate, setTaxRate] = useState("");
  const [receiptFooter, setReceiptFooter] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setEmailProvider((settings.email_provider as "resend" | "zeptomail") ?? "resend");
    setBusinessName(settings.business_name ?? "Nexus POS");
    setBusinessAddress(settings.business_address ?? "");
    setBusinessPhone(settings.business_phone ?? "");
    setTaxRate(settings.tax_rate ?? "0.08");
    setReceiptFooter(settings.receipt_footer ?? "Thank you for your business!");
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
          business_name: businessName,
          business_address: businessAddress,
          business_phone: businessPhone,
          tax_rate: taxRate,
          receipt_footer: receiptFooter,
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
                placeholder="Nexus POS"
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
                  max="1"
                  step="0.001"
                  value={taxRate}
                  onChange={(e) => { setTaxRate(e.target.value); markDirty(); }}
                  className="w-28"
                />
                <span className="text-sm text-muted-foreground">
                  = {(parseFloat(taxRate || "0") * 100).toFixed(1)}%
                </span>
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
        </CardContent>
      </Card>

      <div className="flex justify-end pt-2">
        <Button
          onClick={handleSave}
          disabled={!dirty || updateSettings.isPending}
          className="min-w-[120px]"
        >
          {updateSettings.isPending ? "Saving…" : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}
