import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { LayoutDashboard, ShoppingCart, ListOrdered, Store, Package, Users, BarChart2, Maximize, Minimize, UtensilsCrossed, ChefHat, UserCog, Coins } from "lucide-react";
import { ReactNode, useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/pos", label: "POS", icon: ShoppingCart },
  { href: "/tables", label: "Tables", icon: UtensilsCrossed },
  { href: "/kitchen", label: "Kitchen", icon: ChefHat },
  { href: "/orders", label: "Orders", icon: ListOrdered },
  { href: "/cash", label: "Cash", icon: Coins },
  { href: "/products", label: "Products", icon: Package },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/staff", label: "Staff", icon: UserCog },
  { href: "/reports", label: "Reports", icon: BarChart2 },
];

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  return (
    <div className="flex h-screen w-full flex-col bg-background text-foreground overflow-hidden">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-5 bg-card">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-lg shadow-primary/30">
            <Store className="h-4.5 w-4.5" />
          </div>
          <div className="leading-tight">
            <span className="text-base font-bold tracking-tight">Nexus POS</span>
            <span className="text-[10px] text-muted-foreground ml-2 hidden sm:inline">Your Business, Connected.</span>
          </div>
        </div>

        <nav className="flex items-center gap-1">
          {NAV_ITEMS.map((item) => {
            const isActive = location.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
                )}
              >
                <item.icon className="h-3.5 w-3.5" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={toggleFullscreen}
            title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          >
            {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </Button>
          <div className="h-7 w-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center">
            <span className="text-[10px] font-bold text-primary">A</span>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-auto">{children}</main>

      <footer className="shrink-0 border-t border-border py-1.5 text-center text-xs text-muted-foreground/60 bg-card">
        Powered by MicroBooks
      </footer>
    </div>
  );
}
