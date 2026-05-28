import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ShieldCheck, Eye, EyeOff, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { TENANT_TOKEN_KEY } from "@/lib/saas-api";

function PasswordInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        type={show ? "text" : "password"}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="pr-10"
      />
      <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShow(s => !s)}>
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

export function AdminInvitePage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const token = new URLSearchParams(window.location.search).get("token") ?? "";

  const [validating, setValidating] = useState(true);
  const [inviteInfo, setInviteInfo] = useState<{ name: string; email: string; businessName: string } | null>(null);
  const [validateError, setValidateError] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) {
      setValidateError("Invalid invite link — no token found.");
      setValidating(false);
      return;
    }

    fetch(`/api/admin-users/validate-invite/${token}`)
      .then(async r => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "Invalid invite");
        return data;
      })
      .then(data => {
        setInviteInfo(data);
        setValidating(false);
      })
      .catch(err => {
        setValidateError(err.message ?? "This invite link is invalid or has expired.");
        setValidating(false);
      });
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) { toast({ variant: "destructive", title: "Password too short", description: "Password must be at least 8 characters." }); return; }
    if (password !== confirmPassword) { toast({ variant: "destructive", title: "Passwords don't match" }); return; }

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin-users/accept-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to accept invite");

      localStorage.setItem(TENANT_TOKEN_KEY, data.token);
      setDone(true);

      toast({ title: "Welcome!", description: `You're now logged in to ${data.tenant?.businessName ?? "NEXXUS POS"}.` });
      setTimeout(() => navigate("/dashboard"), 1500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      toast({ variant: "destructive", title: "Error", description: msg });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0f1729] flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-full bg-blue-500/10 border border-blue-500/20 mb-4">
            <ShieldCheck className="h-7 w-7 text-blue-400" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">NEXXUS POS</h1>
          <p className="text-sm text-slate-400 mt-1">Admin Invitation</p>
        </div>

        <Card className="border-slate-700 bg-slate-900/80">
          <CardHeader>
            {validating && (
              <>
                <CardTitle className="text-base flex items-center gap-2 text-white">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
                  Validating invite…
                </CardTitle>
              </>
            )}

            {!validating && validateError && (
              <>
                <div className="flex items-center gap-2 text-red-400 mb-1">
                  <AlertCircle className="h-5 w-5" />
                  <CardTitle className="text-base text-red-400">Invalid Invitation</CardTitle>
                </div>
                <CardDescription className="text-red-300/80">{validateError}</CardDescription>
              </>
            )}

            {!validating && inviteInfo && !done && (
              <>
                <CardTitle className="text-base text-white">Set Your Password</CardTitle>
                <CardDescription>
                  You've been invited to manage <strong className="text-slate-200">{inviteInfo.businessName}</strong> as an admin user.
                </CardDescription>
              </>
            )}

            {done && (
              <div className="flex items-center gap-2 text-green-400">
                <CheckCircle2 className="h-5 w-5" />
                <CardTitle className="text-base text-green-400">All set! Redirecting…</CardTitle>
              </div>
            )}
          </CardHeader>

          {!validating && inviteInfo && !done && (
            <CardContent>
              <div className="mb-4 rounded-lg bg-slate-800/60 border border-slate-700 p-3 text-sm space-y-1">
                <p className="text-slate-400 text-xs">Logging in as</p>
                <p className="font-semibold text-white">{inviteInfo.name}</p>
                <p className="text-slate-400 text-xs">{inviteInfo.email}</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-slate-200">New Password</Label>
                  <PasswordInput value={password} onChange={setPassword} placeholder="At least 8 characters" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-slate-200">Confirm Password</Label>
                  <PasswordInput value={confirmPassword} onChange={setConfirmPassword} placeholder="Re-enter your password" />
                </div>
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Setting password…</> : "Accept Invitation & Login"}
                </Button>
              </form>
            </CardContent>
          )}
        </Card>

        <p className="text-center text-xs text-slate-500">
          Powered by MicroBooks · NEXXUS POS
        </p>
      </div>
    </div>
  );
}
