import { useEffect, useState } from "react";
import { getCommissions, Commission } from "../lib/api";
import { fmtUSD, fmtMonth, fmtDate } from "@/lib/utils";
import { Loader2, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_COLORS: Record<string, string> = {
  pending: "text-orange-400 bg-orange-400/10",
  paid: "text-emerald-400 bg-emerald-400/10",
  cancelled: "text-destructive bg-destructive/10",
};

export default function CommissionsPage() {
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getCommissions()
      .then(setCommissions)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="w-6 h-6 animate-spin text-primary" />
    </div>
  );

  const totalPending = commissions
    .filter(c => c.status === "pending")
    .reduce((sum, c) => sum + Number(c.commissionAmount), 0);

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Commissions</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Earnings from your referrals' subscriptions</p>
        </div>
        {totalPending > 0 && (
          <div className="bg-primary/10 border border-primary/30 rounded-lg px-4 py-2 text-right">
            <p className="text-xs text-primary font-medium">Pending</p>
            <p className="text-lg font-bold text-foreground">{fmtUSD(totalPending * 100)}</p>
          </div>
        )}
      </div>

      {error && <div className="text-sm text-destructive px-4 py-3 rounded-lg bg-destructive/10 border border-destructive/20">{error}</div>}

      {commissions.length === 0 && !error ? (
        <div className="text-center py-16 bg-card border border-border rounded-xl">
          <DollarSign className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-foreground font-medium">No commissions yet</p>
          <p className="text-sm text-muted-foreground mt-1">Commissions are generated when your referrals pay their subscriptions</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Business</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Period</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Base Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Rate</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Commission</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {commissions.map(c => (
                  <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground">{c.businessName ?? `Tenant #${c.tenantId}`}</td>
                    <td className="px-4 py-3 text-muted-foreground">{fmtMonth(c.periodMonth)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{fmtUSD(Number(c.baseAmount) * 100)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{Math.round(Number(c.commissionRate) * 100)}%</td>
                    <td className="px-4 py-3 font-semibold text-foreground">{fmtUSD(Number(c.commissionAmount) * 100)}</td>
                    <td className="px-4 py-3">
                      <span className={cn("px-2.5 py-1 rounded-full text-xs font-medium capitalize", STATUS_COLORS[c.status] ?? "text-muted-foreground bg-muted")}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{fmtDate(c.createdAt)}</td>
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
