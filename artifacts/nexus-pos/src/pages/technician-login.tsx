import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { ArrowRight, AlertCircle, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { technicianLogin, technicianMe, TECHNICIAN_TOKEN_KEY } from "@/lib/saas-api";
import { clearQueryCache } from "@/lib/query-persister";

export function TechnicianLogin() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem(TECHNICIAN_TOKEN_KEY);
    if (!token) return;
    technicianMe()
      .then(() => setLocation("/technician"))
      .catch(() => localStorage.removeItem(TECHNICIAN_TOKEN_KEY));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      clearQueryCache();
      const { token } = await technicianLogin(email, password);
      localStorage.setItem(TECHNICIAN_TOKEN_KEY, token);
      setLocation("/technician");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Invalid email or password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-screen w-full flex-col bg-background text-foreground relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/20 via-background to-background pointer-events-none" />
      <main className="flex-1 flex items-center justify-center p-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="w-full max-w-[400px]"
        >
          <div className="flex flex-col items-center text-center mb-6">
            <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-3">
              <Wrench className="h-7 w-7 text-primary" />
            </div>
            <h1 className="text-2xl font-bold">Technician Sign-in</h1>
            <p className="mt-1 text-sm text-muted-foreground">Access your assigned NEXXUS POS customers.</p>
          </div>

          <Card className="border-border/50 bg-card/50 backdrop-blur-xl shadow-2xl">
            <CardContent className="p-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="t-login-email">Email</Label>
                  <Input id="t-login-email" type="email" required value={email} onChange={e => setEmail(e.target.value)} className="bg-background/50" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="t-login-pw">Password</Label>
                  <Input id="t-login-pw" type="password" required value={password} onChange={e => setPassword(e.target.value)} className="bg-background/50" />
                </div>

                {error && (
                  <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {error}
                  </div>
                )}

                <Button type="submit" className="w-full mt-4 h-11" disabled={loading}>
                  {loading ? "Signing in…" : (<>Sign In<ArrowRight className="ml-2 h-4 w-4" /></>)}
                </Button>
              </form>

              <p className="text-center text-sm text-muted-foreground mt-4">
                Need an account?{" "}
                <button type="button" onClick={() => setLocation("/technician/register")} className="text-primary hover:text-primary/80 font-medium transition-colors">
                  Register as a technician
                </button>
              </p>
              <p className="text-center text-xs text-muted-foreground mt-2">
                <button type="button" onClick={() => setLocation("/login")} className="hover:text-foreground transition-colors">
                  Back to business login
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
