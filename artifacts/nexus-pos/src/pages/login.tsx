import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, AlertCircle, Mail, CheckCircle, X } from "lucide-react";
import logoUrl from "@assets/EB8B578F-2602-4DD8-AB97-D02AF59C49D3_1775943434994.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { saasLogin, saasMe, saasForgotPassword, TENANT_TOKEN_KEY } from "@/lib/saas-api";
import { clearQueryCache } from "@/lib/query-persister";

/* ─── Forgot Password Modal ─── */
function ForgotPasswordModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await saasForgotPassword(email);
      setSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Mail className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold text-sm">Forgot Password</h2>
              <p className="text-xs text-muted-foreground">We'll send a reset link</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {sent ? (
          <div className="text-center py-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500/20 mx-auto mb-3">
              <CheckCircle className="h-6 w-6 text-green-500" />
            </div>
            <h3 className="font-semibold mb-1">Check your email</h3>
            <p className="text-sm text-muted-foreground mb-4">
              If <strong>{email}</strong> is registered, you'll receive a password reset link shortly.
            </p>
            <Button variant="outline" className="w-full" onClick={onClose}>Close</Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-sm text-muted-foreground">Enter your account email address and we'll send you a link to reset your password.</p>
            <div className="space-y-1.5">
              <Label htmlFor="reset-email">Email Address</Label>
              <Input
                id="reset-email"
                type="email"
                placeholder="you@yourbusiness.com"
                required
                value={email}
                onChange={e => { setEmail(e.target.value); setError(""); }}
                className="bg-background/50"
                autoFocus
              />
            </div>
            {error && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}
            <div className="flex gap-3">
              <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
              <Button type="submit" className="flex-1" disabled={loading || !email}>
                {loading ? "Sending…" : "Send Reset Link"}
              </Button>
            </div>
          </form>
        )}
      </motion.div>
    </div>
  );
}

/* ─── Splash Screen ─── */
function SplashScreen() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center"
      style={{ background: "#0f1729" }}
    >
      <motion.div
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="flex flex-col items-center gap-6"
      >
        <img
          src="/splash-logo.png"
          alt="NEXXUS POS"
          className="w-40 h-40 drop-shadow-2xl"
        />
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-4xl font-extrabold tracking-widest text-white uppercase">
            NEXXUS <span style={{ color: "#3b82f6" }}>POS</span>
          </h1>
          <p className="text-base font-semibold text-white/90 mt-1">
            Your Business. <span style={{ color: "#22d3ee" }}>Connected.</span>
          </p>
          <p className="text-xs tracking-[0.2em] text-white/40 mt-2 uppercase">
            Smarter Operations. Stronger Business.
          </p>
        </div>

        {/* Progress bar */}
        <div className="flex flex-col items-center gap-2 mt-2">
          <div className="relative w-56 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
            <motion.div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ background: "linear-gradient(90deg, #3b82f6, #22d3ee)" }}
              initial={{ width: "0%" }}
              animate={{ width: "100%" }}
              transition={{ duration: 4.6, ease: "linear", delay: 0.3 }}
            />
            {/* Shimmer overlay */}
            <motion.div
              className="absolute inset-y-0 w-16 rounded-full"
              style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent)" }}
              animate={{ x: ["-64px", "224px"] }}
              transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
            />
          </div>
          <p className="text-[10px] tracking-widest text-white/25 uppercase">Loading…</p>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ─── Login Page ─── */
export function Login() {
  const [, setLocation] = useLocation();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showForgot, setShowForgot] = useState(false);
  const [showSplash, setShowSplash] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem(TENANT_TOKEN_KEY);
    if (!token) return;
    saasMe()
      .then(() => {
        setLocation("/dashboard");
      })
      .catch(() => {
        localStorage.removeItem(TENANT_TOKEN_KEY);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      clearQueryCache();
      const { token } = await saasLogin(email, password);
      localStorage.setItem(TENANT_TOKEN_KEY, token);
      setShowSplash(true);
      setTimeout(() => {
        setLocation("/dashboard");
      }, 5000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Invalid email or password");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-full flex-col bg-background text-foreground relative overflow-hidden">
      <AnimatePresence>
        {showSplash && <SplashScreen />}
      </AnimatePresence>

      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/20 via-background to-background pointer-events-none" />

      <AnimatePresence>
        {showForgot && <ForgotPasswordModal onClose={() => setShowForgot(false)} />}
      </AnimatePresence>

      <main className="flex-1 flex items-center justify-center p-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="w-full max-w-[400px]"
        >
          <div className="flex flex-col items-center text-center mb-8">
            <img src={logoUrl} alt="NEXXUS POS" className="h-16 w-auto mb-4 drop-shadow-lg" />
            <p className="mt-1 text-muted-foreground">Your Business, Connected.</p>
          </div>

          <Card className="border-border/50 bg-card/50 backdrop-blur-xl shadow-2xl">
            <CardContent className="p-6">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@yourbusiness.com"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="bg-background/50"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    <button
                      type="button"
                      onClick={() => setShowForgot(true)}
                      className="text-xs text-muted-foreground hover:text-primary transition-colors font-medium"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="bg-background/50"
                  />
                </div>

                {error && (
                  <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {error}
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full mt-4 h-11"
                  disabled={isLoading}
                >
                  {isLoading ? "Signing in…" : (
                    <>
                      Sign In
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              </form>

              <p className="text-center text-sm text-muted-foreground mt-4">
                Don't have an account?{" "}
                <button
                  type="button"
                  onClick={() => setLocation("/signup")}
                  className="text-primary hover:text-primary/80 font-medium transition-colors"
                >
                  Start free trial
                </button>
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </main>

      <footer className="shrink-0 py-4 text-center text-xs text-muted-foreground relative z-10">
        Powered by MicroBooks
      </footer>
    </div>
  );
}
