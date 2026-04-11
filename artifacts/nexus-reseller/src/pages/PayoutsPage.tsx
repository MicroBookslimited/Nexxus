import { useEffect, useState } from "react";
import { getPayouts, requestPayout, Payout } from "@/lib/api";
import { fmtUSD, fmtDate } from "@/lib/utils";
import { Loader2, CreditCard, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_COLORS: Record<string, string> = {
  pending: "text-orange-400 bg-orange-400/10",
  approved: "text-blue-400 bg-blue-400/10",
  paid: "text-emerald-400 bg-emerald-400/10",
  rejected: "text-destructive bg-destructive/10",
};

export default function PayoutsPage() {
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [requesting, setRequesting] = useState(false);
  const [reqError, setReqError] = useState("");
  const [reqSuccess, setReqSuccess] = useState("");

  useEffect(() => {
    getPayouts()
      .then(setPayouts)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleRequest() {
    setReqError("");
    setReqSuccess("");
    setRequesting(true);
    try {
      const p = await requestPayout();
      setPayouts(prev => [p, ...prev]);
      setReqSuccess(`Payout of ${fmtUSD(Number(p.amount) * 100)} requested successfully!`);
    } catch (err: any) {
      setReqError(err.message || "Request failed");
    } finally {
      setRequesting(false);
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="w-6 h-6 animate-spin text-primary" />
    </div>
  );

  const hasPending = payouts.some(p => p.status === "pending");

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Payouts</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Request and track your commission payouts</p>
        </div>
        <button
          onClick={handleRequest}
          disabled={requesting || hasPending}
          title={hasPending ? "You already have a pending payout request" : "Request payout of all pending commissions"}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {requesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Request Payout
        </button>
      </div>

      {reqError && <div className="text-sm text-destructive px-4 py-3 rounded-lg bg-destructive/10 border border-destructive/20">{reqError}</div>}
      {reqSuccess && <div className="text-sm text-emerald-400 px-4 py-3 rounded-lg bg-emerald-400/10 border border-emerald-400/20">{reqSuccess}</div>}
      {error && <div className="text-sm text-destructive px-4 py-3 rounded-lg bg-destructive/10 border border-destructive/20">{error}</div>}

      {payouts.length === 0 && !error ? (
        <div className="text-center py-16 bg-card border border-border rounded-xl">
          <CreditCard className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-foreground font-medium">No payouts yet</p>
          <p className="text-sm text-muted-foreground mt-1">When you have pending commissions, you can request a payout here</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Commissions</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Requested</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Paid</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {payouts.map(p => (
                  <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-semibold text-foreground">{fmtUSD(Number(p.amount) * 100)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{p.commissionCount}</td>
                    <td className="px-4 py-3">
                      <span className={cn("px-2.5 py-1 rounded-full text-xs font-medium capitalize", STATUS_COLORS[p.status] ?? "text-muted-foreground bg-muted")}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{fmtDate(p.requestedAt)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{p.paidAt ? fmtDate(p.paidAt) : "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{p.notes ?? "—"}</td>
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
