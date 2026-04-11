import { useEffect, useState } from "react";
import { getReferrals, Referral } from "@/lib/api";
import { fmtDate } from "@/lib/utils";
import { Loader2, Users, CheckCircle2, XCircle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_COLORS: Record<string, string> = {
  active: "text-emerald-400 bg-emerald-400/10",
  inactive: "text-muted-foreground bg-muted",
  suspended: "text-destructive bg-destructive/10",
  cancelled: "text-orange-400 bg-orange-400/10",
};

const SUB_STATUS_COLORS: Record<string, string> = {
  active: "text-emerald-400",
  trialing: "text-blue-400",
  past_due: "text-orange-400",
  cancelled: "text-destructive",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn("px-2.5 py-1 rounded-full text-xs font-medium capitalize", STATUS_COLORS[status] ?? "text-muted-foreground bg-muted")}>
      {status}
    </span>
  );
}

export default function ReferralsPage() {
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getReferrals()
      .then(setReferrals)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="w-6 h-6 animate-spin text-primary" />
    </div>
  );

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Referrals</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Businesses you've referred to NEXXUS</p>
      </div>

      {error && <div className="text-sm text-destructive px-4 py-3 rounded-lg bg-destructive/10 border border-destructive/20">{error}</div>}

      {referrals.length === 0 && !error ? (
        <div className="text-center py-16 bg-card border border-border rounded-xl">
          <Users className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-foreground font-medium">No referrals yet</p>
          <p className="text-sm text-muted-foreground mt-1">Share your referral code to start earning commissions</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Business</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Subscription</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Plan</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {referrals.map(r => (
                  <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground">{r.businessName}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.email}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-4 py-3">
                      {r.subscriptionStatus ? (
                        <span className={cn("text-xs font-medium capitalize", SUB_STATUS_COLORS[r.subscriptionStatus] ?? "text-muted-foreground")}>
                          {r.subscriptionStatus}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{r.planName ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{fmtDate(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
