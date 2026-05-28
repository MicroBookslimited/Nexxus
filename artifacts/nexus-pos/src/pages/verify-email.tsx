import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { saasVerifyEmail } from "@/lib/saas-api";
import { Button } from "@/components/ui/button";
import logoUrl from "@assets/EB8B578F-2602-4DD8-AB97-D02AF59C49D3_1775943434994.png";

export function VerifyEmail() {
  const [, navigate] = useLocation();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (!token) {
      setStatus("error");
      setErrorMsg("No verification token found. Please use the link from your email.");
      return;
    }
    saasVerifyEmail(token)
      .then(() => setStatus("success"))
      .catch((err: Error) => {
        setStatus("error");
        setErrorMsg(err.message ?? "Verification failed. The link may have expired.");
      });
  }, []);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{ background: "#0f1729" }}
    >
      <img src={logoUrl} alt="NEXXUS POS" className="h-12 mb-10 object-contain" />

      <div
        className="w-full max-w-md rounded-2xl p-8 flex flex-col items-center text-center gap-5"
        style={{ background: "#131f35", border: "1px solid rgba(59,130,246,0.2)" }}
      >
        {status === "loading" && (
          <>
            <Loader2 className="w-12 h-12 text-blue-400 animate-spin" />
            <h2 className="text-xl font-bold text-white">Verifying your email…</h2>
            <p className="text-slate-400 text-sm">Please wait a moment.</p>
          </>
        )}

        {status === "success" && (
          <>
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30">
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            </div>
            <h2 className="text-xl font-bold text-white">Email Verified!</h2>
            <p className="text-slate-400 text-sm">
              Your email address has been verified successfully. Your account is now fully secured.
            </p>
            <Button
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold h-11"
              onClick={() => navigate("/dashboard")}
            >
              Go to Dashboard
            </Button>
          </>
        )}

        {status === "error" && (
          <>
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-red-500/10 border border-red-500/30">
              <XCircle className="w-8 h-8 text-red-400" />
            </div>
            <h2 className="text-xl font-bold text-white">Verification Failed</h2>
            <p className="text-slate-400 text-sm">{errorMsg}</p>
            <Button
              variant="outline"
              className="w-full border-slate-600 text-slate-300 hover:bg-slate-700 h-11"
              onClick={() => navigate("/dashboard")}
            >
              Back to Dashboard
            </Button>
          </>
        )}
      </div>

      <p className="text-slate-600 text-xs mt-8">Powered by MicroBooks · NEXXUS POS</p>
    </div>
  );
}
