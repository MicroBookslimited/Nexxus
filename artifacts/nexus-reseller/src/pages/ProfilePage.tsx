import { useEffect, useState } from "react";
import { updateMe, ResellerProfile } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Save } from "lucide-react";

export default function ProfilePage() {
  const { reseller, setReseller } = useAuth();
  const [form, setForm] = useState({ name: "", companyName: "", phone: "", paymentDetails: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (reseller) {
      setForm({
        name: reseller.name ?? "",
        companyName: reseller.companyName ?? "",
        phone: reseller.phone ?? "",
        paymentDetails: reseller.paymentDetails ?? "",
      });
    }
  }, [reseller]);

  function update(k: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSaving(true);
    try {
      const updated = await updateMe({
        name: form.name,
        companyName: form.companyName || null,
        phone: form.phone || null,
        paymentDetails: form.paymentDetails || null,
      } as Partial<ResellerProfile>);
      setReseller(updated);
      setSuccess("Profile updated successfully");
    } catch (err: any) {
      setError(err.message || "Update failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Profile</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Manage your reseller account details</p>
      </div>

      {/* Read-only info */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Account Info</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Email</span>
            <p className="font-medium text-foreground mt-0.5">{reseller?.email}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Referral Code</span>
            <p className="font-mono font-bold text-primary mt-0.5 tracking-wider">{reseller?.referralCode}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Commission Rate</span>
            <p className="font-medium text-foreground mt-0.5">{Math.round((reseller?.commissionRate ?? 0.3) * 100)}% recurring</p>
          </div>
          <div>
            <span className="text-muted-foreground">Account Status</span>
            <p className="font-medium text-foreground capitalize mt-0.5">{reseller?.status}</p>
          </div>
        </div>
      </div>

      {/* Editable form */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="text-sm font-semibold text-foreground mb-4">Edit Details</h2>
        {error && <div className="mb-4 text-sm text-destructive px-4 py-3 rounded-lg bg-destructive/10 border border-destructive/20">{error}</div>}
        {success && <div className="mb-4 text-sm text-emerald-400 px-4 py-3 rounded-lg bg-emerald-400/10 border border-emerald-400/20">{success}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Full Name *</label>
            <input
              type="text" required value={form.name} onChange={update("name")}
              className="w-full px-3 py-2.5 rounded-lg bg-input border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Company Name</label>
            <input
              type="text" value={form.companyName} onChange={update("companyName")}
              className="w-full px-3 py-2.5 rounded-lg bg-input border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Phone</label>
            <input
              type="tel" value={form.phone} onChange={update("phone")}
              className="w-full px-3 py-2.5 rounded-lg bg-input border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="+1 876 555 0100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Payment Details
              <span className="text-muted-foreground font-normal ml-1 text-xs">(bank info, PayPal, etc.)</span>
            </label>
            <textarea
              value={form.paymentDetails}
              onChange={update("paymentDetails")}
              rows={3}
              className="w-full px-3 py-2.5 rounded-lg bg-input border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              placeholder="e.g., NCB account 1234567, or PayPal: you@example.com"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-60 transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </form>
      </div>
    </div>
  );
}
