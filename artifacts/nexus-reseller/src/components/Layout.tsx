import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import {
  LayoutDashboard, Users, DollarSign, CreditCard, User, LogOut, Zap
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/referrals", icon: Users, label: "Referrals" },
  { to: "/commissions", icon: DollarSign, label: "Commissions" },
  { to: "/payouts", icon: CreditCard, label: "Payouts" },
  { to: "/profile", icon: User, label: "Profile" },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const { reseller, logout } = useAuth();
  const [location, navigate] = useLocation();

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside className="flex flex-col w-64 shrink-0 bg-card border-r border-border">
        {/* Logo */}
        <div className="flex items-center gap-2 px-6 py-5 border-b border-border">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/20">
            <Zap className="w-4 h-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-bold text-foreground tracking-wide">NEXXUS</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Reseller Portal</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV.map(({ to, icon: Icon, label }) => {
            const isActive = location.startsWith(to);
            return (
              <Link
                key={to}
                href={to}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* User footer */}
        <div className="border-t border-border px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{reseller?.name}</p>
              <p className="text-xs text-muted-foreground truncate">{reseller?.email}</p>
            </div>
            <button
              onClick={handleLogout}
              className="ml-2 p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
