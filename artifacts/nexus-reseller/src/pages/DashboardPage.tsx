import { useEffect, useState } from "react";
import { getDashboard, DashboardStats } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { fmtUSD, fmtMonth } from "@/lib/utils";
import { Users, DollarSign, TrendingUp, Clock, Loader2, Copy, Check } from "lucide-react";

function StatCard({ label, value, icon: Icon, sub }: { label: string; value: string; icon: React.ElementType; sub?: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-start justify-between mb-3">
        <span className="text-sm text-muted-foreground font-medium">{label}</span>
        <div className="p-2 rounded-lg bg-primary/10">
          <Icon className="w-4 h-4 text-primary" />
        </div>
      </div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

export default function DashboardPage() {
  const { reseller } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getDashboard()
      .then(setStats)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  function copyCode() {
    navigator.clipboard.writeText(reseller?.referralCode ?? "");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="w-6 h-6 animate-spin text-primary" />
    </div>
  );

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Welcome back, {reseller?.name?.split(" ")[0]}!</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Here's your reseller performance overview</p>
      </div>

      {/* Referral code */}
      <div className="bg-primary/10 border border-primary/30 rounded-xl p-5 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-primary mb-1">Your Referral Code</p>
          <p className="text-xl font-mono font-bold text-foreground tracking-widest">{reseller?.referralCode}</p>
          <p className="text-xs text-muted-foreground mt-1">Share this code when your clients sign up for NEXXUS</p>
        </div>
        <button
          onClick={copyCode}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>

      {error && <div className="text-sm text-destructive px-4 py-3 rounded-lg bg-destructive/10 border border-destructive/20">{error}</div>}

      {/* Stats */}
      {stats && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Total Referrals"
              value={String(stats.totalReferrals)}
              icon={Users}
              sub={`${stats.activeSubscriptions} active`}
            />
            <StatCard
              label="Lifetime Earnings"
              value={fmtUSD(stats.lifetimeEarnings)}
              icon={DollarSign}
              sub="All time"
            />
            <StatCard
              label="This Month"
              value={fmtUSD(stats.monthlyEarnings)}
              icon={TrendingUp}
              sub="Current month"
            />
            <StatCard
              label="Pending Payout"
              value={fmtUSD(stats.pendingPayouts)}
              icon={Clock}
              sub="Awaiting payment"
            />
          </div>

          {/* Monthly breakdown */}
          {stats.monthlyBreakdown.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-5">
              <h2 className="text-sm font-semibold text-foreground mb-4">Monthly Earnings</h2>
              <div className="space-y-3">
                {stats.monthlyBreakdown.map(row => {
                  const amount = parseFloat(row.total ?? "0") * 100;
                  return (
                    <div key={row.month} className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">{fmtMonth(row.month)}</span>
                      <div className="flex items-center gap-4">
                        <span className="text-xs text-muted-foreground">{row.count} commission{row.count !== 1 ? "s" : ""}</span>
                        <span className="text-sm font-medium text-foreground">{fmtUSD(amount)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* Commission rate card */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="text-sm font-semibold text-foreground mb-3">Your Commission Rate</h2>
        <div className="flex items-center gap-3">
          <div className="text-3xl font-bold text-primary">{Math.round((reseller?.commissionRate ?? 0.3) * 100)}%</div>
          <div>
            <p className="text-sm text-foreground font-medium">Recurring</p>
            <p className="text-xs text-muted-foreground">Earned every month your clients are subscribed</p>
          </div>
        </div>
      </div>
    </div>
  );
}
