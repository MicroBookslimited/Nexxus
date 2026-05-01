import { useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { ArrowRight, AlertCircle, CheckCircle, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { technicianRegister } from "@/lib/saas-api";

export function TechnicianRegister() {
  const [, setLocation] = useLocation();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) { setError("Password must be at least 8 characters"); return; }
    if (password !== confirm) { setError("Passwords do not match"); return; }
    setLoading(true);
    try {
      await technicianRegister({ name, email, password, phone: phone || undefined });
      setDone(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-screen w-full flex-col bg-background text-foreground relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/20 via-background to-background pointer-events-none" />
      <main className="flex-1 flex items-center justify-center p-6 relative z-10 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="w-full max-w-[420px]"
        >
          <div className="flex flex-col items-center text-center mb-6">
            <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-3">
              <Wrench className="h-7 w-7 text-primary" />
            </div>
            <h1 className="text-2xl font-bold">Technician Sign-up</h1>
            <p className="mt-1 text-sm text-muted-foreground">Register as an installer/technician for NEXXUS POS customers.</p>
          </div>

          <Card className="border-border/50 bg-card/50 backdrop-blur-xl shadow-2xl">
            <CardContent className="p-6">
              {done ? (
                <div className="text-center py-2">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500/20 mx-auto mb-3">
                    <CheckCircle className="h-6 w-6 text-green-500" />
                  </div>
                  <h3 className="font-semibold mb-1">Registration submitted</h3>
                  <p className="text-sm text-muted-foreground mb-5">
                    Your account is pending approval by NEXXUS POS staff. You'll be able to sign in once you've been approved and assigned to a customer.
                  </p>
                  <Button className="w-full" onClick={() => setLocation("/technician/login")}>
                    Go to sign in
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="t-name">Full name</Label>
                    <Input id="t-name" required value={name} onChange={e => setName(e.target.value)} className="bg-background/50" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="t-email">Email</Label>
                    <Input id="t-email" type="email" required value={email} onChange={e => setEmail(e.target.value)} className="bg-background/50" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="t-phone">Phone (optional)</Label>
                    <Input id="t-phone" value={phone} onChange={e => setPhone(e.target.value)} className="bg-background/50" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="t-pw">Password</Label>
                    <Input id="t-pw" type="password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)} className="bg-background/50" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="t-pw2">Confirm password</Label>
                    <Input id="t-pw2" type="password" required minLength={8} value={confirm} onChange={e => setConfirm(e.target.value)} className="bg-background/50" />
                  </div>

                  {error && (
                    <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      {error}
                    </div>
                  )}

                  <Button type="submit" className="w-full mt-2 h-11" disabled={loading}>
                    {loading ? "Creating account…" : (<>Create account<ArrowRight className="ml-2 h-4 w-4" /></>)}
                  </Button>
                </form>
              )}

              <p className="text-center text-sm text-muted-foreground mt-4">
                Already registered?{" "}
                <button type="button" onClick={() => setLocation("/technician/login")} className="text-primary hover:text-primary/80 font-medium transition-colors">
                  Sign in
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
