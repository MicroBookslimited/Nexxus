import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Store, ArrowRight, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { saasLogin, TENANT_TOKEN_KEY } from "@/lib/saas-api";

export function Login() {
  const [, setLocation] = useLocation();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    const token = localStorage.getItem(TENANT_TOKEN_KEY);
    if (token) setLocation("/dashboard");
  }, [setLocation]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      const { token } = await saasLogin(email, password);
      localStorage.setItem(TENANT_TOKEN_KEY, token);
      setLocation("/dashboard");
    } catch (err: any) {
      setError(err.message ?? "Invalid email or password");
    } finally {
      setIsLoading(false);
    }
  };

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
          <div className="flex flex-col items-center text-center mb-8">
            <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
              <Store className="h-8 w-8" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Nexus POS</h1>
            <p className="mt-2 text-muted-foreground">Your Business, Connected.</p>
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
                  <Label htmlFor="password">Password</Label>
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
