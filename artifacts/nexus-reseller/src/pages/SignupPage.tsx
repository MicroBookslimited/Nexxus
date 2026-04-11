import { useState } from "react";
import { useLocation, Link } from "wouter";
import { signup, setToken } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Zap, Loader2 } from "lucide-react";

export default function SignupPage() {
  const [, navigate] = useLocation();
  const { setReseller } = useAuth();
  const [form, setForm] = useState({ name: "", email: "", password: "", companyName: "", phone: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function update(k: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await signup({
        name: form.name,
        email: form.email,
        password: form.password,
        companyName: form.companyName || undefined,
        phone: form.phone || undefined,
      });
      setToken(res.token);
      setReseller(res.reseller);
      navigate("/dashboard");
    } catch (err: any) {
      setError(err.message || "Signup failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary/20 ring-1 ring-primary/30">
              <Zap className="w-6 h-6 text-primary" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-foreground">Become a Reseller</h1>
          <p className="text-muted-foreground mt-1 text-sm">Earn 30% recurring commission on every referral</p>
        </div>

        <div className="bg-card border border-border rounded-xl p-8 shadow-lg">
          {error && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-destructive/10 text-destructive text-sm border border-destructive/20">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Full Name *</label>
              <input
                type="text" required value={form.name} onChange={update("name")}
                className="w-full px-3 py-2.5 rounded-lg bg-input border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="John Smith"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Email *</label>
              <input
                type="email" required value={form.email} onChange={update("email")}
                className="w-full px-3 py-2.5 rounded-lg bg-input border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Password *</label>
              <input
                type="password" required value={form.password} onChange={update("password")}
                className="w-full px-3 py-2.5 rounded-lg bg-input border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Min 8 characters"
                minLength={8}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Company Name</label>
              <input
                type="text" value={form.companyName} onChange={update("companyName")}
                className="w-full px-3 py-2.5 rounded-lg bg-input border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Optional"
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
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 disabled:opacity-60 transition-colors mt-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {loading ? "Creating account…" : "Create Reseller Account"}
            </button>
          </form>
          <p className="mt-5 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="text-primary hover:underline font-medium">Sign in</Link>
          </p>
        </div>
        <p className="text-center text-xs text-muted-foreground mt-6">Powered by MicroBooks</p>
      </div>
    </div>
  );
}
