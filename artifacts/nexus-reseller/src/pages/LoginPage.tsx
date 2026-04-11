import { useState } from "react";
import { useLocation, Link } from "wouter";
import { login, setToken } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Zap, Loader2 } from "lucide-react";

export default function LoginPage() {
  const [, navigate] = useLocation();
  const { setReseller } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await login({ email, password });
      setToken(res.token);
      setReseller(res.reseller);
      navigate("/dashboard");
    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary/20 ring-1 ring-primary/30">
              <Zap className="w-6 h-6 text-primary" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-foreground">NEXXUS Reseller Portal</h1>
          <p className="text-muted-foreground mt-1 text-sm">Sign in to your reseller account</p>
        </div>

        <div className="bg-card border border-border rounded-xl p-8 shadow-lg">
          {error && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-destructive/10 text-destructive text-sm border border-destructive/20">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-input border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-input border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="••••••••"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 disabled:opacity-60 transition-colors"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>
          <p className="mt-5 text-center text-sm text-muted-foreground">
            Don't have an account?{" "}
            <Link href="/signup" className="text-primary hover:underline font-medium">
              Sign up as reseller
            </Link>
          </p>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Powered by MicroBooks
        </p>
      </div>
    </div>
  );
}
